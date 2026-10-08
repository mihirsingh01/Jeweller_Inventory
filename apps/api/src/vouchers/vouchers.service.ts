import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateVoucherDto, UpdateVoucherDto } from './vouchers.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { DomainEventEmitter } from '../common/events/domain-event.emitter';
import { EntrySavedEvent } from '../common/events/entry-saved.event';

@Injectable()
export class VouchersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: DomainEventEmitter,
  ) {}

  async findAll(
    user: AuthUser,
    partyId?: string,
    kind?: string,
    mode?: string,
    limit = 50,
    offset = 0,
  ) {
    const conditions: string[] = ['mv.is_deleted = false'];
    const params: any[] = [];
    let idx = 1;

    if (user.role === 'STAFF') {
      conditions.push(`mv.created_by = $${idx++}`);
      params.push(user.id);
    }

    if (partyId) {
      conditions.push(`mv.party_id = $${idx++}`);
      params.push(partyId);
    }

    if (kind) {
      conditions.push(`mv.kind = $${idx++}`);
      params.push(kind);
    }

    if (mode) {
      conditions.push(`mv.mode = $${idx++}`);
      params.push(mode);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT mv.*, p.name AS party_name, p.whatsapp_number AS party_whatsapp,
             b.name AS bank_name, u.name AS creator_name,
             COALESCE(
               (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                 'id', va.id,
                 'sale_id', va.sale_id,
                 'purchase_id', va.purchase_id,
                 'amount', va.amount,
                 'sale_bill_no', s.bill_no,
                 'purchase_bill_no', pu.bill_no
               ))
               FROM voucher_allocations va
               LEFT JOIN sales s ON s.id = va.sale_id
               LEFT JOIN purchases pu ON pu.id = va.purchase_id
               WHERE va.voucher_id = mv.id),
               '[]'::json
             ) AS allocations
      FROM money_vouchers mv
      JOIN parties p ON p.id = mv.party_id
      LEFT JOIN bank_accounts b ON b.id = mv.bank_account_id
      JOIN users u ON u.id = mv.created_by
      ${where}
      ORDER BY mv.entry_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async findOne(id: string, user: AuthUser) {
    const query = `
      SELECT mv.*, p.name AS party_name, p.type AS party_type, p.whatsapp_number AS party_whatsapp,
             b.name AS bank_name, u.name AS creator_name,
             COALESCE(
               (SELECT JSON_AGG(JSON_BUILD_OBJECT(
                 'id', va.id,
                 'sale_id', va.sale_id,
                 'purchase_id', va.purchase_id,
                 'amount', va.amount,
                 'sale_bill_no', s.bill_no,
                 'sale_total', s.total_amount,
                 'purchase_bill_no', pu.bill_no,
                 'purchase_total', pu.total_amount
               ))
               FROM voucher_allocations va
               LEFT JOIN sales s ON s.id = va.sale_id
               LEFT JOIN purchases pu ON pu.id = va.purchase_id
               WHERE va.voucher_id = mv.id),
               '[]'::json
             ) AS allocations
      FROM money_vouchers mv
      JOIN parties p ON p.id = mv.party_id
      LEFT JOIN bank_accounts b ON b.id = mv.bank_account_id
      JOIN users u ON u.id = mv.created_by
      WHERE mv.id = $1 AND mv.is_deleted = false
    `;

    const res = await this.db.query(query, [id]);
    if (res.rows.length === 0) {
      throw new NotFoundException('Voucher not found');
    }

    const voucher = res.rows[0];
    if (user.role === 'STAFF' && voucher.created_by !== user.id) {
      throw new NotFoundException('Voucher not found');
    }

    // Dynamic historical party ledger balance (Req 46)
    const ledgerEntryRes = await this.db.query(
      `SELECT id FROM ledger_entries 
       WHERE source_type = 'VOUCHER' AND source_id = $1 
       ORDER BY id ASC LIMIT 1`,
      [id],
    );

    if (ledgerEntryRes.rows.length > 0) {
      const ledgerEntryId = ledgerEntryRes.rows[0].id;
      const isCustomer = voucher.party_type === 'CUSTOMER';
      // For customer: debit - credit is receivable balance (Dr)
      // For supplier/karigar: credit - debit is payable balance (Cr)
      const balanceExpr = isCustomer ? 'le.debit - le.credit' : 'le.credit - le.debit';
      const priorBalRes = await this.db.query(
        `SELECT p.opening_balance,
                COALESCE(SUM(${balanceExpr}), 0) AS prior_diff
         FROM parties p
         LEFT JOIN ledger_entries le ON le.party_id = p.id AND le.id < $1
         WHERE p.id = $2
         GROUP BY p.id, p.opening_balance`,
        [ledgerEntryId, voucher.party_id],
      );

      if (priorBalRes.rows.length > 0) {
        const opening = Number(priorBalRes.rows[0].opening_balance || 0);
        const priorDiff = Number(priorBalRes.rows[0].prior_diff || 0);
        voucher.balance_before = opening + priorDiff;
        voucher.this_voucher = Number(voucher.amount);
        // Receipt reduces customer receivable balance; Payment reduces supplier payable balance
        voucher.balance_after = voucher.balance_before - voucher.this_voucher;
      }
    }

    return voucher;
  }

  async create(dto: CreateVoucherDto, user: AuthUser) {
    if (dto.idempotency_key) {
      const existing = await this.db.query(
        `SELECT id FROM money_vouchers WHERE idempotency_key = $1 AND is_deleted = false`,
        [dto.idempotency_key],
      );
      if (existing.rows.length > 0) {
        return this.findOne(existing.rows[0].id, user);
      }
    }

    if (dto.mode === 'BANK') {
      if (!dto.bank_account_id) {
        throw new BadRequestException('A bank account is required when payment mode is BANK');
      }
      const bankRes = await this.db.query(
        `SELECT id, name, is_active FROM bank_accounts WHERE id = $1`,
        [dto.bank_account_id],
      );
      if (bankRes.rows.length === 0 || !bankRes.rows[0].is_active) {
        throw new BadRequestException('Invalid or inactive bank account specified');
      }
    } else if (dto.mode === 'CASH') {
      if (dto.bank_account_id) {
        throw new BadRequestException('Bank account must not be specified when payment mode is CASH');
      }
    }

    const partyRes = await this.db.query(
      `SELECT id, name, whatsapp_number, is_active FROM parties WHERE id = $1`,
      [dto.party_id],
    );
    if (partyRes.rows.length === 0 || !partyRes.rows[0].is_active) {
      throw new BadRequestException('Invalid or inactive party specified');
    }
    const party = partyRes.rows[0];

    const savedVoucher = await this.db.withTransaction(async (client) => {
      // 1. Insert Money Voucher (entry_at set by PostgreSQL DEFAULT now())
      const voucherRes = await client.query(
        `INSERT INTO money_vouchers (kind, party_id, mode, bank_account_id, amount, reference_no, notes, idempotency_key, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          dto.kind,
          dto.party_id,
          dto.mode,
          dto.mode === 'BANK' ? dto.bank_account_id : null,
          dto.amount,
          dto.reference_no || null,
          dto.notes || null,
          dto.idempotency_key || null,
          user.id,
        ],
      );
      const voucher = voucherRes.rows[0];

      // 2. Insert Ledger Entry
      // RECEIPT reduces customer balance -> CREDIT party ledger
      // PAYMENT reduces supplier balance -> DEBIT party ledger
      const isReceipt = dto.kind === 'RECEIPT';
      const debit = isReceipt ? 0 : dto.amount;
      const credit = isReceipt ? dto.amount : 0;

      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'VOUCHER', $2, $3, $4)`,
        [voucher.party_id, voucher.id, debit, credit],
      );

      // 3. Process Allocations
      if (dto.allocations && dto.allocations.length > 0) {
        let totalAllocated = 0;
        for (const alloc of dto.allocations) {
          if (!alloc.sale_id && !alloc.purchase_id) {
            throw new BadRequestException('Allocation must specify either a sale_id or purchase_id');
          }
          if (alloc.sale_id && alloc.purchase_id) {
            throw new BadRequestException('Allocation cannot specify both sale_id and purchase_id');
          }
          if (alloc.amount <= 0) {
            throw new BadRequestException('Allocation amount must be greater than zero');
          }

          totalAllocated += alloc.amount;

          if (alloc.sale_id) {
            const saleRes = await client.query(
              `SELECT s.id, s.bill_no, s.party_id, s.total_amount,
                COALESCE((SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id), 0) AS already_allocated
               FROM sales s WHERE s.id = $1 AND s.is_deleted = false`,
              [alloc.sale_id],
            );
            if (saleRes.rows.length === 0) {
              throw new NotFoundException(`Allocated sale ${alloc.sale_id} not found`);
            }
            const sale = saleRes.rows[0];
            if (sale.party_id !== dto.party_id) {
              throw new BadRequestException(`Sale #${sale.bill_no} does not belong to the voucher party`);
            }

            const outstanding = parseFloat(sale.total_amount) - parseFloat(sale.already_allocated);
            if (alloc.amount > outstanding + 0.001) {
              throw new BadRequestException(
                `Allocation ₹${alloc.amount} exceeds sale #${sale.bill_no} outstanding ₹${outstanding.toFixed(2)}`,
              );
            }

            await client.query(
              `INSERT INTO voucher_allocations (voucher_id, sale_id, amount) VALUES ($1, $2, $3)`,
              [voucher.id, alloc.sale_id, alloc.amount],
            );

            // Update sale status
            const newTotalAlloc = parseFloat(sale.already_allocated) + alloc.amount;
            const newStatus = newTotalAlloc >= parseFloat(sale.total_amount) - 0.001 ? 'PAID' : 'PARTIAL';
            await client.query(`UPDATE sales SET status = $1 WHERE id = $2`, [newStatus, alloc.sale_id]);
          } else if (alloc.purchase_id) {
            const purchaseRes = await client.query(
              `SELECT p.id, p.bill_no, p.party_id, p.total_amount,
                COALESCE((SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.purchase_id = p.id), 0) AS already_allocated
               FROM purchases p WHERE p.id = $1 AND p.is_deleted = false`,
              [alloc.purchase_id],
            );
            if (purchaseRes.rows.length === 0) {
              throw new NotFoundException(`Allocated purchase ${alloc.purchase_id} not found`);
            }
            const purchase = purchaseRes.rows[0];
            if (purchase.party_id !== dto.party_id) {
              throw new BadRequestException(`Purchase #${purchase.bill_no} does not belong to the voucher party`);
            }

            const outstanding = parseFloat(purchase.total_amount) - parseFloat(purchase.already_allocated);
            if (alloc.amount > outstanding + 0.001) {
              throw new BadRequestException(
                `Allocation ₹${alloc.amount} exceeds purchase #${purchase.bill_no} outstanding ₹${outstanding.toFixed(2)}`,
              );
            }

            await client.query(
              `INSERT INTO voucher_allocations (voucher_id, purchase_id, amount) VALUES ($1, $2, $3)`,
              [voucher.id, alloc.purchase_id, alloc.amount],
            );

            // Update purchase status
            const newTotalAlloc = parseFloat(purchase.already_allocated) + alloc.amount;
            const newStatus = newTotalAlloc >= parseFloat(purchase.total_amount) - 0.001 ? 'PAID' : 'PARTIAL';
            await client.query(`UPDATE purchases SET status = $1 WHERE id = $2`, [newStatus, alloc.purchase_id]);
          }
        }

        if (totalAllocated > dto.amount + 0.001) {
          throw new BadRequestException('Total bill allocations cannot exceed the voucher amount');
        }
      }

      // 4. Audit Log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'CREATE', 'money_vouchers', $2, NULL, $3)`,
        [user.id, voucher.id, JSON.stringify(voucher)],
      );

      // 5. Notification Outbox Row (Req 37)
      await client.query(
        `INSERT INTO notification_outbox (event_type, entity_type, entity_id, recipient_phone, payload, status)
         VALUES ($1, 'VOUCHER', $2, $3, $4, 'PENDING')`,
        [
          'VOUCHER_CREATED',
          voucher.id,
          party.whatsapp_number || null,
          JSON.stringify({
            voucher_id: voucher.id,
            voucher_no: voucher.voucher_no,
            kind: voucher.kind,
            amount: voucher.amount,
            mode: voucher.mode,
            party_id: voucher.party_id,
            party_name: party.name,
            reference_no: voucher.reference_no,
          }),
        ],
      );

      return voucher;
    });

    // Emit domain event
    this.eventEmitter.emitEntrySaved(
      new EntrySavedEvent({
        type: 'VOUCHER',
        id: savedVoucher.id,
        partyId: savedVoucher.party_id,
        partyName: party.name,
        partyPhone: party.whatsapp_number,
        amount: parseFloat(savedVoucher.amount),
        staffId: user.id,
        staffName: user.name,
        billNo: savedVoucher.voucher_no ? Number(savedVoucher.voucher_no) : undefined,
        timestamp: savedVoucher.entry_at,
      }),
    );

    return savedVoucher;
  }

  async update(id: string, dto: UpdateVoucherDto, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can edit vouchers');
    }

    return await this.db.withTransaction(async (client) => {
      const vRes = await client.query(
        `SELECT * FROM money_vouchers WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (vRes.rows.length === 0) throw new NotFoundException('Voucher not found');
      const original = vRes.rows[0];

      // 1. Reversing ledger row: swap debit & credit of original voucher
      const origIsReceipt = original.kind === 'RECEIPT';
      const revDebit = origIsReceipt ? parseFloat(original.amount) : 0;
      const revCredit = origIsReceipt ? 0 : parseFloat(original.amount);

      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'VOUCHER_REVERSAL', $2, $3, $4)`,
        [original.party_id, original.id, revDebit, revCredit],
      );

      // 2. Fetch and remove old allocations
      const oldAllocs = await client.query(
        `SELECT sale_id, purchase_id FROM voucher_allocations WHERE voucher_id = $1`,
        [id],
      );
      await client.query(`DELETE FROM voucher_allocations WHERE voucher_id = $1`, [id]);

      // Recompute affected bills from deleted allocations
      await this.recomputeBillStatuses(
        client,
        oldAllocs.rows.map((r) => r.sale_id).filter(Boolean),
        oldAllocs.rows.map((r) => r.purchase_id).filter(Boolean),
      );

      // 3. Compute new voucher values
      const newKind = dto.kind ?? original.kind;
      const newPartyId = dto.party_id ?? original.party_id;
      const newMode = dto.mode ?? original.mode;
      let newBankAccountId =
        newMode === 'CASH'
          ? null
          : dto.bank_account_id !== undefined
          ? dto.bank_account_id
          : original.bank_account_id;

      if (newMode === 'BANK') {
        if (!newBankAccountId) {
          throw new BadRequestException('A bank account is required when payment mode is BANK');
        }
        const bRes = await client.query(
          `SELECT id, is_active FROM bank_accounts WHERE id = $1`,
          [newBankAccountId],
        );
        if (bRes.rows.length === 0 || !bRes.rows[0].is_active) {
          throw new BadRequestException('Invalid or inactive bank account specified');
        }
      } else {
        newBankAccountId = null;
      }

      const newAmount = dto.amount !== undefined ? dto.amount : parseFloat(original.amount);
      const newRef = dto.reference_no !== undefined ? dto.reference_no : original.reference_no;
      const newNotes = dto.notes !== undefined ? dto.notes : original.notes;

      const updatedVoucherRes = await client.query(
        `UPDATE money_vouchers
         SET kind = $1, party_id = $2, mode = $3, bank_account_id = $4, amount = $5, reference_no = $6, notes = $7
         WHERE id = $8
         RETURNING *`,
        [newKind, newPartyId, newMode, newBankAccountId, newAmount, newRef, newNotes, id],
      );
      const updatedVoucher = updatedVoucherRes.rows[0];

      // 4. Insert new ledger row for the updated voucher
      const isReceipt = newKind === 'RECEIPT';
      const debit = isReceipt ? 0 : newAmount;
      const credit = isReceipt ? newAmount : 0;

      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'VOUCHER', $2, $3, $4)`,
        [newPartyId, id, debit, credit],
      );

      // 5. Apply new allocations if supplied
      if (dto.allocations && dto.allocations.length > 0) {
        let totalAllocated = 0;
        for (const alloc of dto.allocations) {
          if (!alloc.sale_id && !alloc.purchase_id) {
            throw new BadRequestException('Allocation must specify either a sale_id or purchase_id');
          }
          if (alloc.sale_id && alloc.purchase_id) {
            throw new BadRequestException('Allocation cannot specify both sale_id and purchase_id');
          }
          if (alloc.amount <= 0) {
            throw new BadRequestException('Allocation amount must be greater than zero');
          }

          totalAllocated += alloc.amount;

          if (alloc.sale_id) {
            const saleRes = await client.query(
              `SELECT s.id, s.bill_no, s.party_id, s.total_amount,
                COALESCE((SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id), 0) AS already_allocated
               FROM sales s WHERE s.id = $1 AND s.is_deleted = false`,
              [alloc.sale_id],
            );
            if (saleRes.rows.length === 0) throw new NotFoundException('Allocated sale not found');
            const sale = saleRes.rows[0];
            if (sale.party_id !== newPartyId) {
              throw new BadRequestException(`Sale #${sale.bill_no} does not belong to the voucher party`);
            }

            const outstanding = parseFloat(sale.total_amount) - parseFloat(sale.already_allocated);
            if (alloc.amount > outstanding + 0.001) {
              throw new BadRequestException(
                `Allocation ₹${alloc.amount} exceeds sale #${sale.bill_no} outstanding ₹${outstanding.toFixed(2)}`,
              );
            }

            await client.query(
              `INSERT INTO voucher_allocations (voucher_id, sale_id, amount) VALUES ($1, $2, $3)`,
              [id, alloc.sale_id, alloc.amount],
            );

            const newTotalAlloc = parseFloat(sale.already_allocated) + alloc.amount;
            const newStatus = newTotalAlloc >= parseFloat(sale.total_amount) - 0.001 ? 'PAID' : 'PARTIAL';
            await client.query(`UPDATE sales SET status = $1 WHERE id = $2`, [newStatus, alloc.sale_id]);
          } else if (alloc.purchase_id) {
            const pRes = await client.query(
              `SELECT p.id, p.bill_no, p.party_id, p.total_amount,
                COALESCE((SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.purchase_id = p.id), 0) AS already_allocated
               FROM purchases p WHERE p.id = $1 AND p.is_deleted = false`,
              [alloc.purchase_id],
            );
            if (pRes.rows.length === 0) throw new NotFoundException('Allocated purchase not found');
            const purchase = pRes.rows[0];
            if (purchase.party_id !== newPartyId) {
              throw new BadRequestException(`Purchase #${purchase.bill_no} does not belong to the voucher party`);
            }

            const outstanding = parseFloat(purchase.total_amount) - parseFloat(purchase.already_allocated);
            if (alloc.amount > outstanding + 0.001) {
              throw new BadRequestException(
                `Allocation ₹${alloc.amount} exceeds purchase #${purchase.bill_no} outstanding ₹${outstanding.toFixed(2)}`,
              );
            }

            await client.query(
              `INSERT INTO voucher_allocations (voucher_id, purchase_id, amount) VALUES ($1, $2, $3)`,
              [id, alloc.purchase_id, alloc.amount],
            );

            const newTotalAlloc = parseFloat(purchase.already_allocated) + alloc.amount;
            const newStatus = newTotalAlloc >= parseFloat(purchase.total_amount) - 0.001 ? 'PAID' : 'PARTIAL';
            await client.query(`UPDATE purchases SET status = $1 WHERE id = $2`, [newStatus, alloc.purchase_id]);
          }
        }

        if (totalAllocated > newAmount + 0.001) {
          throw new BadRequestException('Total bill allocations cannot exceed the updated voucher amount');
        }
      }

      // 6. Audit Log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'UPDATE', 'money_vouchers', $2, $3, $4)`,
        [user.id, id, JSON.stringify(original), JSON.stringify(updatedVoucher)],
      );

      return updatedVoucher;
    });
  }

  async softDelete(id: string, user: AuthUser) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can delete vouchers');
    }

    return await this.db.withTransaction(async (client) => {
      const vRes = await client.query(
        `SELECT * FROM money_vouchers WHERE id = $1 AND is_deleted = false`,
        [id],
      );
      if (vRes.rows.length === 0) throw new NotFoundException('Voucher not found');
      const voucher = vRes.rows[0];

      // 1. Reversing ledger row: swap debit & credit
      const isReceipt = voucher.kind === 'RECEIPT';
      const debit = isReceipt ? parseFloat(voucher.amount) : 0;
      const credit = isReceipt ? 0 : parseFloat(voucher.amount);

      await client.query(
        `INSERT INTO ledger_entries (party_id, source_type, source_id, debit, credit)
         VALUES ($1, 'VOUCHER_REVERSAL', $2, $3, $4)`,
        [voucher.party_id, voucher.id, debit, credit],
      );

      // 2. Fetch and remove allocations
      const allocs = await client.query(
        `SELECT sale_id, purchase_id FROM voucher_allocations WHERE voucher_id = $1`,
        [id],
      );
      await client.query(`DELETE FROM voucher_allocations WHERE voucher_id = $1`, [id]);

      // 3. Recompute bill statuses for affected sales & purchases
      await this.recomputeBillStatuses(
        client,
        allocs.rows.map((r) => r.sale_id).filter(Boolean),
        allocs.rows.map((r) => r.purchase_id).filter(Boolean),
      );

      // 4. Mark voucher deleted
      await client.query(
        `UPDATE money_vouchers SET is_deleted = true, deleted_at = now(), deleted_by = $1 WHERE id = $2`,
        [user.id, id],
      );

      // 5. Audit log
      await client.query(
        `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
         VALUES ($1, 'SOFT_DELETE', 'money_vouchers', $2, $3, $4)`,
        [user.id, id, JSON.stringify(voucher), JSON.stringify({ is_deleted: true, deleted_by: user.id })],
      );

      return { success: true, message: 'Voucher reversed and bill status restored' };
    });
  }

  private async recomputeBillStatuses(
    client: any,
    saleIds: string[],
    purchaseIds: string[],
  ) {
    const uniqueSaleIds = Array.from(new Set(saleIds));
    for (const saleId of uniqueSaleIds) {
      const sRes = await client.query(
        `SELECT s.total_amount,
          COALESCE((SELECT SUM(amount) FROM voucher_allocations WHERE sale_id = s.id), 0) AS allocated
         FROM sales s WHERE s.id = $1`,
        [saleId],
      );
      if (sRes.rows.length > 0) {
        const allocTotal = parseFloat(sRes.rows[0].allocated);
        const totalAmt = parseFloat(sRes.rows[0].total_amount);
        const status =
          allocTotal <= 0.001
            ? 'OPEN'
            : allocTotal >= totalAmt - 0.001
            ? 'PAID'
            : 'PARTIAL';
        await client.query(`UPDATE sales SET status = $1 WHERE id = $2`, [status, saleId]);
      }
    }

    const uniquePurchaseIds = Array.from(new Set(purchaseIds));
    for (const purchaseId of uniquePurchaseIds) {
      const pRes = await client.query(
        `SELECT p.total_amount,
          COALESCE((SELECT SUM(amount) FROM voucher_allocations WHERE purchase_id = p.id), 0) AS allocated
         FROM purchases p WHERE p.id = $1`,
        [purchaseId],
      );
      if (pRes.rows.length > 0) {
        const allocTotal = parseFloat(pRes.rows[0].allocated);
        const totalAmt = parseFloat(pRes.rows[0].total_amount);
        const status =
          allocTotal <= 0.001
            ? 'OPEN'
            : allocTotal >= totalAmt - 0.001
            ? 'PAID'
            : 'PARTIAL';
        await client.query(`UPDATE purchases SET status = $1 WHERE id = $2`, [status, purchaseId]);
      }
    }
  }
}
