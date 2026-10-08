import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizePhoneNumber,
  buildWhatsAppShareUrl,
  formatSaleBillShareMessage,
  formatVoucherShareMessage,
} from '../lib/calculations/whatsapp-share.ts';

test('WhatsApp - sanitizePhoneNumber normalizes 10-digit and formatted phone numbers', () => {
  assert.equal(sanitizePhoneNumber('9876543210'), '919876543210');
  assert.equal(sanitizePhoneNumber('+91 98765 43210'), '919876543210');
  assert.equal(sanitizePhoneNumber('+91-98765-43210'), '919876543210');
  assert.equal(sanitizePhoneNumber('919876543210'), '919876543210');
});

test('WhatsApp - buildWhatsAppShareUrl constructs URL with encoded message text', () => {
  const url = buildWhatsAppShareUrl('9876543210', 'Namaste! Invoice #1047');
  assert.ok(url.startsWith('https://wa.me/919876543210?text='));
  assert.ok(url.includes('Namaste'));
  assert.ok(url.includes('%231047'));
});

test('WhatsApp - formatSaleBillShareMessage includes essential invoice details (Req 47)', () => {
  const msg = formatSaleBillShareMessage({
    billNo: 1047,
    partyName: 'Rajasthan Jewellers',
    totalAmount: 275000.0,
    dueDate: '26/09/2026',
    itemsSummary: 'Gold 22K Bangles (250.000g)',
  });

  assert.match(msg, /Invoice #1047/);
  assert.match(msg, /Rajasthan Jewellers/);
  assert.match(msg, /₹2,75,000\.00/);
  assert.match(msg, /\*Due Date:\* 26\/09\/2026/);
  assert.match(msg, /Gold 22K Bangles/);
  assert.match(msg, /Kumkum Payal/);
});

test('WhatsApp - formatVoucherShareMessage formats Receipt confirmation (Req 34, 37)', () => {
  const msg = formatVoucherShareMessage({
    voucherNo: 2001,
    kind: 'RECEIPT',
    partyName: 'Rajasthan Jewellers',
    amount: 50000.0,
    mode: 'BANK',
    referenceNo: 'IMPS-987211',
  });

  assert.match(msg, /Payment Receipt/);
  assert.match(msg, /#2001/);
  assert.match(msg, /Rajasthan Jewellers/);
  assert.match(msg, /₹50,000\.00/);
  assert.match(msg, /BANK/);
  assert.match(msg, /IMPS-987211/);
});

test('WhatsApp - formatVoucherShareMessage formats Payment confirmation (Req 36, 37)', () => {
  const msg = formatVoucherShareMessage({
    voucherNo: 2002,
    kind: 'PAYMENT',
    partyName: 'Omkar Bullion Mart',
    amount: 120000.0,
    mode: 'CASH',
  });

  assert.match(msg, /Payment Confirmation/);
  assert.match(msg, /#2002/);
  assert.match(msg, /Omkar Bullion Mart/);
  assert.match(msg, /₹1,20,000\.00/);
  assert.match(msg, /CASH/);
});
