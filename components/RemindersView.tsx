'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ReminderSettings, PaymentReminder, Party } from '@/lib/api/types';
import {
  updateReminderSettings,
  triggerDailyReminders,
  listReminders,
  createManualReminder,
  updateReminderStatus,
} from '@/lib/api/services';
import { formatRupee, formatDate } from '@/lib/format';
import {
  categorizeReminder,
  computeRemindersSummary,
} from '@/lib/calculations/reminder-calculations';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';

interface RemindersViewProps {
  settings: ReminderSettings;
  parties: Party[];
  role?: 'Owner' | 'Staff';
  onRefresh: () => void;
}

export function RemindersView({ settings, parties, role = 'Owner', onRefresh }: RemindersViewProps) {
  // Navigation tabs within reminders
  const [activeTab, setActiveTab] = useState<'queue' | 'settings'>('queue');

  // Reminders list state
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<
    'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'COMPLETED'
  >('ALL');
  const [selectedPartyFilter, setSelectedPartyFilter] = useState<string>('');

  // Manual reminder dialog state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPartyId, setNewPartyId] = useState(parties[0]?.id || '');
  const [newReminderDate, setNewReminderDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [newAmount, setNewAmount] = useState<number>(10000);
  const [newNotes, setNewNotes] = useState('');
  const [creatingReminder, setCreatingReminder] = useState(false);

  // Settings form state
  const [repeatDays, setRepeatDays] = useState(settings.repeat_days || 3);
  const [sendTime, setSendTime] = useState(settings.send_time || '10:00');
  const [ownerPhone, setOwnerPhone] = useState(settings.owner_whatsapp || '+919690000000');
  const [isActive, setIsActive] = useState(settings.is_active ?? true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Backspace navigation guard
  useBackspaceNavigationGuard();

  // Load reminders
  const fetchRemindersList = useCallback(async () => {
    setLoadingReminders(true);
    try {
      const data = await listReminders({
        filter: selectedFilter === 'ALL' ? undefined : selectedFilter,
        party_id: selectedPartyFilter || undefined,
      });
      setReminders(data);
    } catch (err: any) {
      console.error('Error fetching reminders:', err);
    } finally {
      setLoadingReminders(false);
    }
  }, [selectedFilter, selectedPartyFilter]);

  useEffect(() => {
    fetchRemindersList();
  }, [fetchRemindersList]);

  // Summary statistics
  const summary = useMemo(() => {
    return computeRemindersSummary(reminders);
  }, [reminders]);

  // Handle reminder status update
  const handleUpdateStatus = async (
    id: string,
    status: 'COMPLETED' | 'DISMISSED' | 'CANCELLED',
  ) => {
    try {
      await updateReminderStatus(id, status);
      await fetchRemindersList();
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error updating reminder status');
    }
  };

  // Handle manual reminder create
  const handleCreateManualReminder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (creatingReminder) return;

    if (!newPartyId) {
      alert('Please select a party.');
      return;
    }
    if (!newReminderDate) {
      alert('Please select a reminder date.');
      return;
    }
    if (!newAmount || newAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setCreatingReminder(true);
    try {
      await createManualReminder({
        party_id: newPartyId,
        reminder_date: newReminderDate,
        amount: newAmount,
        notes: newNotes || undefined,
      });
      setShowAddModal(false);
      setNewNotes('');
      await fetchRemindersList();
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error creating reminder');
    } finally {
      setCreatingReminder(false);
    }
  };

  // Shortcut for manual reminder modal
  useSaveShortcut({
    onSave: handleCreateManualReminder,
    isSubmitting: creatingReminder,
    enabled: showAddModal,
  });

  // Save settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateReminderSettings({
        repeat_days: repeatDays,
        send_time: sendTime,
        owner_whatsapp: ownerPhone,
        is_active: isActive,
      });
      alert('Reminder configuration updated successfully!');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error updating settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    try {
      const res = await triggerDailyReminders();
      setTestResult(res);
      await fetchRemindersList();
    } catch (err: any) {
      alert(err.message || 'Error triggering reminder job');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <div className="welcome-row">
        <div>
          <h2>Payment Reminders & Scheduler (Req 5, 14, 24)</h2>
          <p>
            Track overdue customer receivables and supplier payment commitments with WhatsApp follow-ups.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowAddModal(true)}
            style={{ background: 'var(--gold-primary)' }}
          >
            + Add Reminder
          </button>
          {role === 'Owner' && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleSendTest}
              disabled={testing}
            >
              {testing ? 'Dispatching...' : '📱 Run Daily Job'}
            </button>
          )}
        </div>
      </div>

      {testResult && (
        <div
          style={{
            background: '#DEF7EC',
            border: '1px solid #BCF0DA',
            borderRadius: 8,
            padding: 14,
            marginBottom: 18,
          }}
        >
          <strong style={{ color: '#03543F' }}>✓ Daily Job Executed</strong>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#046C4E' }}>
            Found {testResult.overdueBillsFound} overdue bills. Sent{' '}
            {testResult.customerMessagesSent} customer message(s) and 1 consolidated owner summary for{' '}
            {formatRupee(testResult.grandTotalOverdue || 0)}.
          </p>
        </div>
      )}

      {/* Primary Tab Navigation */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          className={activeTab === 'queue' ? 'primary-button' : 'btn-secondary'}
          onClick={() => setActiveTab('queue')}
        >
          📋 Reminders Queue ({summary.totalActiveCount})
        </button>
        {role === 'Owner' && (
          <button
            className={activeTab === 'settings' ? 'primary-button' : 'btn-secondary'}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ WhatsApp Automation & Settings
          </button>
        )}
      </div>

      {activeTab === 'queue' ? (
        <div>
          {/* KPI Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                background: '#FFF',
                border: '1px solid #FECACA',
                borderLeft: '4px solid #DC2626',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>
                Overdue
              </span>
              <strong style={{ display: 'block', fontSize: 20, color: '#2B2B2B', margin: '4px 0 2px' }} className="tabular-numbers">
                {formatRupee(summary.overdueAmount)}
              </strong>
              <small style={{ fontSize: 11, color: '#7A7268' }}>{summary.overdueCount} bills past due</small>
            </div>

            <div
              style={{
                background: '#FFF',
                border: '1px solid #FDE68A',
                borderLeft: '4px solid #D97706',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', textTransform: 'uppercase' }}>
                Due Today
              </span>
              <strong style={{ display: 'block', fontSize: 20, color: '#2B2B2B', margin: '4px 0 2px' }} className="tabular-numbers">
                {formatRupee(summary.todayAmount)}
              </strong>
              <small style={{ fontSize: 11, color: '#7A7268' }}>{summary.todayCount} due today</small>
            </div>

            <div
              style={{
                background: '#FFF',
                border: '1px solid #BFDBFE',
                borderLeft: '4px solid #2563EB',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase' }}>
                Upcoming
              </span>
              <strong style={{ display: 'block', fontSize: 20, color: '#2B2B2B', margin: '4px 0 2px' }} className="tabular-numbers">
                {formatRupee(summary.upcomingAmount)}
              </strong>
              <small style={{ fontSize: 11, color: '#7A7268' }}>{summary.upcomingCount} pending schedule</small>
            </div>

            <div
              style={{
                background: '#FFF',
                border: '1px solid #BCF0DA',
                borderLeft: '4px solid #059669',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
                Settled / Done
              </span>
              <strong style={{ display: 'block', fontSize: 20, color: '#2B2B2B', margin: '4px 0 2px' }} className="tabular-numbers">
                {formatRupee(summary.completedAmount)}
              </strong>
              <small style={{ fontSize: 11, color: '#7A7268' }}>{summary.completedCount} settled</small>
            </div>
          </div>

          {/* Filters Bar */}
          <div
            className="panel"
            style={{
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              {(['ALL', 'OVERDUE', 'TODAY', 'UPCOMING', 'COMPLETED'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setSelectedFilter(filterKey)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1px solid',
                    cursor: 'pointer',
                    background: selectedFilter === filterKey ? 'var(--gold-primary)' : '#FAF6F2',
                    color: selectedFilter === filterKey ? '#FFF' : '#2B2B2B',
                    borderColor: selectedFilter === filterKey ? 'var(--gold-primary)' : 'var(--line)',
                  }}
                >
                  {filterKey}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#7A7268', margin: 0 }}>Filter by Party:</label>
              <select
                className="form-select"
                style={{ minWidth: 200, padding: '4px 8px', fontSize: 12 }}
                value={selectedPartyFilter}
                onChange={(e) => setSelectedPartyFilter(e.target.value)}
              >
                <option value="">All Parties</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Reminders Table */}
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#FAF6F2', borderBottom: '1px solid var(--line)' }}>
                <tr>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Party</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Linked Bill / Source</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Reminder Date</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Amount (₹)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left' }}>Notes</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingReminders ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#7A7268' }}>
                      Loading payment reminders...
                    </td>
                  </tr>
                ) : reminders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#7A7268' }}>
                      No payment reminders found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  reminders.map((rem) => {
                    const cat = categorizeReminder(rem.reminder_date, rem.status);
                    return (
                      <tr key={rem.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              background: cat.badgeColor.bg,
                              color: cat.badgeColor.text,
                              border: `1px solid ${cat.badgeColor.border}`,
                            }}
                          >
                            {cat.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <strong>{rem.party_name || 'Party'}</strong>
                          <span style={{ display: 'block', fontSize: 11, color: '#7A7268' }}>
                            {rem.party_type} • {rem.party_phone || 'No phone'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {rem.sale_bill_no ? (
                            <span style={{ color: '#059669', fontWeight: 600 }}>
                              Sale #{rem.sale_bill_no}
                            </span>
                          ) : rem.purchase_bill_no ? (
                            <span style={{ color: '#2563EB', fontWeight: 600 }}>
                              Purchase #{rem.purchase_bill_no}
                            </span>
                          ) : (
                            <span style={{ color: '#7A7268', fontStyle: 'italic' }}>
                              Manual Follow-up
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }} className="tabular-numbers">
                          {formatDate(rem.reminder_date)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }} className="tabular-numbers">
                          {formatRupee(rem.amount)}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#4B5563', maxWidth: 220 }}>
                          {rem.notes || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {rem.status !== 'COMPLETED' && rem.status !== 'CANCELLED' && (
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(rem.id, 'COMPLETED')}
                                style={{
                                  border: 'none',
                                  background: '#DEF7EC',
                                  color: '#03543F',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                ✓ Settle
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(rem.id, 'DISMISSED')}
                                style={{
                                  border: '1px solid var(--line)',
                                  background: '#FFF',
                                  color: '#6B7280',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                          {rem.status === 'COMPLETED' && (
                            <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>Settled</span>
                          )}
                          {rem.status === 'CANCELLED' && (
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>Cancelled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Settings and Automation Tab */
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          <div className="panel">
            <form onSubmit={handleSaveSettings}>
              <h3 style={{ font: '20px Georgia', margin: '0 0 16px' }}>Scheduler Configuration</h3>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Reminders Automation Switch</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    id="activeSwitch"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <label htmlFor="activeSwitch" style={{ fontSize: 13, textTransform: 'none', color: '#2B2B2B', cursor: 'pointer' }}>
                    Enable automatic daily WhatsApp payment reminders
                  </label>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Repeat Every N Days</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input tabular-numbers"
                    value={repeatDays}
                    onChange={(e) => setRepeatDays(parseInt(e.target.value) || 1)}
                    required
                  />
                  <small style={{ fontSize: 11, color: '#7A7268' }}>Days between repeat reminders per bill</small>
                </div>

                <div className="form-group">
                  <label>Daily Schedule Time (IST)</label>
                  <input
                    type="time"
                    className="form-input"
                    value={sendTime}
                    onChange={(e) => setSendTime(e.target.value)}
                    required
                  />
                  <small style={{ fontSize: 11, color: '#7A7268' }}>Asia/Kolkata timezone</small>
                </div>

                <div className="form-group full-width">
                  <label>Owner WhatsApp Number (E.164)</label>
                  <input
                    className="form-input"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    required
                    placeholder="+919876543210"
                  />
                  <small style={{ fontSize: 11, color: '#7A7268' }}>Receives the single consolidated daily summary</small>
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <button type="submit" className="primary-button" disabled={savingSettings}>
                  {savingSettings ? 'Saving...' : 'Save Reminder Settings'}
                </button>
              </div>
            </form>
          </div>

          <div className="panel" style={{ background: '#FAF7F4' }}>
            <h3 style={{ font: '20px Georgia', margin: '0 0 12px' }}>Live WhatsApp Templates</h3>

            <div style={{ background: '#FFF', border: '1px solid #E9E0D7', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#9B1C31', fontWeight: 700 }}>
                Owner Consolidated Daily Summary (1 Per Day)
              </span>
              <p style={{ fontStyle: 'italic', fontSize: 12, color: '#2B2B2B', margin: '8px 0 0', lineHeight: 1.5 }}>
                &quot;Kumkum Payal Daily Summary: You have <strong>3</strong> pending overdue bills totaling <strong>₹4,61,500</strong> across <strong>2</strong> customers as of {new Date().toLocaleDateString('en-GB')}. Check the owner dashboard for individual statements.&quot;
              </p>
            </div>

            <div style={{ background: '#FFF', border: '1px solid #E9E0D7', borderRadius: 8, padding: 14 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#B8893B', fontWeight: 700 }}>
                Individual Customer WhatsApp Alert
              </span>
              <p style={{ fontStyle: 'italic', fontSize: 12, color: '#2B2B2B', margin: '8px 0 0', lineHeight: 1.5 }}>
                &quot;Namaste Kohinoor Exports, gentle reminder from Kumkum Payal regarding Invoice #1047 for ₹2,75,000, which was due on 26/09/2026. Kindly arrange the settlement at your earliest convenience.&quot;
              </p>
            </div>

            <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 8, padding: 12, marginTop: 16, fontSize: 11, color: '#9F1239' }}>
              <strong>Invariants & Rules:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                <li>No reminders sent before the due date passes.</li>
                <li>Reminders stop automatically when a bill is settled or cancelled.</li>
                <li>Staff can only view and manage reminders for their own entries.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Manual Reminder Create Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <form onSubmit={handleCreateManualReminder}>
              <div className="modal-header">
                <h3>Add Payment Reminder</h3>
                <button type="button" className="close-btn" onClick={() => setShowAddModal(false)}>
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Party *</label>
                  <select
                    className="form-select"
                    value={newPartyId}
                    onChange={(e) => setNewPartyId(e.target.value)}
                    required
                  >
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Reminder / Due Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newReminderDate}
                    onChange={(e) => setNewReminderDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Amount (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input tabular-numbers"
                    value={newAmount}
                    onChange={(e) => setNewAmount(parseFloat(e.target.value) || 0)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Notes / Follow-up Details</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="e.g. Follow up on cheque deposit, promised payment by next week"
                    maxLength={500}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={creatingReminder}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={creatingReminder}
                  style={{ background: 'var(--gold-primary)' }}
                >
                  {creatingReminder ? 'Saving...' : 'Save Reminder (Ctrl+S)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
