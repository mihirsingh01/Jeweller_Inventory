import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(
    actorId?: string,
    tableName?: string,
    recordId?: string,
    startDate?: string,
    endDate?: string,
    action?: string,
    limit = 50,
    offset = 0,
  ) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (actorId) {
      conditions.push(`al.actor_id = $${idx++}`);
      params.push(actorId);
    }

    if (tableName) {
      conditions.push(`al.table_name = $${idx++}`);
      params.push(tableName);
    }

    if (action) {
      conditions.push(`al.action = $${idx++}`);
      params.push(action);
    }

    if (recordId) {
      conditions.push(`al.record_id = $${idx++}`);
      params.push(recordId);
    }

    if (startDate) {
      conditions.push(`al.at >= $${idx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`al.at <= $${idx++}`);
      params.push(endDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) AS total FROM audit_log al ${where}`;
    const countRes = await this.db.query(countQuery, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const queryParams = [...params, limit, offset];

    const query = `
      SELECT al.*, u.name AS actor_name, u.username AS actor_username
      FROM audit_log al
      JOIN users u ON u.id = al.actor_id
      ${where}
      ORDER BY al.at DESC, al.id DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, queryParams);
    return {
      total,
      limit,
      offset,
      logs: res.rows,
    };
  }
}
