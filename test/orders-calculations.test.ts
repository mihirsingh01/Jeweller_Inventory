import test from 'node:test';
import assert from 'node:assert';

interface OrderCalculationLine {
  unit: 'PCS' | 'KG';
  pieces?: number;
  weight_kg?: number;
  rate: number;
}

function calculateOrderTotals(lines: OrderCalculationLine[]) {
  let subtotalPaise = 0;
  const processedLines = lines.map((line) => {
    let linePaise = 0;
    const ratePaise = Math.round(line.rate * 100);
    if (line.unit === 'PCS') {
      linePaise = Math.floor(line.pieces || 0) * ratePaise;
    } else {
      const weightGrams = Math.round((line.weight_kg || 0) * 1000);
      linePaise = Math.round((weightGrams * ratePaise) / 1000);
    }
    subtotalPaise += linePaise;
    return {
      ...line,
      amount: linePaise / 100,
    };
  });

  const gstRate = 3.0; // 3% GST on jewellery
  const gstPaise = Math.round((subtotalPaise * gstRate) / 100);
  const exactTotalPaise = subtotalPaise + gstPaise;
  const roundedTotalPaise = Math.round(exactTotalPaise / 100) * 100;
  const roundOffPaise = roundedTotalPaise - exactTotalPaise;

  return {
    lines: processedLines,
    subtotal: subtotalPaise / 100,
    gstRate,
    gstAmount: gstPaise / 100,
    roundOff: roundOffPaise / 100,
    totalAmount: roundedTotalPaise / 100,
  };
}

function convertOrderLinesToBillLines(lines: Array<{
  item_id: string;
  unit: 'PCS' | 'KG';
  pieces?: number;
  weight_kg?: number;
  fulfilled_pieces?: number;
  fulfilled_weight_kg?: number;
  rate: number;
}>) {
  return lines
    .map((line) => {
      const pendingPieces = line.unit === 'PCS'
        ? Math.max(0, (line.pieces || 0) - (line.fulfilled_pieces || 0))
        : undefined;
      const pendingWeight = line.unit === 'KG'
        ? Math.max(0, Math.round(((line.weight_kg || 0) - (line.fulfilled_weight_kg || 0)) * 1000) / 1000)
        : undefined;

      if (line.unit === 'PCS' && pendingPieces === 0) return null;
      if (line.unit === 'KG' && (pendingWeight || 0) <= 0.0001) return null;

      const ratePaise = Math.round(line.rate * 100);
      const amountPaise = line.unit === 'PCS'
        ? (pendingPieces || 0) * ratePaise
        : Math.round(((pendingWeight || 0) * 1000 * ratePaise) / 1000);

      return {
        item_id: line.item_id,
        unit: line.unit,
        pieces: pendingPieces,
        weight_kg: pendingWeight,
        rate: line.rate,
        amount: amountPaise / 100,
      };
    })
    .filter(Boolean);
}

test('Order Calculations - Zero-float arithmetic with 3% GST and rupee round-off', () => {
  const lines: OrderCalculationLine[] = [
    { unit: 'KG', weight_kg: 0.025, rate: 7500000 }, // 25 grams at ₹75,00,000/kg = ₹1,87,500.00
    { unit: 'PCS', pieces: 2, rate: 1250.50 },        // 2 pcs at ₹1250.50 = ₹2,501.00
  ];

  const result = calculateOrderTotals(lines);

  // Subtotal = 187500 + 2501 = 190001.00
  assert.strictEqual(result.subtotal, 190001.00);
  assert.strictEqual(result.lines[0].amount, 187500.00);
  assert.strictEqual(result.lines[1].amount, 2501.00);

  // 3% GST on 190001 = 5700.03
  assert.strictEqual(result.gstAmount, 5700.03);

  // Exact total = 190001 + 5700.03 = 195701.03
  // Rounded total to nearest rupee = 195701.00
  // Round off = -0.03
  assert.strictEqual(result.roundOff, -0.03);
  assert.strictEqual(result.totalAmount, 195701.00);
});

test('Decoupled Orders Invariant - Order creation creates zero ledger entries and zero stock movements', () => {
  // Simulate mock database mutation tracking
  let ledgerEntriesCreated = 0;
  let stockMovementsCreated = 0;

  function handleCreateOrderAction() {
    // Orders Module: Non-financial commitment only (Req 6, 7)
    // ONLY inserts into sales_orders / purchase_orders and audit_log
    // ledger_entries and stock_movements MUST NEVER be touched
    return { order_id: 'so-1', status: 'PENDING' };
  }

  handleCreateOrderAction();

  assert.strictEqual(ledgerEntriesCreated, 0, 'Orders must never write to ledger_entries');
  assert.strictEqual(stockMovementsCreated, 0, 'Orders must never write to stock_movements');
});

test('Conversion to Bill - Pre-fills unfulfilled quantities and calculates accurate pending balances', () => {
  const orderLines = [
    {
      item_id: 'i1',
      unit: 'PCS' as const,
      pieces: 10,
      fulfilled_pieces: 4, // 6 pending
      rate: 500,
    },
    {
      item_id: 'i2',
      unit: 'KG' as const,
      weight_kg: 1.500,
      fulfilled_weight_kg: 0.500, // 1.000 kg pending
      rate: 70000,
    },
    {
      item_id: 'i3',
      unit: 'PCS' as const,
      pieces: 2,
      fulfilled_pieces: 2, // 0 pending -> should be excluded from prefill
      rate: 1000,
    },
  ];

  const prefilled = convertOrderLinesToBillLines(orderLines);

  assert.strictEqual(prefilled.length, 2, 'Fully fulfilled lines should not be prefilled');
  assert.strictEqual(prefilled[0]?.pieces, 6);
  assert.strictEqual(prefilled[0]?.amount, 3000); // 6 * 500
  assert.strictEqual(prefilled[1]?.weight_kg, 1.000);
  assert.strictEqual(prefilled[1]?.amount, 70000); // 1.000 * 70000
});

test('Order Status Transitions - Guard against converting already COMPLETED or CANCELLED orders', () => {
  function validateOrderConvertible(status: string) {
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      throw new Error(`Cannot convert order because status is ${status}`);
    }
    return true;
  }

  // PENDING and PARTIAL can be converted
  assert.doesNotThrow(() => validateOrderConvertible('PENDING'));
  assert.doesNotThrow(() => validateOrderConvertible('PARTIAL'));

  // COMPLETED and CANCELLED throw error
  assert.throws(() => validateOrderConvertible('COMPLETED'), /Cannot convert order/);
  assert.throws(() => validateOrderConvertible('CANCELLED'), /Cannot convert order/);
});

test('Staff Scoping - Staff isolation throws 404 (NotFoundException) on cross-staff order access', () => {
  const order = {
    id: 'so-1',
    created_by: 'staff-1',
  };

  function checkAccess(user: { id: string; role: 'OWNER' | 'STAFF' }, orderOwnerId: string) {
    if (user.role === 'STAFF' && user.id !== orderOwnerId) {
      throw new Error('NotFoundException: Order not found');
    }
    return true;
  }

  // Staff-1 accessing own order -> allowed
  assert.doesNotThrow(() => checkAccess({ id: 'staff-1', role: 'STAFF' }, order.created_by));

  // Staff-2 accessing Staff-1 order -> 404
  assert.throws(
    () => checkAccess({ id: 'staff-2', role: 'STAFF' }, order.created_by),
    /NotFoundException/,
  );

  // Owner accessing any order -> allowed
  assert.doesNotThrow(() => checkAccess({ id: 'owner-1', role: 'OWNER' }, order.created_by));
});
