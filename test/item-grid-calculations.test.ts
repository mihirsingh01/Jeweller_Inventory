import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLineAmount,
  calculateGridTotals,
  validateGridLine,
} from '../lib/calculations/item-grid.ts';
import type { Item, GridLineItem } from '../lib/api/types';

test('calculateLineAmount - PCS whole unit calculation', () => {
  // 5 pieces at Rs 1,200.00 each -> Rs 6,000.00
  const amt1 = calculateLineAmount('PCS', 5, 1200);
  assert.equal(amt1, 6000);

  // 10 pieces at Rs 99.99 each -> Rs 999.90
  const amt2 = calculateLineAmount('PCS', 10, 99.99);
  assert.equal(amt2, 999.9);

  // Non-integer qty gets floored
  const amt3 = calculateLineAmount('PCS', 5.8, 100);
  assert.equal(amt3, 500);
});

test('calculateLineAmount - KG 3-decimal precision without float errors', () => {
  // 0.125 Kg (125 grams) at Rs 72,000 / Kg -> Rs 9,000.00
  const amt1 = calculateLineAmount('KG', 0.125, 72000);
  assert.equal(amt1, 9000);

  // 2.500 Kg at Rs 65,432.10 / Kg -> (2500 * 6543210) / 1000 = 16358025 paise = Rs 163,580.25
  const amt2 = calculateLineAmount('KG', 2.500, 65432.10);
  assert.equal(amt2, 163580.25);

  // 0.001 Kg (1 gram) at Rs 70,000 / Kg -> Rs 70.00
  const amt3 = calculateLineAmount('KG', 0.001, 70000);
  assert.equal(amt3, 70);

  // Fractional paise rounding check: 0.333 Kg at Rs 1,000 / Kg -> 333 * 100000 / 1000 = 33300 paise = Rs 333.00
  const amt4 = calculateLineAmount('KG', 0.333, 1000);
  assert.equal(amt4, 333);
});

test('calculateLineAmount - Zero or negative handling', () => {
  assert.equal(calculateLineAmount('KG', 0, 70000), 0);
  assert.equal(calculateLineAmount('KG', -1, 70000), 0);
  assert.equal(calculateLineAmount('PCS', 5, -100), 0);
  assert.equal(calculateLineAmount('KG', NaN, 70000), 0);
});

test('calculateGridTotals - Accumulation of mixed units and paise', () => {
  const lines: Partial<GridLineItem>[] = [
    {
      item_id: 'i1',
      unit: 'KG',
      weight_kg: 0.150,
      pieces: 0,
      rate: 72000,
      amount: 10800,
    },
    {
      item_id: 'i2',
      unit: 'PCS',
      weight_kg: 0,
      pieces: 4,
      rate: 2500.50,
      amount: 10002,
    },
    // Trailing empty row
    {
      item_id: '',
      unit: 'KG',
      weight_kg: 0,
      pieces: 0,
      rate: 0,
      amount: 0,
    },
  ];

  const totals = calculateGridTotals(lines);
  assert.equal(totals.validLineCount, 2);
  assert.equal(totals.totalPieces, 4);
  assert.equal(totals.totalWeightKg, 0.150);
  assert.equal(totals.subtotal, 20802);
  assert.equal(totals.subtotalPaise, 2080200);
});

test('validateGridLine - Unit constraints and positive inputs', () => {
  const czItem: Item = {
    id: 'i4',
    name: 'Loose Cubic Zirconia',
    category: 'Stones',
    code: 'CZ',
    allowed_units: 'PCS',
    default_unit: 'PCS',
    stock_pieces: 10,
    stock_kg: 0,
    is_active: true,
  };

  const goldItem: Item = {
    id: 'i1',
    name: 'Gold Ornaments 22K',
    category: 'Gold',
    code: 'GO22',
    allowed_units: 'KG',
    default_unit: 'KG',
    stock_pieces: 0,
    stock_kg: 1.5,
    is_active: true,
  };

  // CZ only allows PCS
  const invalidCz = validateGridLine(
    { item_id: czItem.id, unit: 'KG', weight_kg: 0.100, rate: 500 },
    czItem,
  );
  assert.equal(invalidCz.isValid, false);
  assert.match(invalidCz.error!, /only allows PCS unit/);

  // Valid CZ with PCS
  const validCz = validateGridLine(
    { item_id: czItem.id, unit: 'PCS', pieces: 5, rate: 500 },
    czItem,
  );
  assert.equal(validCz.isValid, true);

  // Gold only allows KG
  const invalidGold = validateGridLine(
    { item_id: goldItem.id, unit: 'PCS', pieces: 2, rate: 70000 },
    goldItem,
  );
  assert.equal(invalidGold.isValid, false);
  assert.match(invalidGold.error!, /only allows KG unit/);

  // Empty row is invalid but marked as empty
  const emptyRow = validateGridLine({ item_id: '', pieces: 0, weight_kg: 0, rate: 0 });
  assert.equal(emptyRow.isValid, false);
  assert.equal(emptyRow.error, 'Empty row');
});
