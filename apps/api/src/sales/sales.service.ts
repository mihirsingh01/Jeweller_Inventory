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
      `SELECT s.*, p.name AS party_name, p.whatsapp_number AS party_phone, u.name AS creator_name,
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
      `SELECT sl.*, i.name AS item_name 
       FROM sale_lines sl
       JOIN items i ON i.id = sl.item_id
       WHERE sl.sale_id = $1`,
      [id],
    );

    sale.lines = linesRes.rows;
    return sale;
  }

  async create(dto: CreateSaleDto, user: AuthUser) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one item line is required');
    }

    const savedSale = await this.db.withTransaction(async (client) => {
      let totalAmount = 0;

      // Validate lines and verify available stock
      for (const line of dto.lines) {
        if (line.pieces < 0 || line.weight_kg < 0 || line.rate < 0) {
          throw new BadRequestException('Values cannot be negative');
        }
        if (line.pieces <= 0 && line.weight_kg <= 0) {
          throw new BadRequestException('Pieces or weight (Kg) must be greater than zero for each line');
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

        // Check if allow_negative_stock is enabled in settings (default false)
        const settingsRes = await client.query(
          `SELECT is_active FROM reminder_settings WHERE id = 1`,
        );
        const allowNegativeStock = false; // Default strict inventory control

        if (!allowNegativeStock) {
          if (line.pieces > 0 && availPieces < line.pieces) {
            throw new BadRequestException(
              `Insufficient stock for item. Available: ${availPieces} pieces, Requested: ${line.pieces}`,
            );
          }
          if (line.weight_kg > 0 && availKg < line.weight_kg) {
            throw new BadRequestException(
              `Insufficient stock for item. Available: ${availKg.toFixed(3)} Kg, Requested: ${line.weight_kg.toFixed(3)} Kg`,
            );
          }
        }

        const calcAmount =
          line.amount !== undefined
            ? line.amount
            : line.weight_kg > 0
            ? Number((line.weight_kg * line.rate).toFixed(2))
            : Number((line.pieces * line.rate).toFixed(2));
        totalAmount += calcAmount;
      }

      // 1. Insert Sales Header
      const saleInsert = await client.query(
        `INSERT INTO sales (party_id, due_date, total_amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [dto.party_id, dto.due_date, totalAmount, dto.notes || null, user.id],
      );
      const sale = saleInsert.rows[0];

      // 2. Insert Sale Lines & 3. Stock Movements (negative delta)
      for (const line of dto.lines) {
        const lineAmount =
          line.amount !== undefined
            ? line.amount
            : line.weight_kg > 0
            ? Number((line.weight_kg * line.rate).toFixed(2))
            : Number((line.pieces * line.rate).toFixed(2));

        await client.query(
          `INSERT INTO sale_lines (sale_id, item_id, pieces, weight_kg, rate, amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sale.id, line.item_id, line.pieces || 0, line.weight_kg || 0, line.rate, lineAmount],
        );

        // Stock movement: Sale reduces stock
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'SALE', $2, $3, $4)`,
          [line.item_id, sale.id, -(line.pieces || 0), -(line.weight_kg || 0)],
        );
      }

      // 4. Ledger Entry: Sale increases customer debit (they owe more)
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'SALE', $2, $3, 0)`,
        [sale.party_id, sale.id, totalAmount],
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
