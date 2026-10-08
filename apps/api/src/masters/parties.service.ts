import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

export interface CreatePartyDto {
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  whatsapp_number?: string;
  address?: string;
  work_types?: string;
  opening_balance?: number;
}

export interface UpdatePartyDto {
  name?: string;
  type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  whatsapp_number?: string;
  address?: string;
  work_types?: string;
  opening_balance?: number;
  is_active?: boolean;
}

@Injectable()
export class PartiesService {
  constructor(private readonly db: DatabaseService) {}

  validateAndNormalizeIndianMobile(phone?: string): string | null {
    if (!phone || !phone.trim()) return null;
    const clean = phone.trim().replace(/[\s\-\(\)]/g, '');

    // 10-digit Indian mobile starting with 6, 7, 8, 9
    if (/^[6-9]\d{9}$/.test(clean)) {
      return `+91${clean}`;
    }
    // 0 followed by 10 digits
    if (/^0[6-9]\d{9}$/.test(clean)) {
      return `+91${clean.slice(1)}`;
    }
    // +91 followed by 10 digits
    if (/^\+91[6-9]\d{9}$/.test(clean)) {
      return clean;
    }
    // General E.164 international format
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    if (e164Regex.test(clean)) {
      return clean;
    }

    throw new BadRequestException(
      'Invalid mobile number. Please enter a 10-digit Indian mobile (e.g. 9829012345 or +919829012345)',
    );
  }

  maskMobile(phone?: string, isOwner = false, reveal = false): string | null {
    if (!phone) return null;
    if (isOwner && reveal) return phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return '••••••';
    const last4 = digits.slice(-4);
    return `••••••${last4}`;
  }

  async findAll(
    user?: AuthUser,
    search?: string,
    type?: string,
    revealPhone = false,
    limit = 50,
    offset = 0,
  ) {
    const conditions: string[] = ['is_active = true'];
    const params: any[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(name ILIKE $${idx} OR whatsapp_number ILIKE $${idx} OR address ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    if (type) {
      conditions.push(`(type = $${idx} OR type = 'BOTH')`);
      params.push(type);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT p.id, p.name, p.type, p.whatsapp_number, p.address, p.work_types, p.opening_balance, p.is_active, p.created_at, p.created_by,
        COALESCE(
          p.opening_balance + (
            SELECT COALESCE(SUM(debit - credit), 0)
            FROM ledger_entries
            WHERE party_id = p.id
          ),
          p.opening_balance
        ) AS current_balance
      FROM parties p
      ${whereClause}
      ORDER BY p.name ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    const res = await this.db.query(query, params);
    const isOwner = user?.role === 'OWNER';

    return res.rows.map((party) => ({
      ...party,
      opening_balance: Number(party.opening_balance),
      current_balance: Number(party.current_balance),
      whatsapp_number: this.maskMobile(party.whatsapp_number, isOwner, revealPhone),
      raw_phone_masked: !isOwner || !revealPhone,
    }));
  }

  async findOne(id: string, user?: AuthUser, revealPhone = false) {
    const res = await this.db.query(
      `SELECT p.*,
        COALESCE(
          p.opening_balance + (
            SELECT COALESCE(SUM(debit - credit), 0)
            FROM ledger_entries
            WHERE party_id = p.id
          ),
          p.opening_balance
        ) AS current_balance
       FROM parties p
       WHERE p.id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Party not found');
    }

    const party = res.rows[0];
    const isOwner = user?.role === 'OWNER';

    return {
      ...party,
      whatsapp_number: this.maskMobile(party.whatsapp_number, isOwner, revealPhone),
      raw_phone_masked: !isOwner || !revealPhone,
    };
  }

  async create(dto: CreatePartyDto, user: AuthUser) {
    const normalizedMobile = this.validateAndNormalizeIndianMobile(dto.whatsapp_number);

    const res = await this.db.query(
      `INSERT INTO parties (name, type, whatsapp_number, address, work_types, opening_balance, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        dto.name.trim(),
        dto.type,
        normalizedMobile,
        dto.address ? dto.address.trim() : null,
        dto.work_types ? dto.work_types.trim() : null,
        dto.opening_balance || 0,
        user.id,
      ],
    );

    const party = res.rows[0];

    // Write audit log row
    await this.db.query(
      `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
       VALUES ($1, 'CREATE', 'parties', $2, null, $3)`,
      [user.id, party.id, JSON.stringify(party)],
    );

    const isOwner = user.role === 'OWNER';
    return {
      ...party,
      whatsapp_number: this.maskMobile(party.whatsapp_number, isOwner, false),
      raw_phone_masked: true,
    };
  }

  async update(id: string, dto: UpdatePartyDto, user: AuthUser) {
    const oldPartyRes = await this.db.query(`SELECT * FROM parties WHERE id = $1`, [id]);
    if (oldPartyRes.rows.length === 0) {
      throw new NotFoundException('Party not found');
    }
    const oldParty = oldPartyRes.rows[0];

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(dto.name.trim());
    }
    if (dto.type !== undefined) {
      updates.push(`type = $${idx++}`);
      values.push(dto.type);
    }
    if (dto.whatsapp_number !== undefined) {
      const normalized = this.validateAndNormalizeIndianMobile(dto.whatsapp_number);
      updates.push(`whatsapp_number = $${idx++}`);
      values.push(normalized);
    }
    if (dto.address !== undefined) {
      updates.push(`address = $${idx++}`);
      values.push(dto.address ? dto.address.trim() : null);
    }
    if (dto.work_types !== undefined) {
      updates.push(`work_types = $${idx++}`);
      values.push(dto.work_types ? dto.work_types.trim() : null);
    }
    if (dto.opening_balance !== undefined) {
      updates.push(`opening_balance = $${idx++}`);
      values.push(dto.opening_balance);
    }
    if (dto.is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(dto.is_active);
    }

    if (updates.length === 0) {
      throw new BadRequestException('No fields provided to update');
    }

    values.push(id);
    const res = await this.db.query(
      `UPDATE parties SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    const updatedParty = res.rows[0];

    // Write audit log row
    await this.db.query(
      `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
       VALUES ($1, 'UPDATE', 'parties', $2, $3, $4)`,
      [user.id, id, JSON.stringify(oldParty), JSON.stringify(updatedParty)],
    );

    const isOwner = user.role === 'OWNER';
    return {
      ...updatedParty,
      whatsapp_number: this.maskMobile(updatedParty.whatsapp_number, isOwner, false),
      raw_phone_masked: true,
    };
  }
}
