import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class BillRendererService {
  private readonly logger = new Logger(BillRendererService.name);
  private readonly storageDir = path.resolve(process.cwd(), 'uploads', 'bills');

  constructor(private readonly db: DatabaseService) {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  generateHtmlTemplate(sale: any): string {
    const formattedDate = new Date(sale.entry_at).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const formattedTime = new Date(sale.entry_at).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });
    const formattedDueDate = new Date(sale.due_date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const lines = sale.lines || [];
    const linesHtml = lines
      .map(
        (line: any, idx: number) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #EFEAE3; text-align: center;">${idx + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #EFEAE3;"><strong>${line.item_name}</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #EFEAE3; text-align: right; font-variant-numeric: tabular-nums;">${line.pieces}</td>
          <td style="padding: 10px; border-bottom: 1px solid #EFEAE3; text-align: right; font-variant-numeric: tabular-nums;">${parseFloat(line.weight_kg).toFixed(3)} Kg</td>
          <td style="padding: 10px; border-bottom: 1px solid #EFEAE3; text-align: right; font-variant-numeric: tabular-nums;">₹${parseFloat(line.rate).toLocaleString('en-IN')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #EFEAE3; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700;">₹${parseFloat(line.amount).toLocaleString('en-IN')}</td>
        </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; }
        body { background: #FFFFFF; color: #2B2B2B; width: 800px; padding: 40px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #9B1C31; padding-bottom: 24px; }
        .brand-name { font-size: 32px; font-weight: 800; color: #9B1C31; letter-spacing: -0.5px; }
        .brand-sub { font-size: 13px; color: #B8893B; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
        .bill-badge { text-align: right; }
        .bill-badge h2 { font-size: 24px; color: #2B2B2B; font-weight: 700; }
        .bill-badge p { font-size: 14px; color: #7A7268; margin-top: 4px; }
        .party-box { background: #FBF7F2; border-radius: 8px; padding: 18px 24px; margin: 28px 0; display: flex; justify-content: space-between; }
        .party-box div { font-size: 14px; }
        .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
        .table th { background: #F5EFEB; color: #5C554E; padding: 12px 10px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .totals-row { margin-top: 24px; display: flex; justify-content: flex-end; }
        .totals-box { width: 300px; background: #FBF7F2; padding: 18px; border-radius: 8px; }
        .totals-line { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; }
        .grand-total { font-size: 18px; font-weight: 800; color: #9B1C31; border-top: 2px solid #EFEAE3; padding-top: 8px; margin-top: 8px; }
        .footer { margin-top: 40px; border-top: 1px solid #EFEAE3; padding-top: 16px; font-size: 12px; color: #7A7268; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand-name">Kumkum Payal</div>
          <div class="brand-sub">Exclusive Jewellery & Polish/Meena Job Work</div>
          <div style="font-size: 12px; color: #7A7268; margin-top: 6px;">Johri Bazaar, Jaipur · GSTIN: 08AAAPK1234F1Z0</div>
        </div>
        <div class="bill-badge">
          <h2>INVOICE #${sale.bill_no}</h2>
          <p>Date: <strong>${formattedDate} ${formattedTime}</strong></p>
          <p>Due Date: <strong style="color: #9B1C31;">${formattedDueDate}</strong></p>
        </div>
      </div>

      <div class="party-box">
        <div>
          <div style="color: #7A7268; font-size: 11px; text-transform: uppercase; font-weight: 700;">Billed To:</div>
          <div style="font-size: 18px; font-weight: 700; color: #2B2B2B; margin-top: 4px;">${sale.party_name}</div>
          <div style="color: #5C554E; margin-top: 2px;">Phone: ${sale.party_phone || 'N/A'}</div>
          ${sale.party_address ? `<div style="color: #7A7268; font-size: 12px; margin-top: 2px;">${sale.party_address}</div>` : ''}
        </div>
        <div style="text-align: right;">
          <div style="color: #7A7268; font-size: 11px; text-transform: uppercase; font-weight: 700;">Status:</div>
          <div style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-weight: 700; font-size: 12px; background: #FEF3C7; color: #92400E; margin-top: 4px;">
            ${sale.status}
          </div>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th style="text-align: center; width: 40px;">#</th>
            <th>Item Description</th>
            <th style="text-align: right;">Pieces</th>
            <th style="text-align: right;">Weight (Kg)</th>
            <th style="text-align: right;">Rate (₹)</th>
            <th style="text-align: right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml}
        </tbody>
      </table>

      <div class="totals-row">
        <div class="totals-box">
          <div class="totals-line">
            <span>Subtotal</span>
            <span>₹${parseFloat(sale.total_amount).toLocaleString('en-IN')}</span>
          </div>
          <div class="totals-line grand-total">
            <span>Total Payable</span>
            <span>₹${parseFloat(sale.total_amount).toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      <div class="footer">
        <p>This is an authentic computer-generated invoice. Date and time are recorded automatically by the server.</p>
        <p style="margin-top: 4px;">Thank you for your business! · Kumkum Payal Jewellery</p>
      </div>
    </body>
    </html>`;
  }

  async renderBillToJpg(sale: any): Promise<Buffer> {
    if (process.env.NODE_ENV === 'test' && !process.env.PUPPETEER_EXECUTABLE_PATH) {
      return this.renderSharpFallback(sale);
    }

    const html = this.generateHtmlTemplate(sale);

    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        timeout: 3000,
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 1000, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const rawBuffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true });
      await browser.close();

      // Optimize image via Sharp with mozjpeg compression
      const sharp = require('sharp');
      return await sharp(rawBuffer).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    } catch (err: any) {
      this.logger.warn(`Puppeteer browser launch failed (${err.message}). Using sharp card fallback.`);
      return this.renderSharpFallback(sale);
    }
  }

  renderSharpFallback(sale: any): Promise<Buffer> {
    const sharp = require('sharp');
    const linesList = (sale.lines || [])
      .map((l: any, i: number) => {
        const y = 280 + i * 35;
        return `<text x="50" y="${y}" font-family="Arial, sans-serif" font-size="14" fill="#2B2B2B">${l.item_name} - ${l.pieces} pcs / ${parseFloat(l.weight_kg).toFixed(3)} Kg: ₹${parseFloat(l.amount).toLocaleString('en-IN')}</text>`;
      })
      .join('');

    const svg = `
      <svg width="800" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#FBF7F2"/>
        <rect x="20" y="20" width="760" height="860" rx="16" fill="#FFFFFF" stroke="#EFEAE3" stroke-width="2"/>
        <text x="50" y="80" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#9B1C31">KUMKUM PAYAL</text>
        <text x="50" y="105" font-family="Arial, sans-serif" font-size="14" fill="#B8893B">INVOICE #${sale.bill_no}</text>
        <line x1="50" y1="125" x2="750" y2="125" stroke="#9B1C31" stroke-width="2"/>
        <text x="50" y="160" font-family="Arial, sans-serif" font-size="16" fill="#2B2B2B">Billed to: ${sale.party_name}</text>
        <text x="50" y="190" font-family="Arial, sans-serif" font-size="14" fill="#7A7268">Phone: ${sale.party_phone || 'N/A'}</text>
        <text x="50" y="220" font-family="Arial, sans-serif" font-size="14" fill="#7A7268">Due Date: ${sale.due_date}</text>
        <line x1="50" y1="240" x2="750" y2="240" stroke="#EFEAE3" stroke-width="1"/>
        ${linesList}
        <line x1="50" y1="760" x2="750" y2="760" stroke="#EFEAE3" stroke-width="2"/>
        <text x="50" y="800" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#9B1C31">Total Payable: ₹${parseFloat(sale.total_amount).toLocaleString('en-IN')}</text>
        <text x="50" y="840" font-family="Arial, sans-serif" font-size="12" fill="#7A7268">Date and time are recorded automatically by the server.</text>
      </svg>
    `;
    return sharp(Buffer.from(svg)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  }


  async saveAndRecordBill(sale: any, messageId?: number): Promise<{ filePath: string; fileName: string; billImageId: string }> {
    const buffer = await this.renderBillToJpg(sale);
    const fileName = `bill_${sale.bill_no}_${sale.id}.jpg`;
    const filePath = path.join(this.storageDir, fileName);

    fs.writeFileSync(filePath, buffer);

    const res = await this.db.query(
      `INSERT INTO bill_images (sale_id, file_path, message_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [sale.id, filePath, messageId || null],
    );

    return { filePath, fileName, billImageId: res.rows[0].id };
  }

  getBillFilePath(saleId: string): string | null {
    const files = fs.readdirSync(this.storageDir);
    const match = files.find((f) => f.includes(saleId));
    return match ? path.join(this.storageDir, match) : null;
  }

  generateSignedUrl(saleId: string, expiresInMinutes = 30): { url: string; token: string; expiresAt: string } {
    const secret = process.env.JWT_SECRET || 'kumkum-bill-signing-secret';
    const expiresTimestamp = Date.now() + expiresInMinutes * 60 * 1000;
    const expiresAt = new Date(expiresTimestamp).toISOString();

    const dataToSign = `${saleId}:${expiresTimestamp}`;
    const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');

    const payload = JSON.stringify({ saleId, exp: expiresTimestamp, sig: signature });
    const token = Buffer.from(payload).toString('base64url');

    const baseUrl =
      process.env.PUBLIC_APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null) ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:4000');
    const url = `${baseUrl}/api/v1/sales/bill/media/${token}`;

    return { url, token, expiresAt };
  }

  verifySignedUrlToken(token: string): { valid: boolean; saleId?: string; error?: string } {
    try {
      const secret = process.env.JWT_SECRET || 'kumkum-bill-signing-secret';
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const { saleId, exp, sig } = JSON.parse(decoded);

      if (!saleId || !exp || !sig) {
        return { valid: false, error: 'Malformed token payload' };
      }

      if (Date.now() > exp) {
        return { valid: false, error: 'Signed URL has expired' };
      }

      const dataToSign = `${saleId}:${exp}`;
      const expectedSignature = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');

      const isSignatureValid = crypto.timingSafeEqual(
        Buffer.from(sig, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );

      if (!isSignatureValid) {
        return { valid: false, error: 'Invalid URL signature' };
      }

      return { valid: true, saleId };
    } catch {
      return { valid: false, error: 'Invalid token format' };
    }
  }
}
