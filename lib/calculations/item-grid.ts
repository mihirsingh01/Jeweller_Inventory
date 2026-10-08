import type { Item, GridLineItem } from '../api/types';

/**
 * Calculates line amount without floating-point inaccuracies.
 * Math is executed in integer paise and integer grams.
 * 
 * - For PCS: pieces * rate (in paise)
 * - For KG: (weight in grams * rate in paise) / 1000, rounded to nearest paisa
 */
export function calculateLineAmount(unit: 'PCS' | 'KG', qty: number, rate: number): number {
  if (qty <= 0 || rate <= 0 || isNaN(qty) || isNaN(rate)) {
    return 0;
  }

  // Rate in paise (integer)
  const ratePaise = Math.round(rate * 100);

  if (unit === 'PCS') {
    const pieces = Math.floor(qty);
    const amountPaise = pieces * ratePaise;
    return amountPaise / 100;
  } else {
    // Weight in grams (integer, 3 decimal places)
    const weightGrams = Math.round(qty * 1000);
    // 1000 grams = 1 Kg. Round to nearest paisa.
    const amountPaise = Math.round((weightGrams * ratePaise) / 1000);
    return amountPaise / 100;
  }
}

export interface GridTotals {
  totalPieces: number;
  totalWeightKg: number;
  subtotalPaise: number;
  subtotal: number;
  validLineCount: number;
}

export interface GridLineLike {
  id?: string;
  item_id?: string;
  item_name?: string;
  item_code?: string;
  unit?: 'PCS' | 'KG';
  pieces?: number | '' | null;
  weight_kg?: number | '' | null;
  rate?: number | '' | null;
  amount?: number;
  isValid?: boolean;
  error?: string;
}

/**
 * Computes grid totals across all line items using integer accumulators.
 */
export function calculateGridTotals(lines: Array<GridLineLike>): GridTotals {
  let subtotalPaise = 0;
  let totalPieces = 0;
  let totalWeightGrams = 0;
  let validLineCount = 0;

  for (const line of lines) {
    if (!line.item_id) continue;

    const amount = Number(line.amount) || 0;
    if (amount > 0) {
      subtotalPaise += Math.round(amount * 100);
      validLineCount++;
    }

    if (line.unit === 'PCS') {
      totalPieces += Math.floor(Number(line.pieces) || 0);
    } else if (line.unit === 'KG') {
      totalWeightGrams += Math.round((Number(line.weight_kg) || 0) * 1000);
    }
  }

  return {
    totalPieces,
    totalWeightKg: totalWeightGrams / 1000,
    subtotalPaise,
    subtotal: subtotalPaise / 100,
    validLineCount,
  };
}

export interface LineValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a single grid row against item configuration and business invariants.
 */
export function validateGridLine(
  line: GridLineLike,
  itemConfig?: Item,
): LineValidationResult {
  // If row is completely empty, it is not an error (trailing empty row)
  if (!line.item_id && !line.pieces && !line.weight_kg && !line.rate) {
    return { isValid: false, error: 'Empty row' };
  }

  if (!line.item_id) {
    return { isValid: false, error: 'Item must be selected' };
  }

  const unit = line.unit || 'KG';

  // Check unit compatibility against item configuration
  if (itemConfig && itemConfig.allowed_units) {
    if (itemConfig.allowed_units === 'PCS' && unit !== 'PCS') {
      return { isValid: false, error: `${itemConfig.name} only allows PCS unit` };
    }
    if (itemConfig.allowed_units === 'KG' && unit !== 'KG') {
      return { isValid: false, error: `${itemConfig.name} only allows KG unit` };
    }
  }

  if (unit === 'PCS') {
    const pcs = Number(line.pieces);
    if (!pcs || pcs <= 0) {
      return { isValid: false, error: 'Pieces must be greater than 0' };
    }
    if (!Number.isInteger(pcs)) {
      return { isValid: false, error: 'Pieces must be a whole number' };
    }
  } else {
    const wt = Number(line.weight_kg);
    if (!wt || wt <= 0) {
      return { isValid: false, error: 'Weight (Kg) must be greater than 0' };
    }
  }

  const rate = Number(line.rate);
  if (rate === undefined || rate === null || isNaN(rate) || rate < 0) {
    return { isValid: false, error: 'Rate cannot be negative' };
  }

  return { isValid: true };
}
