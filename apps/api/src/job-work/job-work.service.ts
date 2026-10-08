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
  CreateJobWorkDto,
  UpdateJobWorkDto,
  JobWorkLineDto,
} from './job-work.dto';

@Injectable()
export class JobWorkService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async findAll(user: AuthUser, limit = 50, offset = 0, workType?: string) {
    const conditions: string[] = ['jw.is_deleted = false'];
    const params: any[] = [];
    let idx = 1;

    if (user.role === 'STAFF') {
      conditions.push(`jw.created_by = $${idx++}`);
      params.push(user.id);
    }

    if (workType) {
      conditions.push(`jw.work_type = $${idx++}`);
      params.push(workType);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT jw.*, p.name AS party_name, p.whatsapp_number AS party_phone, u.name AS creator_name,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'id', jl.id,
              'issue_line_id', jl.issue_line_id,
              'item_id', jl.item_id,
              'item_name', i.name,
              'item_code', i.code,
              'unit', jl.unit,
              'pieces', jl.pieces,
              'weight_kg', jl.weight_kg,
              'labour_charge', jl.labour_charge,
              'is_closed', jl.is_closed,
              'notes', jl.notes
            )
          ) FROM job_work_lines jl
          JOIN items i ON i.id = jl.item_id
          WHERE jl.job_work_id = jw.id),
          '[]'::json
        ) AS lines
      FROM job_work_entries jw
      JOIN parties p ON p.id = jw.party_id
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
      SELECT jw.*, p.name AS party_name, p.whatsapp_number AS party_phone, u.name AS creator_name
      FROM job_work_entries jw
      JOIN parties p ON p.id = jw.party_id
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

    // Dynamic Karigar ledger balance (Req 31)
    if (jw.direction === 'RECEIVE' && Number(jw.charge_amount) > 0) {
      const ledgerEntryRes = await this.db.query(
        `SELECT id FROM ledger_entries WHERE source_type = 'JOB_WORK_LABOUR' AND source_id = $1 LIMIT 1`,
        [id],
      );
      if (ledgerEntryRes.rows.length > 0) {
        const ledgerId = ledgerEntryRes.rows[0].id;
        const priorBalRes = await this.db.query(
          `SELECT p.opening_balance,
                  COALESCE(SUM(le.credit - le.debit), 0) AS prior_diff
           FROM parties p
           LEFT JOIN ledger_entries le ON le.party_id = p.id AND le.id < $1
           WHERE p.id = $2
           GROUP BY p.id, p.opening_balance`,
          [ledgerId, jw.party_id],
        );
        if (priorBalRes.rows.length > 0) {
          jw.balance_before = Number(priorBalRes.rows[0].opening_balance || 0) + Number(priorBalRes.rows[0].prior_diff || 0);
          jw.this_labour = Number(jw.charge_amount);
          jw.balance_after = jw.balance_before + jw.this_labour;
        }
      }
    }

    const linesRes = await this.db.query(
      `SELECT jl.*, i.name AS item_name, i.code AS item_code,
              orig.pieces AS orig_pieces, orig.weight_kg AS orig_weight_kg
       FROM job_work_lines jl
       JOIN items i ON i.id = jl.item_id
       LEFT JOIN job_work_lines orig ON orig.id = jl.issue_line_id
       WHERE jl.job_work_id = $1
       ORDER BY jl.id ASC`,
      [id],
    );
    jw.lines = linesRes.rows;

    return jw;
  }

  /**
   * Returns all pending issue lines for a specific Karigar (Req 32)
   * Respects Phase 2 staff isolation (Staff only sees their own issued lines).
   */
  async getPendingIssueLines(partyId: string, user: AuthUser, workType?: string) {
    const conditions: string[] = [
      'jw.is_deleted = false',
      "jw.direction = 'ISSUE'",
      'jw.party_id = $1',
      'jl.is_closed = false',
    ];
    const params: any[] = [partyId];
    let idx = 2;

    if (user.role === 'STAFF') {
      conditions.push(`jw.created_by = $${idx++}`);
      params.push(user.id);
    }

    if (workType) {
      conditions.push(`jw.work_type = $${idx++}`);
      params.push(workType);
    }

    const query = `
      SELECT 
        jl.id AS issue_line_id,
        jl.job_work_id,
        jw.entry_no,
        jw.work_type,
        jw.entry_at,
        jl.item_id,
        i.name AS item_name,
        i.code AS item_code,
        jl.unit,
        jl.pieces AS sent_pieces,
        jl.weight_kg AS sent_weight_kg,
        COALESCE(
          (SELECT SUM(rl.pieces)
           FROM job_work_lines rl
           JOIN job_work_entries rjw ON rjw.id = rl.job_work_id
           WHERE rl.issue_line_id = jl.id AND rjw.is_deleted = false),
          0
        ) AS already_received_pieces,
        COALESCE(
          (SELECT SUM(rl.weight_kg)
           FROM job_work_lines rl
           JOIN job_work_entries rjw ON rjw.id = rl.job_work_id
           WHERE rl.issue_line_id = jl.id AND rjw.is_deleted = false),
          0
        ) AS already_received_weight_kg
      FROM job_work_lines jl
      JOIN job_work_entries jw ON jw.id = jl.job_work_id
      JOIN items i ON i.id = jl.item_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY jw.entry_at ASC, jl.id ASC
    `;

    const res = await this.db.query(query, params);

    // Compute remaining pending quantities and filter out completed lines
    return res.rows
      .map((row) => {
        const sentPieces = Number(row.sent_pieces);
        const sentWeight = Number(row.sent_weight_kg);
        const recvPieces = Number(row.already_received_pieces);
        const recvWeight = Number(row.already_received_weight_kg);

        const pendingPieces = Math.max(0, sentPieces - recvPieces);
        const pendingWeight = Math.max(0, Math.round((sentWeight - recvWeight) * 1000) / 1000);

        return {
          ...row,
          sent_pieces: sentPieces,
          sent_weight_kg: sentWeight,
          already_received_pieces: recvPieces,
          already_received_weight_kg: recvWeight,
          pending_pieces: pendingPieces,
          pending_weight_kg: pendingWeight,
        };
      })
      .filter((row) => row.pending_pieces > 0 || row.pending_weight_kg > 0);
  }

  async create(dto: CreateJobWorkDto, user: AuthUser) {
    if (dto.idempotency_key) {
      const existing = await this.db.query(
        `SELECT id FROM job_work_entries WHERE idempotency_key = $1`,
        [dto.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return this.findOne(existing.rows[0].id, user);
      }
    }

    // Normalize lines
    let linesToProcess: JobWorkLineDto[] = [];
    if (dto.lines && dto.lines.length > 0) {
      linesToProcess = dto.lines;
    } else if (dto.item_id) {
      linesToProcess = [
        {
          item_id: dto.item_id,
          unit: 'KG',
          pieces: 0,
          weight_kg: Number(dto.weight_kg) || 0,
          labour_charge: Number(dto.charge_amount) || 0,
        },
      ];
    } else {
      throw new BadRequestException('At least one item line is required');
    }

    // Validation
    for (const line of linesToProcess) {
      if ((line.pieces || 0) < 0 || (line.weight_kg || 0) < 0 || (line.labour_charge || 0) < 0) {
        throw new BadRequestException('Quantities, weights, and labour charges cannot be negative');
      }
      if ((line.pieces || 0) <= 0 && (line.weight_kg || 0) <= 0) {
        throw new BadRequestException('Pieces or weight (Kg) must be strictly greater than zero for each line');
      }
      if (dto.direction === 'RECEIVE' && !line.issue_line_id) {
        throw new BadRequestException('Received lines must link to an existing issue line');
      }
    }

    const savedJw = await this.db.withTransaction(async (client) => {
      let totalWeight = 0;
      let totalLabourCharge = 0;

      for (const line of linesToProcess) {
        totalWeight += Number(line.weight_kg) || 0;
        totalLabourCharge += Number(line.labour_charge) || 0;
      }
      totalWeight = Math.round(totalWeight * 1000) / 1000;
      totalLabourCharge = Math.round(totalLabourCharge * 100) / 100;

      // 1. Insert Header
      const headerRes = await client.query(
        `INSERT INTO job_work_entries (
           work_type, party_id, direction, issue_id, weight_kg, charge_amount, notes, created_by, idempotency_key
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          dto.work_type,
          dto.party_id,
          dto.direction,
          dto.issue_id || null,
          totalWeight,
          totalLabourCharge,
          dto.notes || null,
          user.id,
          dto.idempotency_key || null,
        ],
      );
      const jw = headerRes.rows[0];

      // 2. Process Lines & Stock Movements
      for (const line of linesToProcess) {
        let itemId = line.item_id;
        let unit = line.unit || ((line.pieces || 0) > 0 && !(line.weight_kg || 0) ? 'PCS' : 'KG');
        const pieces = Number(line.pieces) || 0;
        const weightKg = Number(line.weight_kg) || 0;
        const labourCharge = Number(line.labour_charge) || 0;

        // If receiving, retrieve item and unit from the linked issue line if missing
        if (dto.direction === 'RECEIVE' && line.issue_line_id) {
          const issueLineRes = await client.query(
            `SELECT jl.*, jw.created_by FROM job_work_lines jl
             JOIN job_work_entries jw ON jw.id = jl.job_work_id
             WHERE jl.id = $1`,
            [line.issue_line_id],
          );
          if (issueLineRes.rows.length === 0) {
            throw new NotFoundException(`Linked issue line ${line.issue_line_id} not found`);
          }
          const issueLine = issueLineRes.rows[0];
          if (user.role === 'STAFF' && issueLine.created_by !== user.id) {
            throw new NotFoundException('Cannot receive against another staff member’s issue');
          }
          if (!itemId) itemId = issueLine.item_id;
          if (!unit) unit = issueLine.unit;

          // Close line with shortage if requested (Req 32)
          if (line.is_closed) {
            await client.query(
              `UPDATE job_work_lines SET is_closed = true WHERE id = $1`,
              [line.issue_line_id],
            );
          }
        }

        // Insert job_work_lines row
        await client.query(
          `INSERT INTO job_work_lines (
             job_work_id, issue_line_id, item_id, unit, pieces, weight_kg, labour_charge, is_closed, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            jw.id,
            line.issue_line_id || null,
            itemId,
            unit,
            pieces,
            weightKg,
            labourCharge,
            line.is_closed || false,
            line.notes || null,
          ],
        );

        // Stock movement:
        // ISSUE: stock leaves workshop to Karigar (-pieces, -kg)
        // RECEIVE: stock returns to workshop (+pieces, +kg)
        const piecesDelta = dto.direction === 'ISSUE' ? -pieces : +pieces;
        const kgDelta = dto.direction === 'ISSUE' ? -weightKg : +weightKg;
        const sourceType = `${dto.work_type}_${dto.direction}`; // e.g. POLISH_ISSUE, POLISH_RECEIVE

        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, $2, $3, $4, $5)`,
          [itemId, sourceType, jw.id, piecesDelta, kgDelta],
        );
      }

      // 3. Financial Ledger Entry for Labour (Req 33):
      // Only posted on RECEIVE (Decision 7: Credit Karigar for service rendered)
      if (dto.direction === 'RECEIVE' && totalLabourCharge > 0) {
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'JOB_WORK_LABOUR', $2, 0, $3)`,
          [dto.party_id, jw.id, totalLabourCharge],
        );
      }

      // 4. Audit Log (Req 41)
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'CREATE', 'job_work_entries', $2, NULL, $3)`,
        [user.id, jw.id, JSON.stringify({ ...jw, lines: linesToProcess })],
      );

      // 5. Notification Outbox (Req 3)
      await client.query(
        `INSERT INTO notification_outbox (event_type, entity_type, entity_id, payload)
         VALUES ('JOB_WORK_CREATED', 'job_work_entries', $1, $2)`,
        [
          jw.id,
          JSON.stringify({
            entry_no: jw.entry_no,
            work_type: jw.work_type,
            direction: jw.direction,
            party_id: jw.party_id,
            total_weight: totalWeight,
            total_labour: totalLabourCharge,
            created_by: user.id,
            created_by_name: user.name,
          }),
        ],
      );

      return jw;
    });

    // 6. Emit EntrySaved domain event after commit
    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'JOB_WORK',
        id: savedJw.id,
        partyId: savedJw.party_id,
        amount: savedJw.charge_amount,
        weightKg: savedJw.weight_kg,
        staffId: user.id,
        staffName: user.name,
        billNo: savedJw.entry_no,
        timestamp: new Date().toISOString(),
      }),
    );

    return savedJw;
  }

  async update(id: string, dto: UpdateJobWorkDto, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can edit job work entries');
    }

    return await this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM job_work_entries WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException('Job work entry not found');
      }
      const oldJw = res.rows[0];

      // Update notes or basic metadata
      const updateRes = await client.query(
        `UPDATE job_work_entries 
         SET notes = COALESCE($1, notes)
         WHERE id = $2 
         RETURNING *`,
        [dto.notes || null, id],
      );
      const newJw = updateRes.rows[0];

      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'UPDATE', 'job_work_entries', $2, $3, $4)`,
        [user.id, id, JSON.stringify(oldJw), JSON.stringify(newJw)],
      );

      return newJw;
    });
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

      // 1. If this was an ISSUE, ensure no RECEIVE lines have been logged against its lines
      if (jw.direction === 'ISSUE') {
        const hasReceives = await client.query(
          `SELECT rl.id FROM job_work_lines rl
           JOIN job_work_lines il ON il.id = rl.issue_line_id
           JOIN job_work_entries rjw ON rjw.id = rl.job_work_id
           WHERE il.job_work_id = $1 AND rjw.is_deleted = false`,
          [id],
        );
        if (hasReceives.rows.length > 0) {
          throw new BadRequestException('Cannot delete issue entry that already has received lines recorded against it. Delete receive entries first.');
        }
      }

      // 2. Reversing Stock Movements
      const lines = (
        await client.query(`SELECT * FROM job_work_lines WHERE job_work_id = $1`, [id])
      ).rows;

      for (const line of lines) {
        // Reverse delta: if issue was negative, reversal is positive; if receive was positive, reversal is negative
        const revPiecesDelta = jw.direction === 'ISSUE' ? +line.pieces : -line.pieces;
        const revKgDelta = jw.direction === 'ISSUE' ? +line.weight_kg : -line.weight_kg;

        await client.query(
          `INSERT INTO stock_movements (item_id, source_type, source_id, pieces_delta, kg_delta)
           VALUES ($1, 'JOB_WORK_REVERSAL', $2, $3, $4)`,
          [line.item_id, id, revPiecesDelta, revKgDelta],
        );

        // If receive closed an issue line with shortage, unclose it
        if (jw.direction === 'RECEIVE' && line.issue_line_id && line.is_closed) {
          await client.query(
            `UPDATE job_work_lines SET is_closed = false WHERE id = $1`,
            [line.issue_line_id],
          );
        }
      }

      // 3. Reversing Ledger Entry if labour charge existed (debit Karigar)
      if (jw.direction === 'RECEIVE' && Number(jw.charge_amount) > 0) {
        await client.query(
          `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
           VALUES ($1, 'JOB_WORK_LABOUR_REVERSAL', $2, $3, 0)`,
          [jw.party_id, id, jw.charge_amount],
        );
      }

      // 4. Soft-delete header
      await client.query(
        `UPDATE job_work_entries SET is_deleted = true, deleted_at = now(), deleted_by = $1 WHERE id = $2`,
        [user.id, id],
      );

      // 5. Audit Log snapshot
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'SOFT_DELETE', 'job_work_entries', $2, $3, $4)`,
        [user.id, id, JSON.stringify(jw), JSON.stringify({ is_deleted: true, deleted_by: user.id })],
      );

      return { success: true, message: 'Job work entry deleted and reversing stock/ledger entries created' };
    });
  }

  async getBalances() {
    const query = `
      SELECT p.id AS party_id, p.name AS party_name,
             i.id AS item_id, i.name AS item_name,
             jw.work_type,
             COALESCE(SUM(CASE WHEN jw.direction = 'ISSUE' THEN jl.weight_kg ELSE -jl.weight_kg END), 0) AS net_weight_with_worker,
             COALESCE(SUM(CASE WHEN jw.direction = 'ISSUE' THEN jl.pieces ELSE -jl.pieces END), 0) AS net_pieces_with_worker
      FROM job_work_lines jl
      JOIN job_work_entries jw ON jw.id = jl.job_work_id
      JOIN parties p ON p.id = jw.party_id
      JOIN items i ON i.id = jl.item_id
      WHERE jw.is_deleted = false
      GROUP BY p.id, p.name, i.id, i.name, jw.work_type
      HAVING COALESCE(SUM(CASE WHEN jw.direction = 'ISSUE' THEN jl.weight_kg ELSE -jl.weight_kg END), 0) <> 0
          OR COALESCE(SUM(CASE WHEN jw.direction = 'ISSUE' THEN jl.pieces ELSE -jl.pieces END), 0) <> 0
      ORDER BY p.name ASC
    `;
    const res = await this.db.query(query);
    return res.rows;
  }
}
