import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVoucherLedgerImpact,
  validateVoucherAllocations,
} from '../lib/calculations/voucher-calculations.ts';

test('Voucher - Customer Receipt reduces receivable balance (Req 34, 46)', () => {
  const result = calculateVoucherLedgerImpact({
    kind: 'RECEIPT',
    partyType: 'CUSTOMER',
    currentBalance: 50000.0,
    amount: 20000.0,
  });

  assert.equal(result.balanceBefore, 50000.0);
  assert.equal(result.thisVoucher, 20000.0);
  assert.equal(result.balanceAfter, 30000.0);
  assert.equal(result.isOverpayment, false);
  assert.match(result.beforeLabel, /50000\.00 Dr/);
  assert.match(result.afterLabel, /30000\.00 Dr/);
});

test('Voucher - Customer Receipt with surplus turns balance into customer advance (Cr)', () => {
  const result = calculateVoucherLedgerImpact({
    kind: 'RECEIPT',
    partyType: 'CUSTOMER',
    currentBalance: 10000.0,
    amount: 15000.0,
  });

  assert.equal(result.balanceBefore, 10000.0);
  assert.equal(result.thisVoucher, 15000.0);
  assert.equal(result.balanceAfter, -5000.0);
  assert.match(result.afterLabel, /5000\.00 Cr \(Advance\)/);
});

test('Voucher - Supplier Payment reduces payable balance (Req 36, 46)', () => {
  const result = calculateVoucherLedgerImpact({
    kind: 'PAYMENT',
    partyType: 'SUPPLIER',
    currentBalance: 40000.0,
    amount: 15000.0,
  });

  assert.equal(result.balanceBefore, 40000.0);
  assert.equal(result.thisVoucher, 15000.0);
  assert.equal(result.balanceAfter, 25000.0);
  assert.equal(result.isOverpayment, false);
  assert.match(result.beforeLabel, /40000\.00 Cr \(Payable\)/);
  assert.match(result.afterLabel, /25000\.00 Cr \(Payable\)/);
});

test('Voucher - Supplier Payment exceeding payable flags advance payment warning (Req 36)', () => {
  const result = calculateVoucherLedgerImpact({
    kind: 'PAYMENT',
    partyType: 'SUPPLIER',
    currentBalance: 10000.0,
    amount: 25000.0,
  });

  assert.equal(result.balanceBefore, 10000.0);
  assert.equal(result.thisVoucher, 25000.0);
  assert.equal(result.balanceAfter, -15000.0);
  assert.equal(result.isOverpayment, true);
  assert.equal(result.overpaymentAmount, 15000.0);
  assert.match(result.afterLabel, /15000\.00 Dr \(Advance\)/);
});

test('Voucher - Allocation validation handles exact match and partial allocations', () => {
  const valid = validateVoucherAllocations(10000, [
    { amount: 4000 },
    { amount: 3500 },
  ]);

  assert.equal(valid.isValid, true);
  assert.equal(valid.totalAllocated, 7500);
  assert.equal(valid.remainingUnallocated, 2500);

  const exact = validateVoucherAllocations(5000, [
    { amount: 2000 },
    { amount: 3000 },
  ]);

  assert.equal(exact.isValid, true);
  assert.equal(exact.totalAllocated, 5000);
  assert.equal(exact.remainingUnallocated, 0);
});

test('Voucher - Allocation validation rejects allocations exceeding voucher amount', () => {
  const invalid = validateVoucherAllocations(5000, [
    { amount: 3000 },
    { amount: 2500 },
  ]);

  assert.equal(invalid.isValid, false);
  assert.equal(invalid.totalAllocated, 5500);
  assert.equal(invalid.remainingUnallocated, 0);
  assert.match(invalid.error || '', /exceeds voucher total/);
});

test('Voucher - Integer paise precision on fractional sums (zero-float)', () => {
  const valid = validateVoucherAllocations(301.0, [
    { amount: 100.33 },
    { amount: 200.67 },
  ]);

  assert.equal(valid.isValid, true);
  assert.equal(valid.totalAllocated, 301.0);
  assert.equal(valid.remainingUnallocated, 0.0);
});
