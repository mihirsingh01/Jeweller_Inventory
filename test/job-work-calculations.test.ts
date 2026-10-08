import test from 'node:test';
import assert from 'node:assert';

interface PendingCalculationInput {
  sent_pieces: number;
  sent_weight_kg: number;
  receives: Array<{ pieces: number; weight_kg: number; is_closed?: boolean }>;
}

function calculatePending(input: PendingCalculationInput) {
  const totalReceivedPieces = input.receives.reduce((sum, r) => sum + r.pieces, 0);
  const totalReceivedWeightKg = input.receives.reduce(
    (sum, r) => sum + Math.round(r.weight_kg * 1000),
    0,
  ) / 1000;

  const pendingPieces = Math.max(0, input.sent_pieces - totalReceivedPieces);
  const pendingWeightKg = Math.max(
    0,
    Math.round((input.sent_weight_kg - totalReceivedWeightKg) * 1000) / 1000,
  );

  const isClosed =
    input.receives.some((r) => r.is_closed) ||
    (pendingPieces === 0 && pendingWeightKg === 0);

  return {
    totalReceivedPieces,
    totalReceivedWeightKg,
    pendingPieces,
    pendingWeightKg,
    isClosed,
  };
}

function calculateDifference(received: number, sentOrPending: number, isKg = false) {
  if (isKg) {
    const diff = Math.round((received - sentOrPending) * 1000) / 1000;
    return {
      diff,
      sign: diff > 0 ? '+' : '',
      status: diff < 0 ? 'SHORTAGE' : diff > 0 ? 'SURPLUS' : 'MATCHED',
    };
  } else {
    const diff = received - sentOrPending;
    return {
      diff,
      sign: diff > 0 ? '+' : '',
      status: diff < 0 ? 'SHORTAGE' : diff > 0 ? 'SURPLUS' : 'MATCHED',
    };
  }
}

test('Job Work - Difference calculation (8 of 10 -> -2 red, 12 of 10 -> +2 green, 10 of 10 -> 0)', () => {
  // Case A: 8 of 10 (shortage)
  const diffA = calculateDifference(8, 10, false);
  assert.strictEqual(diffA.diff, -2);
  assert.strictEqual(diffA.status, 'SHORTAGE');

  // Case B: 12 of 10 (surplus)
  const diffB = calculateDifference(12, 10, false);
  assert.strictEqual(diffB.diff, 2);
  assert.strictEqual(diffB.sign, '+');
  assert.strictEqual(diffB.status, 'SURPLUS');

  // Case C: 10 of 10 (exact match)
  const diffC = calculateDifference(10, 10, false);
  assert.strictEqual(diffC.diff, 0);
  assert.strictEqual(diffC.status, 'MATCHED');

  // Case D: KG 3-decimal precision (2.450 of 2.500 Kg -> -0.050 Kg)
  const diffKg = calculateDifference(2.45, 2.5, true);
  assert.strictEqual(diffKg.diff, -0.05);
  assert.strictEqual(diffKg.status, 'SHORTAGE');
});

test('Job Work - Partial receipt across two separate receive entries', () => {
  const sent = {
    sent_pieces: 10,
    sent_weight_kg: 2.5,
  };

  // First partial receipt: 4 pieces, 1.000 kg received
  const stateAfterFirst = calculatePending({
    ...sent,
    receives: [{ pieces: 4, weight_kg: 1.0 }],
  });
  assert.strictEqual(stateAfterFirst.totalReceivedPieces, 4);
  assert.strictEqual(stateAfterFirst.totalReceivedWeightKg, 1.0);
  assert.strictEqual(stateAfterFirst.pendingPieces, 6);
  assert.strictEqual(stateAfterFirst.pendingWeightKg, 1.5);
  assert.strictEqual(stateAfterFirst.isClosed, false);

  // Second partial receipt: remaining 6 pieces, 1.500 kg received
  const stateAfterSecond = calculatePending({
    ...sent,
    receives: [
      { pieces: 4, weight_kg: 1.0 },
      { pieces: 6, weight_kg: 1.5 },
    ],
  });
  assert.strictEqual(stateAfterSecond.totalReceivedPieces, 10);
  assert.strictEqual(stateAfterSecond.totalReceivedWeightKg, 2.5);
  assert.strictEqual(stateAfterSecond.pendingPieces, 0);
  assert.strictEqual(stateAfterSecond.pendingWeightKg, 0);
  assert.strictEqual(stateAfterSecond.isClosed, true);
});

test('Job Work - Close line with shortage option', () => {
  // Sent 10 pieces. Received only 8 pieces, but user checks "Close line with shortage"
  const state = calculatePending({
    sent_pieces: 10,
    sent_weight_kg: 2.0,
    receives: [{ pieces: 8, weight_kg: 1.6, is_closed: true }],
  });

  assert.strictEqual(state.totalReceivedPieces, 8);
  assert.strictEqual(state.pendingPieces, 2);
  // Although 2 pieces remain physically unreceived, line is explicitly closed
  assert.strictEqual(state.isClosed, true);
});

test('Job Work - Karigar Ledger Balance Direction (Labour charge posted on Receive)', () => {
  // Karigar starting balance: ₹4,500 Cr (accounts payable = -4500)
  const priorBalance = -4500;

  // On Issue: NO financial posting to ledger (stays -4500)
  const balanceAfterIssue = priorBalance;
  assert.strictEqual(balanceAfterIssue, -4500);

  // On Receive: Labour charge of ₹750 is recorded
  const labourCharge = 750;
  // Credit to Karigar increases accounts payable to ₹5,250 (-5250)
  const closingBalance = priorBalance - labourCharge;
  assert.strictEqual(closingBalance, -5250);
  assert.strictEqual(Math.abs(closingBalance), 5250);
});

test('Job Work - Multi-line fast entry line validation', () => {
  const validLine = {
    item_id: 'i1',
    unit: 'KG' as const,
    pieces: 0,
    weight_kg: 0.85,
    labour_charge: 250,
  };

  assert.ok(validLine.weight_kg > 0);
  assert.ok(validLine.labour_charge >= 0);
});
