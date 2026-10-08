'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Party,
  Item,
  OrderHeader,
  OrderType,
  OrderStatus,
  GridLineItem,
} from '@/lib/api/types';
import {
  listOrders,
  createOrder,
  convertOrderToBill,
  updateOrderStatus,
  deleteOrder,
} from '@/lib/api/services';
import { formatRupee, formatDate } from '@/lib/format';
import { ItemEntryGrid } from './ItemEntryGrid';
import { QuickAddPartyDialog } from './QuickAddPartyDialog';
import { useSaveShortcut } from '@/lib/hooks/useSaveShortcut';
import { useBackspaceNavigationGuard } from '@/lib/hooks/useBackspaceNavigationGuard';
import {
  formatOrderShareMessage,
  buildWhatsAppShareUrl,
} from '@/lib/calculations/whatsapp-share';

interface OrdersViewProps {
  parties: Party[];
  items: Item[];
  role?: 'Owner' | 'Staff';
  onRefresh: () => void;
  onOpenSaleModal?: (prefilled?: any) => void;
  onOpenPurchaseModal?: (prefilled?: any) => void;
}

export function OrdersView({
  parties,
  items,
  role = 'Owner',
  onRefresh,
  onOpenSaleModal,
  onOpenPurchaseModal,
}: OrdersViewProps) {
  // Navigation tabs: SO vs PO
  const [orderType, setOrderType] = useState<OrderType>('SO');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [partyFilter, setPartyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Orders data
  const [orders, setOrders] = useState<OrderHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderHeader | null>(null);
  const [convertTarget, setConvertTarget] = useState<OrderHeader | null>(null);
  const [converting, setConverting] = useState(false);
  const [showQuickPartyModal, setShowQuickPartyModal] = useState(false);

  // Create Order Form State
  const relevantParties = useMemo(() => {
    if (orderType === 'SO') {
      return parties.filter((p) => p.type === 'CUSTOMER' || p.type === 'BOTH');
    }
    return parties.filter((p) => p.type === 'SUPPLIER' || p.type === 'BOTH');
  }, [parties, orderType]);

  const [orderPartyId, setOrderPartyId] = useState('');
  const [expectedDate, setExpectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [orderNotes, setOrderNotes] = useState('');
  const [gridLines, setGridLines] = useState<GridLineItem[]>([]);
  const [gridSubtotal, setGridSubtotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Keep selected party default valid
  useEffect(() => {
    if (relevantParties.length > 0 && !relevantParties.some((p) => p.id === orderPartyId)) {
      setOrderPartyId(relevantParties[0].id);
    }
  }, [relevantParties, orderPartyId]);

  // Load orders when type changes
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const data = await listOrders(
        orderType,
        statusFilter === 'ALL' ? undefined : statusFilter,
        partyFilter || undefined,
      );
      setOrders(data);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [orderType, statusFilter, partyFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Backspace guard on modals
  useBackspaceNavigationGuard(showCreateModal || !!convertTarget);

  // Summary Metrics
  const summary = useMemo(() => {
    let pendingCount = 0;
    let pendingAmount = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    for (const o of orders) {
      if (o.status === 'PENDING' || o.status === 'PARTIAL') {
        pendingCount++;
        pendingAmount += Number(o.total_amount || 0);
      } else if (o.status === 'COMPLETED') {
        completedCount++;
      } else if (o.status === 'CANCELLED') {
        cancelledCount++;
      }
    }

    return {
      total: orders.length,
      pendingCount,
      pendingAmount,
      completedCount,
      cancelledCount,
    };
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = `${o.order_no}`.includes(q);
        const matchParty = (o.party_name || '').toLowerCase().includes(q);
        const matchNotes = (o.notes || '').toLowerCase().includes(q);
        if (!matchNo && !matchParty && !matchNotes) return false;
      }
      return true;
    });
  }, [orders, searchQuery]);

  // Order calculation for form
  const orderGstAmount = useMemo(() => {
    const gstRate = 3.0;
    const subtotalPaise = Math.round(gridSubtotal * 100);
    const gstPaise = Math.round((subtotalPaise * gstRate) / 100);
    return gstPaise / 100;
  }, [gridSubtotal]);

  const orderGrandTotal = useMemo(() => {
    const subtotalPaise = Math.round(gridSubtotal * 100);
    const gstPaise = Math.round((subtotalPaise * 3.0) / 100);
    const exactTotalPaise = subtotalPaise + gstPaise;
    const roundedTotalPaise = Math.round(exactTotalPaise / 100) * 100;
    return roundedTotalPaise / 100;
  }, [gridSubtotal]);

  // Reset form
  const resetForm = () => {
    setGridLines([]);
    setGridSubtotal(0);
    setOrderNotes('');
    setExpectedDate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    });
    if (relevantParties[0]) {
      setOrderPartyId(relevantParties[0].id);
    }
  };

  // Submit Order Creation
  const handleCreateOrder = async () => {
    if (!orderPartyId) {
      alert('Please select a party');
      return;
    }
    const validLines = gridLines.filter(
      (l) => l.item_id && ((l.pieces && l.pieces > 0) || (l.weight_kg && l.weight_kg > 0)),
    );
    if (validLines.length === 0) {
      alert('Please enter at least one valid item line with quantity or weight.');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      await createOrder({
        type: orderType,
        party_id: orderPartyId,
        expected_delivery_date: expectedDate || undefined,
        notes: orderNotes || undefined,
        lines: validLines.map((l) => ({
          item_id: l.item_id,
          unit: l.unit,
          pieces: l.pieces || undefined,
          weight_kg: l.weight_kg || undefined,
          rate: l.rate,
          amount: l.amount,
        })),
      });

      setShowCreateModal(false);
      resetForm();
      setActionMessage(`✅ ${orderType === 'SO' ? 'Sales Order' : 'Purchase Order'} created successfully!`);
      setTimeout(() => setActionMessage(null), 4000);
      await loadOrders();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  // Save shortcut on create modal
  useSaveShortcut(handleCreateOrder, showCreateModal && !submitting);

  // Convert to Bill Handler (Req 6, 7)
  const handleConvertOrder = async (order: OrderHeader) => {
    setConverting(true);
    setActionError(null);
    try {
      const result = await convertOrderToBill(order.id, orderType);
      setConvertTarget(null);
      setActionMessage(
        `🎉 ${orderType === 'SO' ? 'Sales Order' : 'Purchase Order'} #${order.order_no} converted to Bill successfully!`,
      );
      setTimeout(() => setActionMessage(null), 5000);
      await loadOrders();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to convert order');
    } finally {
      setConverting(false);
    }
  };

  // Status update handler
  const handleStatusChange = async (order: OrderHeader, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(order.id, orderType, newStatus);
      await loadOrders();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update order status');
    }
  };

  // Delete handler (Owner only)
  const handleDeleteOrder = async (order: OrderHeader) => {
    if (!window.confirm(`Are you sure you want to delete ${orderType} #${order.order_no}?`)) return;
    try {
      await deleteOrder(order.id, orderType);
      await loadOrders();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete order');
    }
  };

  // WhatsApp share
  const handleShareWhatsApp = (order: OrderHeader) => {
    const text = formatOrderShareMessage({
      orderNo: order.order_no,
      orderType,
      partyName: order.party_name,
      totalAmount: order.total_amount,
      expectedDeliveryDate: order.expected_delivery_date,
      itemsSummary: `${order.lines_count || (order.lines ? order.lines.length : 1)} item line(s)`,
    });
    const url = buildWhatsAppShareUrl(order.party_phone || '', text);
    window.open(url, '_blank');
  };

  return (
    <div className="orders-view">
      {/* Top Banner Alert / Message */}
      {actionMessage && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          {actionError}
        </div>
      )}

      {/* View Header with SO / PO Tab Switcher */}
      <div className="view-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📋 Orders Module</span>
            <span className="badge badge-outline" style={{ fontSize: '0.8rem', fontWeight: 500 }}>
              Req 6 & 7 (Decoupled Non-Financial)
            </span>
          </h2>
          <p className="text-secondary" style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            Track commitments without impacting ledger balance or stock movements until conversion.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* SO / PO Switcher */}
          <div className="btn-group" style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button
              className={`btn ${orderType === 'SO' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, padding: '8px 16px', fontWeight: orderType === 'SO' ? 600 : 400 }}
              onClick={() => setOrderType('SO')}
            >
              🛍️ Sales Orders (SO)
            </button>
            <button
              className={`btn ${orderType === 'PO' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, padding: '8px 16px', fontWeight: orderType === 'PO' ? 600 : 400 }}
              onClick={() => setOrderType('PO')}
            >
              📦 Purchase Orders (PO)
            </button>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
          >
            + New {orderType === 'SO' ? 'Sales' : 'Purchase'} Order
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--primary)' }}>
          <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Total {orderType} Orders</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 4 }}>{summary.total}</div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid #f59e0b' }}>
          <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Pending / In Progress</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
            {summary.pendingCount}
          </div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid #10b981' }}>
          <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Pending Order Value</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', marginTop: 4 }}>
            {formatRupee(summary.pendingAmount)}
          </div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: '4px solid #3b82f6' }}>
          <div className="text-secondary" style={{ fontSize: '0.85rem' }}>Completed / Fulfilled</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#3b82f6', marginTop: 4 }}>
            {summary.completedCount}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Status Filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status:</span>
          {(['ALL', 'PENDING', 'PARTIAL', 'COMPLETED', 'CANCELLED'] as const).map((st) => (
            <button
              key={st}
              className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Party Filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="input-field"
            style={{ width: 180, padding: '6px 10px', fontSize: '0.85rem' }}
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
          >
            <option value="">All Parties</option>
            {relevantParties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Text Search */}
          <input
            type="text"
            className="input-field"
            placeholder="Search #no, party..."
            style={{ width: 200, padding: '6px 10px', fontSize: '0.85rem' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading {orderType === 'SO' ? 'sales' : 'purchase'} orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>
              No {orderType === 'SO' ? 'Sales' : 'Purchase'} Orders found.
            </p>
            <button
              className="btn btn-outline"
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
            >
              + Create First {orderType === 'SO' ? 'Sales' : 'Purchase'} Order
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Order #</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Party</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Delivery Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Lines</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Amount</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const isPending = order.status === 'PENDING' || order.status === 'PARTIAL';
                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        <span
                          style={{ cursor: 'pointer', color: 'var(--primary)' }}
                          onClick={() => setSelectedOrder(order)}
                        >
                          #{orderType}-{order.order_no}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.88rem' }}>
                        {formatDate(order.order_date)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{order.party_name}</div>
                        {order.party_phone && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {order.party_phone}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.88rem' }}>
                        {order.expected_delivery_date ? (
                          <span>{order.expected_delivery_date}</span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span className="badge badge-neutral">
                          {order.lines_count || (order.lines ? order.lines.length : 1)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                        {formatRupee(order.total_amount)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span
                          className={`badge ${
                            order.status === 'COMPLETED'
                              ? 'badge-success'
                              : order.status === 'PENDING'
                              ? 'badge-warning'
                              : order.status === 'PARTIAL'
                              ? 'badge-info'
                              : 'badge-neutral'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          {/* Convert to Bill Action (Req 6, 7) */}
                          {isPending && (
                            <button
                              className="btn btn-sm btn-primary"
                              title="Convert this order to Bill (posts ledger & stock movements)"
                              onClick={() => setConvertTarget(order)}
                            >
                              ⚡ Convert to Bill
                            </button>
                          )}

                          {/* WhatsApp Share */}
                          <button
                            className="btn btn-sm btn-outline"
                            title="Share order details on WhatsApp"
                            onClick={() => handleShareWhatsApp(order)}
                          >
                            📱
                          </button>

                          {/* View details */}
                          <button
                            className="btn btn-sm btn-ghost"
                            title="View details"
                            onClick={() => setSelectedOrder(order)}
                          >
                            👁️
                          </button>

                          {/* Status toggle for staff / owner */}
                          {order.status === 'PENDING' && (
                            <button
                              className="btn btn-sm btn-ghost"
                              title="Cancel order"
                              onClick={() => handleStatusChange(order, 'CANCELLED')}
                            >
                              ✕
                            </button>
                          )}

                          {/* Delete (Owner only) */}
                          {role === 'Owner' && (
                            <button
                              className="btn btn-sm btn-ghost text-danger"
                              title="Delete order"
                              onClick={() => handleDeleteOrder(order)}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- CREATE ORDER MODAL --- */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-container"
            style={{
              maxWidth: 900,
              width: '95%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>
                + New {orderType === 'SO' ? 'Sales Order (SO)' : 'Purchase Order (PO)'}
              </h3>
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>

            {/* Invariant Info Banner */}
            <div
              className="alert alert-info"
              style={{
                marginBottom: 16,
                fontSize: '0.88rem',
                borderLeft: '4px solid #3b82f6',
              }}
            >
              ℹ️ <strong>Commitment Invariant (Req 6 & 7):</strong> Orders do <em>not</em> deduct stock or create ledger entries. They track customer orders or supplier bookings until converted to a finalized Bill.
            </div>

            {/* Form Header Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '0.88rem' }}>
                  {orderType === 'SO' ? 'Customer (Alt+C)' : 'Supplier (Alt+S)'} *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="input-field"
                    style={{ flex: 1, padding: '8px 12px' }}
                    value={orderPartyId}
                    onChange={(e) => setOrderPartyId(e.target.value)}
                  >
                    {relevantParties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.whatsapp_number ? `(${p.whatsapp_number})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowQuickPartyModal(true)}
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '0.88rem' }}>
                  Expected Delivery Date
                </label>
                <input
                  type="date"
                  className="input-field"
                  style={{ width: '100%', padding: '8px 12px' }}
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: '0.88rem' }}>
                Specifications / Hallmarking / Delivery Notes
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. 22K 916 Hallmark required; deliver by festive eve..."
                style={{ width: '100%', padding: '8px 12px' }}
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
              />
            </div>

            {/* Item Entry Fast Grid */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                Order Items (Fast Grid — Tab/Enter to navigate, Alt+A to add row)
              </label>
              <ItemEntryGrid
                items={items}
                onChange={(lines, subtotal) => {
                  setGridLines(lines);
                  setGridSubtotal(subtotal);
                }}
              />
            </div>

            {/* Calculation Totals */}
            <div
              className="card"
              style={{
                padding: 16,
                background: 'var(--surface-sunken)',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
                marginBottom: 20,
              }}
            >
              <div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Items Subtotal</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatRupee(gridSubtotal)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>GST (3%)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatRupee(orderGstAmount)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Grand Total (Rupee Rounded)</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)' }}>
                  {formatRupee(orderGrandTotal)}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateOrder}
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save Order (Ctrl+S)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CONVERT TO BILL CONFIRMATION MODAL (Req 6, 7) --- */}
      {convertTarget && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-container"
            style={{
              maxWidth: 550,
              width: '90%',
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
            }}
          >
            <h3 style={{ margin: '0 0 12px 0' }}>
              ⚡ Convert {orderType} #{convertTarget.order_no} to {orderType === 'SO' ? 'Sale Bill' : 'Purchase Bill'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
              Converting this order will mark it as <strong>COMPLETED</strong> and fulfill the ordered items.
              Financial ledger entries and inventory stock movements will be immediately posted for party{' '}
              <strong>{convertTarget.party_name}</strong>.
            </p>

            <div
              style={{
                margin: '16px 0',
                padding: 12,
                borderRadius: 8,
                background: 'var(--surface-sunken)',
                fontSize: '0.88rem',
              }}
            >
              <div><strong>Party:</strong> {convertTarget.party_name}</div>
              <div><strong>Order Date:</strong> {formatDate(convertTarget.order_date)}</div>
              <div><strong>Items:</strong> {convertTarget.lines_count || (convertTarget.lines?.length || 1)} line(s)</div>
              <div><strong>Total Amount:</strong> {formatRupee(convertTarget.total_amount)}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConvertTarget(null)}
                disabled={converting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleConvertOrder(convertTarget)}
                disabled={converting}
              >
                {converting ? 'Converting...' : 'Confirm & Convert to Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ORDER DETAILS DRAWER / MODAL --- */}
      {selectedOrder && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-container"
            style={{
              maxWidth: 700,
              width: '90%',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>
                {orderType} #{selectedOrder.order_no} Details
              </h3>
              <button className="btn btn-ghost" onClick={() => setSelectedOrder(null)}>
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div><strong>Party:</strong> {selectedOrder.party_name}</div>
              <div><strong>Status:</strong> {selectedOrder.status}</div>
              <div><strong>Order Date:</strong> {formatDate(selectedOrder.order_date)}</div>
              <div><strong>Delivery Date:</strong> {selectedOrder.expected_delivery_date || '—'}</div>
              <div><strong>Created By:</strong> {selectedOrder.creator_name || 'Staff'}</div>
              <div><strong>Total Amount:</strong> {formatRupee(selectedOrder.total_amount)}</div>
            </div>

            {selectedOrder.notes && (
              <div style={{ marginBottom: 16, padding: 10, background: 'var(--surface-sunken)', borderRadius: 6 }}>
                <strong>Notes:</strong> {selectedOrder.notes}
              </div>
            )}

            {selectedOrder.lines && selectedOrder.lines.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Order Line Items</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Unit</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Qty / Wt</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.lines.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px' }}>{l.item_name || 'Item'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.unit}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          {l.unit === 'PCS' ? `${l.pieces || 0} pcs` : `${Number(l.weight_kg || 0).toFixed(3)} kg`}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatRupee(l.rate)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{formatRupee(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button
                className="btn btn-outline"
                onClick={() => handleShareWhatsApp(selectedOrder)}
              >
                📱 WhatsApp Share
              </button>
              {selectedOrder.status === 'PENDING' && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setSelectedOrder(null);
                    setConvertTarget(selectedOrder);
                  }}
                >
                  ⚡ Convert to Bill
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setSelectedOrder(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Party Modal */}
      <QuickAddPartyDialog
        isOpen={showQuickPartyModal}
        onClose={() => setShowQuickPartyModal(false)}
        initialType={orderType === 'SO' ? 'CUSTOMER' : 'SUPPLIER'}
        onPartyCreated={(newParty) => {
          onRefresh();
          setOrderPartyId(newParty.id);
        }}
      />
    </div>
  );
}
