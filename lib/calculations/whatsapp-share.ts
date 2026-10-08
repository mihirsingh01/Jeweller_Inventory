/**
 * WhatsApp message formatting and sharing link builder (Req 3, 4, 34, 37, 47).
 */

export function sanitizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export function buildWhatsAppShareUrl(phoneNumber: string, text: string): string {
  const cleanPhone = sanitizePhoneNumber(phoneNumber);
  const encodedText = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

export interface SaleBillShareParams {
  billNo: number;
  partyName?: string;
  totalAmount: number;
  dueDate?: string;
  itemsSummary?: string;
  companyName?: string;
}

export function formatSaleBillShareMessage(params: SaleBillShareParams): string {
  const company = params.companyName || 'Kumkum Payal';
  const party = params.partyName || 'Valued Customer';
  const amountStr = `₹${params.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  let msg = `*${company} — Invoice #${params.billNo}*\n\n`;
  msg += `Namaste ${party},\n\n`;
  msg += `Thank you for your business. Here are the details of your invoice:\n`;
  msg += `• *Invoice No:* #${params.billNo}\n`;
  msg += `• *Total Amount:* ${amountStr}\n`;
  if (params.dueDate) {
    msg += `• *Due Date:* ${params.dueDate}\n`;
  }
  if (params.itemsSummary) {
    msg += `• *Items:* ${params.itemsSummary}\n`;
  }
  msg += `\nPlease arrange settlement by the due date. For queries, kindly reply directly to this chat.\n\n`;
  msg += `Warm regards,\n*${company}*`;
  return msg;
}

export interface VoucherShareParams {
  voucherNo: number;
  kind: 'RECEIPT' | 'PAYMENT';
  partyName?: string;
  amount: number;
  mode: string;
  referenceNo?: string;
  companyName?: string;
}

export function formatVoucherShareMessage(params: VoucherShareParams): string {
  const company = params.companyName || 'Kumkum Payal';
  const party = params.partyName || 'Party';
  const amountStr = `₹${params.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const kindLabel = params.kind === 'RECEIPT' ? 'Payment Receipt (Inflow)' : 'Payment Confirmation (Outflow)';

  let msg = `*${company} — ${kindLabel}*\n\n`;
  msg += `Namaste ${party},\n\n`;
  msg += `We have recorded the following transaction:\n`;
  msg += `• *Voucher No:* #${params.voucherNo}\n`;
  msg += `• *Type:* ${params.kind}\n`;
  msg += `• *Amount:* ${amountStr}\n`;
  msg += `• *Mode:* ${params.mode}\n`;
  if (params.referenceNo) {
    msg += `• *Reference / Cheque:* ${params.referenceNo}\n`;
  }
  msg += `\nThank you for partnering with us.\n\n`;
  msg += `Warm regards,\n*${company}*`;
  return msg;
}
