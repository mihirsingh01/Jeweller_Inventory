'use client'

import React, { useState } from 'react';
import { Party, Item } from '@/lib/api/types';
import { createSale, sendBillOnWhatsApp } from '@/lib/api/services';
import { formatRupee } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';

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
  const [lines, setLines] = useState([
    { item_id: items[0]?.id || '', pieces: 1, weight_kg: 0.150, rate: 72000, amount: 10800 },
  ]);

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

  if (!isOpen) return null;

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...lines];
    (updated[index] as any)[field] = value;
    const l = updated[index];
    const calcAmount = l.weight_kg > 0 ? l.weight_kg * l.rate : l.pieces * l.rate;
    l.amount = Math.round(calcAmount);
    setLines(updated);
  };

  const addLine = () => {
    setLines([
      ...lines,
      { item_id: items[0]?.id || '', pieces: 1, weight_kg: 0.100, rate: 72000, amount: 7200 },
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const totalAmount = lines.reduce((acc, l) => acc + (l.amount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const sale = await createSale({
        party_id: partyId,
        due_date: dueDate,
        notes,
        lines,
      });
      setSuccessSale(sale);
      onSaleCreated();
    } catch (err: any) {
      alert(err.message || 'Error saving sale entry');
    } finally {
      setLoading(false);
    }
  };


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
    setLines([{ item_id: items[0]?.id || '', pieces: 1, weight_kg: 0.150, rate: 72000, amount: 10800 }]);
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

              {/* Line Items */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B' }}>Line Items</label>
                  <button type="button" className="text-button" onClick={addLine}>＋ Add Item Line</button>
                </div>

                {lines.map((line, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1.2fr 1.2fr auto', gap: 8, alignItems: 'center', marginBottom: 8, background: '#FAF6F2', padding: 10, borderRadius: 8 }}>
                    <select className="form-select" value={line.item_id} onChange={(e) => handleLineChange(idx, 'item_id', e.target.value)}>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                    <input type="number" min="0" className="form-input tabular-numbers" placeholder="Pcs" value={line.pieces} onChange={(e) => handleLineChange(idx, 'pieces', parseInt(e.target.value) || 0)} title="Pieces" />
                    <input type="number" step="0.001" min="0" className="form-input tabular-numbers" placeholder="Kg" value={line.weight_kg} onChange={(e) => handleLineChange(idx, 'weight_kg', parseFloat(e.target.value) || 0)} title="Weight (Kg)" />
                    <input type="number" min="0" className="form-input tabular-numbers" placeholder="Rate ₹" value={line.rate} onChange={(e) => handleLineChange(idx, 'rate', parseFloat(e.target.value) || 0)} title="Rate per unit" />
                    <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', paddingRight: 6 }} className="tabular-numbers">
                      {formatRupee(line.amount)}
                    </div>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)} style={{ color: '#DC2626', background: 'transparent', border: 0, cursor: 'pointer', fontSize: 16 }}>✕</button>
                    )}
                  </div>
                ))}
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
                {loading ? 'Saving Sale...' : 'Save Sale Entry ↗'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
