'use client'

import React, { useState } from 'react';
import { Party, Item, GridLineItem } from '@/lib/api/types';
import { createSale, sendBillOnWhatsApp } from '@/lib/api/services';
import { formatRupee } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { ItemEntryGrid } from './ItemEntryGrid';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';

interface NewSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  items: Item[];
  onSaleCreated: () => void;
}

export function NewSaleModal({ isOpen, onClose, parties, items, onSaleCreated }: NewSaleModalProps) {
  const [partyId, setPartyId] = useState(parties[0]?.id || '');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [validLines, setValidLines] = useState<GridLineItem[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);

  // Quick add customer dialog state & Alt+C shortcut
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useAltKeyShortcut({
    code: 'KeyC',
    onTrigger: () => setShowQuickAdd(true),
    enabled: isOpen,
    isDialogOpen: showQuickAdd,
  });

  // Success state
  const [successSale, setSuccessSale] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waSent, setWaSent] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (validLines.length === 0) {
      alert('Please add at least one valid item line with quantity and rate.');
      return;
    }

    setLoading(true);
    try {
      const sale = await createSale({
        party_id: partyId,
        due_date: dueDate,
        notes,
        idempotency_key: idempotencyKey,
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
    setTotalAmount(0);
    setNotes('');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        {successSale ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DEF7EC', color: '#03543F', display: 'grid', placeItems: 'center', margin: '0 auto 16px', fontSize: 28 }}>
              ✓
            </div>
            <h3 style={{ font: '24px Georgia', margin: '0 0 8px', color: '#9B1C31' }}>Sale Saved Successfully!</h3>
            <p style={{ color: '#7A7268', fontSize: 13, marginBottom: 20 }}>
              Invoice <strong>#{successSale.bill_no}</strong> for <strong>{formatRupee(successSale.total_amount)}</strong> has been recorded in the ledger and stock.
            </p>

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
              <h3>Record New Sale</h3>
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
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B', display: 'block', marginBottom: 8 }}>
                  Line Items (Auto-Add Rows & Fast Keyboard Grid)
                </label>
                <ItemEntryGrid
                  items={items}
                  onChange={(lines, subtotal) => {
                    setValidLines(lines);
                    setTotalAmount(subtotal);
                  }}
                  disabled={loading}
                />
              </div>

              <div className="form-group full-width" style={{ marginTop: 8 }}>
                <label>Notes / Narration</label>
                <input className="form-input" placeholder="Optional comments..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {/* Total Summary */}
              <div style={{ background: '#FAF0F2', border: '1px solid #F5CCD3', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <div>
                  <span style={{ fontSize: 11, color: '#9B1C31', textTransform: 'uppercase', fontWeight: 700 }}>Total Invoice Amount</span>
                  <p style={{ margin: 0, fontSize: 12, color: '#7A7268' }}>Will reduce stock and post debit to customer ledger</p>
                </div>
                <strong style={{ font: '24px Georgia', color: '#9B1C31' }} className="tabular-numbers">
                  {formatRupee(totalAmount)}
                </strong>
              </div>

              <p style={{ fontSize: 11, color: '#7A7268', margin: 0 }}>
                ℹ️ Date and time are recorded automatically.
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
