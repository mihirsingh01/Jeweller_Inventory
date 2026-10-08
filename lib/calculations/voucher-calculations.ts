/**
 * Pure integer-paise calculations for Money Vouchers (Receipt & Payment)
 * Adheres strictly to Kumkum Payal zero-float invariant (Req 36, 43, 46).
 */

export interface VoucherLedgerImpactInput {
  kind: 'RECEIPT' | 'PAYMENT';
  partyType?: 'CUSTOMER' | 'SUPPLIER' | 'KARIGAR' | 'BOTH';
  currentBalance: number; // In rupees
  amount: number; // In rupees
}

export interface VoucherLedgerImpactResult {
  balanceBefore: number;
  thisVoucher: number;
  balanceAfter: number;
  isOverpayment: boolean;
  overpaymentAmount: number;
  beforeLabel: string;
  afterLabel: string;
}

/**
 * Calculates dynamic party ledger balances before and after a voucher is saved.
 * Customer: Positive balance = Receivable (Dr), Negative balance = Advance from customer (Cr)
 * Supplier/Karigar: Positive balance = Payable (Cr), Negative balance = Advance to party (Dr)
 */
export function calculateVoucherLedgerImpact(
  input: VoucherLedgerImpactInput,
): VoucherLedgerImpactResult {
  const currentPaise = Math.round(Number(input.currentBalance || 0) * 100);
  const voucherPaise = Math.round(Number(input.amount || 0) * 100);
  const isCustomer = input.partyType === 'CUSTOMER';

  let afterPaise = 0;
  let isOverpayment = false;
  let overpaymentPaise = 0;

  if (input.kind === 'RECEIPT') {
    // RECEIPT reduces customer receivable (Credit party ledger)
    // For supplier, receipt returns advance/refunds payable
    afterPaise = currentPaise - voucherPaise;
  } else {
    // PAYMENT reduces supplier payable (Debit party ledger)
    // For customer, payment issues refund/advance
    afterPaise = currentPaise - voucherPaise;
    if (voucherPaise > currentPaise && currentPaise >= 0) {
      isOverpayment = true;
      overpaymentPaise = voucherPaise - currentPaise;
    }
  }

  const balanceBefore = currentPaise / 100;
  const thisVoucher = voucherPaise / 100;
  const balanceAfter = afterPaise / 100;
  const overpaymentAmount = overpaymentPaise / 100;

  const formatBalanceLabel = (paiseVal: number, customer: boolean): string => {
    const absVal = (Math.abs(paiseVal) / 100).toFixed(2);
    if (paiseVal === 0) return `₹0.00`;
    if (customer) {
      return paiseVal > 0 ? `₹${absVal} Dr (Receivable)` : `₹${absVal} Cr (Advance)`;
    } else {
      return paiseVal > 0 ? `₹${absVal} Cr (Payable)` : `₹${absVal} Dr (Advance)`;
    }
  };

  return {
    balanceBefore,
    thisVoucher,
    balanceAfter,
    isOverpayment,
    overpaymentAmount,
    beforeLabel: formatBalanceLabel(currentPaise, isCustomer),
    afterLabel: formatBalanceLabel(afterPaise, isCustomer),
  };
}

/**
 * Validates bill allocations against voucher amount using integer paise.
 */
export function validateVoucherAllocations(
  voucherAmount: number,
  allocations: Array<{ amount: number }>,
): {
  totalAllocated: number;
  remainingUnallocated: number;
  isValid: boolean;
  error?: string;
} {
  const voucherPaise = Math.round(Number(voucherAmount || 0) * 100);
  const totalAllocatedPaise = allocations.reduce(
    (sum, a) => sum + Math.round(Number(a.amount || 0) * 100),
    0,
  );

  const totalAllocated = totalAllocatedPaise / 100;
  const remainingUnallocated = Math.max(0, (voucherPaise - totalAllocatedPaise) / 100);

  if (totalAllocatedPaise > voucherPaise) {
    return {
      totalAllocated,
      remainingUnallocated: 0,
      isValid: false,
      error: `Allocated amount (₹${totalAllocated.toFixed(2)}) exceeds voucher total (₹${(
        voucherPaise / 100
      ).toFixed(2)})`,
    };
  }

  return {
    totalAllocated,
    remainingUnallocated,
    isValid: true,
  };
}
