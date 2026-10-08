'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { Party, Item, GridLineItem, JobWorkEntry, PendingJobWorkLine } from '@/lib/api/types';
import { createJobWork, getPendingJobWorkLines, getParty } from '@/lib/api/services';
import { formatRupee, formatDate } from '@/lib/format';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { ItemEntryGrid } from './ItemEntryGrid';
import { useAltKeyShortcut } from '@/lib/hooks/useAltKeyShortcut';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';

interface JobWorkModalProps {
  isOpen: boolean;
  type: 'POLISH' | 'MEENA';
  onClose: () => void;
  parties: Party[];
  items: Item[];
  onJobWorkCreated: () => void;
}

interface ReceiveRowState {
  issue_line_id: string;
  item_id: string;
  item_name: string;
  unit: 'PCS' | 'KG';
  sent_pieces: number;
  sent_weight_kg: number;
  already_received_pieces: number;
  already_received_weight_kg: number;
  pending_pieces: number;
  pending_weight_kg: number;
  // User input
  received_pieces: number;
  received_weight_kg: number;
  labour_charge: number;
  is_closed: boolean;
  selected: boolean;
}

export function JobWorkModal({
  isOpen,
  type,
  onClose,
  parties,
  items,
  onJobWorkCreated,
}: JobWorkModalProps) {
  // Karigar parties (prefer parties marked with work_types matching or SUPPLIER/BOTH)
  const karigarParties = useMemo(() => {
    return parties.filter((p) => {
      if (p.work_types && (p.work_types.includes(type) || p.work_types.includes(type.toLowerCase()))) {
        return true;
      }
      return p.type === 'SUPPLIER' || p.type === 'BOTH';
    });
  }, [parties, type]);

  const [partyId, setPartyId] = useState<string>('');
  const [direction, setDirection] = useState<'ISSUE' | 'RECEIVE'>('ISSUE');
  const [karigarBalance, setKarigarBalance] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [showQuickAdd, setShowQuickAdd] = useState<boolean>(false);

  // Issue state (ItemEntryGrid)
  const [issueLines, setIssueLines] = useState<GridLineItem[]>([]);
  const [issueSubtotal, setIssueSubtotal] = useState<number>(0);

  // Receive state (Pending lines from selected Karigar)
  const [pendingLines, setPendingLines] = useState<PendingJobWorkLine[]>([]);
  const [receiveRows, setReceiveRows] = useState<ReceiveRowState[]>([]);
  const [loadingPending, setLoadingPending] = useState<boolean>(false);

  // Success view state
  const [savedEntry, setSavedEntry] = useState<JobWorkEntry | null>(null);

  // Initialize party selection
  useEffect(() => {
    if (!partyId && karigarParties.length > 0) {
      setPartyId(karigarParties[0].id);
    }
  }, [karigarParties, partyId]);

  // Fetch live Karigar ledger balance
  useEffect(() => {
    if (!partyId) return;
    const currentParty = parties.find((p) => p.id === partyId);
    if (currentParty) {
      setKarigarBalance(Number(currentParty.current_balance ?? currentParty.opening_balance ?? 0));
    }

    getParty(partyId)
      .then((p) => {
        if (p && p.current_balance !== undefined) {
          setKarigarBalance(Number(p.current_balance));
        }
      })
      .catch(() => {});
  }, [partyId, parties]);

  // When direction is RECEIVE or party changes, fetch pending issued lines (Req 32)
  useEffect(() => {
    if (!isOpen || direction !== 'RECEIVE' || !partyId) {
      setPendingLines([]);
      setReceiveRows([]);
      return;
    }

    setLoadingPending(true);
    getPendingJobWorkLines(partyId, type)
      .then((lines) => {
        setPendingLines(lines);
        setReceiveRows(
          lines.map((l) => ({
            issue_line_id: l.issue_line_id,
            item_id: l.item_id,
            item_name: l.item_name,
            unit: l.unit,
            sent_pieces: l.sent_pieces,
            sent_weight_kg: l.sent_weight_kg,
            already_received_pieces: l.already_received_pieces,
            already_received_weight_kg: l.already_received_weight_kg,
            pending_pieces: l.pending_pieces,
            pending_weight_kg: l.pending_weight_kg,
            received_pieces: l.pending_pieces, // default prefill
            received_weight_kg: l.pending_weight_kg,
            labour_charge: 0,
            is_closed: false,
            selected: true,
          })),
        );
      })
      .catch((err) => {
        console.error('Failed to load pending job work lines', err);
      })
      .finally(() => {
        setLoadingPending(false);
      });
  }, [isOpen, direction, partyId, type]);

  // Alt+K shortcut for quick add Karigar
  useAltKeyShortcut({
    code: 'KeyK',
    onTrigger: () => setShowQuickAdd(true),
    enabled: isOpen,
    isDialogOpen: showQuickAdd,
  });

  // Calculate receive summary & total labour charge
  const totalLabourCharge = useMemo(() => {
    if (direction !== 'RECEIVE') return 0;
    return receiveRows
      .filter((r) => r.selected)
      .reduce((sum, r) => sum + (Number(r.labour_charge) || 0), 0);
  }, [direction, receiveRows]);

  // Karigar balance display
  // Negative balance means accounts payable (Cr). Labour increases payable (more negative).
  const closingKarigarBalance = karigarBalance - totalLabourCharge;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    if (!partyId) {
      alert('Please select an artisan / Karigar.');
      return;
    }

    if (direction === 'ISSUE') {
      if (issueLines.length === 0) {
        alert('Please add at least one valid item to issue.');
        return;
      }

      setLoading(true);
      try {
        const entry = await createJobWork({
          work_type: type,
          party_id: partyId,
          direction: 'ISSUE',
          notes,
          idempotency_key: idempotencyKey,
          lines: issueLines.map((l) => ({
            item_id: l.item_id,
            unit: l.unit,
            pieces: l.pieces || 0,
            weight_kg: l.weight_kg || 0,
          })),
        });

        setSavedEntry(entry);
        onJobWorkCreated();
      } catch (err: any) {
        alert(err.message || 'Error recording job work issue');
      } finally {
        setLoading(false);
      }
    } else {
      // RECEIVE Back
      const activeRows = receiveRows.filter((r) => r.selected);
      if (activeRows.length === 0) {
        alert('Please select at least one issued line to receive back.');
        return;
      }

      setLoading(true);
      try {
        const entry = await createJobWork({
          work_type: type,
          party_id: partyId,
          direction: 'RECEIVE',
          notes,
          idempotency_key: idempotencyKey,
          lines: activeRows.map((r) => ({
            issue_line_id: r.issue_line_id,
            item_id: r.item_id,
            unit: r.unit,
            pieces: r.received_pieces || 0,
            weight_kg: r.received_weight_kg || 0,
            labour_charge: r.labour_charge || 0,
            is_closed: r.is_closed,
          })),
        });

        setSavedEntry(entry);
        onJobWorkCreated();
      } catch (err: any) {
        alert(err.message || 'Error recording job work receive');
      } finally {
        setLoading(false);
      }
    }
  };

  const { idempotencyKey } = useSaveShortcut({
    onSave: handleSubmit,
    isSaving: loading,
    enabled: isOpen && !showQuickAdd && !savedEntry,
  });

  useBackspaceNavigationGuard({
    isDirty: issueLines.length > 0 || notes.length > 0,
    isDialogOpen: isOpen,
    onBack: onClose,
  });

  if (!isOpen) return null;

  const selectedKarigar = parties.find((p) => p.id === partyId);

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 860, maxHeight: '92vh', overflowY: 'auto' }}>
        {savedEntry ? (
          /* Success Screen */
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <h3 style={{ fontSize: 22, color: '#2B2B2B', margin: '0 0 6px' }}>
              {type === 'POLISH' ? 'Polish' : 'Meena'} Job Work Recorded!
            </h3>
            <p style={{ color: '#7A7268', margin: '0 0 20px', fontSize: 13 }}>
              Entry <strong>#{savedEntry.entry_no}</strong> ({savedEntry.direction === 'ISSUE' ? 'Issued' : 'Received Back'}) for <strong>{selectedKarigar?.name}</strong> has been saved.
            </p>

            {/* Dynamic Ledger Impact if Labour Charge present */}
            {savedEntry.direction === 'RECEIVE' && (savedEntry.charge_amount || 0) > 0 && (
              <div style={{ background: '#FAF6F2', borderRadius: 8, padding: 16, margin: '0 auto 20px', maxWidth: 600, border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7A7268', textTransform: 'uppercase', marginBottom: 12 }}>
                  Karigar Ledger Impact (Payable / Cr)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 11, color: '#7A7268', marginBottom: 2 }}>Previous Balance</div>
                    <strong className="tabular-numbers" style={{ fontSize: 14 }}>
                      {formatRupee(Math.abs(savedEntry.balance_before ?? karigarBalance))}
                    </strong>
                    <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>Cr (Payable)</div>
                  </div>
                  <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 11, color: '#7A7268', marginBottom: 2 }}>Labour This Entry</div>
                    <strong className="tabular-numbers" style={{ fontSize: 14, color: '#2563EB' }}>
                      +{formatRupee(savedEntry.charge_amount || 0)}
                    </strong>
                    <div style={{ fontSize: 10, color: '#7A7268', marginTop: 2 }}>Artisan Credit</div>
                  </div>
                  <div style={{ background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 11, color: '#7A7268', marginBottom: 2 }}>Closing Balance</div>
                    <strong className="tabular-numbers" style={{ fontSize: 14, color: '#DC2626' }}>
                      {formatRupee(Math.abs(savedEntry.balance_after ?? closingKarigarBalance))}
                    </strong>
                    <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>Cr (Payable)</div>
                  </div>
                </div>
              </div>
            )}

            {/* Entry Summary */}
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 14, margin: '0 auto 24px', maxWidth: 600, textAlign: 'left', fontSize: 13, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#64748B' }}>Direction:</span>
                <strong>{savedEntry.direction === 'ISSUE' ? 'Sent (Stock Outward)' : 'Received Back (Stock Inward)'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#64748B' }}>Total Weight:</span>
                <span className="tabular-numbers"><strong>{savedEntry.weight_kg} Kg</strong></span>
              </div>
              {savedEntry.direction === 'RECEIVE' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#2563EB' }}>
                  <span>Total Labour Charge:</span>
                  <span className="tabular-numbers"><strong>{formatRupee(savedEntry.charge_amount || 0)}</strong></span>
                </div>
              )}
              {savedEntry.notes && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #E2E8F0', fontSize: 12, color: '#475569' }}>
                  <strong>Notes:</strong> {savedEntry.notes}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSavedEntry(null);
                  setIssueLines([]);
                  setNotes('');
                }}
              >
                ＋ Record Another Entry
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                Done &amp; Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{type === 'POLISH' ? '✦' : '❖'}</span>
                <div>
                  <h3 style={{ margin: 0 }}>
                    {type === 'POLISH' ? 'Polish' : 'Meena'} Job Work
                  </h3>
                  <span style={{ fontSize: 12, color: '#7A7268' }}>
                    Artisan Outward / Inward Tracking &bull; Labour Charges
                  </span>
                </div>
              </div>
              <button type="button" className="close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="modal-body">
              {/* Direction Switcher (Issue vs Receive) */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    border: direction === 'ISSUE' ? '2px solid #2563EB' : '1px solid var(--line)',
                    background: direction === 'ISSUE' ? '#EFF6FF' : '#fff',
                    color: direction === 'ISSUE' ? '#1D4ED8' : '#2B2B2B',
                  }}
                  onClick={() => setDirection('ISSUE')}
                >
                  ↗ Issue to Karigar (Sent)
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    border: direction === 'RECEIVE' ? '2px solid #059669' : '1px solid var(--line)',
                    background: direction === 'RECEIVE' ? '#ECFDF5' : '#fff',
                    color: direction === 'RECEIVE' ? '#047857' : '#2B2B2B',
                  }}
                  onClick={() => setDirection('RECEIVE')}
                >
                  ↙ Received Back from Karigar
                </button>
              </div>

              {/* Karigar Selection Header with Alt+K */}
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
                  <select
                    className="form-select"
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    required
                  >
                    {karigarParties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.work_types ? `(${p.work_types})` : ''} {p.address ? `— ${p.address}` : ''}
                      </option>
                    ))}
                    {karigarParties.length === 0 && (
                      <option value="">No karigars found. Use Alt+K to add one.</option>
                    )}
                  </select>

                  <QuickAddPartyDialog
                    isOpen={showQuickAdd}
                    onClose={() => setShowQuickAdd(false)}
                    type="KARIGAR"
                    onSuccess={(newParty) => {
                      parties.push(newParty);
                      setPartyId(newParty.id);
                      setKarigarBalance(Number(newParty.opening_balance || 0));
                    }}
                  />
                </div>
              </div>

              {/* Live Karigar Balance Display (Req 31) */}
              {selectedKarigar && (
                <div style={{ background: '#FAF6F2', borderRadius: 8, padding: 12, marginTop: 10, border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7A7268', textTransform: 'uppercase', marginBottom: 6 }}>
                    Live Karigar Ledger Balance (Accounts Payable)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                    <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 10, color: '#7A7268' }}>Previous Balance</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#DC2626' }} className="tabular-numbers">
                        {formatRupee(Math.abs(karigarBalance))} Cr
                      </div>
                      <div style={{ fontSize: 9, color: '#7A7268' }}>Payable</div>
                    </div>
                    <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 10, color: '#7A7268' }}>Labour This Entry</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#2563EB' }} className="tabular-numbers">
                        +{formatRupee(totalLabourCharge)}
                      </div>
                      <div style={{ fontSize: 9, color: '#7A7268' }}>
                        {direction === 'RECEIVE' ? 'Artisan Credit' : 'No Financial Post on Issue'}
                      </div>
                    </div>
                    <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 10, color: '#7A7268' }}>Closing Balance</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#DC2626' }} className="tabular-numbers">
                        {formatRupee(Math.abs(closingKarigarBalance))} Cr
                      </div>
                      <div style={{ fontSize: 9, color: '#7A7268' }}>Payable</div>
                    </div>
                  </div>
                </div>
              )}

              {/* DIRECTION 1: ISSUE (Sent to Karigar) using ItemEntryGrid (Req 30) */}
              {direction === 'ISSUE' && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B' }}>
                      Items to Issue (Fast-entry Grid &bull; Enter/Tab to advance &bull; Ctrl+Del to delete)
                    </label>
                    <span style={{ fontSize: 11, color: '#7A7268' }}>
                      {issueLines.length} item{issueLines.length === 1 ? '' : 's'} &bull; Stock will move to Karigar
                    </span>
                  </div>
                  <ItemEntryGrid
                    items={items}
                    onChange={(lines, subtotal) => {
                      setIssueLines(lines);
                      setIssueSubtotal(subtotal);
                    }}
                    disabled={loading}
                  />
                </div>
              )}

              {/* DIRECTION 2: RECEIVE BACK from Karigar (Linked to Issue Lines with Difference) (Req 32) */}
              {direction === 'RECEIVE' && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#2B2B2B' }}>
                      Pending Issues for {selectedKarigar?.name} (Select &amp; Record Received Back)
                    </label>
                    <span style={{ fontSize: 11, color: '#7A7268' }}>
                      {loadingPending ? 'Loading pending items...' : `${pendingLines.length} pending line(s)`}
                    </span>
                  </div>

                  {loadingPending ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#7A7268' }}>
                      Fetching pending issued items for this Karigar...
                    </div>
                  ) : receiveRows.length === 0 ? (
                    <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, padding: 24, textAlign: 'center', color: '#64748B' }}>
                      No pending {type.toLowerCase()} job work items found for {selectedKarigar?.name}.
                      <br />
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>
                        Switch to "Issue to Karigar" to send new pieces.
                      </span>
                    </div>
                  ) : (
                    <div className="data-table-container" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                      <table className="data-table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#FAF6F2' }}>
                            <th style={{ width: 36, textAlign: 'center' }}>✓</th>
                            <th>Issue Entry</th>
                            <th>Item</th>
                            <th style={{ textAlign: 'right' }}>Sent</th>
                            <th style={{ textAlign: 'right' }}>Already Recv</th>
                            <th style={{ textAlign: 'right' }}>Receive Back</th>
                            <th style={{ textAlign: 'center' }}>Difference</th>
                            <th style={{ textAlign: 'right' }}>Labour ₹</th>
                            <th style={{ textAlign: 'center' }}>Close Shortage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiveRows.map((row, idx) => {
                            // Compute difference = Received - Pending (Req 32: 8 of 10 -> -2 red; 12 of 10 -> +2 green; 10 of 10 -> 0)
                            const isPcs = row.unit === 'PCS';
                            const diffQty = isPcs
                              ? row.received_pieces - row.pending_pieces
                              : Math.round((row.received_weight_kg - row.pending_weight_kg) * 1000) / 1000;

                            const diffColor =
                              diffQty < 0 ? '#DC2626' : diffQty > 0 ? '#16A34A' : '#7A7268';
                            const diffSign = diffQty > 0 ? '+' : '';

                            return (
                              <tr key={row.issue_line_id} style={{ opacity: row.selected ? 1 : 0.5 }}>
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={row.selected}
                                    onChange={(e) => {
                                      const updated = [...receiveRows];
                                      updated[idx].selected = e.target.checked;
                                      setReceiveRows(updated);
                                    }}
                                  />
                                </td>
                                <td>
                                  <strong>#{row.issue_line_id.slice(0, 8)}</strong>
                                </td>
                                <td>
                                  <strong>{row.item_name}</strong>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {isPcs ? `${row.sent_pieces} Pcs` : `${row.sent_weight_kg.toFixed(3)} Kg`}
                                </td>
                                <td style={{ textAlign: 'right', color: '#7A7268' }}>
                                  {isPcs ? `${row.already_received_pieces} Pcs` : `${row.already_received_weight_kg.toFixed(3)} Kg`}
                                </td>
                                <td style={{ textAlign: 'right', width: 120 }}>
                                  {isPcs ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      className="form-input"
                                      style={{ width: 80, fontSize: 12, padding: '4px 6px', textAlign: 'right' }}
                                      value={row.received_pieces}
                                      onChange={(e) => {
                                        const updated = [...receiveRows];
                                        updated[idx].received_pieces = parseInt(e.target.value) || 0;
                                        setReceiveRows(updated);
                                      }}
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.001"
                                      className="form-input"
                                      style={{ width: 90, fontSize: 12, padding: '4px 6px', textAlign: 'right' }}
                                      value={row.received_weight_kg}
                                      onChange={(e) => {
                                        const updated = [...receiveRows];
                                        updated[idx].received_weight_kg = parseFloat(e.target.value) || 0;
                                        setReceiveRows(updated);
                                      }}
                                    />
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      color: diffColor,
                                      background: diffQty < 0 ? '#FEF2F2' : diffQty > 0 ? '#F0FDF4' : '#F1F5F9',
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    {isPcs ? `${diffSign}${diffQty}` : `${diffSign}${diffQty.toFixed(3)} Kg`}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right', width: 110 }}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="form-input"
                                    placeholder="0.00"
                                    style={{ width: 90, fontSize: 12, padding: '4px 6px', textAlign: 'right' }}
                                    value={row.labour_charge || ''}
                                    onChange={(e) => {
                                      const updated = [...receiveRows];
                                      updated[idx].labour_charge = parseFloat(e.target.value) || 0;
                                      setReceiveRows(updated);
                                    }}
                                  />
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    title="Close line with shortage"
                                    checked={row.is_closed}
                                    onChange={(e) => {
                                      const updated = [...receiveRows];
                                      updated[idx].is_closed = e.target.checked;
                                      setReceiveRows(updated);
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Notes / Instructions */}
              <div className="form-group full-width" style={{ marginTop: 12 }}>
                <label>Notes / Batch / Instructions</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Special antique polish batch #81; certified delivery..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Summary Bottom Bar */}
              <div
                style={{
                  background: direction === 'ISSUE' ? '#EFF6FF' : '#ECFDF5',
                  border: direction === 'ISSUE' ? '1px solid #BFDBFE' : '1px solid #A7F3D0',
                  borderRadius: 8,
                  padding: 14,
                  marginTop: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      color: direction === 'ISSUE' ? '#1D4ED8' : '#047857',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    {direction === 'ISSUE' ? 'Issue Summary' : 'Receive & Labour Summary'}
                  </span>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    {direction === 'ISSUE'
                      ? `${issueLines.length} item(s) to issue &bull; Stock leaves workshop`
                      : `${receiveRows.filter((r) => r.selected).length} line(s) selected &bull; Total Labour: ${formatRupee(totalLabourCharge)}`}
                  </div>
                </div>
                <strong
                  style={{
                    font: '24px Georgia',
                    color: direction === 'ISSUE' ? '#1D4ED8' : '#047857',
                  }}
                  className="tabular-numbers"
                >
                  {direction === 'ISSUE'
                    ? `${issueLines.reduce((s, l) => s + (l.weight_kg || 0), 0).toFixed(3)} Kg`
                    : formatRupee(totalLabourCharge)}
                </strong>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, color: '#7A7268' }}>
                Keyboard: <strong>Ctrl+S</strong> to save &bull; <strong>Alt+K</strong> new karigar
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                  style={{ background: direction === 'ISSUE' ? '#2563EB' : '#059669' }}
                >
                  {loading
                    ? 'Saving...'
                    : direction === 'ISSUE'
                    ? 'Issue to Karigar [Ctrl+S] ↗'
                    : 'Save Received Back [Ctrl+S] ↙'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
