import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { DomainEventEmitter } from '../common/events/domain-event.emitter';
import { EntrySavedEvent } from '../common/events/entry-saved.event';
import {
  SendMessageOptions,
  IWhatsAppProvider,
  MockWhatsAppProvider,
  CloudApiWhatsAppProvider,
} from './whatsapp.provider';
import { WhatsAppQueueService } from './whatsapp-queue.service';

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private provider: IWhatsAppProvider;

  constructor(
    private readonly db: DatabaseService,
    private readonly domainEvents: DomainEventEmitter,
    private readonly queueService: WhatsAppQueueService,
  ) {
    if (process.env.WHATSAPP_PROVIDER === 'cloud') {
      this.provider = new CloudApiWhatsAppProvider(this.db);
    } else {
      this.provider = new MockWhatsAppProvider(this.db);
    }
  }

  onModuleInit() {
    // Listen to EntrySaved domain event to dispatch owner WhatsApp alerts for EVERY entry
    this.domainEvents.onEntrySaved(async (event: EntrySavedEvent) => {
      try {
        await this.handleEntrySaved(event);
      } catch (err: any) {
        this.logger.error(`Error in EntrySaved WhatsApp notification: ${err.message}`);
      }
    });
  }

  async send(options: SendMessageOptions) {
    try {
      return await this.queueService.enqueue(options);
    } catch (err: any) {
      this.logger.error(`Error queueing WhatsApp notification: ${err.message}`);
      // Invariant: Failed send must NEVER block or roll back saving an entry
      return { messageId: '', status: 'FAILED' };
    }
  }

  async sendMedia(
    to: string,
    mediaUrl: string,
    caption: string,
    relatedType?: string,
    relatedId?: string,
  ) {
    return this.send({
      to,
      templateName: 'bill_delivery',
      parameters: { caption },
      mediaUrl,
      caption,
      relatedType,
      relatedId,
    });
  }

  private async handleEntrySaved(event: EntrySavedEvent) {
    const payload = event.payload;

    // 1. Fetch owner WhatsApp number from reminder_settings
    const settings = await this.db.query(
      `SELECT owner_whatsapp FROM reminder_settings WHERE id = 1`,
    );
    const ownerPhone = settings.rows[0]?.owner_whatsapp || process.env.OWNER_WHATSAPP || '+919690000000';

    // 2. Format entry value: currency (₹) or weight (Kg)
    let valueStr = 'N/A';
    if (payload.weightKg !== undefined && payload.weightKg > 0) {
      valueStr = `${parseFloat(String(payload.weightKg)).toFixed(3)} Kg`;
    } else if (payload.amount !== undefined) {
      valueStr = `₹${parseFloat(String(payload.amount)).toLocaleString('en-IN')}`;
    }

    // 3. Format entry type label
    const typeLabelMap: Record<string, string> = {
      SALE: 'Sale Invoice',
      PURCHASE: 'Purchase Bill',
      JOB_WORK: 'Job Work Entry',
      VOUCHER: 'Money Voucher',
    };
    const entryTypeLabel = typeLabelMap[payload.type] || payload.type;
    const refNo = payload.billNo ? `#${payload.billNo}` : payload.id.substring(0, 8);

    const formattedTime = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });

    this.logger.log(
      `[OwnerNotification] Triggering alert for ${entryTypeLabel} ${refNo} by ${payload.staffName}`,
    );

    // 4. Dispatch owner alert template
    return this.send({
      to: ownerPhone,
      templateName: 'owner_entry_alert',
      parameters: {
        staff_name: payload.staffName,
        entry_type: entryTypeLabel,
        bill_number: refNo,
        party_name: payload.partyName || 'Counter Party',
        amount_or_kg: valueStr,
        entry_time: formattedTime,
      },
      relatedType: payload.type,
      relatedId: payload.id,
    });
  }

  verifyWebhookSignature(signatureHeader: string | undefined, rawBody: string | Buffer): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    // In dev or test mode without WHATSAPP_APP_SECRET, accept signature
    if (!appSecret) {
      return true;
    }

    if (!signatureHeader) {
      return false;
    }

    const [algorithm, signature] = signatureHeader.split('=');
    if (algorithm !== 'sha256' || !signature) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', appSecret);
    const expected = hmac.update(rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  async handleWebhookStatus(providerMsgId: string, status: string) {
    await this.db.query(
      `UPDATE whatsapp_messages 
       SET status = $1 
       WHERE provider_msg_id = $2`,
      [status.toUpperCase(), providerMsgId],
    );
  }

  async getMessages(limit = 50, offset = 0, status?: string, recipient?: string) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status.toUpperCase());
    }

    if (recipient) {
      conditions.push(`to_number LIKE $${idx++}`);
      params.push(`%${recipient}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT * FROM whatsapp_messages
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async getOutbox(limit = 50, offset = 0, status?: string) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status.toUpperCase());
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const query = `
      SELECT * FROM notification_outbox
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async retryOutbox(id: number) {
    const res = await this.db.query(
      `SELECT * FROM notification_outbox WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Outbox record not found');
    }

    const item = res.rows[0];
    try {
      const sendRes = await this.send({
        to: item.recipient_phone || process.env.OWNER_WHATSAPP || '+919690000000',
        templateName: item.event_type.toLowerCase(),
        parameters: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload,
        relatedType: item.entity_type,
        relatedId: item.entity_id,
      });

      await this.db.query(
        `UPDATE notification_outbox
         SET status = 'SENT', processed_at = now(), error_message = NULL
         WHERE id = $1`,
        [id],
      );

      return { success: true, message: 'Notification dispatched successfully', sendRes };
    } catch (err: any) {
      await this.db.query(
        `UPDATE notification_outbox
         SET status = 'FAILED', processed_at = now(), error_message = $1
         WHERE id = $2`,
        [err.message, id],
      );
      return { success: false, error: err.message };
    }
  }

  async processPendingOutbox(limit = 20) {
    const res = await this.db.query(
      `SELECT * FROM notification_outbox WHERE status = 'PENDING' ORDER BY id ASC LIMIT $1`,
      [limit],
    );

    let processed = 0;
    for (const item of res.rows) {
      try {
        await this.send({
          to: item.recipient_phone || process.env.OWNER_WHATSAPP || '+919690000000',
          templateName: item.event_type.toLowerCase(),
          parameters: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload,
          relatedType: item.entity_type,
          relatedId: item.entity_id,
        });

        await this.db.query(
          `UPDATE notification_outbox SET status = 'SENT', processed_at = now() WHERE id = $1`,
          [item.id],
        );
        processed++;
      } catch (err: any) {
        await this.db.query(
          `UPDATE notification_outbox SET status = 'FAILED', processed_at = now(), error_message = $1 WHERE id = $2`,
          [err.message, item.id],
        );
      }
    }

    return { processed, total: res.rows.length };
  }
}
