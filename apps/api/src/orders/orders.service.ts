import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateOrderDto, UpdateOrderStatusDto } from './orders.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly db: DatabaseService) {}

  private getTableNames(type: 'SO' | 'PO') {
    return {
      headerTable: type === 'SO' ? 'sales_orders' : 'purchase_orders',
      linesTable: type === 'SO' ? 'sales_order_lines' : 'purchase_order_lines',
      linkColumn: type === 'SO' ? 'order_id' : 'order_id',
      prefix: type,
    };
  }

  async findAll(
    type: 'SO' | 'PO',
    user: AuthUser,
    status?: string,
    partyId?: string,
    limit = 50,
    offset = 0,
  ) {
    const { headerTable } = this.getTableNames(type);
    const conditions: string[] = ['o.is_deleted = false'];
    const params: any[] = [];
    let idx = 1;

    // Staff isolation: staff see only own orders (Req 1, 6, 7)
    if (user.role === 'STAFF') {
      conditions.push(`o.created_by = $${idx++}`);
      params.push(user.id);
    }

    if (partyId) {
      conditions.push(`o.party_id = $${idx++}`);
      params.push(partyId);
    }

    if (status) {
      conditions.push(`o.status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT o.*,
             '${type}' AS order_type,
             p.name AS party_name, p.type AS party_type, p.whatsapp_number AS party_phone,
             u.name AS creator_name,
             (SELECT COUNT(*) FROM ${type === 'SO' ? 'sales_order_lines' : 'purchase_order_lines'} WHERE order_id = o.id) AS lines_count
      FROM ${headerTable} o
      JOIN parties p ON p.id = o.party_id
      JOIN users u ON u.id = o.created_by
      ${where}
      ORDER BY o.order_date DESC, o.order_no DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async findOne(type: 'SO' | 'PO', id: string, user: AuthUser) {
    const { headerTable, linesTable } = this.getTableNames(type);

    const res = await this.db.query(
      `SELECT o.*,
              '${type}' AS order_type,
              p.name AS party_name, p.type AS party_type, p.whatsapp_number AS party_phone,
              u.name AS creator_name
       FROM ${headerTable} o
       JOIN parties p ON p.id = o.party_id
       JOIN users u ON u.id = o.created_by
       WHERE o.id = $1 AND o.is_deleted = false`,
      [id],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`${type === 'SO' ? 'Sales' : 'Purchase'} order not found`);
    }

    const order = res.rows[0];
    if (user.role === 'STAFF' && order.created_by !== user.id) {
      throw new NotFoundException(`${type === 'SO' ? 'Sales' : 'Purchase'} order not found`);
    }

    const linesRes = await this.db.query(
      `SELECT ol.*, i.name AS item_name, i.code AS item_code
       FROM ${linesTable} ol
       JOIN items i ON i.id = ol.item_id
       WHERE ol.order_id = $1
       ORDER BY ol.id ASC`,
      [id],
    );

    order.lines = linesRes.rows;
    return order;
  }

  async create(dto: CreateOrderDto, user: AuthUser) {
    const { headerTable, linesTable } = this.getTableNames(dto.type);

    if (dto.idempotency_key) {
      const existing = await this.db.query(
        `SELECT id FROM ${headerTable} WHERE idempotency_key = $1 AND is_deleted = false`,
        [dto.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return this.findOne(dto.type, existing.rows[0].id, user);
      }
    }

    // Party validation
    const partyRes = await this.db.query(
      `SELECT id, name, is_active FROM parties WHERE id = $1`,
      [dto.party_id],
    );
    if (partyRes.rows.length === 0 || !partyRes.rows[0].is_active) {
      throw new BadRequestException('Invalid or inactive party specified');
    }

    // Zero-float calculations using integer paise
    let subtotalPaise = 0;
    for (const line of dto.lines) {
      const lineAmtPaise = Math.round(Number(line.amount || 0) * 100);
      subtotalPaise += lineAmtPaise;
    }

    const gstRate = 3.0; // 3% GST on jewellery
    const gstPaise = Math.round((subtotalPaise * gstRate) / 100);
    const exactTotalPaise = subtotalPaise + gstPaise;
    const roundedTotalPaise = Math.round(exactTotalPaise / 100) * 100; // Integer rupee rounding
    const roundOffPaise = roundedTotalPaise - exactTotalPaise;

    const subtotal = subtotalPaise / 100;
    const taxableAmount = subtotal;
    const gstAmount = gstPaise / 100;
    const roundOff = roundOffPaise / 100;
    const totalAmount = roundedTotalPaise / 100;

    return await this.db.withTransaction(async (client) => {
      // 1. Insert Order Header (NO ledger entries and NO stock movements, Req 6, 7)
      const orderRes = await client.query(
        `INSERT INTO ${headerTable} (
           party_id, expected_delivery_date, status, subtotal, taxable_amount,
           gst_rate, gst_amount, round_off, total_amount, notes, idempotency_key, created_by
         )
         VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          dto.party_id,
          dto.expected_delivery_date || null,
          subtotal,
          taxableAmount,
          gstRate,
          gstAmount,
          roundOff,
          totalAmount,
          dto.notes || null,
          dto.idempotency_key || null,
          user.id,
        ],
      );

      const order = orderRes.rows[0];

      // 2. Insert Order Lines
      for (const line of dto.lines) {
        await client.query(
          `INSERT INTO ${linesTable} (
             order_id, item_id, unit, pieces, weight_kg, rate, amount
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            order.id,
            line.item_id,
            line.unit,
            line.unit === 'PCS' ? line.pieces : null,
            line.unit === 'KG' ? line.weight_kg : null,
            line.rate,
            line.amount,
          ],
        );
      }

      // 3. Audit Log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'CREATE', '${headerTable}', $2, NULL, $3)`,
        [user.id, order.id, JSON.stringify(order)],
      );

      return this.findOne(dto.type, order.id, user);
    });
  }

  async convertToBill(type: 'SO' | 'PO', id: string, user: AuthUser) {
    const order = await this.findOne(type, id, user);

    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot convert order #${order.order_no} because its status is already ${order.status}`,
      );
    }

    // Build prefilled bill lines from pending quantities
    const unfulfilledLines = order.lines
      .map((line: any) => {
        const pendingPieces = line.unit === 'PCS'
          ? Math.max(0, (line.pieces || 0) - (line.fulfilled_pieces || 0))
          : undefined;
        const pendingWeight = line.unit === 'KG'
          ? Math.max(0, parseFloat(line.weight_kg || '0') - parseFloat(line.fulfilled_weight_kg || '0'))
          : undefined;

        // Skip fully fulfilled lines
        if (line.unit === 'PCS' && pendingPieces === 0) return null;
        if (line.unit === 'KG' && (pendingWeight || 0) <= 0.0001) return null;

        const lineAmount = line.unit === 'PCS'
          ? Math.round((pendingPieces || 0) * parseFloat(line.rate) * 100) / 100
          : Math.round((pendingWeight || 0) * parseFloat(line.rate) * 100) / 100;

        return {
          item_id: line.item_id,
          item_name: line.item_name,
          item_code: line.item_code,
          unit: line.unit,
          pieces: pendingPieces,
          weight_kg: pendingWeight,
          rate: parseFloat(line.rate),
          amount: lineAmount,
        };
      })
      .filter(Boolean);

    // Mark order COMPLETED (or PARTIAL)
    const { headerTable } = this.getTableNames(type);
    await this.db.query(
      `UPDATE ${headerTable} SET status = 'COMPLETED' WHERE id = $1`,
      [id],
    );

    return {
      order_id: order.id,
      order_no: order.order_no,
      order_type: type,
      party_id: order.party_id,
      party_name: order.party_name,
      party_type: order.party_type,
      notes: `Converted from ${type === 'SO' ? 'SO' : 'PO'} #${order.order_no}. ${order.notes || ''}`.trim(),
      prefilled_lines: unfulfilledLines,
      subtotal: order.subtotal,
      total_amount: order.total_amount,
    };
  }

  async updateStatus(
    type: 'SO' | 'PO',
    id: string,
    dto: UpdateOrderStatusDto,
    user: AuthUser,
  ) {
    const order = await this.findOne(type, id, user);
    const { headerTable } = this.getTableNames(type);

    const res = await this.db.query(
      `UPDATE ${headerTable} SET status = $1 WHERE id = $2 RETURNING *`,
      [dto.status, id],
    );

    await this.db.query(
      `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
       VALUES ($1, 'UPDATE_STATUS', '${headerTable}', $2, $3, $4)`,
      [user.id, id, JSON.stringify({ status: order.status }), JSON.stringify({ status: dto.status })],
    );

    return res.rows[0];
  }

  async softDelete(type: 'SO' | 'PO', id: string, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can delete orders');
    }

    const order = await this.findOne(type, id, user);
    const { headerTable } = this.getTableNames(type);

    await this.db.query(
      `UPDATE ${headerTable} SET is_deleted = true, deleted_at = now(), deleted_by = $1 WHERE id = $2`,
      [user.id, id],
    );

    await this.db.query(
      `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
       VALUES ($1, 'SOFT_DELETE', '${headerTable}', $2, $3, $4)`,
      [user.id, id, JSON.stringify(order), JSON.stringify({ is_deleted: true, deleted_by: user.id })],
    );

    return { success: true, message: `${type === 'SO' ? 'Sales' : 'Purchase'} order deleted` };
  }
}
