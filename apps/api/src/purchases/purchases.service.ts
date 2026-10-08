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

export interface PurchaseLineDto {
  item_id: string;
  pieces: number;
  weight_kg: number;
  rate: number;
  amount?: number;
}

export interface CreatePurchaseDto {
  party_id: string;
  due_date?: string;
  notes?: string;
  lines: PurchaseLineDto[];
}

export interface UpdatePurchaseDto {
  due_date?: string;
  notes?: string;
  lines?: PurchaseLineDto[];
}

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

    const linesRes = await this.db.query(
      `SELECT pl.*, i.name AS item_name 
       FROM purchase_lines pl
       JOIN items i ON i.id = pl.item_id
       WHERE pl.purchase_id = $1`,
      [id],
    );

    purchase.lines = linesRes.rows;
    return purchase;
  }

  async create(dto: CreatePurchaseDto, user: AuthUser) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one purchase line is required');
    }

    const savedPurchase = await this.db.withTransaction(async (client) => {
      let totalAmount = 0;
      for (const line of dto.lines) {
        if (line.pieces < 0 || line.weight_kg < 0 || line.rate < 0) {
          throw new BadRequestException('Values cannot be negative');
        }
        if (line.pieces <= 0 && line.weight_kg <= 0) {
          throw new BadRequestException('Pieces or weight (Kg) must be greater than zero for each line');
        }
        const calcAmount =
          line.amount !== undefined
            ? line.amount
            : line.weight_kg > 0
            ? Number((line.weight_kg * line.rate).toFixed(2))
            : Number((line.pieces * line.rate).toFixed(2));
        totalAmount += calcAmount;
      }

      // 1. Insert Purchase Header
      const purchaseInsert = await client.query(
        `INSERT INTO purchases (party_id, due_date, total_amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [dto.party_id, dto.due_date || null, totalAmount, dto.notes || null, user.id],
      );
      const purchase = purchaseInsert.rows[0];

      // 2. Insert Purchase Lines & 3. Stock Movements (positive delta)
      for (const line of dto.lines) {
        const lineAmount =
          line.amount !== undefined
            ? line.amount
            : line.weight_kg > 0
            ? Number((line.weight_kg * line.rate).toFixed(2))
            : Number((line.pieces * line.rate).toFixed(2));

        await client.query(
          `INSERT INTO purchase_lines (purchase_id, item_id, pieces, weight_kg, rate, amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [purchase.id, line.item_id, line.pieces || 0, line.weight_kg || 0, line.rate, lineAmount],
        );

        // Stock movement: Purchase adds stock
        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'PURCHASE', $2, $3, $4)`,
          [line.item_id, purchase.id, line.pieces || 0, line.weight_kg || 0],
        );
      }

      // 4. Ledger Entry: Purchase increases supplier credit (business owes more)
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'PURCHASE', $2, 0, $3)`,
        [purchase.party_id, purchase.id, totalAmount],
      );

      return purchase;
    });

    // 5. Emit EntrySaved domain event after commit
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
          const lineAmount =
            line.amount !== undefined
              ? line.amount
              : line.weight_kg > 0
              ? Number((line.weight_kg * line.rate).toFixed(2))
              : Number((line.pieces * line.rate).toFixed(2));
          newTotal += lineAmount;

          await client.query(
            `INSERT INTO purchase_lines (purchase_id, item_id, pieces, weight_kg, rate, amount)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, line.item_id, line.pieces || 0, line.weight_kg || 0, line.rate, lineAmount],
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
             total_amount = $3
         WHERE id = $4
         RETURNING *`,
        [dto.due_date || null, dto.notes || null, newTotal, id],
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

      // Reversing Ledger Entry
      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'PURCHASE_REVERSAL', $2, $3, 0)`,
        [purchase.party_id, id, purchase.total_amount],
      );

      // Reversing Stock Movements
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

      await client.query(
        `UPDATE purchases SET is_deleted = true, deleted_at = now(), deleted_by = $1 WHERE id = $2`,
        [user.id, id],
      );

      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'SOFT_DELETE', 'purchases', $2, $3, $4)`,
        [user.id, id, JSON.stringify(purchase), JSON.stringify({ is_deleted: true, deleted_by: user.id })],
      );

      return { success: true, message: 'Purchase deleted and reversing ledger/stock entries created' };
    });
  }
}
