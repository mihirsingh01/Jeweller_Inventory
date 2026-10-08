import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { DomainEventEmitter } from '../common/events/domain-event.emitter';
import { EntrySavedEvent } from '../common/events/entry-saved.event';
import {
  CreatePurchaseDto,
  UpdatePurchaseDto,
  PurchaseLineDto,
} from './purchases.dto';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async findAll(user: AuthUser, limit = 50, offset = 0) {
    const conditions: string[] = ['p.is_deleted = false'];
    const params: any[] = [];
    let idx = 1;

    if (user.role === 'STAFF') {
      conditions.push(`p.created_by = $${idx++}`);
      params.push(user.id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT p.*, pt.name AS party_name, pt.whatsapp_number AS party_phone, u.name AS creator_name,
        COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.purchase_id = p.id),
          0
        ) AS allocated_amount,
        (p.total_amount - COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.purchase_id = p.id),
          0
        )) AS outstanding_amount
      FROM purchases p
      JOIN parties pt ON pt.id = p.party_id
      JOIN users u ON u.id = p.created_by
      ${where}
      ORDER BY p.entry_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async findOne(id: string, user: AuthUser) {
    const purchaseRes = await this.db.query(
      `SELECT p.*, pt.name AS party_name, pt.whatsapp_number AS party_phone, u.name AS creator_name,
        COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.purchase_id = p.id),
          0
        ) AS allocated_amount,
        (p.total_amount - COALESCE(
          (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.purchase_id = p.id),
          0
        )) AS outstanding_amount
       FROM purchases p
       JOIN parties pt ON pt.id = p.party_id
       JOIN users u ON u.id = p.created_by
       WHERE p.id = $1 AND p.is_deleted = false`,
      [id],
    );

    if (purchaseRes.rows.length === 0) {
      throw new NotFoundException('Purchase entry not found');
    }

    const purchase = purchaseRes.rows[0];
    if (user.role === 'STAFF' && purchase.created_by !== user.id) {
      throw new NotFoundException('Purchase entry not found');
    }

    // Dynamic historical supplier ledger balance (Req 23)
    const ledgerEntryRes = await this.db.query(
      `SELECT id, entry_at FROM ledger_entries 
       WHERE source_type = 'PURCHASE' AND source_id = $1 
       ORDER BY id ASC LIMIT 1`,
      [id],
    );

    if (ledgerEntryRes.rows.length > 0) {
      const ledgerEntryId = ledgerEntryRes.rows[0].id;
      // Supplier balance: Credit increases payable, Debit decreases payable
      const priorBalRes = await this.db.query(
        `SELECT p.opening_balance,
                COALESCE(SUM(le.credit - le.debit), 0) AS prior_diff
         FROM parties p
         LEFT JOIN ledger_entries le ON le.party_id = p.id AND le.id < $1
         WHERE p.id = $2
         GROUP BY p.id, p.opening_balance`,
        [ledgerEntryId, purchase.party_id],
      );

      if (priorBalRes.rows.length > 0) {
        const opening = Number(priorBalRes.rows[0].opening_balance || 0);
        const priorDiff = Number(priorBalRes.rows[0].prior_diff || 0);
        purchase.balance_before = opening + priorDiff;
        purchase.this_purchase = Number(purchase.total_amount);
        purchase.balance_after = purchase.balance_before + purchase.this_purchase;
      }
    }

    const linesRes = await this.db.query(
      `SELECT pl.*, i.name AS item_name, i.code AS item_code 
       FROM purchase_lines pl
       JOIN items i ON i.id = pl.item_id
       WHERE pl.purchase_id = $1
       ORDER BY pl.id ASC`,
      [id],
    );

    purchase.lines = linesRes.rows;

    // Fetch linked payment reminder (Req 24)
    const reminderRes = await this.db.query(
      `SELECT * FROM payment_reminders WHERE purchase_id = $1 AND status <> 'CANCELLED' ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    purchase.reminder = reminderRes.rows[0] || null;

    return purchase;
  }

  async create(dto: CreatePurchaseDto, user: AuthUser) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one purchase line is required');
    }

    if (dto.idempotency_key) {
      const existing = await this.db.query(
        `SELECT id FROM purchases WHERE idempotency_key = $1`,
        [dto.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return this.findOne(existing.rows[0].id, user);
      }
    }

    // Integer paise zero-float calculation engine
    let rawSubtotalPaise = 0;
    for (const line of dto.lines) {
      if (line.pieces < 0 || line.weight_kg < 0 || line.rate < 0) {
        throw new BadRequestException('Values cannot be negative');
      }
      if (line.pieces <= 0 && line.weight_kg <= 0) {
        throw new BadRequestException('Pieces or weight (Kg) must be greater than zero for each line');
      }

      const unit = line.unit || (line.pieces > 0 && (!line.weight_kg || line.weight_kg === 0) ? 'PCS' : 'KG');
      const ratePaise = Math.round(Number(line.rate) * 100);
      let linePaise = 0;

      if (unit === 'PCS') {
        linePaise = Math.round(line.pieces * ratePaise);
      } else {
        const weightGrams = Math.round(Number(line.weight_kg) * 1000);
        linePaise = Math.round((weightGrams * ratePaise) / 1000);
      }
      rawSubtotalPaise += linePaise;
    }

    // Charges calculation in integer paise
    const discountType = dto.discount_type || 'PERCENT';
    let discountPaise = 0;
    if (discountType === 'PERCENT') {
      const percentBps = Math.round(Number(dto.discount_value || 0) * 100);
      discountPaise = Math.round((rawSubtotalPaise * percentBps) / 10000);
    } else {
      discountPaise = Math.min(
        Math.round(Number(dto.discount_value || dto.discount_amount || 0) * 100),
        rawSubtotalPaise,
      );
    }

    const taxablePaise = Math.max(0, rawSubtotalPaise - discountPaise);
    const gstRate = dto.gst_rate !== undefined ? Number(dto.gst_rate) : 3.0;
    const gstBps = Math.round(gstRate * 100);
    const gstPaise = Math.round((taxablePaise * gstBps) / 10000);

    const transportPaise = Math.round(Number(dto.transport_charges || 0) * 100);
    const packagingPaise = Math.round(Number(dto.packaging_charges || 0) * 100);
    const otherPaise = Math.round(Number(dto.other_charges || 0) * 100);

    const unroundedTotalPaise =
      taxablePaise + gstPaise + transportPaise + packagingPaise + otherPaise;

    let roundOffPaise = 0;
    if (dto.round_off !== undefined && dto.round_off !== null) {
      roundOffPaise = Math.round(Number(dto.round_off) * 100);
    } else {
      const nearestRupeePaise = Math.round(unroundedTotalPaise / 100) * 100;
      roundOffPaise = nearestRupeePaise - unroundedTotalPaise;
    }

    const finalGrandTotalPaise = unroundedTotalPaise + roundOffPaise;

    const subtotal = rawSubtotalPaise / 100;
    const discountAmount = discountPaise / 100;
    const taxableAmount = taxablePaise / 100;
    const gstAmount = gstPaise / 100;
    const transportCharges = transportPaise / 100;
    const packagingCharges = packagingPaise / 100;
    const otherCharges = otherPaise / 100;
    const roundOff = roundOffPaise / 100;
    const grandTotal = finalGrandTotalPaise / 100;

    const savedPurchase = await this.db.withTransaction(async (client) => {
      // 1. Insert Purchase Header
      const purchaseInsert = await client.query(
        `INSERT INTO purchases (
           party_id, due_date, subtotal, discount_type, discount_value, discount_amount,
           taxable_amount, gst_rate, gst_amount, transport_charges, packaging_charges,
           other_charges, round_off, total_amount, notes, narration, created_by, idempotency_key, order_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [
          dto.party_id,
          dto.due_date || null,
          subtotal,
          discountType,
          dto.discount_value || 0,
          discountAmount,
          taxableAmount,
          gstRate,
          gstAmount,
          transportCharges,
          packagingCharges,
          otherCharges,
          roundOff,
          grandTotal,
          dto.notes || null,
          dto.narration || null,
          user.id,
          dto.idempotency_key || null,
          dto.order_id || null,
        ],
      );
      const purchase = purchaseInsert.rows[0];

      if (dto.order_id) {
        await client.query(`UPDATE purchase_orders SET status = 'COMPLETED' WHERE id = $1`, [dto.order_id]);
      }

      // 2. Insert Purchase Lines & 3. Stock Movements (positive delta for purchase)
      for (const line of dto.lines) {
        const unit = line.unit || (line.pieces > 0 && (!line.weight_kg || line.weight_kg === 0) ? 'PCS' : 'KG');
        const ratePaise = Math.round(Number(line.rate) * 100);
        let linePaise = 0;
        if (unit === 'PCS') {
          linePaise = Math.round(line.pieces * ratePaise);
        } else {
          const weightGrams = Math.round(Number(line.weight_kg) * 1000);
          linePaise = Math.round((weightGrams * ratePaise) / 1000);
        }
        const lineAmount = linePaise / 100;

        await client.query(
          `INSERT INTO purchase_lines (purchase_id, item_id, unit, pieces, weight_kg, rate, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [purchase.id, line.item_id, unit, line.pieces || 0, line.weight_kg || 0, line.rate, lineAmount],
        );

        // Stock movement: Purchase adds stock
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'PURCHASE', $2, $3, $4)`,
          [line.item_id, purchase.id, line.pieces || 0, line.weight_kg || 0],
        );
      }

      // 4. Ledger Entry: Purchase increases supplier credit (accounts payable)
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'PURCHASE', $2, 0, $3)`,
        [purchase.party_id, purchase.id, grandTotal],
      );

      // 5. Optional Payment Reminder (Req 24)
      if (dto.reminder && dto.reminder.reminder_date) {
        await client.query(
          `INSERT INTO payment_reminders (purchase_id, party_id, reminder_date, amount, notes, status, created_by)
           VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
          [
            purchase.id,
            purchase.party_id,
            dto.reminder.reminder_date,
            dto.reminder.amount || grandTotal,
            dto.reminder.notes || `Purchase Bill #${purchase.bill_no} payment reminder`,
            user.id,
          ],
        );
      }

      // 6. Audit Log (Req 41)
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'CREATE', 'purchases', $2, NULL, $3)`,
        [user.id, purchase.id, JSON.stringify({ ...purchase, lines: dto.lines })],
      );

      // 7. Notification Outbox (Req 3)
      await client.query(
        `INSERT INTO notification_outbox (event_type, entity_type, entity_id, payload)
         VALUES ('PURCHASE_CREATED', 'purchases', $1, $2)`,
        [
          purchase.id,
          JSON.stringify({
            bill_no: purchase.bill_no,
            total_amount: grandTotal,
            party_id: purchase.party_id,
            created_by: user.id,
            created_by_name: user.name,
          }),
        ],
      );

      return purchase;
    });

    // 8. Emit EntrySaved domain event after commit
    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'PURCHASE',
        id: savedPurchase.id,
        partyId: savedPurchase.party_id,
        amount: savedPurchase.total_amount,
        staffId: user.id,
        staffName: user.name,
        billNo: savedPurchase.bill_no,
        timestamp: new Date().toISOString(),
      }),
    );

    return savedPurchase;
  }

  async update(id: string, dto: UpdatePurchaseDto, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can edit purchase entries');
    }

    const updatedPurchase = await this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM purchases WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException('Purchase entry not found');
      }
      const oldPurchase = res.rows[0];
      const oldLines = (
        await client.query(`SELECT * FROM purchase_lines WHERE purchase_id = $1`, [id])
      ).rows;

      // 1. Reversing Ledger: Debit supplier to reverse old credit
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'PURCHASE_REVERSAL', $2, $3, 0)`,
        [oldPurchase.party_id, id, oldPurchase.total_amount],
      );

      // 2. Reversing Stock Movements: Deduct old added stock
      for (const line of oldLines) {
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'PURCHASE_REVERSAL', $2, $3, $4)`,
          [line.item_id, id, -(line.pieces || 0), -(line.weight_kg || 0)],
        );
      }

      let newTotal = oldPurchase.total_amount;
      if (dto.lines && dto.lines.length > 0) {
        newTotal = 0;
        await client.query(`DELETE FROM purchase_lines WHERE purchase_id = $1`, [id]);

        for (const line of dto.lines) {
          const unit = line.unit || (line.pieces > 0 && (!line.weight_kg || line.weight_kg === 0) ? 'PCS' : 'KG');
          const ratePaise = Math.round(Number(line.rate) * 100);
          let linePaise = 0;
          if (unit === 'PCS') {
            linePaise = Math.round(line.pieces * ratePaise);
          } else {
            const weightGrams = Math.round(Number(line.weight_kg) * 1000);
            linePaise = Math.round((weightGrams * ratePaise) / 1000);
          }
          const lineAmount = linePaise / 100;
          newTotal += lineAmount;

          await client.query(
            `INSERT INTO purchase_lines (purchase_id, item_id, unit, pieces, weight_kg, rate, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, line.item_id, unit, line.pieces || 0, line.weight_kg || 0, line.rate, lineAmount],
          );

          await client.query(
            `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
             VALUES ($1, 'PURCHASE', $2, $3, $4)`,
            [line.item_id, id, line.pieces || 0, line.weight_kg || 0],
          );
        }

        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'PURCHASE', $2, 0, $3)`,
          [oldPurchase.party_id, id, newTotal],
        );
      } else {
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'PURCHASE', $2, 0, $3)`,
          [oldPurchase.party_id, id, oldPurchase.total_amount],
        );
      }

      // 3. Update Purchase Header
      const updateRes = await client.query(
        `UPDATE purchases 
         SET due_date = COALESCE($1, due_date),
             notes = COALESCE($2, notes),
             narration = COALESCE($3, narration),
             total_amount = $4
         WHERE id = $5
         RETURNING *`,
        [dto.due_date || null, dto.notes || null, dto.narration || null, newTotal, id],
      );
      const newPurchase = updateRes.rows[0];

      // 4. Audit Log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'UPDATE', 'purchases', $2, $3, $4)`,
        [
          user.id,
          id,
          JSON.stringify({ ...oldPurchase, lines: oldLines }),
          JSON.stringify({ ...newPurchase, lines: dto.lines || oldLines }),
        ],
      );

      return newPurchase;
    });

    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'PURCHASE',
        id: updatedPurchase.id,
        partyId: updatedPurchase.party_id,
        amount: updatedPurchase.total_amount,
        staffId: user.id,
        staffName: user.name,
        billNo: updatedPurchase.bill_no,
        timestamp: new Date().toISOString(),
      }),
    );

    return updatedPurchase;
  }

  async softDelete(id: string, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can delete purchase entries');
    }

    return await this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM purchases WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException('Purchase entry not found');
      }
      const purchase = res.rows[0];

      // 1. Reversing Ledger Entry (debit supplier to cancel credit)
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'PURCHASE_REVERSAL', $2, $3, 0)`,
        [purchase.party_id, id, purchase.total_amount],
      );

      // 2. Reversing Stock Movements (subtract previously added stock)
      const lines = (
        await client.query(`SELECT * FROM purchase_lines WHERE purchase_id = $1`, [id])
      ).rows;
      for (const line of lines) {
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'PURCHASE_REVERSAL', $2, $3, $4)`,
          [line.item_id, id, -(line.pieces || 0), -(line.weight_kg || 0)],
        );
      }

      // 3. Reversibly cancel linked payment reminders
      await client.query(
        `UPDATE payment_reminders SET status = 'CANCELLED' WHERE purchase_id = $1`,
        [id],
      );

      // 4. Mark purchase as deleted
      await client.query(
        `UPDATE purchases SET is_deleted = true, deleted_at = now(), deleted_by = $1 WHERE id = $2`,
        [user.id, id],
      );

      // 5. Audit Log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'SOFT_DELETE', 'purchases', $2, $3, $4)`,
        [user.id, id, JSON.stringify(purchase), JSON.stringify({ is_deleted: true, deleted_by: user.id })],
      );

      return { success: true, message: 'Purchase deleted and reversing ledger/stock entries created' };
    });
  }
}
