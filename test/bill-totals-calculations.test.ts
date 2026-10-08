import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBillTotals,
  validateTotalsMatch,
} from '../lib/calculations/bill-totals.ts';

test('calculateBillTotals - Standard jewellery bill with 3% GST', () => {
  const result = calculateBillTotals({
    subtotal: 100000,
    gstRate: 3.0,
    transportCharges: 250,
  });

  assert.equal(result.subtotal, 100000);
  assert.equal(result.discountAmount, 0);
  assert.equal(result.taxableAmount, 100000);
  assert.equal(result.gstRate, 3.0);
  assert.equal(result.gstAmount, 3000);
  assert.equal(result.transportCharges, 250);
  assert.equal(result.grandTotal, 103250);
});

test('calculateBillTotals - Percentage discount', () => {
  const result = calculateBillTotals({
    subtotal: 50000,
    discountType: 'PERCENT',
    discountValue: 10,
    gstRate: 3.0,
  });

  assert.equal(result.discountAmount, 5000);
  assert.equal(result.taxableAmount, 45000);
  assert.equal(result.gstAmount, 1350);
  assert.equal(result.grandTotal, 46350);
});

test('calculateBillTotals - Fixed amount discount with round off', () => {
  const result = calculateBillTotals({
    subtotal: 72345.60,
    discountType: 'AMOUNT',
    discountValue: 500,
    gstRate: 3.0,
  });

  assert.equal(result.discountAmount, 500);
  assert.equal(result.taxableAmount, 71845.60);
  // 71845.60 * 0.03 = 2155.368 -> rounded to 2155.37
  assert.equal(result.gstAmount, 2155.37);
  // Total before round: 71845.60 + 2155.37 = 74000.97
  assert.equal(result.grandTotalBeforeRound, 74000.97);
  // Round off: +0.03 to make 74001.00
  assert.equal(result.roundOff, 0.03);
  assert.equal(result.grandTotal, 74001);
});

test('calculateBillTotals - Extra charges combination (transport, packaging, other)', () => {
  const result = calculateBillTotals({
    subtotal: 20000,
    discountType: 'AMOUNT',
    discountValue: 0,
    gstRate: 0, // 0% tax override
    transportCharges: 350,
    packagingCharges: 150,
    otherCharges: 100,
  });

  assert.equal(result.totalCharges, 600);
  assert.equal(result.grandTotal, 20600);
});

test('validateTotalsMatch - Rejects mismatched client calculations', () => {
  const computed = calculateBillTotals({
    subtotal: 10000,
    gstRate: 3.0,
  });

  const validClient = {
    subtotal: 10000,
    taxableAmount: 10000,
    gstAmount: 300,
    grandTotal: 10300,
  };
  const matchResult = validateTotalsMatch(validClient, computed);
  assert.equal(matchResult.isMatch, true);

  const forgedClient = {
    subtotal: 10000,
    grandTotal: 9999, // mismatch!
  };
  const mismatchResult = validateTotalsMatch(forgedClient, computed);
  assert.equal(mismatchResult.isMatch, false);
  assert.equal(mismatchResult.mismatchField, 'grandTotal');
});
