'use client'

import React, { useState } from 'react';
import { Party, Item, GridLineItem } from '@/lib/api/types';
import { createPurchase } from '@/lib/api/services';
import { formatRupee } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { ItemEntryGrid } from './ItemEntryGrid';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';

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
  const [validLines, setValidLines] = useState<GridLineItem[]>([]);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useAltKeyShortcut({
    code: 'KeyS',
    onTrigger: () => setShowQuickAdd(true),
    enabled: isOpen,
    isDialogOpen: showQuickAdd,
  });

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (validLines.length === 0) {
      alert('Please add at least one valid item line with quantity and rate.');
      return;
    }

    setLoading(true);
    try {
      await createPurchase({
        party_id: partyId,
        due_date: dueDate || undefined,
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
      onPurchaseCreated();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error recording purchase');
    } finally {
      setLoading(false);
    }
  };

  const { idempotencyKey } = useSaveShortcut({
    onSave: handleSubmit,
    isSaving: loading,
    enabled: isOpen && !showQuickAdd,
  });

  useBackspaceNavigationGuard({
    isDirty: validLines.length > 0 || notes.length > 0,
    isDialogOpen: isOpen,
    onBack: onClose,
  });

  if (!isOpen) return null;

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
              {loading ? 'Recording Purchase...' : 'Save Purchase [Ctrl+S] ↙'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
