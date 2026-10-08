'use client'

import React, { useState, useMemo } from 'react';
import { AuditLogRow } from '@/lib/api/types';
import { formatDate } from '@/lib/format';

interface AuditLogViewProps {
  logs: AuditLogRow[];
}

export function AuditLogView({ logs }: AuditLogViewProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Distinct tables and actions for filter dropdowns
  const availableTables = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => {
      if (l.table_name) s.add(l.table_name);
    });
    return Array.from(s).sort();
  }, [logs]);

  const availableActions = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => {
      if (l.action) s.add(l.action);
    });
    return Array.from(s).sort();
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedAction !== 'ALL' && log.action !== selectedAction) return false;
      if (selectedTable !== 'ALL' && log.table_name !== selectedTable) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchRecord = String(log.record_id || '').toLowerCase().includes(q);
        const matchActor = (log.actor_name || '').toLowerCase().includes(q);
        const matchAction = log.action.toLowerCase().includes(q);
        const matchTable = log.table_name.toLowerCase().includes(q);
        if (!matchRecord && !matchActor && !matchAction && !matchTable) return false;
      }
      return true;
    });
  }, [logs, selectedAction, selectedTable, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    let creates = 0;
    let softDeletes = 0;
    let updates = 0;
    logs.forEach((l) => {
      if (l.action === 'CREATE') creates++;
      else if (l.action === 'SOFT_DELETE' || l.action === 'DELETE') softDeletes++;
      else updates++;
    });
    return { total: logs.length, creates, softDeletes, updates };
  }, [logs]);

  return (
    <div className="audit-log-view">
      <div className="view-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🛡️ Append-Only Security Audit Trail</span>
            <span className="badge badge-outline" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
              Req 41 & 50 (Owner Only)
            </span>
          </h2>
          <p className="text-secondary" style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Every administrative mutation, soft-delete, and reversal is permanently stamped with before & after state diffs.
          </p>
        </div>
      </div>

      {/* KPI Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--primary)' }}>
          <div className="text-secondary" style={{ fontSize: '0.82rem' }}>Total Audit Events</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 4 }}>{metrics.total}</div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid #10b981' }}>
          <div className="text-secondary" style={{ fontSize: '0.82rem' }}>Insert & Creations</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981', marginTop: 4 }}>
            {metrics.creates}
          </div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid #f59e0b' }}>
          <div className="text-secondary" style={{ fontSize: '0.82rem' }}>Administrative Updates</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
            {metrics.updates}
          </div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid #ef4444' }}>
          <div className="text-secondary" style={{ fontSize: '0.82rem' }}>Reversible Soft Deletes</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
            {metrics.softDeletes}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Action Filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Action:</span>
          <select
            className="input-field"
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
          >
            <option value="ALL">All Actions</option>
            {availableActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Table Filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Table:</span>
          <select
            className="input-field"
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
          >
            <option value="ALL">All Tables</option>
            {availableTables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div style={{ marginLeft: 'auto' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search record ID, actor..."
            style={{ width: 220, padding: '6px 10px', fontSize: '0.85rem' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No audit log entries match the current filter criteria.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Actor</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Action</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Target Table</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Record ID</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Payload Diff</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  const isDelete = log.action === 'SOFT_DELETE' || log.action === 'DELETE';
                  const isCreate = log.action === 'CREATE';
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: isExpanded ? 'var(--surface-sunken)' : 'transparent',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {formatDate(log.at)}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          {log.actor_name || 'Owner'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span
                            className={`badge ${
                              isDelete
                                ? 'badge-danger'
                                : isCreate
                                ? 'badge-success'
                                : 'badge-warning'
                            }`}
                            style={{ fontSize: '0.75rem', fontWeight: 700 }}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <code style={{ background: 'var(--surface-sunken)', padding: '2px 6px', borderRadius: 4 }}>
                            {log.table_name}
                          </code>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {String(log.record_id).slice(0, 16)}...
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => toggleExpand(log.id)}
                          >
                            {isExpanded ? 'Hide Diff ▲' : 'Inspect Diff ▼'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--surface-sunken)', padding: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: '0.8rem' }}>
                              <div>
                                <strong style={{ color: '#ef4444' }}>Before State:</strong>
                                <pre
                                  style={{
                                    background: 'var(--surface)',
                                    padding: 12,
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    overflowX: 'auto',
                                    marginTop: 6,
                                    maxHeight: 250,
                                  }}
                                >
                                  {log.before_data
                                    ? JSON.stringify(log.before_data, null, 2)
                                    : 'null (New Record Created)'}
                                </pre>
                              </div>
                              <div>
                                <strong style={{ color: '#10b981' }}>After State:</strong>
                                <pre
                                  style={{
                                    background: 'var(--surface)',
                                    padding: 12,
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    overflowX: 'auto',
                                    marginTop: 6,
                                    maxHeight: 250,
                                  }}
                                >
                                  {log.after_data
                                    ? JSON.stringify(log.after_data, null, 2)
                                    : 'null (Record Deleted)'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        className="alert alert-info"
        style={{ marginTop: 20, fontSize: '0.85rem', borderLeft: '4px solid #3b82f6' }}
      >
        🔒 <strong>PostgreSQL Security Invariant:</strong> Database triggers block <code>UPDATE</code> and <code>DELETE</code> operations on <code>audit_log</code>. History is strictly append-only and cannot be altered or purged by any user.
      </div>
    </div>
  );
}
