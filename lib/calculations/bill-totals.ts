/**
 * Pure calculation engine for Sales Bill totals and charges breakdown.
 * Invariant: ZERO floating-point errors.
 * All intermediate operations are computed in integer paise.
 * 
 * Order of calculation:
 * 1. Subtotal (sum of item lines)
 * 2. - Discount (percentage or fixed amount) = Taxable Amount
 * 3. + GST (% applied on Taxable Amount)
 * 4. + Transport Charges
 * 5. + Packaging Charges
 * 6. + Other Charges
 * 7. +/- Round Off (to nearest whole rupee)
 * 8. = Grand Total
 */

export interface CalculateBillChargesInput {
  subtotal: number;
  discountType?: 'AMOUNT' | 'PERCENT';
  discountValue?: number;
  gstRate?: number; // e.g. 3.0 for 3%
  transportCharges?: number;
  packagingCharges?: number;
  otherCharges?: number;
  applyRoundOff?: boolean; // defaults to true
}

export interface CalculatedBillTotals {
  subtotal: number;
  discountType: 'AMOUNT' | 'PERCENT';
  discountValue: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  transportCharges: number;
  packagingCharges: number;
  otherCharges: number;
  totalCharges: number;
  grandTotalBeforeRound: number;
  roundOff: number;
  grandTotal: number;
}

export type BillTotals = CalculatedBillTotals;

export function calculateBillTotals(input: CalculateBillChargesInput): CalculatedBillTotals {
  const subtotalPaise = Math.max(0, Math.round((Number(input.subtotal) || 0) * 100));
  const discountType = input.discountType === 'PERCENT' ? 'PERCENT' : 'AMOUNT';
  const discountValue = Math.max(0, Number(input.discountValue) || 0);

  let discountPaise = 0;
  if (discountType === 'PERCENT') {
    discountPaise = Math.round((subtotalPaise * discountValue) / 100);
  } else {
    discountPaise = Math.round(discountValue * 100);
  }
  // Discount cannot exceed subtotal
  discountPaise = Math.min(discountPaise, subtotalPaise);

  const taxablePaise = subtotalPaise - discountPaise;

  const gstRate = Math.max(0, Number(input.gstRate ?? 3.0));
  const gstPaise = Math.round((taxablePaise * gstRate) / 100);

  const transportPaise = Math.max(0, Math.round((Number(input.transportCharges) || 0) * 100));
  const packagingPaise = Math.max(0, Math.round((Number(input.packagingCharges) || 0) * 100));
  const otherPaise = Math.max(0, Math.round((Number(input.otherCharges) || 0) * 100));

  const totalChargesPaise = transportPaise + packagingPaise + otherPaise;
  const grandTotalBeforeRoundPaise = taxablePaise + gstPaise + totalChargesPaise;

  const applyRound = input.applyRoundOff !== false;
  let grandTotalPaise = grandTotalBeforeRoundPaise;
  let roundOffPaise = 0;

  if (applyRound) {
    // Round to nearest whole rupee (100 paise)
    grandTotalPaise = Math.round(grandTotalBeforeRoundPaise / 100) * 100;
    roundOffPaise = grandTotalPaise - grandTotalBeforeRoundPaise;
  }

  return {
    subtotal: subtotalPaise / 100,
    discountType,
    discountValue,
    discountAmount: discountPaise / 100,
    taxableAmount: taxablePaise / 100,
    gstRate,
    gstAmount: gstPaise / 100,
    transportCharges: transportPaise / 100,
    packagingCharges: packagingPaise / 100,
    otherCharges: otherPaise / 100,
    totalCharges: totalChargesPaise / 100,
    grandTotalBeforeRound: grandTotalBeforeRoundPaise / 100,
    roundOff: roundOffPaise / 100,
    grandTotal: grandTotalPaise / 100,
  };
}

/**
 * Validates that server and client computed bill totals match within 0 paise tolerance.
 */
export function validateTotalsMatch(
  clientTotals: Partial<CalculatedBillTotals>,
  computedTotals: CalculatedBillTotals,
): { isMatch: boolean; mismatchField?: string; expected?: number; received?: number } {
  const fieldsToCheck: (keyof CalculatedBillTotals)[] = [
    'subtotal',
    'discountAmount',
    'taxableAmount',
    'gstAmount',
    'grandTotal',
  ];

  for (const field of fieldsToCheck) {
    if (clientTotals[field] !== undefined) {
      const clientVal = Math.round(Number(clientTotals[field]) * 100);
      const computedVal = Math.round(Number(computedTotals[field]) * 100);
      if (clientVal !== computedVal) {
        return {
          isMatch: false,
          mismatchField: field,
          expected: computedVal / 100,
          received: clientVal / 100,
        };
      }
    }
  }

  return { isMatch: true };
}
