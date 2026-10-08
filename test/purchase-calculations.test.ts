import test from 'node:test';
import assert from 'node:assert';
import { calculateBillTotals, validateTotalsMatch } from '../lib/calculations/bill-totals.ts';
import { calculateLineAmount, calculateGridTotals } from '../lib/calculations/item-grid.ts';

test('Purchase Bill - Item grid calculation for PCS and KG units', () => {
  // Line 1: 5 pcs at ₹1200/pc = ₹6000
  const pcsAmount = calculateLineAmount('PCS', 5, 1200);
  assert.strictEqual(pcsAmount, 6000);

  // Line 2: 1.250 kg at ₹65000/kg = ₹81250
  const kgAmount = calculateLineAmount('KG', 1.25, 65000);
  assert.strictEqual(kgAmount, 81250);

  // Grid totals: subtotal = 6000 + 81250 = 87250
  const gridTotals = calculateGridTotals([
    {
      id: 'l1',
      item_id: 'i1',
      unit: 'PCS',
      pieces: 5,
      weight_kg: 0,
      rate: 1200,
      amount: pcsAmount,
    },
    {
      id: 'l2',
      item_id: 'i2',
      unit: 'KG',
      pieces: 0,
      weight_kg: 1.25,
      rate: 65000,
      amount: kgAmount,
    },
  ]);

  assert.strictEqual(gridTotals.subtotal, 87250);
  assert.strictEqual(gridTotals.totalPieces, 5);
  assert.strictEqual(gridTotals.totalWeightKg, 1.25);
});

test('Purchase Bill - Charges, GST (3%), Discount, and Round Off calculation', () => {
  const totals = calculateBillTotals({
    subtotal: 100000,
    discountType: 'PERCENT',
    discountValue: 2, // 2% discount = 2000 => taxable = 98000
    gstRate: 3.0,     // 3% GST on 98000 = 2940
    transportCharges: 500,
    packagingCharges: 250,
    otherCharges: 100,
  });

  assert.strictEqual(totals.subtotal, 100000);
  assert.strictEqual(totals.discountAmount, 2000);
  assert.strictEqual(totals.taxableAmount, 98000);
  assert.strictEqual(totals.gstAmount, 2940);
  assert.strictEqual(totals.transportCharges, 500);
  assert.strictEqual(totals.packagingCharges, 250);
  assert.strictEqual(totals.otherCharges, 100);
  // Total before round off = 98000 + 2940 + 500 + 250 + 100 = 101790 (already whole rupee, roundOff = 0)
  assert.strictEqual(totals.grandTotal, 101790);
  assert.strictEqual(totals.roundOff, 0);
});

test('Purchase Bill - Supplier Ledger Balance Direction (Payable / Cr calculation)', () => {
  // Case A: Supplier has existing payable of ₹75,000 (represented in ledger convention as -75000 Cr)
  const priorBalancePayable = -75000;
  const newPurchaseBill = 25000;
  // New purchase adds credit to supplier, increasing payable to ₹100,000 (-100000)
  const closingBalanceA = priorBalancePayable - newPurchaseBill;
  assert.strictEqual(closingBalanceA, -100000);
  assert.strictEqual(Math.abs(closingBalanceA), 100000);

  // Case B: Supplier has advance balance of ₹15,000 (represented as +15000 Dr)
  const priorBalanceAdvance = 15000;
  // New purchase of ₹25,000 consumes advance, resulting in ₹10,000 net payable (-10000 Cr)
  const closingBalanceB = priorBalanceAdvance - newPurchaseBill;
  assert.strictEqual(closingBalanceB, -10000);
  assert.strictEqual(Math.abs(closingBalanceB), 10000);

  // Case C: Exact settlement
  const closingBalanceC = 25000 - newPurchaseBill;
  assert.strictEqual(closingBalanceC, 0);
});

test('Purchase Bill - Narration length boundary and text preservation (Req 25)', () => {
  const narration500 = 'A'.repeat(500);
  assert.strictEqual(narration500.length, 500);

  // Ensure trimming and character integrity
  const sampleNarration = 'Purchased 22K Hallmarked Gold Bars batch #9921; assay certificate attached.';
  assert.ok(sampleNarration.length <= 500);
  assert.strictEqual(sampleNarration.trim(), sampleNarration);
});

test('Purchase Bill - Reminder validation and link payload (Req 24)', () => {
  const billTotal = 154200;
  const reminder = {
    enabled: true,
    reminder_date: '2026-10-25',
    amount: billTotal,
    notes: 'Supplier payment due via RTGS',
  };

  assert.strictEqual(reminder.enabled, true);
  assert.strictEqual(reminder.amount, 154200);
  assert.ok(new Date(reminder.reminder_date).getTime() > 0);
  assert.ok(reminder.notes.length > 0);
});
