import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateSaleDto, UpdateSaleDto } from './sales.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { DomainEventEmitter } from '../common/events/domain-event.emitter';
import { EntrySavedEvent } from '../common/events/entry-saved.event';

@Injectable()
export class SalesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async findAll(user: AuthUser, partyId?: string, limit = 50, offset = 0) {
    const conditions: string[] = ['s.is_deleted = false'];
    const params: any[] = [];
    let idx = 1;

    // Staff isolation rule: staff only view own entries
    if (user.role === 'STAFF') {
      conditions.push(`s.created_by = $${idx++}`);
      params.push(user.id);
    }

    if (partyId) {
      conditions.push(`s.party_id = $${idx++}`);
      params.push(partyId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT s.*, p.name AS party_name, p.whatsapp_number AS party_phone, u.name AS creator_name,
        COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id),
          0
        ) AS allocated_amount,
        (s.total_amount - COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id),
          0
        )) AS outstanding_amount
      FROM sales s
      JOIN parties p ON p.id = s.party_id
      JOIN users u ON u.id = s.created_by
      ${where}
      ORDER BY s.entry_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async findOne(id: string, user: AuthUser) {
    const saleRes = await this.db.query(
      `SELECT s.*, p.name AS party_name, p.whatsapp_number AS party_phone, p.opening_balance AS party_opening_balance, u.name AS creator_name,
        COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id),
          0
        ) AS allocated_amount,
        (s.total_amount - COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id),
          0
        )) AS outstanding_amount
       FROM sales s
       JOIN parties p ON p.id = s.party_id
       JOIN users u ON u.id = s.created_by
       WHERE s.id = $1 AND s.is_deleted = false`,
      [id],
    );

    if (saleRes.rows.length === 0) {
      throw new NotFoundException('Sale not found');
    }

    const sale = saleRes.rows[0];
    if (user.role === 'STAFF' && sale.created_by !== user.id) {
      throw new NotFoundException('Sale not found');
    }

    const linesRes = await this.db.query(
      `SELECT sl.*, i.name AS item_name, i.code AS item_code 
       FROM sale_lines sl
       JOIN items i ON i.id = sl.item_id
       WHERE sl.sale_id = $1`,
      [id],
    );
    sale.lines = linesRes.rows;

    // Requirement 8: Compute Balance Before | This Bill | Closing Balance dynamically from ledger
    const ledgerRes = await this.db.query(
      `SELECT id FROM ledger_entries WHERE source_type = 'SALE' AND source_id = $1 ORDER BY id ASC LIMIT 1`,
      [id],
    );
    let balanceBefore = Number(sale.party_opening_balance || 0);
    if (ledgerRes.rows.length > 0) {
      const ledgerEntryId = ledgerRes.rows[0].id;
      const prevRes = await this.db.query(
        `SELECT p.opening_balance + COALESCE(SUM(le.debit - le.credit), 0) AS balance_before
         FROM parties p
         LEFT JOIN ledger_entries le ON le.party_id = p.id AND le.id < $1
         WHERE p.id = $2
         GROUP BY p.opening_balance`,
        [ledgerEntryId, sale.party_id],
      );
      if (prevRes.rows.length > 0) {
        balanceBefore = Number(prevRes.rows[0].balance_before);
      }
    }
    const thisBill = Number(sale.total_amount);
    const balanceAfter = balanceBefore + thisBill;

    sale.balance_before = Math.round(balanceBefore * 100) / 100;
    sale.this_bill = thisBill;
    sale.balance_after = Math.round(balanceAfter * 100) / 100;

    // Linked payment reminder if present
    const reminderRes = await this.db.query(
      `SELECT * FROM payment_reminders WHERE sale_id = $1 AND status <> 'CANCELLED' ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    sale.reminder = reminderRes.rows[0] || null;

    return sale;
  }

  async create(dto: CreateSaleDto, user: AuthUser) {
    if (!dto.party_id) {
      throw new BadRequestException('Customer party is required');
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one item line is required');
    }

    if (dto.idempotency_key) {
      const existing = await this.db.query(
        `SELECT id FROM sales WHERE idempotency_key = $1`,
        [dto.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return this.findOne(existing.rows[0].id, user);
      }
    }

    const savedSale = await this.db.withTransaction(async (client) => {
      // 1. Verify party exists
      const partyRes = await client.query(
        `SELECT id, name, whatsapp_number, is_active FROM parties WHERE id = $1`,
        [dto.party_id],
      );
      if (partyRes.rows.length === 0) {
        throw new NotFoundException('Customer party not found');
      }
      const party = partyRes.rows[0];

      let subtotalPaise = 0;

      // 2. Validate lines, units, and verify stock
      for (const line of dto.lines) {
        if (!line.item_id) {
          throw new BadRequestException('Item must be selected for all lines');
        }
        if (line.pieces < 0 || line.weight_kg < 0 || line.rate < 0) {
          throw new BadRequestException('Quantity and rate values cannot be negative');
        }
        if (line.pieces <= 0 && line.weight_kg <= 0) {
          throw new BadRequestException('Pieces or weight (Kg) must be greater than zero for each line');
        }

        // Validate unit compatibility against item config
        const itemRes = await client.query(
          `SELECT id, name, allowed_units, default_unit FROM items WHERE id = $1`,
          [line.item_id],
        );
        if (itemRes.rows.length === 0) {
          throw new NotFoundException(`Item not found for id ${line.item_id}`);
        }
        const item = itemRes.rows[0];
        const unit = line.unit || (line.pieces > 0 ? 'PCS' : 'KG');

        if (item.allowed_units === 'PCS' && unit !== 'PCS') {
          throw new BadRequestException(`${item.name} only allows PCS unit`);
        }
        if (item.allowed_units === 'KG' && unit !== 'KG') {
          throw new BadRequestException(`${item.name} only allows KG unit`);
        }

        // Check available stock
        const stockRes = await client.query(
          `SELECT COALESCE(SUM(pieces_delta), 0) AS stock_pieces,
                  COALESCE(SUM(kg_delta), 0) AS stock_kg
           FROM stock_movements WHERE item_id = $1`,
          [line.item_id],
        );
        const availPieces = Number(stockRes.rows[0]?.stock_pieces || 0);
        const availKg = Number(stockRes.rows[0]?.stock_kg || 0);

        if (line.pieces > 0 && availPieces < line.pieces) {
          throw new BadRequestException(
            `Insufficient stock for ${item.name}. Available: ${availPieces} pcs, Requested: ${line.pieces} pcs`,
          );
        }
        if (line.weight_kg > 0 && availKg < line.weight_kg) {
          throw new BadRequestException(
            `Insufficient stock for ${item.name}. Available: ${availKg.toFixed(3)} Kg, Requested: ${line.weight_kg.toFixed(3)} Kg`,
          );
        }

        // Calculate line amount with integer paise
        let lineAmountPaise = 0;
        const ratePaise = Math.round(line.rate * 100);
        if (unit === 'PCS') {
          lineAmountPaise = Math.floor(line.pieces) * ratePaise;
        } else {
          const grams = Math.round(line.weight_kg * 1000);
          lineAmountPaise = Math.round((grams * ratePaise) / 1000);
        }
        line.amount = lineAmountPaise / 100;
        subtotalPaise += lineAmountPaise;
      }

      // 3. Compute charges & grand total using zero-float integer math
      const subtotal = subtotalPaise / 100;
      const discountType = dto.discount_type === 'PERCENT' ? 'PERCENT' : 'AMOUNT';
      const discountValue = Math.max(0, Number(dto.discount_value) || 0);

      let discountPaise = 0;
      if (discountType === 'PERCENT') {
        discountPaise = Math.round((subtotalPaise * discountValue) / 100);
      } else {
        discountPaise = Math.round(discountValue * 100);
      }
      discountPaise = Math.min(discountPaise, subtotalPaise);

      const taxablePaise = subtotalPaise - discountPaise;
      const gstRate = Math.max(0, Number(dto.gst_rate ?? 3.0));
      const gstPaise = Math.round((taxablePaise * gstRate) / 100);

      const transportPaise = Math.max(0, Math.round((Number(dto.transport_charges) || 0) * 100));
      const packagingPaise = Math.max(0, Math.round((Number(dto.packaging_charges) || 0) * 100));
      const otherPaise = Math.max(0, Math.round((Number(dto.other_charges) || 0) * 100));

      const totalChargesPaise = transportPaise + packagingPaise + otherPaise;
      const grandTotalBeforeRoundPaise = taxablePaise + gstPaise + totalChargesPaise;

      // Round to nearest integer rupee
      const grandTotalPaise = Math.round(grandTotalBeforeRoundPaise / 100) * 100;
      const roundOffPaise = grandTotalPaise - grandTotalBeforeRoundPaise;

      const grandTotal = grandTotalPaise / 100;

      // Reconcile and reject mismatched client totals
      if (dto.total_amount !== undefined && Math.abs(dto.total_amount - grandTotal) > 1.0) {
        throw new BadRequestException(
          `Total amount mismatch. Client sent ₹${dto.total_amount}, server calculated ₹${grandTotal}`,
        );
      }

      // 4. Insert Sales Header
      const saleInsert = await client.query(
        `INSERT INTO sales (
           party_id, due_date, subtotal, discount_type, discount_value, discount_amount,
           taxable_amount, gst_rate, gst_amount, transport_charges, packaging_charges,
           other_charges, round_off, total_amount, notes, created_by, idempotency_key, order_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [
          dto.party_id,
          dto.due_date,
          subtotal,
          discountType,
          discountValue,
          discountPaise / 100,
          taxablePaise / 100,
          gstRate,
          gstPaise / 100,
          transportPaise / 100,
          packagingPaise / 100,
          otherPaise / 100,
          roundOffPaise / 100,
          grandTotal,
          dto.notes || null,
          user.id,
          dto.idempotency_key || null,
          dto.order_id || null,
        ],
      );
      const sale = saleInsert.rows[0];

      if (dto.order_id) {
        await client.query(`UPDATE sales_orders SET status = 'COMPLETED' WHERE id = $1`, [dto.order_id]);
      }

      // 5. Insert Sale Lines & Stock Movements (negative delta)
      for (const line of dto.lines) {
        await client.query(
          `INSERT INTO sale_lines (sale_id, item_id, pieces, weight_kg, rate, amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sale.id, line.item_id, line.pieces || 0, line.weight_kg || 0, line.rate, line.amount],
        );

        // Stock movement: Sale reduces stock
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'SALE', $2, $3, $4)`,
          [line.item_id, sale.id, -(line.pieces || 0), -(line.weight_kg || 0)],
        );
      }

      // 6. Ledger Entry: Sale increases customer debit (they owe more)
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'SALE', $2, $3, 0)`,
        [sale.party_id, sale.id, grandTotal],
      );

      // 7. Payment Reminder (if enabled)
      if (dto.reminder?.enabled && dto.reminder.reminder_date) {
        const reminderAmount = Number(dto.reminder.amount) > 0 ? Number(dto.reminder.amount) : grandTotal;
        await client.query(
          `INSERT INTO payment_reminders (sale_id, party_id, reminder_date, amount, notes, status, created_by)
           VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
          [sale.id, sale.party_id, dto.reminder.reminder_date, reminderAmount, dto.reminder.notes || null, user.id],
        );
      }

      // 8. Audit Log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'CREATE', 'sales', $2, NULL, $3)`,
        [user.id, sale.id, JSON.stringify(sale)],
      );

      // 9. Notification Outbox Row
      await client.query(
        `INSERT INTO notification_outbox (event_type, entity_type, entity_id, recipient_phone, payload, status)
         VALUES ($1, 'SALE', $2, $3, $4, 'PENDING')`,
        [
          'SALE_CREATED',
          sale.id,
          party.whatsapp_number || null,
          JSON.stringify({
            bill_no: sale.bill_no,
            customer_name: party.name,
            amount: grandTotal,
            due_date: sale.due_date,
          }),
        ],
      );

      return sale;
    });

    // 5. Emit EntrySaved domain event after commit
    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'SALE',
        id: savedSale.id,
        partyId: savedSale.party_id,
        amount: savedSale.total_amount,
        staffId: user.id,
        staffName: user.name,
        billNo: savedSale.bill_no,
        timestamp: new Date().toISOString(),
      }),
    );

    return savedSale;
  }

  async update(id: string, dto: UpdateSaleDto, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can edit entries');
    }

    const updatedSale = await this.db.withTransaction(async (client) => {
      const saleRes = await client.query(
        `SELECT * FROM sales WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (saleRes.rows.length === 0) {
        throw new NotFoundException('Sale not found');
      }
      const oldSale = saleRes.rows[0];
      const oldLines = (
        await client.query(`SELECT * FROM sale_lines WHERE sale_id = $1`, [id])
      ).rows;

      // 1. Reversing Ledger Entry: Credit customer to offset old debit
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'SALE_REVERSAL', $2, 0, $3)`,
        [oldSale.party_id, oldSale.id, oldSale.total_amount],
      );

      // 2. Reversing Stock Movements: Add back old stock
      for (const line of oldLines) {
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'SALE_REVERSAL', $2, $3, $4)`,
          [line.item_id, oldSale.id, line.pieces, line.weight_kg],
        );
      }

      // If new lines are provided, compute new total and insert
      let newTotal = oldSale.total_amount;
      if (dto.lines && dto.lines.length > 0) {
        newTotal = 0;
        await client.query(`DELETE FROM sale_lines WHERE sale_id = $1`, [id]);

        for (const line of dto.lines) {
          const lineAmount =
            line.amount !== undefined
              ? line.amount
              : line.weight_kg > 0
              ? Number((line.weight_kg * line.rate).toFixed(2))
              : Number((line.pieces * line.rate).toFixed(2));
          newTotal += lineAmount;

          await client.query(
            `INSERT INTO sale_lines (sale_id, item_id, pieces, weight_kg, rate, amount)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, line.item_id, line.pieces || 0, line.weight_kg || 0, line.rate, lineAmount],
          );

          // New Stock movement: subtract stock
          await client.query(
            `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
             VALUES ($1, 'SALE', $2, $3, $4)`,
            [line.item_id, id, -(line.pieces || 0), -(line.weight_kg || 0)],
          );
        }

        // New Ledger entry
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'SALE', $2, $3, 0)`,
          [oldSale.party_id, id, newTotal],
        );
      } else {
        // If lines were not updated, re-apply the original ledger entry
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'SALE', $2, $3, 0)`,
          [oldSale.party_id, id, oldSale.total_amount],
        );
      }

      // 3. Update Sale Header
      const updateRes = await client.query(
        `UPDATE sales 
         SET due_date = COALESCE($1, due_date),
             notes = COALESCE($2, notes),
             total_amount = $3
         WHERE id = $4
         RETURNING *`,
        [dto.due_date || null, dto.notes || null, newTotal, id],
      );
      const newSale = updateRes.rows[0];

      // 4. Append to immutable audit_log with before and after state
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'UPDATE', 'sales', $2, $3, $4)`,
        [
          user.id,
          id,
          JSON.stringify({ ...oldSale, lines: oldLines }),
          JSON.stringify({ ...newSale, lines: dto.lines || oldLines }),
        ],
      );

      return newSale;
    });

    // Emit event after commit
    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'SALE',
        id: updatedSale.id,
        partyId: updatedSale.party_id,
        amount: updatedSale.total_amount,
        staffId: user.id,
        staffName: user.name,
        billNo: updatedSale.bill_no,
        timestamp: new Date().toISOString(),
      }),
    );

    return updatedSale;
  }

  async softDelete(id: string, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can delete entries');
    }

    return await this.db.withTransaction(async (client) => {
      const saleRes = await client.query(
        `SELECT * FROM sales WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (saleRes.rows.length === 0) {
        throw new NotFoundException('Sale not found');
      }
      const sale = saleRes.rows[0];

      // Reversing Ledger Entry: Credit customer to offset previous debit
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'SALE_REVERSAL', $2, 0, $3)`,
        [sale.party_id, sale.id, sale.total_amount],
      );

      // Reversing Stock Movements: Add back stock
      const lines = await client.query(`SELECT * FROM sale_lines WHERE sale_id = $1`, [id]);
      for (const line of lines.rows) {
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'SALE_REVERSAL', $2, $3, $4)`,
          [line.item_id, sale.id, line.pieces, line.weight_kg],
        );
      }

      // Mark as deleted
      await client.query(
        `UPDATE sales SET is_deleted = true, deleted_at = now(), deleted_by = $1 WHERE id = $2`,
        [user.id, id],
      );

      // Cancel linked pending reminders in the same transaction
      await client.query(
        `UPDATE reminder_log SET status = 'CANCELLED' WHERE sale_id = $1`,
        [id],
      );

      // Write to immutable audit_log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'SOFT_DELETE', 'sales', $2, $3, $4)`,
        [user.id, id, JSON.stringify(sale), JSON.stringify({ is_deleted: true, deleted_by: user.id })],
      );

      return { success: true, message: 'Sale deleted and reversing ledger/stock entries created' };
    });
  }
}
