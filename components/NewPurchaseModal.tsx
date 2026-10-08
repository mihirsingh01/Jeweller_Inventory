'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { Party, Item, GridLineItem, Purchase } from '@/lib/api/types';
import { createPurchase, getParty } from '@/lib/api/services';
import { formatRupee, formatDate } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { ItemEntryGrid } from './ItemEntryGrid';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';
import { calculateBillTotals, BillTotals } from '@/lib/calculations/bill-totals';

interface NewPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  items: Item[];
  onPurchaseCreated: () => void;
}

export function NewPurchaseModal({ isOpen, onClose, parties, items, onPurchaseCreated }: NewPurchaseModalProps) {
  // Party selection (defaulting to suppliers)
  const initialSupplier = parties.find((p) => p.type === 'SUPPLIER' || p.type === 'BOTH') || parties[0];
  const [partyId, setPartyId] = useState(initialSupplier?.id || '');
  const [supplierBalance, setSupplierBalance] = useState<number>(0);

  // Form fields
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [narration, setNarration] = useState(''); // Req 25: Narration text field (~500 chars)

  // Item Grid State
  const [validLines, setValidLines] = useState<GridLineItem[]>([]);
  const [gridSubtotal, setGridSubtotal] = useState<number>(0);

  // Charges & Discounts (Req 22, 15)
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(3.0);
  const [transportCharges, setTransportCharges] = useState<number>(0);
  const [packagingCharges, setPackagingCharges] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(0);

  // Payment Reminder (Req 24)
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDate, setReminderDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [reminderAmount, setReminderAmount] = useState<number | ''>('');
  const [reminderNotes, setReminderNotes] = useState('');

  // Quick add supplier dialog & Alt+S shortcut (Req 20)
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useAltKeyShortcut({
    code: 'KeyS',
    onTrigger: () => setShowQuickAdd(true),
    enabled: isOpen,
    isDialogOpen: showQuickAdd,
  });

  // Success state
  const [successPurchase, setSuccessPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch live ledger balance when supplier changes (Req 23)
  useEffect(() => {
    if (!partyId) return;
    const currentParty = parties.find((p) => p.id === partyId);
    if (currentParty) {
      setSupplierBalance(Number(currentParty.current_balance ?? currentParty.opening_balance ?? 0));
    }

    getParty(partyId)
      .then((p) => {
        if (p && p.current_balance !== undefined) {
          setSupplierBalance(Number(p.current_balance));
        }
      })
      .catch(() => {});
  }, [partyId, parties]);

  // Compute bill totals using integer arithmetic
  const billTotals: BillTotals = useMemo(() => {
    return calculateBillTotals({
      subtotal: gridSubtotal,
      discountType,
      discountValue,
      gstRate,
      transportCharges,
      packagingCharges,
      otherCharges,
    });
  }, [gridSubtotal, discountType, discountValue, gstRate, transportCharges, packagingCharges, otherCharges]);

  // In ledger convention: current_balance = opening + (debit - credit)
  // For suppliers, negative balance means Accounts Payable (Cr).
  // This purchase adds credit (+grandTotal), making the balance more negative (increasing payable).
  const closingSupplierBalance = supplierBalance - billTotals.grandTotal;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (!partyId) {
      alert('Please select a supplier party.');
      return;
    }

    if (validLines.length === 0) {
      alert('Please add at least one valid item line with quantity and rate.');
      return;
    }

    if (reminderEnabled) {
      if (!reminderDate) {
        alert('Please specify a reminder date.');
        return;
      }
      const today = new Date().toISOString().split('T')[0];
      if (reminderDate < today) {
        alert('Reminder date cannot be in the past.');
        return;
      }
    }

    setLoading(true);
    try {
      const purchase = await createPurchase({
        party_id: partyId,
        due_date: dueDate || undefined,
        notes: notes || undefined,
        narration: narration || undefined,
        idempotency_key: idempotencyKey,
        subtotal: billTotals.subtotal,
        discount_type: billTotals.discountType,
        discount_value: billTotals.discountValue,
        discount_amount: billTotals.discountAmount,
        taxable_amount: billTotals.taxableAmount,
        gst_rate: billTotals.gstRate,
        gst_amount: billTotals.gstAmount,
        transport_charges: billTotals.transportCharges,
        packaging_charges: billTotals.packagingCharges,
        other_charges: billTotals.otherCharges,
        round_off: billTotals.roundOff,
        total_amount: billTotals.grandTotal,
        reminder: reminderEnabled
          ? {
              enabled: true,
              reminder_date: reminderDate,
              amount: typeof reminderAmount === 'number' && reminderAmount > 0 ? reminderAmount : billTotals.grandTotal,
              notes: reminderNotes || `Purchase payment reminder for ${parties.find((p) => p.id === partyId)?.name || 'Supplier'}`,
            }
          : undefined,
        lines: validLines.map((l) => ({
          item_id: l.item_id,
          unit: l.unit,
          pieces: l.pieces || 0,
          weight_kg: l.weight_kg || 0,
          rate: l.rate,
          amount: l.amount,
        })),
      });

      setSuccessPurchase(purchase);
      onPurchaseCreated();
    } catch (err: any) {
      alert(err.message || 'Error recording purchase bill');
    } finally {
      setLoading(false);
    }
  };

  const { idempotencyKey } = useSaveShortcut({
    onSave: handleSubmit,
    isSaving: loading,
    enabled: isOpen && !showQuickAdd && !successPurchase,
  });

  useBackspaceNavigationGuard({
    isDirty: validLines.length > 0 || notes.length > 0 || narration.length > 0,
    isDialogOpen: isOpen,
    onBack: onClose,
  });

  if (!isOpen) return null;

  // Filter parties to suppliers or both
  const supplierParties = parties.filter((p) => p.type === 'SUPPLIER' || p.type === 'BOTH');
  const selectedSupplier = parties.find((p) => p.id === partyId);

  // Helper for displaying supplier balance
  const formatBalanceDisplay = (val: number) => {
    if (val < 0) {
      return { amount: formatRupee(Math.abs(val)), status: 'Payable (Cr)', color: '#DC2626' };
    } else if (val > 0) {
      return { amount: formatRupee(val), status: 'Advance (Dr)', color: '#2563EB' };
    } else {
      return { amount: '₹0.00', status: 'Settled', color: '#16A34A' };
    }
  };

  const prevDisplay = formatBalanceDisplay(supplierBalance);
  const closingDisplay = formatBalanceDisplay(closingSupplierBalance);

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 860, maxHeight: '92vh', overflowY: 'auto' }}>
        {successPurchase ? (
          /* Success Screen */
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <h3 style={{ fontSize: 22, color: '#2B2B2B', margin: '0 0 6px' }}>Purchase Bill Recorded Successfully!</h3>
            <p style={{ color: '#7A7268', margin: '0 0 20px', fontSize: 13 }}>
              Bill <strong>#{successPurchase.bill_no}</strong> for <strong>{selectedSupplier?.name}</strong> has been saved.
            </p>

            {/* Historical Ledger Impact */}
            <div style={{ background: '#FAF6F2', borderRadius: 8, padding: 16, margin: '0 auto 20px', maxWidth: 600, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7A7268', textTransform: 'uppercase', marginBottom: 12 }}>
                Supplier Ledger Impact (Payable / Cr)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, color: '#7A7268', marginBottom: 2 }}>Previous Balance</div>
                  <strong className="tabular-numbers" style={{ fontSize: 14 }}>
                    {formatRupee(Math.abs(successPurchase.balance_before ?? supplierBalance))}
                  </strong>
                  <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>Cr (Payable)</div>
                </div>
                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, color: '#7A7268', marginBottom: 2 }}>This Purchase</div>
                  <strong className="tabular-numbers" style={{ fontSize: 14, color: '#B8893B' }}>
                    +{formatRupee(successPurchase.total_amount)}
                  </strong>
                  <div style={{ fontSize: 10, color: '#7A7268', marginTop: 2 }}>Credit Stock Inward</div>
                </div>
                <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, color: '#7A7268', marginBottom: 2 }}>Closing Balance</div>
                  <strong className="tabular-numbers" style={{ fontSize: 14, color: '#DC2626' }}>
                    {formatRupee(Math.abs(successPurchase.balance_after ?? closingSupplierBalance))}
                  </strong>
                  <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>Cr (Payable)</div>
                </div>
              </div>
            </div>

            {/* Bill Summary Breakdown */}
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 14, margin: '0 auto 24px', maxWidth: 600, textAlign: 'left', fontSize: 13, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#64748B' }}>Subtotal:</span>
                <span className="tabular-numbers"><strong>{formatRupee(successPurchase.subtotal || successPurchase.total_amount)}</strong></span>
              </div>
              {!!successPurchase.discount_amount && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#16A34A' }}>
                  <span>Discount ({successPurchase.discount_type === 'PERCENT' ? `${successPurchase.discount_value}%` : '₹'}):</span>
                  <span className="tabular-numbers">-{formatRupee(successPurchase.discount_amount)}</span>
                </div>
              )}
              {!!successPurchase.gst_amount && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: '#64748B' }}>GST ({successPurchase.gst_rate}%):</span>
                  <span className="tabular-numbers">+{formatRupee(successPurchase.gst_amount)}</span>
                </div>
              )}
              {(!!successPurchase.transport_charges || !!successPurchase.packaging_charges || !!successPurchase.other_charges) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: '#64748B' }}>Other Charges:</span>
                  <span className="tabular-numbers">
                    +{formatRupee((successPurchase.transport_charges || 0) + (successPurchase.packaging_charges || 0) + (successPurchase.other_charges || 0))}
                  </span>
                </div>
              )}
              {!!successPurchase.round_off && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ color: '#64748B' }}>Round Off:</span>
                  <span className="tabular-numbers">{successPurchase.round_off > 0 ? `+${formatRupee(successPurchase.round_off)}` : formatRupee(successPurchase.round_off)}</span>
                </div>
              )}
              <div style={{ borderTop: '1px dashed #CBD5E1', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, color: '#B8893B' }}>
                <span>Grand Total:</span>
                <span className="tabular-numbers">{formatRupee(successPurchase.total_amount)}</span>
              </div>
              {successPurchase.narration && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #E2E8F0', fontSize: 12, color: '#475569' }}>
                  <strong>Narration:</strong> {successPurchase.narration}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSuccessPurchase(null);
                  setValidLines([]);
                  setNotes('');
                  setNarration('');
                }}
              >
                ＋ Record Another Purchase
              </button>
              <button type="button" className="primary-button" style={{ background: '#B8893B' }} onClick={onClose}>
                Done & Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>↙</span>
                <div>
                  <h3 style={{ margin: 0 }}>Record New Purchase Bill</h3>
                  <span style={{ fontSize: 12, color: '#7A7268' }}>Supplier Purchase Inward &bull; Stock &amp; Accounts Payable</span>
                </div>
              </div>
              <button type="button" className="close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="modal-body">
              {/* Supplier Header with Quick-Add (Alt+S) */}
              <div className="form-grid">
                <div className="form-group full-width">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Supplier Party
                      <span style={{ fontSize: 11, background: '#FAF6EF', color: '#B8893B', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                        Alt+S
                      </span>
                    </label>
                    <button type="button" className="text-button" onClick={() => setShowQuickAdd(true)}>
                      ＋ Quick Add Supplier [Alt+S]
                    </button>
                  </div>
                  <select
                    className="form-select"
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    required
                  >
                    {supplierParties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.address ? `— ${p.address}` : ''} ({p.type})
                      </option>
                    ))}
                    {supplierParties.length === 0 && (
                      <option value="">No suppliers found. Use Alt+S to add one.</option>
                    )}
                  </select>

                  <QuickAddPartyDialog
                    isOpen={showQuickAdd}
                    onClose={() => setShowQuickAdd(false)}
                    type="SUPPLIER"
                    onSuccess={(newParty) => {
                      parties.push(newParty);
                      setPartyId(newParty.id);
                      setSupplierBalance(Number(newParty.opening_balance || 0));
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Supplier Invoice / Ref #</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. INV-9042"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Live Supplier Balance Display (Req 23) */}
              {selectedSupplier && (
                <div style={{ background: '#FAF6F2', borderRadius: 8, padding: 12, marginTop: 10, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7A7268', textTransform: 'uppercase', marginBottom: 6 }}>
                    Live Supplier Balance (Accounts Payable)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                    <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 10, color: '#7A7268' }}>Previous Balance</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: prevDisplay.color }} className="tabular-numbers">
                        {prevDisplay.amount}
                      </div>
                      <div style={{ fontSize: 9, color: '#7A7268' }}>{prevDisplay.status}</div>
                    </div>
                    <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 10, color: '#7A7268' }}>This Purchase</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#B8893B' }} className="tabular-numbers">
                        +{formatRupee(billTotals.grandTotal)}
                      </div>
                      <div style={{ fontSize: 9, color: '#7A7268' }}>Stock Inward</div>
                    </div>
                    <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 10, color: '#7A7268' }}>Closing Balance</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: closingDisplay.color }} className="tabular-numbers">
                        {closingDisplay.amount}
                      </div>
                      <div style={{ fontSize: 9, color: '#7A7268' }}>{closingDisplay.status}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Fast-Entry Line Items Grid (Req 21) */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B' }}>
                    Purchased Items (Type code/name &bull; Enter/Tab to advance &bull; Ctrl+Del to delete)
                  </label>
                  <span style={{ fontSize: 11, color: '#7A7268' }}>
                    {validLines.length} item{validLines.length === 1 ? '' : 's'} &bull; Subtotal: <strong>{formatRupee(gridSubtotal)}</strong>
                  </span>
                </div>
                <ItemEntryGrid
                  items={items}
                  onChange={(lines, subtotal) => {
                    setValidLines(lines);
                    setGridSubtotal(subtotal);
                  }}
                  disabled={loading}
                />
              </div>

              {/* Charges & Discounts Breakdown Section (Req 22) */}
              <div style={{ marginTop: 14, background: '#F8FAFC', borderRadius: 8, padding: 14, border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>
                  Charges, Taxes &amp; Discounts
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                  {/* Discount */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label style={{ fontSize: 11, color: '#64748B' }}>Discount</label>
                      <button
                        type="button"
                        style={{ fontSize: 10, background: '#E2E8F0', border: 'none', borderRadius: 3, padding: '1px 5px', cursor: 'pointer' }}
                        onClick={() => setDiscountType(discountType === 'PERCENT' ? 'FIXED' : 'PERCENT')}
                      >
                        {discountType === 'PERCENT' ? '% Percent' : '₹ Amount'}
                      </button>
                    </div>
                    <input
                      type="number"
                      step={discountType === 'PERCENT' ? '0.1' : '1'}
                      min="0"
                      className="form-input"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                      placeholder={discountType === 'PERCENT' ? 'e.g. 5%' : 'e.g. 500'}
                      value={discountValue || ''}
                      onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                    {billTotals.discountAmount > 0 && (
                      <span style={{ fontSize: 10, color: '#16A34A', display: 'block', marginTop: 2 }}>
                        -{formatRupee(billTotals.discountAmount)}
                      </span>
                    )}
                  </div>

                  {/* GST */}
                  <div>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 4 }}>GST Rate</label>
                    <select
                      className="form-select"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                      value={gstRate}
                      onChange={(e) => setGstRate(parseFloat(e.target.value))}
                    >
                      <option value="0">0% (Nil)</option>
                      <option value="1.5">1.5% (Precious Stones)</option>
                      <option value="3">3.0% (Gold/Silver Standard)</option>
                      <option value="5">5.0%</option>
                      <option value="12">12.0%</option>
                      <option value="18">18.0%</option>
                    </select>
                    {billTotals.gstAmount > 0 && (
                      <span style={{ fontSize: 10, color: '#475569', display: 'block', marginTop: 2 }}>
                        +{formatRupee(billTotals.gstAmount)}
                      </span>
                    )}
                  </div>

                  {/* Transport */}
                  <div>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 4 }}>Transport (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                      placeholder="0.00"
                      value={transportCharges || ''}
                      onChange={(e) => setTransportCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>

                  {/* Packaging */}
                  <div>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 4 }}>Packaging (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                      placeholder="0.00"
                      value={packagingCharges || ''}
                      onChange={(e) => setPackagingCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>

                  {/* Other */}
                  <div>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 4 }}>Other Charges (₹)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      style={{ fontSize: 12, padding: '6px 8px' }}
                      placeholder="0.00"
                      value={otherCharges || ''}
                      onChange={(e) => setOtherCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                </div>
              </div>

              {/* Narration Textarea (Req 25: ~500 chars) */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#2B2B2B' }}>
                    Purchase Narration
                  </label>
                  <span style={{ fontSize: 10, color: narration.length > 480 ? '#DC2626' : '#7A7268' }}>
                    {narration.length} / 500 characters
                  </span>
                </div>
                <textarea
                  className="form-input"
                  rows={2}
                  maxLength={500}
                  placeholder="Official bill narration, supplier reference details, purity certificates, etc..."
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  style={{ resize: 'vertical', fontSize: 12 }}
                />
              </div>

              {/* Payment Reminder Expandable Section (Req 24) */}
              <div style={{ marginTop: 12, border: '1px solid #FED7AA', background: '#FFFBEB', borderRadius: 8, padding: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => {
                      setReminderEnabled(e.target.checked);
                      if (e.target.checked && !reminderAmount) {
                        setReminderAmount(billTotals.grandTotal);
                      }
                    }}
                  />
                  <strong style={{ fontSize: 12, color: '#92400E' }}>
                    🔔 Set Payment Reminder for this Purchase Bill
                  </strong>
                </label>

                {reminderEnabled && (
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, paddingTop: 8, borderTop: '1px dashed #FDE68A' }}>
                    <div>
                      <label style={{ fontSize: 10, color: '#92400E', display: 'block', marginBottom: 2 }}>Reminder Date</label>
                      <input
                        type="date"
                        className="form-input"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                        value={reminderDate}
                        onChange={(e) => setReminderDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: '#92400E', display: 'block', marginBottom: 2 }}>Reminder Amount (₹)</label>
                      <input
                        type="number"
                        className="form-input"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                        value={reminderAmount === '' ? billTotals.grandTotal : reminderAmount}
                        onChange={(e) => setReminderAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: '#92400E', display: 'block', marginBottom: 2 }}>Reminder Note</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                        placeholder="Supplier RTGS payment due"
                        value={reminderNotes}
                        onChange={(e) => setReminderNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Total & Summary Bar */}
              <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 14, marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 11, color: '#B8893B', textTransform: 'uppercase', fontWeight: 700 }}>
                    Grand Total Purchase Value
                  </span>
                  <div style={{ fontSize: 12, color: '#7A7268', marginTop: 2 }}>
                    Taxable: {formatRupee(billTotals.taxableAmount)} &bull; GST ({billTotals.gstRate}%): {formatRupee(billTotals.gstAmount)}
                    {billTotals.roundOff !== 0 && ` • Round Off: ${billTotals.roundOff > 0 ? '+' : ''}${formatRupee(billTotals.roundOff)}`}
                  </div>
                </div>
                <strong style={{ font: '26px Georgia', color: '#B8893B' }} className="tabular-numbers">
                  {formatRupee(billTotals.grandTotal)}
                </strong>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, color: '#7A7268' }}>
                Keyboard: <strong>Ctrl+S</strong> to save &bull; <strong>Alt+S</strong> new supplier
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                  style={{ background: '#B8893B' }}
                >
                  {loading ? 'Recording Purchase...' : 'Save Purchase [Ctrl+S] ↙'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
