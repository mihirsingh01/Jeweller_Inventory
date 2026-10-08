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

export interface CreateJobWorkDto {
  work_type: 'POLISH' | 'MEENA';
  party_id: string;
  item_id: string;
  direction: 'ISSUE' | 'RECEIVE';
  weight_kg: number;
  charge_amount?: number;
  notes?: string;
}

export interface UpdateJobWorkDto {
  direction?: 'ISSUE' | 'RECEIVE';
  weight_kg?: number;
  charge_amount?: number;
  notes?: string;
}

@Injectable()
export class JobWorkService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async findAll(user: AuthUser, limit = 50, offset = 0) {
    const conditions: string[] = ['jw.is_deleted = false'];
    const params: any[] = [];
    let idx = 1;

    if (user.role === 'STAFF') {
      conditions.push(`jw.created_by = $${idx++}`);
      params.push(user.id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT jw.*, p.name AS party_name, i.name AS item_name, u.name AS creator_name
      FROM job_work_entries jw
      JOIN parties p ON p.id = jw.party_id
      JOIN items i ON i.id = jw.item_id
      JOIN users u ON u.id = jw.created_by
      ${where}
      ORDER BY jw.entry_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async findOne(id: string, user: AuthUser) {
    const query = `
      SELECT jw.*, p.name AS party_name, i.name AS item_name, u.name AS creator_name
      FROM job_work_entries jw
      JOIN parties p ON p.id = jw.party_id
      JOIN items i ON i.id = jw.item_id
      JOIN users u ON u.id = jw.created_by
      WHERE jw.id = $1 AND jw.is_deleted = false
    `;
    const res = await this.db.query(query, [id]);
    if (res.rows.length === 0) {
      throw new NotFoundException('Job work entry not found');
    }
    const jw = res.rows[0];
    if (user.role === 'STAFF' && jw.created_by !== user.id) {
      throw new NotFoundException('Job work entry not found');
    }
    return jw;
  }

  async getBalances() {
    const query = `
      SELECT p.id AS party_id, p.name AS party_name,
             i.id AS item_id, i.name AS item_name,
             jw.work_type,
             COALESCE(SUM(CASE WHEN jw.direction = 'ISSUE' THEN jw.weight_kg ELSE -jw.weight_kg END), 0) AS net_weight_with_worker
      FROM job_work_entries jw
      JOIN parties p ON p.id = jw.party_id
      JOIN items i ON i.id = jw.item_id
      WHERE jw.is_deleted = false
      GROUP BY p.id, p.name, i.id, i.name, jw.work_type
      HAVING COALESCE(SUM(CASE WHEN jw.direction = 'ISSUE' THEN jw.weight_kg ELSE -jw.weight_kg END), 0) <> 0
      ORDER BY p.name ASC
    `;
    const res = await this.db.query(query);
    return res.rows;
  }

  async create(dto: CreateJobWorkDto, user: AuthUser) {
    if (dto.weight_kg <= 0) {
      throw new BadRequestException('Weight in Kg must be strictly greater than zero');
    }
    if (dto.charge_amount !== undefined && dto.charge_amount < 0) {
      throw new BadRequestException('Charge amount cannot be negative');
    }

    const savedJw = await this.db.withTransaction(async (client) => {
      const charge = dto.charge_amount || 0;

      // 1. Insert Job Work Entry
      const jwRes = await client.query(
        `INSERT INTO job_work_entries (work_type, party_id, item_id, direction, weight_kg, charge_amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          dto.work_type,
          dto.party_id,
          dto.item_id,
          dto.direction,
          dto.weight_kg,
          charge,
          dto.notes || null,
          user.id,
        ],
      );
      const jw = jwRes.rows[0];

      // 2. Stock Movement (Kg only)
      const kgDelta = dto.direction === 'ISSUE' ? -dto.weight_kg : dto.weight_kg;
      const movementType = `${dto.work_type}_${dto.direction}`; // e.g. POLISH_ISSUE, MEENA_RECEIVE
      await client.query(
        `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
         VALUES ($1, $2, $3, 0, $4)`,
        [dto.item_id, movementType, jw.id, kgDelta],
      );

      // 3. Optional Ledger Entry for service charge
      if (charge > 0) {
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'JOB_WORK_CHARGE', $2, 0, $3)`,
          [dto.party_id, jw.id, charge],
        );
      }

      return jw;
    });

    // 4. Emit EntrySaved domain event after commit
    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'JOB_WORK',
        id: savedJw.id,
        partyId: savedJw.party_id,
        amount: savedJw.charge_amount,
        weightKg: savedJw.weight_kg,
        staffId: user.id,
        staffName: user.name,
        timestamp: new Date().toISOString(),
      }),
    );

    return savedJw;
  }

  async update(id: string, dto: UpdateJobWorkDto, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can edit job work entries');
    }

    const updatedJw = await this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM job_work_entries WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException('Job work entry not found');
      }
      const oldJw = res.rows[0];

      // 1. Reversing Stock: Reverse previous kgDelta
      const oldKgDelta = oldJw.direction === 'ISSUE' ? -oldJw.weight_kg : oldJw.weight_kg;
      await client.query(
        `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
         VALUES ($1, 'JOB_WORK_REVERSAL', $2, 0, $3)`,
        [oldJw.item_id, id, -oldKgDelta],
      );

      // 2. Reversing Ledger: If old charge existed, reverse it
      if (oldJw.charge_amount > 0) {
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'JOB_WORK_CHARGE_REVERSAL', $2, $3, 0)`,
          [oldJw.party_id, id, oldJw.charge_amount],
        );
      }

      // New values
      const newDirection = dto.direction || oldJw.direction;
      const newWeight = dto.weight_kg !== undefined ? dto.weight_kg : oldJw.weight_kg;
      const newCharge = dto.charge_amount !== undefined ? dto.charge_amount : oldJw.charge_amount;
      const newNotes = dto.notes !== undefined ? dto.notes : oldJw.notes;

      // 3. New Stock Movement
      const newKgDelta = newDirection === 'ISSUE' ? -newWeight : newWeight;
      await client.query(
        `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
         VALUES ($1, 'JOB_WORK', $2, 0, $3)`,
        [oldJw.item_id, id, newKgDelta],
      );

      // 4. New Ledger entry if charge > 0
      if (newCharge > 0) {
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'JOB_WORK_CHARGE', $2, 0, $3)`,
          [oldJw.party_id, id, newCharge],
        );
      }

      // 5. Update Job Work Header
      const updateRes = await client.query(
        `UPDATE job_work_entries 
         SET direction = $1, weight_kg = $2, charge_amount = $3, notes = $4 
         WHERE id = $5 
         RETURNING *`,
        [newDirection, newWeight, newCharge, newNotes, id],
      );
      const newJw = updateRes.rows[0];

      // 6. Append to audit_log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'UPDATE', 'job_work_entries', $2, $3, $4)`,
        [user.id, id, JSON.stringify(oldJw), JSON.stringify(newJw)],
      );

      return newJw;
    });

    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'JOB_WORK',
        id: updatedJw.id,
        partyId: updatedJw.party_id,
        amount: updatedJw.charge_amount,
        weightKg: updatedJw.weight_kg,
        staffId: user.id,
        staffName: user.name,
        timestamp: new Date().toISOString(),
      }),
    );

    return updatedJw;
  }

  async softDelete(id: string, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can delete job work entries');
    }

    return await this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM job_work_entries WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException('Job work entry not found');
      }
      const jw = res.rows[0];

      // Reversing Stock Movement
      const kgDelta = jw.direction === 'ISSUE' ? -jw.weight_kg : jw.weight_kg;
      await client.query(
        `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
         VALUES ($1, 'JOB_WORK_REVERSAL', $2, 0, $3)`,
        [jw.item_id, id, -kgDelta],
      );

      // Reversing Ledger Entry if charge was present
      if (jw.charge_amount > 0) {
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'JOB_WORK_CHARGE_REVERSAL', $2, $3, 0)`,
          [jw.party_id, id, jw.charge_amount],
        );
      }

      await client.query(
        `UPDATE job_work_entries SET is_deleted = true, deleted_at = now(), deleted_by = $1 WHERE id = $2`,
        [user.id, id],
      );

      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'SOFT_DELETE', 'job_work_entries', $2, $3, $4)`,
        [user.id, id, JSON.stringify(jw), JSON.stringify({ is_deleted: true, deleted_by: user.id })],
      );

      return { success: true, message: 'Job work entry deleted and reversing stock/ledger entries created' };
    });
  }
}
