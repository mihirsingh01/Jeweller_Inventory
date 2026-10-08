'use client'

import React, { useState } from 'react';
import { Party, Item } from '@/lib/api/types';
import { createPurchase } from '@/lib/api/services';
import { formatRupee } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';

interface NewPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  items: Item[];
  onPurchaseCreated: () => void;
}

export function NewPurchaseModal({ isOpen, onClose, parties, items, onPurchaseCreated }: NewPurchaseModalProps) {
  const [partyId, setPartyId] = useState(parties.find((p) => p.type === 'SUPPLIER' || p.type === 'BOTH')?.id || parties[0]?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([
    { item_id: items[0]?.id || '', pieces: 5, weight_kg: 0.500, rate: 70000, amount: 35000 },
  ]);
  const [loading, setLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useAltKeyShortcut({
    code: 'KeyS',
    onTrigger: () => setShowQuickAdd(true),
    enabled: isOpen,
    isDialogOpen: showQuickAdd,
  });

  if (!isOpen) return null;

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...lines];
    (updated[index] as any)[field] = value;
    const l = updated[index];
    const calc = l.weight_kg > 0 ? l.weight_kg * l.rate : l.pieces * l.rate;
    l.amount = Math.round(calc);
    setLines(updated);
  };

  const addLine = () => {
    setLines([...lines, { item_id: items[0]?.id || '', pieces: 1, weight_kg: 0.200, rate: 70000, amount: 14000 }]);
  };

  const totalAmount = lines.reduce((acc, l) => acc + (l.amount || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createPurchase({
        party_id: partyId,
        due_date: dueDate || undefined,
        notes,
        lines,
      });
      onPurchaseCreated();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error recording purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>Record New Purchase</h3>
            <button type="button" className="close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
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
                <select className="form-select" value={partyId} onChange={(e) => setPartyId(e.target.value)} required>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                  ))}
                </select>

                <QuickAddPartyDialog
                  isOpen={showQuickAdd}
                  onClose={() => setShowQuickAdd(false)}
                  type="SUPPLIER"
                  onSuccess={(newParty) => {
                    parties.push(newParty);
                    setPartyId(newParty.id);
                  }}
                />
              </div>

              <div className="form-group">
                <label>Due Date (Optional)</label>
                <input type="date" className="form-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Server Clock</label>
                <input className="form-input" value="Recorded automatically by server" disabled style={{ background: '#F5EFEB', color: '#7A7268' }} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B' }}>Line Items</label>
                <button type="button" className="text-button" onClick={addLine}>＋ Add Item Line</button>
              </div>

              {lines.map((line, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 1.2fr 1.2fr', gap: 8, alignItems: 'center', marginBottom: 8, background: '#FAF6F2', padding: 10, borderRadius: 8 }}>
                  <select className="form-select" value={line.item_id} onChange={(e) => handleLineChange(idx, 'item_id', e.target.value)}>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </select>
                  <input type="number" min="0" className="form-input tabular-numbers" placeholder="Pcs" value={line.pieces} onChange={(e) => handleLineChange(idx, 'pieces', parseInt(e.target.value) || 0)} />
                  <input type="number" step="0.001" min="0" className="form-input tabular-numbers" placeholder="Kg" value={line.weight_kg} onChange={(e) => handleLineChange(idx, 'weight_kg', parseFloat(e.target.value) || 0)} />
                  <input type="number" min="0" className="form-input tabular-numbers" placeholder="Rate ₹" value={line.rate} onChange={(e) => handleLineChange(idx, 'rate', parseFloat(e.target.value) || 0)} />
                  <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }} className="tabular-numbers">
                    {formatRupee(line.amount)}
                  </div>
                </div>
              ))}
            </div>

            <div className="form-group full-width" style={{ marginTop: 8 }}>
              <label>Notes / Narration</label>
              <input className="form-input" placeholder="Supplier invoice reference, etc..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, color: '#B8893B', textTransform: 'uppercase', fontWeight: 700 }}>Total Purchase Value</span>
                <p style={{ margin: 0, fontSize: 12, color: '#7A7268' }}>Will increase stock and add payable credit to supplier</p>
              </div>
              <strong style={{ font: '24px Georgia', color: '#B8893B' }} className="tabular-numbers">
                {formatRupee(totalAmount)}
              </strong>
            </div>

            <p style={{ fontSize: 11, color: '#7A7268', margin: 0 }}>Date and time are recorded automatically.</p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={loading} style={{ background: '#B8893B' }}>
              {loading ? 'Recording Purchase...' : 'Save Purchase ↙'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
