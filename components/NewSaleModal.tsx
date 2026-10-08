'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { Party, Item, GridLineItem, Sale } from '@/lib/api/types';
import { createSale, sendBillOnWhatsApp, getParty } from '@/lib/api/services';
import { formatRupee } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { ItemEntryGrid } from './ItemEntryGrid';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';
import { calculateBillTotals } from '@/lib/calculations/bill-totals';

interface NewSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  items: Item[];
  onSaleCreated: () => void;
}

export function NewSaleModal({ isOpen, onClose, parties, items, onSaleCreated }: NewSaleModalProps) {
  const [partyId, setPartyId] = useState(parties[0]?.id || '');
  const [customerBalance, setCustomerBalance] = useState<number>(0);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');

  // Grid lines and subtotal
  const [validLines, setValidLines] = useState<GridLineItem[]>([]);
  const [gridSubtotal, setGridSubtotal] = useState<number>(0);

  // Extra charges state
  const [discountType, setDiscountType] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(3.0);
  const [transportCharges, setTransportCharges] = useState<number>(0);
  const [packagingCharges, setPackagingCharges] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(0);

  // Optional payment reminder state
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDate, setReminderDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [reminderAmount, setReminderAmount] = useState<number | ''>('');
  const [reminderNotes, setReminderNotes] = useState('');

  // Quick add customer dialog state & Alt+C shortcut
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useAltKeyShortcut({
    code: 'KeyC',
    onTrigger: () => setShowQuickAdd(true),
    enabled: isOpen,
    isDialogOpen: showQuickAdd,
  });

  // Success state
  const [successSale, setSuccessSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waSent, setWaSent] = useState(false);

  // Fetch live ledger balance when customer changes (Requirement 2)
  useEffect(() => {
    if (!partyId) return;
    const currentParty = parties.find((p) => p.id === partyId);
    if (currentParty) {
      setCustomerBalance(Number(currentParty.current_balance ?? currentParty.opening_balance ?? 0));
    }

    // Try fetching fresh balance from server
    getParty(partyId)
      .then((p) => {
        if (p && p.current_balance !== undefined) {
          setCustomerBalance(Number(p.current_balance));
        }
      })
      .catch(() => {});
  }, [partyId, parties]);

  // Pure mathematical calculation for bill totals and charges
  const billTotals = useMemo(() => {
    return calculateBillTotals({
      subtotal: gridSubtotal,
      discountType,
      discountValue,
      gstRate,
      transportCharges,
      packagingCharges,
      otherCharges,
      applyRoundOff: true,
    });
  }, [gridSubtotal, discountType, discountValue, gstRate, transportCharges, packagingCharges, otherCharges]);

  // Live closing balance calculation
  const closingBalance = customerBalance + billTotals.grandTotal;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (!partyId) {
      alert('Please select a customer party.');
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
      const sale = await createSale({
        party_id: partyId,
        due_date: dueDate,
        notes,
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
              notes: reminderNotes,
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

      setSuccessSale(sale);
      onSaleCreated();
    } catch (err: any) {
      alert(err.message || 'Error saving sale entry');
    } finally {
      setLoading(false);
    }
  };

  const { idempotencyKey, resetIdempotencyKey } = useSaveShortcut({
    onSave: handleSubmit,
    isSaving: loading,
    enabled: isOpen && !showQuickAdd && !successSale,
  });

  useBackspaceNavigationGuard({
    isDirty: validLines.length > 0 || notes.length > 0,
    isDialogOpen: isOpen,
    onBack: onClose,
  });

  if (!isOpen) return null;

  const handleSendWhatsApp = async () => {
    if (!successSale) return;
    setWaSending(true);
    try {
      await sendBillOnWhatsApp(successSale.id);
      setWaSent(true);
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch bill on WhatsApp');
    } finally {
      setWaSending(false);
    }
  };

  const handleAddAnother = () => {
    setSuccessSale(null);
    setWaSent(false);
    resetIdempotencyKey();
    setValidLines([]);
    setGridSubtotal(0);
    setDiscountValue(0);
    setTransportCharges(0);
    setPackagingCharges(0);
    setOtherCharges(0);
    setReminderEnabled(false);
    setNotes('');
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 840 }}>
        {successSale ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DEF7EC', color: '#03543F', display: 'grid', placeItems: 'center', margin: '0 auto 16px', fontSize: 28 }}>
              ✓
            </div>
            <h3 style={{ font: '26px Georgia', margin: '0 0 6px', color: '#9B1C31' }}>Sale Saved Successfully!</h3>
            <p style={{ color: '#7A7268', fontSize: 13, marginBottom: 20 }}>
              Invoice <strong>#{successSale.bill_no}</strong> for <strong>{formatRupee(successSale.total_amount)}</strong> has been recorded in the ledger and inventory.
            </p>

            {/* Requirement 8: Balance Before | This Bill | Closing Balance from Ledger */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                background: '#FAF6F2',
                border: '1px solid #E9E0D7',
                borderRadius: 10,
                padding: 16,
                maxWidth: 620,
                margin: '0 auto 20px',
                textAlign: 'left',
              }}
            >
              <div>
                <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', fontWeight: 700 }}>
                  Balance Before
                </span>
                <div style={{ font: '18px Georgia', marginTop: 4, color: (successSale.balance_before ?? 0) >= 0 ? '#9B1C31' : '#059669' }}>
                  {formatRupee(Math.abs(successSale.balance_before ?? 0))} {(successSale.balance_before ?? 0) >= 0 ? 'Dr (Receivable)' : 'Cr (Advance)'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', fontWeight: 700 }}>
                  This Invoice
                </span>
                <div style={{ font: '18px Georgia', marginTop: 4, color: '#9B1C31' }}>
                  {formatRupee(successSale.this_bill ?? successSale.total_amount)} Dr
                </div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', fontWeight: 700 }}>
                  Closing Balance
                </span>
                <div style={{ font: '18px Georgia', marginTop: 4, color: (successSale.balance_after ?? 0) >= 0 ? '#9B1C31' : '#059669' }}>
                  {formatRupee(Math.abs(successSale.balance_after ?? (customerBalance + successSale.total_amount)))} {(successSale.balance_after ?? 0) >= 0 ? 'Dr (Receivable)' : 'Cr (Advance)'}
                </div>
              </div>
            </div>

            {/* Breakdown summary */}
            <div style={{ maxWidth: 620, margin: '0 auto 24px', background: '#FFF', border: '1px solid #E9E0D7', borderRadius: 8, padding: 14, fontSize: 12, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#7A7268' }}>Subtotal:</span>
                <strong>{formatRupee(successSale.subtotal ?? successSale.total_amount)}</strong>
              </div>
              {Number(successSale.discount_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#059669' }}>
                  <span>Discount:</span>
                  <span>- {formatRupee(successSale.discount_amount)}</span>
                </div>
              )}
              {Number(successSale.gst_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#7A7268' }}>GST ({successSale.gst_rate}%):</span>
                  <span>+ {formatRupee(successSale.gst_amount)}</span>
                </div>
              )}
              {Number(successSale.transport_charges) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#7A7268' }}>Transport Charges:</span>
                  <span>+ {formatRupee(successSale.transport_charges)}</span>
                </div>
              )}
              {Number(successSale.round_off) !== 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#7A7268' }}>Round Off:</span>
                  <span>{successSale.round_off > 0 ? `+ ${formatRupee(successSale.round_off)}` : `- ${formatRupee(Math.abs(successSale.round_off))}`}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E9E0D7', paddingTop: 6, fontSize: 14, fontWeight: 700, color: '#9B1C31' }}>
                <span>Grand Total:</span>
                <span>{formatRupee(successSale.total_amount)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, margin: '0 auto' }}>
              <button
                className="primary-button"
                onClick={handleSendWhatsApp}
                disabled={waSending || waSent}
                style={{ background: waSent ? '#059669' : '#25D366', color: '#FFF' }}
              >
                {waSent ? '✓ Bill Sent on WhatsApp' : waSending ? 'Sending Bill...' : '📱 Send Bill on WhatsApp'}
              </button>
              <button className="btn-secondary" onClick={handleAddAnother}>
                ＋ Add Another Entry
              </button>
              <button className="text-button" onClick={onClose} style={{ marginTop: 8 }}>
                Done / Close
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#7A7268', marginTop: 24 }}>Date and time were recorded automatically by the server.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h3>Record New Sale Bill</h3>
              <button type="button" className="close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full-width">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      Customer Party
                      <span style={{ fontSize: 11, background: '#FAF6EF', color: '#B8893B', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                        Alt+C
                      </span>
                    </label>
                    <button type="button" className="text-button" onClick={() => setShowQuickAdd(true)}>
                      ＋ Quick Add Customer [Alt+C]
                    </button>
                  </div>
                  <select className="form-select" value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} {p.whatsapp_number ? `(${p.whatsapp_number})` : ''}</option>
                    ))}
                  </select>

                  <QuickAddPartyDialog
                    isOpen={showQuickAdd}
                    onClose={() => setShowQuickAdd(false)}
                    type="CUSTOMER"
                    onSuccess={(newParty) => {
                      parties.push(newParty);
                      setPartyId(newParty.id);
                    }}
                  />
                </div>

                {/* Requirement 2: Customer Live Ledger Balance Display */}
                <div className="form-group full-width">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 10,
                      background: '#FAF6F2',
                      border: '1px solid #E9E0D7',
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', fontWeight: 600 }}>
                        Previous Balance
                      </span>
                      <div style={{ font: '15px Georgia', color: customerBalance >= 0 ? '#9B1C31' : '#059669', marginTop: 2 }}>
                        {formatRupee(Math.abs(customerBalance))} {customerBalance >= 0 ? 'Dr (Receivable)' : 'Cr (Advance)'}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', fontWeight: 600 }}>
                        This Bill
                      </span>
                      <div style={{ font: '15px Georgia', color: '#9B1C31', marginTop: 2 }}>
                        {formatRupee(billTotals.grandTotal)} Dr
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: '#7A7268', textTransform: 'uppercase', fontWeight: 600 }}>
                        Closing Balance
                      </span>
                      <div style={{ font: '15px Georgia', color: closingBalance >= 0 ? '#9B1C31' : '#059669', marginTop: 2 }}>
                        {formatRupee(Math.abs(closingBalance))} {closingBalance >= 0 ? 'Dr (Receivable)' : 'Cr (Advance)'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Due Date (Required)</label>
                  <input type="date" className="form-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                </div>

                <div className="form-group">
                  <label>Server Clock</label>
                  <input className="form-input" value="Recorded automatically by server" disabled style={{ background: '#F5EFEB', color: '#7A7268' }} />
                </div>
              </div>

              {/* Fast-Entry Line Items Grid */}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B', display: 'block', marginBottom: 8 }}>
                  Line Items (Auto-Add Rows & Fast Keyboard Grid)
                </label>
                <ItemEntryGrid
                  items={items}
                  onChange={(lines, subtotal) => {
                    setValidLines(lines);
                    setGridSubtotal(subtotal);
                  }}
                  disabled={loading}
                />
              </div>

              {/* Requirement 3: Charges Below the Grid (GST, Discount, Transport, Packaging, Other) */}
              <div
                style={{
                  background: '#FCFAF7',
                  border: '1px solid #E9E0D7',
                  borderRadius: 8,
                  padding: 14,
                  marginTop: 6,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7A7268', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Bill Charges & Taxes
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 10 }}>
                  {/* Discount */}
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: 10 }}>Discount</label>
                      <button
                        type="button"
                        onClick={() => setDiscountType(discountType === 'AMOUNT' ? 'PERCENT' : 'AMOUNT')}
                        style={{ border: 0, background: '#F0E8DE', color: '#9B1C31', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}
                      >
                        {discountType === 'AMOUNT' ? 'Switch to %' : 'Switch to ₹'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        step={discountType === 'PERCENT' ? '0.1' : '1'}
                        className="form-input tabular-numbers"
                        placeholder={discountType === 'PERCENT' ? '10%' : '₹ 0.00'}
                        value={discountValue || ''}
                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                        style={{ flex: 1 }}
                      />
                      {billTotals.discountAmount > 0 && (
                        <span style={{ fontSize: 11, color: '#059669', whiteSpace: 'nowrap' }}>
                          - {formatRupee(billTotals.discountAmount)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* GST Rate (Configurable setting + override) */}
                  <div className="form-group">
                    <label style={{ fontSize: 10 }}>GST Rate (%)</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className="form-input tabular-numbers"
                        value={gstRate}
                        onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, color: '#2B2B2B', whiteSpace: 'nowrap' }}>
                        + {formatRupee(billTotals.gstAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Transport */}
                  <div className="form-group">
                    <label style={{ fontSize: 10 }}>Transport (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="form-input tabular-numbers"
                      placeholder="₹ 0.00"
                      value={transportCharges || ''}
                      onChange={(e) => setTransportCharges(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* Packaging */}
                  <div className="form-group">
                    <label style={{ fontSize: 10 }}>Packaging (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="form-input tabular-numbers"
                      placeholder="₹ 0.00"
                      value={packagingCharges || ''}
                      onChange={(e) => setPackagingCharges(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* Other Charges */}
                  <div className="form-group">
                    <label style={{ fontSize: 10 }}>Other Charges (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="form-input tabular-numbers"
                      placeholder="₹ 0.00"
                      value={otherCharges || ''}
                      onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* Round Off */}
                  <div className="form-group">
                    <label style={{ fontSize: 10 }}>Round Off</label>
                    <input
                      className="form-input tabular-numbers"
                      disabled
                      value={billTotals.roundOff !== 0 ? (billTotals.roundOff > 0 ? `+ ₹${billTotals.roundOff.toFixed(2)}` : `- ₹${Math.abs(billTotals.roundOff).toFixed(2)}`) : '₹ 0.00'}
                      style={{ background: '#F5EFEB', color: '#7A7268' }}
                    />
                  </div>
                </div>
              </div>

              {/* Requirement 4: Optional Linked Payment Reminder */}
              <div
                style={{
                  background: '#FFF',
                  border: '1px solid #E9E0D7',
                  borderRadius: 8,
                  padding: 14,
                  marginTop: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="enableReminder"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#9B1C31', cursor: 'pointer' }}
                  />
                  <label htmlFor="enableReminder" style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B', cursor: 'pointer', margin: 0 }}>
                    🔔 Set Payment Reminder for this Bill
                  </label>
                </div>

                {reminderEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid #F0EAE1' }}>
                    <div className="form-group">
                      <label style={{ fontSize: 10 }}>Reminder Date (Required)</label>
                      <input
                        type="date"
                        min={todayStr}
                        className="form-input"
                        value={reminderDate}
                        onChange={(e) => setReminderDate(e.target.value)}
                        required={reminderEnabled}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: 10 }}>Reminder Amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input tabular-numbers"
                        placeholder={`Defaults to ${formatRupee(billTotals.grandTotal)}`}
                        value={reminderAmount}
                        onChange={(e) => setReminderAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: 10 }}>Reminder Notes</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Call customer after lunch..."
                        value={reminderNotes}
                        onChange={(e) => setReminderNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group full-width" style={{ marginTop: 4 }}>
                <label>Notes / Narration</label>
                <input className="form-input" placeholder="Optional comments..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {/* Total Summary */}
              <div style={{ background: '#FAF0F2', border: '1px solid #F5CCD3', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div>
                  <span style={{ fontSize: 11, color: '#9B1C31', textTransform: 'uppercase', fontWeight: 700 }}>Total Invoice Grand Total</span>
                  <p style={{ margin: 0, fontSize: 12, color: '#7A7268' }}>
                    Subtotal: {formatRupee(billTotals.subtotal)} | Taxable: {formatRupee(billTotals.taxableAmount)} | GST ({billTotals.gstRate}%): {formatRupee(billTotals.gstAmount)}
                  </p>
                </div>
                <strong style={{ font: '26px Georgia', color: '#9B1C31' }} className="tabular-numbers">
                  {formatRupee(billTotals.grandTotal)}
                </strong>
              </div>

              <p style={{ fontSize: 11, color: '#7A7268', margin: 0 }}>
                ℹ️ Date and time are recorded automatically by the server.
              </p>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-button" disabled={loading}>
                {loading ? 'Saving Sale...' : 'Save Sale Entry [Ctrl+S] ↗'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
