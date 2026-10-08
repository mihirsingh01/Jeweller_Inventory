'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Party, BankAccount, Sale, Purchase, MoneyVoucher } from '@/lib/api/types';
import { createVoucher, listSales, listPurchases, getParty } from '@/lib/api/services';
import { formatRupee, formatDate } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';
import {
  calculateVoucherLedgerImpact,
  validateVoucherAllocations,
} from '@/lib/calculations/voucher-calculations';

interface VoucherModalProps {
  isOpen: boolean;
  kind: 'RECEIPT' | 'PAYMENT';
  onClose: () => void;
  parties: Party[];
  bankAccounts: BankAccount[];
  onVoucherCreated: () => void;
}

export function VoucherModal({
  isOpen,
  kind,
  onClose,
  parties,
  bankAccounts,
  onVoucherCreated,
}: VoucherModalProps) {
  // Sort / prioritize parties according to voucher kind
  const filteredParties = useMemo(() => {
    if (kind === 'RECEIPT') {
      return [...parties].sort((a, b) => {
        if (a.type === 'CUSTOMER' && b.type !== 'CUSTOMER') return -1;
        if (a.type !== 'CUSTOMER' && b.type === 'CUSTOMER') return 1;
        return a.name.localeCompare(b.name);
      });
    } else {
      return [...parties].sort((a, b) => {
        const aIsPayable = a.type === 'SUPPLIER' || a.type === 'BOTH' || (a.type as string) === 'KARIGAR';
        const bIsPayable = b.type === 'SUPPLIER' || b.type === 'BOTH' || (b.type as string) === 'KARIGAR';
        if (aIsPayable && !bIsPayable) return -1;
        if (!aIsPayable && bIsPayable) return 1;
        return a.name.localeCompare(b.name);
      });
    }
  }, [parties, kind]);

  const [partyId, setPartyId] = useState(filteredParties[0]?.id || '');
  const [partyBalance, setPartyBalance] = useState<number>(0);
  const [amount, setAmount] = useState<number>(25000);
  const [mode, setMode] = useState<'CASH' | 'BANK'>('BANK');
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id || '');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');

  // Unpaid bills for allocation
  const [openSales, setOpenSales] = useState<Sale[]>([]);
  const [openPurchases, setOpenPurchases] = useState<Purchase[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // Loading and idempotency
  const [loading, setLoading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [successVoucher, setSuccessVoucher] = useState<MoneyVoucher | null>(null);

  // Quick party add modal state
  const [quickAddType, setQuickAddType] = useState<'CUSTOMER' | 'SUPPLIER' | 'KARIGAR' | null>(null);

  // Backspace navigation guard
  useBackspaceNavigationGuard();

  // Initialize idempotency key and party on modal open
  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(crypto.randomUUID());
      setSuccessVoucher(null);
      if (filteredParties.length > 0 && !partyId) {
        setPartyId(filteredParties[0].id);
      }
    }
  }, [isOpen, filteredParties]);

  // Alt key shortcuts for fast party creation
  useAltKeyShortcut({
    code: 'KeyC',
    onTrigger: () => setQuickAddType('CUSTOMER'),
    enabled: isOpen && kind === 'RECEIPT',
    isDialogOpen: !!quickAddType,
  });

  useAltKeyShortcut({
    code: 'KeyS',
    onTrigger: () => setQuickAddType('SUPPLIER'),
    enabled: isOpen && kind === 'PAYMENT',
    isDialogOpen: !!quickAddType,
  });

  useAltKeyShortcut({
    code: 'KeyK',
    onTrigger: () => setQuickAddType('KARIGAR'),
    enabled: isOpen && kind === 'PAYMENT',
    isDialogOpen: !!quickAddType,
  });

  // Selected party object
  const selectedParty = useMemo(() => {
    return parties.find((p) => p.id === partyId);
  }, [parties, partyId]);

  // Fetch live party ledger balance when selected party changes
  useEffect(() => {
    if (!partyId) return;
    const p = parties.find((item) => item.id === partyId);
    if (p) {
      setPartyBalance(Number(p.current_balance ?? p.opening_balance ?? 0));
    }

    getParty(partyId)
      .then((live) => {
        if (live && live.current_balance !== undefined) {
          setPartyBalance(Number(live.current_balance));
        }
      })
      .catch(() => {});
  }, [partyId, parties]);

  // Fetch open bills for allocation
  useEffect(() => {
    if (!partyId || !isOpen) {
      setOpenSales([]);
      setOpenPurchases([]);
      setAllocations({});
      return;
    }

    if (kind === 'RECEIPT') {
      listSales(partyId).then((sales) => {
        const unpaid = (sales || []).filter((s) => s.status !== 'PAID');
        setOpenSales(unpaid);
        if (unpaid.length > 0) {
          const first = unpaid[0];
          const out = Number(first.outstanding_amount ?? first.total_amount);
          setAllocations({ [first.id]: Math.min(amount, out) });
        } else {
          setAllocations({});
        }
      });
    } else {
      listPurchases().then((purchases) => {
        const unpaid = (purchases || []).filter(
          (p) => p.party_id === partyId && p.status !== 'PAID',
        );
        setOpenPurchases(unpaid);
        if (unpaid.length > 0) {
          const first = unpaid[0];
          const out = Number(first.outstanding_amount ?? first.total_amount);
          setAllocations({ [first.id]: Math.min(amount, out) });
        } else {
          setAllocations({});
        }
      });
    }
  }, [partyId, kind, isOpen]);

  // Calculate live dynamic balance impact (Req 46)
  const ledgerImpact = useMemo(() => {
    return calculateVoucherLedgerImpact({
      kind,
      partyType: selectedParty?.type,
      currentBalance: partyBalance,
      amount: amount || 0,
    });
  }, [kind, selectedParty, partyBalance, amount]);

  // Allocation validation
  const allocationValidation = useMemo(() => {
    const allocList = Object.values(allocations).map((amt) => ({ amount: amt }));
    return validateVoucherAllocations(amount, allocList);
  }, [amount, allocations]);

  const handleToggleBill = (billId: string, outstanding: number) => {
    const updated = { ...allocations };
    if (updated[billId]) {
      delete updated[billId];
    } else {
      const currentSum = Object.values(updated).reduce((a, b) => a + b, 0);
      const remaining = Math.max(0, amount - currentSum);
      updated[billId] = Math.min(remaining, outstanding);
    }
    setAllocations(updated);
  };

  const handleAllocationAmountChange = (billId: string, newAmt: number, maxOutstanding: number) => {
    const clamped = Math.max(0, Math.min(newAmt, maxOutstanding));
    setAllocations((prev) => ({
      ...prev,
      [billId]: clamped,
    }));
  };

  // Submit handler
  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (loading || successVoucher) return;

      if (!partyId) {
        alert('Please select a party.');
        return;
      }

      if (!amount || amount <= 0) {
        alert('Please enter a valid voucher amount greater than zero.');
        return;
      }

      if (mode === 'BANK' && !bankAccountId) {
        alert('Please select a bank account for BANK transfer mode.');
        return;
      }

      if (!allocationValidation.isValid) {
        alert(allocationValidation.error || 'Allocation error');
        return;
      }

      setLoading(true);

      const allocList = Object.entries(allocations)
        .filter(([, val]) => val > 0)
        .map(([bId, allocAmt]) => ({
          sale_id: kind === 'RECEIPT' ? bId : undefined,
          purchase_id: kind === 'PAYMENT' ? bId : undefined,
          amount: allocAmt,
        }));

      try {
        const saved = await createVoucher({
          kind,
          party_id: partyId,
          mode,
          bank_account_id: mode === 'BANK' ? bankAccountId : undefined,
          amount,
          reference_no: referenceNo || undefined,
          notes: notes || undefined,
          idempotency_key: idempotencyKey,
          allocations: allocList,
        });

        setSuccessVoucher(saved);
        onVoucherCreated();
      } catch (err: any) {
        alert(err.message || 'Error recording voucher');
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      successVoucher,
      partyId,
      amount,
      mode,
      bankAccountId,
      allocationValidation,
      allocations,
      kind,
      referenceNo,
      notes,
      idempotencyKey,
      onVoucherCreated,
    ],
  );

  // Global Save Shortcut (Ctrl+S / Cmd+S / Ctrl+Enter)
  useSaveShortcut({
    onSave: handleSubmit,
    isSubmitting: loading,
    enabled: isOpen && !successVoucher && !quickAddType,
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay">
        <div className="modal-card" style={{ maxWidth: 680 }}>
          {successVoucher ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  background: kind === 'RECEIPT' ? '#ECFDF5' : '#FEF2F2',
                  color: kind === 'RECEIPT' ? '#059669' : '#DC2626',
                  fontSize: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                ✓
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 20, color: '#2B2B2B' }}>
                {kind === 'RECEIPT' ? 'Receipt' : 'Payment'} Voucher Saved
              </h3>
              <p style={{ margin: '0 0 20px', color: '#7A7268', fontSize: 13 }}>
                Voucher #{successVoucher.voucher_no} recorded successfully on{' '}
                {formatDate(successVoucher.entry_at || new Date().toISOString())}
              </p>

              {/* Dynamic Ledger Summary Card */}
              <div
                style={{
                  background: '#FAF6F2',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: 18,
                  marginBottom: 20,
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7A7268', textTransform: 'uppercase', marginBottom: 12 }}>
                  Ledger Impact Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#7A7268', display: 'block' }}>Balance Before</span>
                    <strong style={{ fontSize: 14, color: '#2B2B2B' }} className="tabular-numbers">
                      {ledgerImpact.beforeLabel}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#7A7268', display: 'block' }}>This Voucher</span>
                    <strong
                      style={{
                        fontSize: 14,
                        color: kind === 'RECEIPT' ? '#059669' : '#DC2626',
                      }}
                      className="tabular-numbers"
                    >
                      {formatRupee(successVoucher.amount)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#7A7268', display: 'block' }}>Closing Balance</span>
                    <strong style={{ fontSize: 14, color: '#2B2B2B' }} className="tabular-numbers">
                      {ledgerImpact.afterLabel}
                    </strong>
                  </div>
                </div>

                {successVoucher.reference_no && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 12, color: '#7A7268' }}>
                    Reference / Cheque: <strong>{successVoucher.reference_no}</strong> ({successVoucher.mode})
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSuccessVoucher(null);
                    setIdempotencyKey(crypto.randomUUID());
                    setAllocations({});
                    setReferenceNo('');
                    setNotes('');
                  }}
                >
                  Record Another Voucher
                </button>
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: kind === 'RECEIPT' ? '#059669' : '#DC2626' }}
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>
                    {kind === 'RECEIPT' ? 'Record Receipt (Money IN)' : 'Record Payment (Money OUT)'}
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#7A7268' }}>
                    {kind === 'RECEIPT'
                      ? 'Credits customer ledger & debits cash/bank book'
                      : 'Debits supplier/karigar ledger & credits cash/bank book'}
                  </p>
                </div>
                <button type="button" className="close-btn" onClick={onClose}>
                  ✕
                </button>
              </div>

              <div className="modal-body">
                {/* 1. Live 3-Column Balance Card (Req 46) */}
                <div
                  style={{
                    background: '#FAF6F2',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7A7268', textTransform: 'uppercase' }}>
                      Party Ledger Preview ({selectedParty?.name || 'Party'})
                    </span>
                    <span style={{ fontSize: 11, color: '#7A7268' }}>
                      Type: <strong>{selectedParty?.type || 'PARTY'}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div style={{ background: '#FFF', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
                      <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', display: 'block' }}>
                        Previous Balance
                      </span>
                      <strong style={{ fontSize: 13, color: '#2B2B2B', display: 'block', marginTop: 2 }} className="tabular-numbers">
                        {ledgerImpact.beforeLabel}
                      </strong>
                    </div>

                    <div style={{ background: '#FFF', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
                      <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', display: 'block' }}>
                        This Voucher
                      </span>
                      <strong
                        style={{
                          fontSize: 13,
                          color: kind === 'RECEIPT' ? '#059669' : '#DC2626',
                          display: 'block',
                          marginTop: 2,
                        }}
                        className="tabular-numbers"
                      >
                        {formatRupee(amount)}
                      </strong>
                    </div>

                    <div style={{ background: '#FFF', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
                      <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', display: 'block' }}>
                        Closing Balance
                      </span>
                      <strong style={{ fontSize: 13, color: '#2B2B2B', display: 'block', marginTop: 2 }} className="tabular-numbers">
                        {ledgerImpact.afterLabel}
                      </strong>
                    </div>
                  </div>

                  {/* Overpayment / Advance warning banner (Req 36) */}
                  {kind === 'PAYMENT' && ledgerImpact.isOverpayment && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: '#FFFBEB',
                        border: '1px solid #FCD34D',
                        borderRadius: 6,
                        color: '#92400E',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span>⚠️</span>
                      <div>
                        <strong>Advance Payment Alert:</strong> Voucher amount ({formatRupee(amount)}) exceeds current
                        payable ({formatRupee(ledgerImpact.balanceBefore)}) by{' '}
                        <strong>{formatRupee(ledgerImpact.overpaymentAmount)}</strong>. Party ledger will reflect an advance / debit balance.
                      </div>
                    </div>
                  )}
                </div>

                {/* Form Grid */}
                <div className="form-grid">
                  <div className="form-group full-width">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Party *</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {kind === 'RECEIPT' ? (
                          <button
                            type="button"
                            onClick={() => setQuickAddType('CUSTOMER')}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--gold-primary)',
                              fontSize: 11,
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                          >
                            + Quick Add Customer (Alt+C)
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setQuickAddType('SUPPLIER')}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--gold-primary)',
                                fontSize: 11,
                                cursor: 'pointer',
                                fontWeight: 600,
                              }}
                            >
                              + Supplier (Alt+S)
                            </button>
                            <span style={{ color: '#D1D5DB' }}>|</span>
                            <button
                              type="button"
                              onClick={() => setQuickAddType('KARIGAR')}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--gold-primary)',
                                fontSize: 11,
                                cursor: 'pointer',
                                fontWeight: 600,
                              }}
                            >
                              + Karigar (Alt+K)
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <select
                      className="form-select"
                      value={partyId}
                      onChange={(e) => setPartyId(e.target.value)}
                      required
                    >
                      {filteredParties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Voucher Amount (₹) *</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input tabular-numbers"
                      value={amount || ''}
                      onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Payment Mode *</label>
                    <select
                      className="form-select"
                      value={mode}
                      onChange={(e) => setMode(e.target.value as any)}
                    >
                      <option value="BANK">Bank Transfer / UPI / Cheque</option>
                      <option value="CASH">Cash in Hand</option>
                    </select>
                  </div>

                  {mode === 'BANK' && (
                    <div className="form-group">
                      <label>Bank Account *</label>
                      <select
                        className="form-select"
                        value={bankAccountId}
                        onChange={(e) => setBankAccountId(e.target.value)}
                        required
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Reference No. / UTR / Cheque</label>
                    <input
                      className="form-input"
                      placeholder="e.g. UTR92837482, CHQ-10492"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                    />
                  </div>

                  <div className="form-group full-width">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>Notes / Narration</label>
                      <span style={{ fontSize: 11, color: '#7A7268' }}>{notes.length}/500</span>
                    </div>
                    <input
                      className="form-input"
                      placeholder="Optional notes or remarks"
                      maxLength={500}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* Bill Allocation Table for Receipts / Payments */}
                {((kind === 'RECEIPT' && openSales.length > 0) ||
                  (kind === 'PAYMENT' && openPurchases.length > 0)) && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B', margin: 0 }}>
                        Allocate Voucher Across Unpaid Invoices
                      </label>
                      <span style={{ fontSize: 11, color: allocationValidation.isValid ? '#059669' : '#DC2626' }}>
                        Allocated: {formatRupee(allocationValidation.totalAllocated)} / {formatRupee(amount)}
                      </span>
                    </div>

                    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#FAF6F2', borderBottom: '1px solid var(--line)' }}>
                          <tr>
                            <th style={{ padding: '8px 10px', textAlign: 'left', width: 40 }}>Settle</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Bill #</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Due Date</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Outstanding</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', width: 120 }}>Allocated (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kind === 'RECEIPT'
                            ? openSales.map((bill) => {
                                const out = Number(bill.outstanding_amount ?? bill.total_amount);
                                const isAlloc = !!allocations[bill.id];
                                return (
                                  <tr key={bill.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                      <input
                                        type="checkbox"
                                        checked={isAlloc}
                                        onChange={() => handleToggleBill(bill.id, out)}
                                      />
                                    </td>
                                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>#{bill.bill_no}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#7A7268' }}>
                                      {bill.due_date ? formatDate(bill.due_date) : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-numbers">
                                      {formatRupee(out)}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      {isAlloc ? (
                                        <input
                                          type="number"
                                          min="0"
                                          max={out}
                                          className="form-input tabular-numbers"
                                          style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', width: 100 }}
                                          value={allocations[bill.id] ?? ''}
                                          onChange={(e) =>
                                            handleAllocationAmountChange(
                                              bill.id,
                                              parseFloat(e.target.value) || 0,
                                              out,
                                            )
                                          }
                                        />
                                      ) : (
                                        <span style={{ color: '#9CA3AF' }}>—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            : openPurchases.map((bill) => {
                                const out = Number(bill.outstanding_amount ?? bill.total_amount);
                                const isAlloc = !!allocations[bill.id];
                                return (
                                  <tr key={bill.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                      <input
                                        type="checkbox"
                                        checked={isAlloc}
                                        onChange={() => handleToggleBill(bill.id, out)}
                                      />
                                    </td>
                                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>#{bill.bill_no}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#7A7268' }}>
                                      {bill.due_date ? formatDate(bill.due_date) : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-numbers">
                                      {formatRupee(out)}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      {isAlloc ? (
                                        <input
                                          type="number"
                                          min="0"
                                          max={out}
                                          className="form-input tabular-numbers"
                                          style={{ padding: '3px 6px', fontSize: 12, textAlign: 'right', width: 100 }}
                                          value={allocations[bill.id] ?? ''}
                                          onChange={(e) =>
                                            handleAllocationAmountChange(
                                              bill.id,
                                              parseFloat(e.target.value) || 0,
                                              out,
                                            )
                                          }
                                        />
                                      ) : (
                                        <span style={{ color: '#9CA3AF' }}>—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 11,
                    color: '#7A7268',
                  }}
                >
                  <span>Timestamp is database-owned. Zero float calculations.</span>
                  <span>Shortcut: <strong>Ctrl+S / Cmd+S</strong> or <strong>Ctrl+Enter</strong></span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                  style={{ background: kind === 'RECEIPT' ? '#059669' : '#DC2626' }}
                >
                  {loading ? 'Processing...' : `Save ${kind === 'RECEIPT' ? 'Receipt' : 'Payment'} (Ctrl+S)`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Quick Add Party Dialog */}
      {quickAddType && (
        <QuickAddPartyDialog
          isOpen={true}
          initialType={quickAddType}
          onClose={() => setQuickAddType(null)}
          onPartyCreated={(newParty: Party) => {
            setPartyId(newParty.id);
            setQuickAddType(null);
            onVoucherCreated();
          }}
        />
      )}
    </>
  );
}
