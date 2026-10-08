'use client'

import React, { useState } from 'react';
import { Party, Item } from '@/lib/api/types';
import { createJobWork } from '@/lib/api/services';
import { formatRupee } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';

interface JobWorkModalProps {
  isOpen: boolean;
  type: 'POLISH' | 'MEENA';
  onClose: () => void;
  parties: Party[];
  items: Item[];
  onJobWorkCreated: () => void;
}

export function JobWorkModal({ isOpen, type, onClose, parties, items, onJobWorkCreated }: JobWorkModalProps) {
  const [partyId, setPartyId] = useState(parties[0]?.id || '');
  const [itemId, setItemId] = useState(items[0]?.id || '');
  const [direction, setDirection] = useState<'ISSUE' | 'RECEIVE'>('ISSUE');
  const [weightKg, setWeightKg] = useState(0.500);
  const [chargeAmount, setChargeAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useAltKeyShortcut({
    code: 'KeyK',
    onTrigger: () => setShowQuickAdd(true),
    enabled: isOpen,
    isDialogOpen: showQuickAdd,
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createJobWork({
        work_type: type,
        party_id: partyId,
        item_id: itemId,
        direction,
        weight_kg: weightKg,
        charge_amount: chargeAmount,
        notes,
      });
      onJobWorkCreated();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error recording job work');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>Record {type === 'POLISH' ? 'Polish' : 'Meena'} Job Work</h3>
            <button type="button" className="close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            <div className="form-grid">
              <div className="form-group full-width">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    Artisan / Karigar
                    <span style={{ fontSize: 11, background: '#FAF6EF', color: '#B8893B', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                      Alt+K
                    </span>
                  </label>
                  <button type="button" className="text-button" onClick={() => setShowQuickAdd(true)}>
                    ＋ Quick Add Karigar [Alt+K]
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
                  type="KARIGAR"
                  onSuccess={(newParty) => {
                    parties.push(newParty);
                    setPartyId(newParty.id);
                  }}
                />
              </div>

              <div className="form-group">
                <label>Inventory Item</label>
                <select className="form-select" value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Movement Direction</label>
                <select className="form-select" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
                  <option value="ISSUE">Issue to Karigar (Deduct Stock)</option>
                  <option value="RECEIVE">Receive Back from Karigar (Add Stock)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Weight (Kg only, 3 decimals)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  className="form-input tabular-numbers"
                  value={weightKg}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Artisan Labor Charge ₹ (Optional)</label>
                <input
                  type="number"
                  min="0"
                  className="form-input tabular-numbers"
                  placeholder="₹ 0.00"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="form-group">
                <label>Server Clock</label>
                <input className="form-input" value="Recorded automatically by server" disabled style={{ background: '#F5EFEB', color: '#7A7268' }} />
              </div>

              <div className="form-group full-width">
                <label>Notes / Batch / Instructions</label>
                <input className="form-input" placeholder="e.g. 10 bangles for antique polish..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div style={{ background: '#FAF6F2', borderRadius: 8, padding: 14, fontSize: 12, color: '#7A7268' }}>
              <strong>Summary:</strong> {direction === 'ISSUE' ? 'Issuing' : 'Receiving back'} <strong>{weightKg.toFixed(3)} Kg</strong> {type} work. {chargeAmount > 0 ? `Will record ₹${chargeAmount} labor charge.` : ''}
            </div>

            <p style={{ fontSize: 11, color: '#7A7268', margin: 0 }}>Date and time are recorded automatically.</p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? 'Saving Entry...' : `Save ${type} Entry`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
