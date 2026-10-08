import {
  Injectable,
  Logger,
  Optional,
  Inject,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DatabaseService } from '../database/database.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { IClock, SystemClock } from '../common/clock/clock.interface';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateManualReminderDto, ListRemindersQueryDto } from './reminders.dto';

export interface UpdateReminderSettingsDto {
  repeat_days?: number;
  send_time?: string;
  owner_whatsapp?: string;
  is_active?: boolean;
}

export const REMINDER_QUEUE_NAME = 'payment-reminders';

@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);
  private clock: IClock;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private redisClient: IORedis | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly whatsAppService: WhatsAppService,
    @Optional() @Inject('IClock') clock?: IClock,
  ) {
    this.clock = clock || new SystemClock();
  }

  setClock(clock: IClock) {
    this.clock = clock;
  }

  getClock(): IClock {
    return this.clock;
  }

  async onModuleInit() {
    await this.initScheduler();
  }

  async initScheduler() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redisClient = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: () => null,
        connectTimeout: 2000,
        lazyConnect: true,
      });

      await this.redisClient.connect();
      this.queue = new Queue(REMINDER_QUEUE_NAME, { connection: this.redisClient });

      const settings = await this.getSettings();
      await this.scheduleDailyJob(settings.send_time || '10:00');

      this.worker = new Worker(
        REMINDER_QUEUE_NAME,
        async () => {
          this.logger.log('[BullMQ] Triggering scheduled daily payment reminders job');
          return await this.runDailyReminderJob();
        },
        { connection: this.redisClient },
      );

      this.logger.log(`[BullMQ] Payment Reminders scheduler registered with send_time: ${settings.send_time}`);
    } catch (err: any) {
      this.logger.warn(`Redis unavailable (${err.message}). Reminder scheduler will be triggered on-demand or by container worker.`);
    }
  }

  private async scheduleDailyJob(sendTime: string) {
    if (!this.queue) return;

    try {
      // Clear previous repeatable jobs
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        await this.queue.removeRepeatableByKey(job.key);
      }

      // Convert HH:MM to cron: minute hour * * *
      const [hourStr, minStr] = sendTime.split(':');
      const hour = parseInt(hourStr || '10', 10);
      const min = parseInt(minStr || '0', 10);
      const cronExpression = `${min} ${hour} * * *`;

      await this.queue.add(
        'daily-reminders-job',
        {},
        {
          repeat: {
            pattern: cronExpression,
            tz: 'Asia/Kolkata',
          },
          removeOnComplete: true,
        },
      );
      this.logger.log(`[BullMQ] Scheduled daily reminder job at ${cronExpression} (Asia/Kolkata)`);
    } catch (err: any) {
      this.logger.warn(`Failed to schedule repeatable job: ${err.message}`);
    }
  }

  async getSettings() {
    const res = await this.db.query(`SELECT * FROM reminder_settings WHERE id = 1`);
    if (res.rows.length === 0) {
      return { id: 1, repeat_days: 3, send_time: '10:00', owner_whatsapp: '+919690000000', is_active: true };
    }
    return res.rows[0];
  }

  async updateSettings(dto: UpdateReminderSettingsDto) {
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (dto.repeat_days !== undefined) {
      updates.push(`repeat_days = $${idx++}`);
      params.push(dto.repeat_days);
    }
    if (dto.send_time !== undefined) {
      updates.push(`send_time = $${idx++}`);
      params.push(dto.send_time);
    }
    if (dto.owner_whatsapp !== undefined) {
      updates.push(`owner_whatsapp = $${idx++}`);
      params.push(dto.owner_whatsapp);
    }
    if (dto.is_active !== undefined) {
      updates.push(`is_active = $${idx++}`);
      params.push(dto.is_active);
    }

    if (updates.length > 0) {
      const query = `UPDATE reminder_settings SET ${updates.join(', ')} WHERE id = 1 RETURNING *`;
      const res = await this.db.query(query, params);
      const updated = res.rows[0];

      if (dto.send_time) {
        await this.scheduleDailyJob(dto.send_time);
      }

      return updated;
    }
    return this.getSettings();
  }

  async getStaffOverdueBills(staffId: string) {
    const todayStr = this.clock.todayString();
    const query = `
      SELECT s.id, s.bill_no, s.entry_at, s.due_date, s.total_amount, s.status,
             p.name AS party_name, p.whatsapp_number,
             (DATE '${todayStr}' - s.due_date) AS days_overdue,
             (s.total_amount - COALESCE(
               (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id), 0
             )) AS outstanding_amount
      FROM sales s
      JOIN parties p ON p.id = s.party_id
      WHERE s.created_by = $1
        AND s.is_deleted = false
        AND s.status <> 'PAID'
        AND s.due_date < DATE '${todayStr}'
      ORDER BY s.due_date ASC
    `;
    const res = await this.db.query(query, [staffId]);
    return res.rows.map((r) => ({
      ...r,
      days_overdue: Math.max(0, parseInt(r.days_overdue, 10)),
      outstanding_amount: Math.round(parseFloat(r.outstanding_amount) * 100) / 100,
    }));
  }

  async sendTestReminder(phone?: string) {
    const settings = await this.getSettings();
    const targetPhone = phone || settings.owner_whatsapp || '+919690000000';

    return await this.whatsAppService.send({
      to: targetPhone,
      templateName: 'customer_payment_reminder',
      parameters: {
        customer_name: 'Test Customer',
        bill_no: '9999',
        outstanding_amount: '₹10,000.00',
        due_date: this.clock.todayString(),
        days_overdue: '1',
      },
    });
  }

  /**
   * Daily Overdue Engine
   * 1. No reminder before due date; first reminder on day +1 (due_date < today)
   * 2. Idempotent: A re-run on the same calendar day sends nothing twice
   * 3. Sends customer reminder only if no prior log, or >= repeat_days since last reminder
   * 4. Customer gets ONE separate message per unpaid bill
   * 5. Owner gets exactly ONE combined summary per day
   * 6. Stops immediately once bill outstanding is zero
   */
  async runDailyReminderJob(targetDate?: Date) {
    const currentDate = targetDate || this.clock.now();
    const todayStr = currentDate.toISOString().split('T')[0];

    const settings = await this.getSettings();
    if (!settings.is_active) {
      this.logger.log('Payment reminders are disabled in settings.');
      return { skipped: true, reason: 'Reminders disabled' };
    }

    const repeatDays = settings.repeat_days || 3;

    // Query all overdue sales strictly past due date: due_date < todayStr
    const query = `
      SELECT s.id, s.bill_no, s.due_date, s.total_amount, s.party_id,
             p.name AS customer_name, p.whatsapp_number,
             (s.total_amount - COALESCE(
               (SELECT SUM(va.amount) FROM voucher_allocations va WHERE va.sale_id = s.id), 0
             )) AS outstanding_amount,
             (
               SELECT sent_at 
               FROM reminder_log 
               WHERE sale_id = s.id AND kind = 'CUSTOMER_BILL'
               ORDER BY sent_at DESC 
               LIMIT 1
             ) AS last_reminder_at,
             (
               SELECT COUNT(*) 
               FROM reminder_log 
               WHERE sale_id = s.id AND kind = 'CUSTOMER_BILL' AND DATE(sent_at) = DATE '${todayStr}'
             ) AS sent_today_count
      FROM sales s
      JOIN parties p ON p.id = s.party_id
      WHERE s.is_deleted = false
        AND s.status <> 'PAID'
        AND s.due_date < DATE '${todayStr}'
      ORDER BY s.due_date ASC
    `;

    const res = await this.db.query(query);
    const overdueBills = res.rows;

    let customerMessagesSent = 0;
    const customerDuesMap: Record<string, { name: string; count: number; total: number }> = {};
    let grandTotalOverdue = 0;

    for (const bill of overdueBills) {
      const outstanding = Math.round(parseFloat(bill.outstanding_amount) * 100) / 100;
      if (outstanding <= 0.001) continue;

      // Group for owner summary
      if (!customerDuesMap[bill.party_id]) {
        customerDuesMap[bill.party_id] = { name: bill.customer_name, count: 0, total: 0 };
      }
      customerDuesMap[bill.party_id].count++;
      customerDuesMap[bill.party_id].total += outstanding;
      grandTotalOverdue += outstanding;

      // 1. Idempotency Check: Don't send twice on the same day for the same bill
      if (parseInt(bill.sent_today_count, 10) > 0) {
        continue;
      }

      // 2. Repeat Days Interval Check
      let shouldSendCustomer = true;
      if (bill.last_reminder_at) {
        const lastSent = new Date(bill.last_reminder_at);
        const daysDiff = Math.floor(
          (currentDate.getTime() - lastSent.getTime()) / (1000 * 3600 * 24),
        );
        if (daysDiff < repeatDays) {
          shouldSendCustomer = false;
        }
      }

      if (shouldSendCustomer) {
        if (!bill.whatsapp_number || !bill.whatsapp_number.trim()) {
          this.logger.warn(
            `Skipping reminder for bill #${bill.bill_no}: No WhatsApp number for party ${bill.customer_name}`,
          );
          continue;
        }

        const dueDateObj = new Date(bill.due_date);
        const daysOverdue = Math.max(
          1,
          Math.floor((currentDate.getTime() - dueDateObj.getTime()) / (1000 * 3600 * 24)),
        );

        // One message PER pending bill
        await this.whatsAppService.send({
          to: bill.whatsapp_number,
          templateName: 'customer_payment_reminder',
          parameters: {
            customer_name: bill.customer_name,
            bill_no: String(bill.bill_no),
            outstanding_amount: `₹${outstanding.toLocaleString('en-IN')}`,
            due_date: dueDateObj.toLocaleDateString('en-GB'),
            days_overdue: String(daysOverdue),
          },
          relatedType: 'SALE',
          relatedId: bill.id,
        });

        await this.db.query(
          `INSERT INTO reminder_log (sale_id, party_id, kind, status, sent_at)
           VALUES ($1, $2, 'CUSTOMER_BILL', 'SENT', $3)`,
          [bill.id, bill.party_id, currentDate],
        );
        customerMessagesSent++;
      }
    }

    // Owner summary: exactly ONE combined summary per day
    let ownerSummarySent = false;
    const customersCount = Object.keys(customerDuesMap).length;

    if (customersCount > 0 && settings.owner_whatsapp) {
      // Idempotency check for owner summary on the same day
      const ownerTodayCheck = await this.db.query(
        `SELECT COUNT(*) AS count
         FROM reminder_log
         WHERE kind = 'OWNER_SUMMARY' AND DATE(sent_at) = DATE '${todayStr}'`,
      );

      const alreadySentOwnerToday = parseInt(ownerTodayCheck.rows[0]?.count || '0', 10) > 0;

      if (!alreadySentOwnerToday) {
        const topDebtors = Object.values(customerDuesMap)
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
          .map((c) => `${c.name} (${c.count} bills: ₹${c.total.toLocaleString('en-IN')})`)
          .join(', ');

        await this.whatsAppService.send({
          to: settings.owner_whatsapp,
          templateName: 'owner_dues_summary',
          parameters: {
            summary_date: todayStr,
            total_overdue_amount: `₹${grandTotalOverdue.toLocaleString('en-IN')}`,
            overdue_bills_count: String(overdueBills.length),
            top_debtors_list: topDebtors,
          },
        });

        await this.db.query(
          `INSERT INTO reminder_log (kind, status, sent_at)
           VALUES ('OWNER_SUMMARY', 'SENT', $1)`,
          [currentDate],
        );
        ownerSummarySent = true;
      }
    }

    return {
      success: true,
      overdueBillsFound: overdueBills.length,
      customerMessagesSent,
      customersCount,
      grandTotalOverdue: Math.round(grandTotalOverdue * 100) / 100,
      ownerSummarySent,
    };
  }

  async findAll(user: AuthUser, query: ListRemindersQueryDto) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    // Staff isolation (Req 1, 5)
    if (user.role === 'STAFF') {
      conditions.push(`r.created_by = $${idx++}`);
      params.push(user.id);
    }

    if (query.party_id) {
      conditions.push(`r.party_id = $${idx++}`);
      params.push(query.party_id);
    }

    if (query.status) {
      conditions.push(`r.status = $${idx++}`);
      params.push(query.status);
    }

    const todayStr = this.clock.todayString();

    if (query.filter === 'TODAY') {
      conditions.push(`r.reminder_date = DATE '${todayStr}'`);
    } else if (query.filter === 'OVERDUE') {
      conditions.push(`r.reminder_date < DATE '${todayStr}' AND r.status IN ('PENDING', 'SENT')`);
    } else if (query.filter === 'UPCOMING') {
      conditions.push(`r.reminder_date > DATE '${todayStr}' AND r.status IN ('PENDING', 'SENT')`);
    } else if (query.filter === 'COMPLETED') {
      conditions.push(`r.status = 'COMPLETED'`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT r.*,
             p.name AS party_name, p.type AS party_type, p.whatsapp_number AS party_phone,
             s.bill_no AS sale_bill_no, s.total_amount AS sale_total,
             pu.bill_no AS purchase_bill_no, pu.total_amount AS purchase_total,
             u.name AS creator_name
      FROM payment_reminders r
      JOIN parties p ON p.id = r.party_id
      LEFT JOIN sales s ON s.id = r.sale_id AND s.is_deleted = false
      LEFT JOIN purchases pu ON pu.id = r.purchase_id AND pu.is_deleted = false
      JOIN users u ON u.id = r.created_by
      ${whereClause}
      ORDER BY r.reminder_date ASC, r.created_at DESC
    `;

    const res = await this.db.query(sql, params);
    return res.rows;
  }

  async findOne(id: string, user: AuthUser) {
    const res = await this.db.query(
      `SELECT r.*,
              p.name AS party_name, p.type AS party_type, p.whatsapp_number AS party_phone,
              s.bill_no AS sale_bill_no, s.total_amount AS sale_total,
              pu.bill_no AS purchase_bill_no, pu.total_amount AS purchase_total,
              u.name AS creator_name
       FROM payment_reminders r
       JOIN parties p ON p.id = r.party_id
       LEFT JOIN sales s ON s.id = r.sale_id
       LEFT JOIN purchases pu ON pu.id = r.purchase_id
       JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Reminder not found');
    }

    const reminder = res.rows[0];
    if (user.role === 'STAFF' && reminder.created_by !== user.id) {
      throw new NotFoundException('Reminder not found');
    }

    return reminder;
  }

  async createManual(dto: CreateManualReminderDto, user: AuthUser) {
    const partyRes = await this.db.query(
      `SELECT id, name, is_active FROM parties WHERE id = $1`,
      [dto.party_id],
    );
    if (partyRes.rows.length === 0 || !partyRes.rows[0].is_active) {
      throw new BadRequestException('Invalid or inactive party specified');
    }

    const res = await this.db.query(
      `INSERT INTO payment_reminders (party_id, reminder_date, amount, notes, status, created_by)
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       RETURNING *`,
      [dto.party_id, dto.reminder_date, dto.amount, dto.notes || null, user.id],
    );

    const reminder = res.rows[0];

    // Audit log
    await this.db.query(
      `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
       VALUES ($1, 'CREATE', 'payment_reminders', $2, NULL, $3)`,
      [user.id, reminder.id, JSON.stringify(reminder)],
    );

    return this.findOne(reminder.id, user);
  }

  async updateStatus(id: string, status: string, user: AuthUser) {
    const existing = await this.findOne(id, user);

    const res = await this.db.query(
      `UPDATE payment_reminders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id],
    );
    const updated = res.rows[0];

    await this.db.query(
      `INSERT INTO audit_log (actor_id, action, table_name, record_id, before_data, after_data)
       VALUES ($1, 'UPDATE', 'payment_reminders', $2, $3, $4)`,
      [user.id, id, JSON.stringify(existing), JSON.stringify(updated)],
    );

    return this.findOne(id, user);
  }
}
