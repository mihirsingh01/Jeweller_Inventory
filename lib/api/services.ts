import { apiClient } from './client';
import {
  User,
  Party,
  Item,
  BankAccount,
  Sale,
  Purchase,
  JobWorkEntry,
  MoneyVoucher,
  ReminderSettings,
  PaymentReminder,
  NotificationOutboxRow,
  AuditLogRow,
  DashboardStats,
  CreateItemDto,
  AdjustStockDto,
  StockMovement,
  OrderHeader,
  OrderLine,
  CreateOrderInput,
  OrderConvertResult,
  OrderType,
  OrderStatus,
} from './types';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';

// --- In-Memory Mock Store for interactive demo / offline mode ---
let mockUsers: User[] = [
  { id: 'u1', name: 'Mihir Sharma', username: 'mihir', role: 'OWNER', is_active: true, last_login_at: '2026-10-01T01:15:00Z', created_at: '2026-09-01T00:00:00Z' },
  { id: 'u2', name: 'Amit Verma', username: 'amit', role: 'STAFF', is_active: true, last_login_at: '2026-10-01T01:10:00Z', created_at: '2026-09-05T00:00:00Z' },
  { id: 'u3', name: 'Priya Patel', username: 'priya', role: 'STAFF', is_active: true, last_login_at: '2026-09-30T18:20:00Z', created_at: '2026-09-12T00:00:00Z' },
];

let mockParties: Party[] = [
  { id: 'p1', name: 'Rajasthan Jewellers', type: 'CUSTOMER', whatsapp_number: '+919829012345', address: 'Johri Bazaar, Jaipur', opening_balance: 125000, current_balance: 186500, is_active: true, created_at: '2026-09-01T00:00:00Z' },
  { id: 'p2', name: 'Mehta Gold Works', type: 'SUPPLIER', whatsapp_number: '+919829054321', address: 'Sarafa Bazaar, Meerut', opening_balance: -75000, current_balance: -94200, is_active: true, created_at: '2026-09-02T00:00:00Z' },
  { id: 'p3', name: 'Shree Balaji Arts', type: 'BOTH', whatsapp_number: '+919829098765', address: 'Zaveri Bazaar, Mumbai', opening_balance: 0, current_balance: 31800, is_active: true, created_at: '2026-09-03T00:00:00Z' },
  { id: 'p4', name: 'Kohinoor Exports', type: 'CUSTOMER', whatsapp_number: '+919829088888', address: 'Bandra West, Mumbai', opening_balance: 200000, current_balance: 275000, is_active: true, created_at: '2026-09-04T00:00:00Z' },
];

let mockItems: Item[] = [
  { id: 'i1', name: 'Gold 22K Plain Bangles', category: 'Gold Ornaments', code: 'GO22', allowed_units: 'BOTH', default_unit: 'KG', stock_pieces: 18, stock_kg: 0.425, is_active: true },
  { id: 'i2', name: 'Silver Traditional Payal 92.5', category: 'Silver Ornaments', code: 'SP92', allowed_units: 'BOTH', default_unit: 'KG', stock_pieces: 84, stock_kg: 8.640, is_active: true },
  { id: 'i3', name: 'Silver Heavy Kada 80T', category: 'Silver Ornaments', code: 'SB80', allowed_units: 'BOTH', default_unit: 'KG', stock_pieces: 32, stock_kg: 4.800, is_active: true },
  { id: 'i4', name: 'CZ Solitaire Ring Mountings', category: 'Diamond Studded', code: 'CZ', allowed_units: 'PCS', default_unit: 'PCS', stock_pieces: 4, stock_kg: 0.035, is_active: true },
  { id: 'i5', name: 'Gold Bracelet 22K', category: 'Gold Ornaments', code: 'GB22', allowed_units: 'BOTH', default_unit: 'KG', stock_pieces: 12, stock_kg: 0.280, is_active: true },
];

let mockStockMovements: StockMovement[] = [
  { id: 'sm_1', item_id: 'i1', entry_at: '2026-09-01T10:00:00Z', source_type: 'Opening Stock', pieces_delta: 20, kg_delta: 0.500, reference: 'Initial stock register balance' },
  { id: 'sm_2', item_id: 'i1', entry_at: '2026-09-30T10:30:00Z', source_type: 'Sale #1048', pieces_delta: -2, kg_delta: -0.075, reference: 'Customer invoice #1048' },
  { id: 'sm_3', item_id: 'i2', entry_at: '2026-09-01T10:00:00Z', source_type: 'Opening Stock', pieces_delta: 80, kg_delta: 8.200, reference: 'Initial stock register balance' },
  { id: 'sm_4', item_id: 'i2', entry_at: '2026-09-29T16:00:00Z', source_type: 'Purchase #5001', pieces_delta: 4, kg_delta: 0.440, reference: 'Supplier purchase #5001' },
  { id: 'sm_5', item_id: 'i3', entry_at: '2026-09-01T10:00:00Z', source_type: 'Opening Stock', pieces_delta: 32, kg_delta: 4.800, reference: 'Initial stock register balance' },
  { id: 'sm_6', item_id: 'i4', entry_at: '2026-09-01T10:00:00Z', source_type: 'Opening Stock', pieces_delta: 4, kg_delta: 0.035, reference: 'Initial stock register balance' },
  { id: 'sm_7', item_id: 'i5', entry_at: '2026-09-01T10:00:00Z', source_type: 'Opening Stock', pieces_delta: 12, kg_delta: 0.280, reference: 'Initial stock register balance' },
];

let mockBankAccounts: BankAccount[] = [
  { id: 'b1', name: 'HDFC Current A/C (..4012)', opening_balance: 450000, current_balance: 520000, is_active: true },
  { id: 'b2', name: 'SBI Trade Account (..8821)', opening_balance: 280000, current_balance: 356240, is_active: true },
];

let mockSales: Sale[] = [
  { id: 's1', bill_no: 1048, party_id: 'p1', party_name: 'Rajasthan Jewellers', party_phone: '+919829012345', entry_at: '2026-09-30T10:30:00Z', due_date: '2026-10-05', total_amount: 186500, allocated_amount: 50000, outstanding_amount: 136500, status: 'PARTIAL', created_by: 'u2', creator_name: 'Amit Verma' },
  { id: 's2', bill_no: 1047, party_id: 'p4', party_name: 'Kohinoor Exports', party_phone: '+919829088888', entry_at: '2026-09-24T14:15:00Z', due_date: '2026-09-26', total_amount: 275000, allocated_amount: 0, outstanding_amount: 275000, status: 'OPEN', created_by: 'u2', creator_name: 'Amit Verma' },
  { id: 's3', bill_no: 1046, party_id: 'p3', party_name: 'Shree Balaji Arts', party_phone: '+919829098765', entry_at: '2026-09-20T11:00:00Z', due_date: '2026-09-28', total_amount: 31800, allocated_amount: 31800, outstanding_amount: 0, status: 'PAID', created_by: 'u1', creator_name: 'Mihir Sharma' },
];

let mockPurchases: Purchase[] = [
  { id: 'pr1', bill_no: 5001, party_id: 'p2', party_name: 'Mehta Gold Works', party_phone: '+919829054321', entry_at: '2026-09-29T16:00:00Z', due_date: '2026-10-10', total_amount: 94200, status: 'OPEN', created_by: 'u1', creator_name: 'Mihir Sharma' },
];

let mockJobWork: JobWorkEntry[] = [
  { id: 'jw1', work_type: 'POLISH', party_id: 'p2', party_name: 'Mehta Gold Works', item_id: 'i2', item_name: 'Silver Traditional Payal 92.5', direction: 'ISSUE', weight_kg: 2.500, charge_amount: 0, entry_at: '2026-09-29T11:30:00Z', created_by: 'u2', creator_name: 'Amit Verma' },
  { id: 'jw2', work_type: 'MEENA', party_id: 'p3', party_name: 'Shree Balaji Arts', item_id: 'i1', item_name: 'Gold 22K Plain Bangles', direction: 'RECEIVE', weight_kg: 0.850, charge_amount: 4500, entry_at: '2026-09-30T15:20:00Z', created_by: 'u1', creator_name: 'Mihir Sharma' },
];

let mockVouchers: MoneyVoucher[] = [
  { id: 'v1', voucher_no: 2001, kind: 'RECEIPT', party_id: 'p1', party_name: 'Rajasthan Jewellers', mode: 'BANK', bank_account_id: 'b1', bank_name: 'HDFC Current A/C (..4012)', amount: 50000, reference_no: 'IMPS-987211', entry_at: '2026-09-30T17:00:00Z', created_by: 'u2', creator_name: 'Amit Verma' },
];

let mockSettings: ReminderSettings = {
  id: 1,
  repeat_days: 3,
  send_time: '10:00',
  owner_whatsapp: '+919690000000',
  is_active: true,
};

let mockReminders: PaymentReminder[] = [
  {
    id: 'rem-1',
    party_id: 'p1',
    party_name: 'Rajasthan Jewellers',
    party_type: 'CUSTOMER',
    party_phone: '••••••4012',
    sale_id: 's2',
    sale_bill_no: 1047,
    sale_total: 275000,
    reminder_date: '2026-09-26',
    amount: 275000,
    notes: 'Invoice #1047 overdue payment follow-up',
    status: 'PENDING',
    created_by: 'u1',
    creator_name: 'Mihir Sharma',
    created_at: '2026-09-18T10:00:00Z',
  },
  {
    id: 'rem-2',
    party_id: 'p2',
    party_name: 'Omkar Bullion Mart',
    party_type: 'SUPPLIER',
    party_phone: '••••••8821',
    purchase_id: 'pu1',
    purchase_bill_no: 1008,
    purchase_total: 485000,
    reminder_date: '2026-10-10',
    amount: 485000,
    notes: 'Purchase settlement reminder',
    status: 'PENDING',
    created_by: 'u1',
    creator_name: 'Mihir Sharma',
    created_at: '2026-09-28T11:00:00Z',
  },
];

let mockOutbox: NotificationOutboxRow[] = [
  {
    id: 1,
    event_type: 'SALE_CREATED',
    entity_type: 'SALE',
    entity_id: 's2',
    recipient_phone: '+919876543210',
    payload: { bill_no: 1047, customer_name: 'Rajasthan Jewellers', amount: 275000 },
    status: 'SENT',
    created_at: '2026-09-18T10:00:00Z',
    processed_at: '2026-09-18T10:00:02Z',
  },
  {
    id: 2,
    event_type: 'VOUCHER_CREATED',
    entity_type: 'VOUCHER',
    entity_id: 'v1',
    recipient_phone: '+919876543210',
    payload: { voucher_no: 2001, kind: 'RECEIPT', amount: 50000 },
    status: 'SENT',
    created_at: '2026-09-30T17:00:00Z',
    processed_at: '2026-09-30T17:00:03Z',
  },
  {
    id: 3,
    event_type: 'REMINDER_ALERT',
    entity_type: 'REMINDER',
    entity_id: 'rem-1',
    recipient_phone: '+919876543210',
    payload: { customer_name: 'Rajasthan Jewellers', bill_no: '1047', days_overdue: '3' },
    status: 'FAILED',
    created_at: '2026-10-01T10:00:00Z',
    processed_at: '2026-10-01T10:00:05Z',
    error_message: 'Mock simulation: recipient rate limited',
  },
];

let mockAuditLogs: AuditLogRow[] = [
  { id: 101, actor_id: 'u1', actor_name: 'Mihir Sharma', action: 'CREATE', table_name: 'users', record_id: 'u2', after_data: { username: 'amit', role: 'STAFF' }, at: '2026-09-05T10:00:00Z' },
  { id: 102, actor_id: 'u1', actor_name: 'Mihir Sharma', action: 'UPDATE_SETTINGS', table_name: 'reminder_settings', record_id: '1', before_data: { repeat_days: 5 }, after_data: { repeat_days: 3 }, at: '2026-09-20T12:00:00Z' },
];

let mockOrders: OrderHeader[] = [
  {
    id: 'so-101',
    order_type: 'SO',
    order_no: 101,
    order_date: '2026-10-02T11:00:00Z',
    party_id: 'p1',
    party_name: 'Rajasthan Jewellers',
    party_type: 'CUSTOMER',
    party_phone: '+919829012345',
    expected_delivery_date: '2026-10-15',
    status: 'PENDING',
    subtotal: 154000,
    taxable_amount: 154000,
    gst_rate: 3,
    gst_amount: 4620,
    round_off: 0,
    total_amount: 158620,
    notes: 'Advance booking for Diwali festive collection',
    created_by: 'u1',
    creator_name: 'Mihir Sharma',
    lines_count: 1,
    lines: [
      {
        id: 'sol-1',
        order_id: 'so-101',
        item_id: 'i1',
        item_name: 'Gold 22K Plain Bangles',
        item_code: 'GO22',
        unit: 'KG',
        weight_kg: 0.020,
        rate: 7700000,
        amount: 154000,
        fulfilled_weight_kg: 0,
      },
    ],
  },
  {
    id: 'po-201',
    order_type: 'PO',
    order_no: 201,
    order_date: '2026-10-03T14:30:00Z',
    party_id: 'p2',
    party_name: 'Mehta Gold Works',
    party_type: 'SUPPLIER',
    party_phone: '+919829054321',
    expected_delivery_date: '2026-10-12',
    status: 'PENDING',
    subtotal: 75000,
    taxable_amount: 75000,
    gst_rate: 3,
    gst_amount: 2250,
    round_off: 0,
    total_amount: 77250,
    notes: 'Raw silver ingot order 1kg',
    created_by: 'u1',
    creator_name: 'Mihir Sharma',
    lines_count: 1,
    lines: [
      {
        id: 'pol-1',
        order_id: 'po-201',
        item_id: 'i2',
        item_name: 'Silver Traditional Payal 92.5',
        item_code: 'SP92',
        unit: 'KG',
        weight_kg: 1.000,
        rate: 75000,
        amount: 75000,
        fulfilled_weight_kg: 0,
      },
    ],
  },
];

// --- Services ---

export async function getDashboard(): Promise<DashboardStats> {
  if (USE_MOCK) {
    return {
      totalReceivable: 1284500,
      totalPayable: 642800,
      overdueAmount: 275000,
      overdueCount: 1,
      todaySales: 186500,
      todayPurchases: 94200,
      cashBalance: 214680,
      bankBalance: 876240,
      topCustomersByDues: [
        { id: 'p4', customer_name: 'Kohinoor Exports', pending_amount: 275000, whatsapp_number: '+919829088888' },
        { id: 'p1', customer_name: 'Rajasthan Jewellers', pending_amount: 136500, whatsapp_number: '+919829012345' },
      ],
      lowStockItems: [
        { id: 'i4', name: 'CZ Solitaire Ring Mountings', category: 'Diamond Studded', pieces: 4, weight_kg: 0.035 },
      ],
      recentEntries: [
        { id: 's1', type: 'Sale', party_name: 'Rajasthan Jewellers', amount: 186500, entry_at: '2026-09-30T10:30:00Z', creator_name: 'Amit Verma' },
        { id: 'pr1', type: 'Purchase', party_name: 'Mehta Gold Works', amount: 94200, entry_at: '2026-09-29T16:00:00Z', creator_name: 'Mihir Sharma' },
        { id: 'v1', type: 'Receipt', party_name: 'Rajasthan Jewellers', amount: 50000, entry_at: '2026-09-30T17:00:00Z', creator_name: 'Amit Verma' },
      ],
    };
  }
  return apiClient<DashboardStats>('/dashboard/metrics');
}

export async function listParties(search?: string, type?: string): Promise<Party[]> {
  if (USE_MOCK) {
    return mockParties.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (type && p.type !== type && p.type !== 'BOTH') return false;
      return true;
    });
  }
  const q = new URLSearchParams();
  if (search) q.append('search', search);
  if (type) q.append('type', type);
  return apiClient<Party[]>(`/parties?${q.toString()}`);
}

export async function createParty(dto: {
  name: string;
  type: string;
  whatsapp_number?: string;
  address?: string;
  work_types?: string;
  opening_balance?: number;
}): Promise<Party> {
  if (USE_MOCK) {
    const newP: Party = {
      id: `p_${Date.now()}`,
      name: dto.name,
      type: dto.type as any,
      whatsapp_number: dto.whatsapp_number,
      address: dto.address,
      work_types: dto.work_types,
      opening_balance: dto.opening_balance || 0,
      current_balance: dto.opening_balance || 0,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    mockParties.push(newP);
    return newP;
  }
  return apiClient<Party>('/parties', { method: 'POST', body: JSON.stringify(dto) });
}

export async function getParty(id: string, revealPhone = false): Promise<Party> {
  if (USE_MOCK) {
    const p = mockParties.find((party) => party.id === id);
    if (!p) throw new Error('Party not found');
    return p;
  }
  return apiClient<Party>(`/parties/${id}${revealPhone ? '?reveal_phone=true' : ''}`);
}

export async function listItems(search?: string): Promise<Item[]> {
  if (USE_MOCK) {
    return mockItems.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  }
  return apiClient<Item[]>(`/items${search ? `?search=${encodeURIComponent(search)}` : ''}`);
}

export async function createItem(dto: CreateItemDto): Promise<Item> {
  const pieces = Number(dto.stock_pieces) || 0;
  const kg = Math.round((Number(dto.stock_kg) || 0) * 1000) / 1000;

  if (USE_MOCK) {
    const newItem: Item = {
      id: `i_${Date.now()}`,
      name: dto.name.trim(),
      category: dto.category || 'Gold Ornaments',
      stock_pieces: pieces,
      stock_kg: kg,
      is_active: true,
    };
    mockItems.push(newItem);

    if (pieces > 0 || kg > 0) {
      mockStockMovements.unshift({
        id: `sm_${Date.now()}`,
        item_id: newItem.id,
        entry_at: new Date().toISOString(),
        source_type: 'Opening Stock',
        pieces_delta: pieces,
        kg_delta: kg,
        reference: 'Initial stock register balance',
      });
    }

    return newItem;
  }
  return apiClient<Item>('/items', {
    method: 'POST',
    body: JSON.stringify({
      ...dto,
      opening_pieces: pieces,
      opening_weight_kg: kg,
    }),
  });
}

export async function adjustStock(dto: AdjustStockDto): Promise<{ success: boolean; item?: Item }> {
  const piecesDelta = Number(dto.pieces_delta) || 0;
  const kgDelta = Math.round((Number(dto.kg_delta) || 0) * 1000) / 1000;

  if (USE_MOCK) {
    const item = mockItems.find((i) => i.id === dto.item_id);
    if (!item) throw new Error('Item not found');

    item.stock_pieces = Math.max(0, item.stock_pieces + piecesDelta);
    item.stock_kg = Math.max(0, Math.round((item.stock_kg + kgDelta) * 1000) / 1000);

    mockStockMovements.unshift({
      id: `sm_${Date.now()}`,
      item_id: item.id,
      entry_at: new Date().toISOString(),
      source_type: piecesDelta >= 0 && kgDelta >= 0 ? 'Stock Addition' : 'Stock Adjustment',
      pieces_delta: piecesDelta,
      kg_delta: kgDelta,
      reference: dto.reason || (piecesDelta >= 0 ? 'Manual Stock Inward' : 'Manual Stock Deduction'),
    });

    return { success: true, item };
  }
  return apiClient('/stock/adjust', { method: 'POST', body: JSON.stringify(dto) });
}

export async function getItemMovements(itemId: string): Promise<StockMovement[]> {
  if (USE_MOCK) {
    return mockStockMovements.filter((sm) => sm.item_id === itemId);
  }
  const res = await apiClient<any>(`/stock/movements/${itemId}`);
  return res.movements || [];
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  if (USE_MOCK) return mockBankAccounts;
  return apiClient<BankAccount[]>('/bank-accounts');
}

export async function listSales(partyId?: string): Promise<Sale[]> {
  if (USE_MOCK) {
    return mockSales.filter((s) => !partyId || s.party_id === partyId);
  }
  return apiClient<Sale[]>(`/sales${partyId ? `?party_id=${partyId}` : ''}`);
}

export async function getSale(id: string): Promise<Sale> {
  if (USE_MOCK) {
    const sale = mockSales.find((s) => s.id === id);
    if (!sale) throw new Error('Sale not found');
    return sale;
  }
  return apiClient<Sale>(`/sales/${id}`);
}

export async function createSale(dto: any): Promise<Sale> {
  if (USE_MOCK) {
    const party = mockParties.find((p) => p.id === dto.party_id);
    let lineSubtotal = 0;
    const lines = dto.lines.map((l: any) => {
      const amt = l.amount || (l.weight_kg > 0 ? l.weight_kg * l.rate : l.pieces * l.rate);
      lineSubtotal += amt;
      const item = mockItems.find((i) => i.id === l.item_id);
      return { ...l, amount: amt, item_name: item?.name || 'Item' };
    });

    const grandTotal = dto.total_amount ?? lineSubtotal;
    const balanceBefore = party?.current_balance ?? party?.opening_balance ?? 0;
    const balanceAfter = balanceBefore + grandTotal;

    if (party) {
      party.current_balance = balanceAfter;
    }

    const newSale: Sale = {
      id: `s_${Date.now()}`,
      bill_no: 1049 + mockSales.length,
      party_id: dto.party_id,
      party_name: party?.name || 'Customer',
      party_phone: party?.whatsapp_number,
      entry_at: new Date().toISOString(),
      due_date: dto.due_date,
      subtotal: dto.subtotal ?? lineSubtotal,
      discount_type: dto.discount_type || 'AMOUNT',
      discount_value: dto.discount_value || 0,
      discount_amount: dto.discount_amount || 0,
      taxable_amount: dto.taxable_amount ?? lineSubtotal,
      gst_rate: dto.gst_rate ?? 3.0,
      gst_amount: dto.gst_amount || 0,
      transport_charges: dto.transport_charges || 0,
      packaging_charges: dto.packaging_charges || 0,
      other_charges: dto.other_charges || 0,
      round_off: dto.round_off || 0,
      total_amount: grandTotal,
      balance_before: balanceBefore,
      this_bill: grandTotal,
      balance_after: balanceAfter,
      outstanding_amount: grandTotal,
      allocated_amount: 0,
      status: 'OPEN',
      notes: dto.notes,
      created_by: 'u2',
      creator_name: 'Amit Verma',
      lines,
      reminder: dto.reminder,
    };
    mockSales.unshift(newSale);

    lines.forEach((l: any) => {
      const item = mockItems.find((i) => i.id === l.item_id);
      if (item) {
        item.stock_pieces = Math.max(0, item.stock_pieces - (l.pieces || 0));
        item.stock_kg = Math.max(0, Math.round((item.stock_kg - (l.weight_kg || 0)) * 1000) / 1000);
        mockStockMovements.unshift({
          id: `sm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          item_id: item.id,
          entry_at: new Date().toISOString(),
          source_type: `Sale #${newSale.bill_no}`,
          pieces_delta: -(l.pieces || 0),
          kg_delta: -(l.weight_kg || 0),
          reference: `Customer: ${party?.name || ''}`,
        });
      }
    });

    return newSale;
  }
  return apiClient<Sale>('/sales', { method: 'POST', body: JSON.stringify(dto) });
}

export async function deleteSale(id: string): Promise<any> {
  if (USE_MOCK) {
    mockSales = mockSales.filter((s) => s.id !== id);
    return { success: true };
  }
  return apiClient(`/sales/${id}`, { method: 'DELETE' });
}

export async function listPurchases(): Promise<Purchase[]> {
  if (USE_MOCK) return mockPurchases;
  return apiClient<Purchase[]>('/purchases');
}

export async function getPurchase(id: string): Promise<Purchase> {
  if (USE_MOCK) {
    const purchase = mockPurchases.find((p) => p.id === id);
    if (!purchase) throw new Error('Purchase entry not found');
    return purchase;
  }
  return apiClient<Purchase>(`/purchases/${id}`);
}

export async function deletePurchase(id: string): Promise<any> {
  if (USE_MOCK) {
    mockPurchases = mockPurchases.filter((p) => p.id !== id);
    return { success: true };
  }
  return apiClient(`/purchases/${id}`, { method: 'DELETE' });
}

export async function createPurchase(dto: any): Promise<Purchase> {
  if (USE_MOCK) {
    const party = mockParties.find((p) => p.id === dto.party_id);
    const subtotal = dto.subtotal || dto.lines.reduce((acc: number, l: any) => {
      return acc + (l.amount || (l.weight_kg > 0 ? l.weight_kg * l.rate : l.pieces * l.rate));
    }, 0);

    const discountAmount = dto.discount_amount || 0;
    const taxableAmount = dto.taxable_amount || Math.max(0, subtotal - discountAmount);
    const gstAmount = dto.gst_amount || 0;
    const transportCharges = dto.transport_charges || 0;
    const packagingCharges = dto.packaging_charges || 0;
    const otherCharges = dto.other_charges || 0;
    const roundOff = dto.round_off || 0;
    const grandTotal = dto.total_amount || (taxableAmount + gstAmount + transportCharges + packagingCharges + otherCharges + roundOff);

    const prevBal = party ? party.current_balance ?? party.opening_balance : 0;
    const closingBal = prevBal + grandTotal;

    const newP: Purchase = {
      id: `pr_${Date.now()}`,
      bill_no: 5002 + mockPurchases.length,
      party_id: dto.party_id,
      party_name: party?.name || 'Supplier',
      party_phone: party?.whatsapp_number,
      entry_at: new Date().toISOString(),
      due_date: dto.due_date,
      subtotal,
      discount_type: dto.discount_type || 'PERCENT',
      discount_value: dto.discount_value || 0,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      gst_rate: dto.gst_rate || 3.0,
      gst_amount: gstAmount,
      transport_charges: transportCharges,
      packaging_charges: packagingCharges,
      other_charges: otherCharges,
      round_off: roundOff,
      total_amount: grandTotal,
      balance_before: prevBal,
      this_purchase: grandTotal,
      balance_after: closingBal,
      status: 'OPEN',
      notes: dto.notes,
      narration: dto.narration,
      created_by: 'u1',
      creator_name: 'Mihir Sharma',
      lines: dto.lines.map((l: any) => {
        const item = mockItems.find((i) => i.id === l.item_id);
        return {
          ...l,
          item_name: item?.name || 'Item',
        };
      }),
      reminder: dto.reminder,
    };
    mockPurchases.unshift(newP);

    if (party) {
      party.current_balance = closingBal;
    }

    dto.lines.forEach((l: any) => {
      const item = mockItems.find((i) => i.id === l.item_id);
      if (item) {
        item.stock_pieces += (l.pieces || 0);
        item.stock_kg = Math.round((item.stock_kg + (l.weight_kg || 0)) * 1000) / 1000;
        mockStockMovements.unshift({
          id: `sm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          item_id: item.id,
          entry_at: new Date().toISOString(),
          source_type: `Purchase #${newP.bill_no}`,
          pieces_delta: +(l.pieces || 0),
          kg_delta: +(l.weight_kg || 0),
          reference: `Supplier: ${party?.name || ''}`,
        });
      }
    });

    return newP;
  }
  return apiClient<Purchase>('/purchases', { method: 'POST', body: JSON.stringify(dto) });
}

export async function listJobWork(workType?: string): Promise<JobWorkEntry[]> {
  if (USE_MOCK) {
    if (workType) return mockJobWork.filter((j) => j.work_type === workType);
    return mockJobWork;
  }
  return apiClient<JobWorkEntry[]>(`/job-work${workType ? `?work_type=${workType}` : ''}`);
}

export async function getJobWork(id: string): Promise<JobWorkEntry> {
  if (USE_MOCK) {
    const jw = mockJobWork.find((j) => j.id === id);
    if (!jw) throw new Error('Job work entry not found');
    return jw;
  }
  return apiClient<JobWorkEntry>(`/job-work/${id}`);
}

export async function getPendingJobWorkLines(partyId: string, workType?: string): Promise<PendingJobWorkLine[]> {
  if (USE_MOCK) {
    const pendingList: PendingJobWorkLine[] = [];
    const issues = mockJobWork.filter((j) => j.party_id === partyId && j.direction === 'ISSUE' && (!workType || j.work_type === workType));
    const receives = mockJobWork.filter((j) => j.party_id === partyId && j.direction === 'RECEIVE');

    for (const issue of issues) {
      if (!issue.lines || issue.lines.length === 0) {
        // Fallback for legacy mock item
        const item = mockItems.find((i) => i.id === issue.item_id);
        const sentKg = issue.weight_kg || 0;
        let receivedKg = 0;
        for (const r of receives) {
          if (r.item_id === issue.item_id) receivedKg += (r.weight_kg || 0);
        }
        const pendingKg = Math.max(0, Math.round((sentKg - receivedKg) * 1000) / 1000);
        if (pendingKg > 0) {
          pendingList.push({
            issue_line_id: `jl_${issue.id}_1`,
            job_work_id: issue.id,
            entry_no: issue.entry_no || 3001,
            work_type: issue.work_type,
            entry_at: issue.entry_at,
            item_id: issue.item_id || 'i1',
            item_name: item?.name || 'Jewellery Item',
            item_code: item?.code,
            unit: 'KG',
            sent_pieces: 0,
            sent_weight_kg: sentKg,
            already_received_pieces: 0,
            already_received_weight_kg: receivedKg,
            pending_pieces: 0,
            pending_weight_kg: pendingKg,
          });
        }
      } else {
        for (const line of issue.lines) {
          if (line.is_closed) continue;
          const item = mockItems.find((i) => i.id === line.item_id);
          let recvPcs = 0;
          let recvKg = 0;
          for (const r of receives) {
            for (const rl of (r.lines || [])) {
              if (rl.issue_line_id === line.id) {
                recvPcs += (rl.pieces || 0);
                recvKg += (rl.weight_kg || 0);
              }
            }
          }
          const pendPcs = Math.max(0, (line.pieces || 0) - recvPcs);
          const pendKg = Math.max(0, Math.round(((line.weight_kg || 0) - recvKg) * 1000) / 1000);
          if (pendPcs > 0 || pendKg > 0) {
            pendingList.push({
              issue_line_id: line.id || `jl_${issue.id}`,
              job_work_id: issue.id,
              entry_no: issue.entry_no || 3001,
              work_type: issue.work_type,
              entry_at: issue.entry_at,
              item_id: line.item_id,
              item_name: item?.name || line.item_name || 'Item',
              item_code: item?.code || line.item_code,
              unit: line.unit || 'KG',
              sent_pieces: line.pieces || 0,
              sent_weight_kg: line.weight_kg || 0,
              already_received_pieces: recvPcs,
              already_received_weight_kg: recvKg,
              pending_pieces: pendPcs,
              pending_weight_kg: pendKg,
            });
          }
        }
      }
    }
    return pendingList;
  }
  return apiClient<PendingJobWorkLine[]>(`/job-work/pending/${partyId}${workType ? `?work_type=${workType}` : ''}`);
}

export async function deleteJobWork(id: string): Promise<any> {
  if (USE_MOCK) {
    mockJobWork = mockJobWork.filter((j) => j.id !== id);
    return { success: true };
  }
  return apiClient(`/job-work/${id}`, { method: 'DELETE' });
}

export async function createJobWork(dto: any): Promise<JobWorkEntry> {
  if (USE_MOCK) {
    const party = mockParties.find((p) => p.id === dto.party_id);
    const lines = dto.lines || (dto.item_id ? [{
      id: `jl_${Date.now()}`,
      item_id: dto.item_id,
      unit: 'KG',
      pieces: 0,
      weight_kg: dto.weight_kg || 0,
      labour_charge: dto.charge_amount || 0,
    }] : []);

    let totalWeight = 0;
    let totalLabour = 0;
    lines.forEach((l: any) => {
      totalWeight += Number(l.weight_kg) || 0;
      totalLabour += Number(l.labour_charge) || 0;
    });

    const prevBal = party ? party.current_balance ?? party.opening_balance : 0;
    const closingBal = dto.direction === 'RECEIVE' ? prevBal + totalLabour : prevBal;

    const newJw: JobWorkEntry = {
      id: `jw_${Date.now()}`,
      entry_no: 3001 + mockJobWork.length,
      work_type: dto.work_type,
      party_id: dto.party_id,
      party_name: party?.name || 'Karigar',
      direction: dto.direction,
      issue_id: dto.issue_id,
      weight_kg: Math.round(totalWeight * 1000) / 1000,
      charge_amount: totalLabour,
      total_labour_charge: totalLabour,
      balance_before: prevBal,
      this_labour: totalLabour,
      balance_after: closingBal,
      entry_at: new Date().toISOString(),
      notes: dto.notes,
      created_by: 'u2',
      creator_name: 'Amit Verma',
      lines: lines.map((l: any, i: number) => {
        const item = mockItems.find((it) => it.id === l.item_id);
        return {
          id: l.id || `jl_${Date.now()}_${i}`,
          issue_line_id: l.issue_line_id,
          item_id: l.item_id,
          item_name: item?.name || 'Item',
          item_code: item?.code,
          unit: l.unit || 'KG',
          pieces: l.pieces || 0,
          weight_kg: l.weight_kg || 0,
          labour_charge: l.labour_charge || 0,
          is_closed: l.is_closed || false,
          notes: l.notes,
        };
      }),
    };
    mockJobWork.unshift(newJw);

    if (party && dto.direction === 'RECEIVE' && totalLabour > 0) {
      party.current_balance = closingBal;
    }

    // Stock movements
    lines.forEach((l: any) => {
      const item = mockItems.find((it) => it.id === l.item_id);
      if (item) {
        const isIssue = dto.direction === 'ISSUE';
        const weightDelta = isIssue ? -(l.weight_kg || 0) : +(l.weight_kg || 0);
        const piecesDelta = isIssue ? -(l.pieces || 0) : +(l.pieces || 0);

        item.stock_pieces = Math.max(0, item.stock_pieces + piecesDelta);
        item.stock_kg = Math.max(0, Math.round((item.stock_kg + weightDelta) * 1000) / 1000);

        mockStockMovements.unshift({
          id: `sm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          item_id: item.id,
          entry_at: new Date().toISOString(),
          source_type: `${dto.work_type}_${dto.direction}`,
          pieces_delta: piecesDelta,
          kg_delta: weightDelta,
          reference: `Karigar: ${party?.name || ''} (${dto.direction})`,
        });
      }
    });

    return newJw;
  }
  return apiClient<JobWorkEntry>('/job-work', { method: 'POST', body: JSON.stringify(dto) });
}

export async function listVouchers(): Promise<MoneyVoucher[]> {
  if (USE_MOCK) return mockVouchers;
  return apiClient<MoneyVoucher[]>('/vouchers');
}

export async function createVoucher(dto: any): Promise<MoneyVoucher> {
  if (USE_MOCK) {
    const party = mockParties.find((p) => p.id === dto.party_id);
    const bank = mockBankAccounts.find((b) => b.id === dto.bank_account_id);
    const newV: MoneyVoucher = {
      id: `v_${Date.now()}`,
      voucher_no: 2002 + mockVouchers.length,
      kind: dto.kind,
      party_id: dto.party_id,
      party_name: party?.name || 'Party',
      party_type: party?.type,
      mode: dto.mode,
      bank_account_id: dto.bank_account_id,
      bank_name: bank?.name,
      amount: dto.amount,
      reference_no: dto.reference_no,
      notes: dto.notes,
      idempotency_key: dto.idempotency_key,
      entry_at: new Date().toISOString(),
      created_by: 'u2',
      creator_name: 'Amit Verma',
    };
    mockVouchers.unshift(newV);

    // Apply allocations to mock sales
    if (dto.allocations && dto.allocations.length > 0) {
      dto.allocations.forEach((alloc: any) => {
        const s = mockSales.find((sale) => sale.id === alloc.sale_id);
        if (s) {
          s.allocated_amount = (s.allocated_amount || 0) + alloc.amount;
          s.outstanding_amount = Math.max(0, s.total_amount - (s.allocated_amount || 0));
          s.status = s.outstanding_amount === 0 ? 'PAID' : 'PARTIAL';
        }
      });
    }

    return newV;
  }
  return apiClient<MoneyVoucher>('/vouchers', { method: 'POST', body: JSON.stringify(dto) });
}

export async function listStaff(): Promise<User[]> {
  if (USE_MOCK) return mockUsers.filter((u) => u.role === 'STAFF');
  return apiClient<User[]>('/staff');
}

export async function createStaff(dto: { name: string; username: string; password?: string }): Promise<User> {
  if (USE_MOCK) {
    const newU: User = {
      id: `u_${Date.now()}`,
      name: dto.name,
      username: dto.username,
      role: 'STAFF',
      is_active: true,
      created_at: new Date().toISOString(),
    };
    mockUsers.push(newU);
    return newU;
  }
  return apiClient<User>('/staff', { method: 'POST', body: JSON.stringify(dto) });
}

export async function toggleStaffActive(id: string, isActive: boolean): Promise<any> {
  if (USE_MOCK) {
    const user = mockUsers.find((u) => u.id === id);
    if (user) user.is_active = isActive;
    return { success: true };
  }
  return apiClient(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  if (USE_MOCK) return mockSettings;
  return apiClient<ReminderSettings>('/reminders/settings');
}

export async function updateReminderSettings(dto: Partial<ReminderSettings>): Promise<ReminderSettings> {
  if (USE_MOCK) {
    mockSettings = { ...mockSettings, ...dto };
    return mockSettings;
  }
  return apiClient<ReminderSettings>('/reminders/settings', { method: 'PATCH', body: JSON.stringify(dto) });
}

export async function triggerDailyReminders(): Promise<any> {
  if (USE_MOCK) {
    return {
      success: true,
      overdueBillsFound: 1,
      customerMessagesSent: 1,
      customersCount: 1,
      grandTotalOverdue: 275000,
    };
  }
  return apiClient('/reminders/trigger', { method: 'POST' });
}

export async function listReminders(query?: {
  filter?: string;
  status?: string;
  party_id?: string;
}): Promise<PaymentReminder[]> {
  if (USE_MOCK) {
    let list = [...mockReminders];
    if (query?.party_id) {
      list = list.filter((r) => r.party_id === query.party_id);
    }
    if (query?.status) {
      list = list.filter((r) => r.status === query.status);
    }
    const today = new Date().toISOString().split('T')[0];
    if (query?.filter === 'TODAY') {
      list = list.filter((r) => r.reminder_date === today);
    } else if (query?.filter === 'OVERDUE') {
      list = list.filter(
        (r) => r.reminder_date < today && (r.status === 'PENDING' || r.status === 'SENT'),
      );
    } else if (query?.filter === 'UPCOMING') {
      list = list.filter(
        (r) => r.reminder_date > today && (r.status === 'PENDING' || r.status === 'SENT'),
      );
    } else if (query?.filter === 'COMPLETED') {
      list = list.filter((r) => r.status === 'COMPLETED');
    }
    return list;
  }
  const params = new URLSearchParams();
  if (query?.filter) params.append('filter', query.filter);
  if (query?.status) params.append('status', query.status);
  if (query?.party_id) params.append('party_id', query.party_id);
  const qStr = params.toString();
  return apiClient<PaymentReminder[]>(`/reminders${qStr ? `?${qStr}` : ''}`);
}

export async function createManualReminder(dto: {
  party_id: string;
  reminder_date: string;
  amount: number;
  notes?: string;
}): Promise<PaymentReminder> {
  if (USE_MOCK) {
    const party = mockParties.find((p) => p.id === dto.party_id);
    const newR: PaymentReminder = {
      id: `rem_${Date.now()}`,
      party_id: dto.party_id,
      party_name: party?.name,
      party_type: party?.type,
      party_phone: party?.whatsapp_number,
      reminder_date: dto.reminder_date,
      amount: dto.amount,
      notes: dto.notes,
      status: 'PENDING',
      created_by: 'u1',
      creator_name: 'Mihir Sharma',
      created_at: new Date().toISOString(),
    };
    mockReminders.unshift(newR);
    return newR;
  }
  return apiClient<PaymentReminder>('/reminders', { method: 'POST', body: JSON.stringify(dto) });
}

export async function updateReminderStatus(
  id: string,
  status: 'PENDING' | 'SENT' | 'COMPLETED' | 'CANCELLED' | 'DISMISSED',
): Promise<PaymentReminder> {
  if (USE_MOCK) {
    const r = mockReminders.find((item) => item.id === id);
    if (r) {
      r.status = status;
      r.updated_at = new Date().toISOString();
      return r;
    }
    throw new Error('Reminder not found');
  }
  return apiClient<PaymentReminder>(`/reminders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export interface AuditLogFilter {
  actor_id?: string;
  table_name?: string;
  action?: string;
  record_id?: string;
  startDate?: string;
  endDate?: string;
}

export async function listAuditLog(filter?: AuditLogFilter): Promise<AuditLogRow[]> {
  if (USE_MOCK) {
    let list = [...mockAuditLogs];
    if (filter?.action) list = list.filter((l) => l.action === filter.action);
    if (filter?.table_name) list = list.filter((l) => l.table_name === filter.table_name);
    if (filter?.actor_id) list = list.filter((l) => l.actor_id === filter.actor_id);
    if (filter?.record_id) list = list.filter((l) => l.record_id === filter.record_id);
    return list;
  }
  const params = new URLSearchParams();
  if (filter?.actor_id) params.set('actor_id', filter.actor_id);
  if (filter?.table_name) params.set('table_name', filter.table_name);
  if (filter?.action) params.set('action', filter.action);
  if (filter?.record_id) params.set('record_id', filter.record_id);
  if (filter?.startDate) params.set('startDate', filter.startDate);
  if (filter?.endDate) params.set('endDate', filter.endDate);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await apiClient<any>(`/audit${q}`);
  return Array.isArray(res) ? res : res.logs || [];
}

export async function sendBillOnWhatsApp(saleId: string): Promise<any> {
  if (USE_MOCK) {
    const s = mockSales.find((sale) => sale.id === saleId);
    return {
      success: true,
      bill_no: s?.bill_no || 1048,
      whatsapp: { status: 'DELIVERED', providerMsgId: `mock_${Date.now()}` },
    };
  }
  return apiClient(`/sales/${saleId}/bill`, { method: 'POST' });
}

export async function listOutbox(status?: string): Promise<NotificationOutboxRow[]> {
  if (USE_MOCK) {
    if (status) return mockOutbox.filter((o) => o.status === status);
    return mockOutbox;
  }
  const q = status ? `?status=${status}` : '';
  return apiClient<NotificationOutboxRow[]>(`/whatsapp/outbox${q}`);
}

export async function retryOutboxItem(id: number): Promise<any> {
  if (USE_MOCK) {
    const item = mockOutbox.find((o) => o.id === id);
    if (item) {
      item.status = 'SENT';
      item.processed_at = new Date().toISOString();
      item.error_message = undefined;
      return { success: true };
    }
    throw new Error('Outbox item not found');
  }
  return apiClient(`/whatsapp/outbox/${id}/retry`, { method: 'POST' });
}

export async function processOutbox(): Promise<any> {
  if (USE_MOCK) {
    mockOutbox.forEach((o) => {
      if (o.status === 'PENDING') o.status = 'SENT';
    });
    return { success: true, processed: 1 };
  }
  return apiClient('/whatsapp/outbox/process', { method: 'POST' });
}

// --- Sales Orders & Purchase Orders (Req 6, 7) ---

export async function listOrders(
  type: OrderType,
  status?: string,
  partyId?: string,
): Promise<OrderHeader[]> {
  if (USE_MOCK) {
    return mockOrders.filter((o) => {
      if (o.order_type !== type && !o.id.toLowerCase().startsWith(type.toLowerCase())) return false;
      if (status && o.status !== status) return false;
      if (partyId && o.party_id !== partyId) return false;
      return true;
    });
  }
  const params = new URLSearchParams();
  params.set('type', type);
  if (status) params.set('status', status);
  if (partyId) params.set('party_id', partyId);
  return apiClient<OrderHeader[]>(`/orders?${params.toString()}`);
}

export async function getOrder(id: string, type: OrderType): Promise<OrderHeader> {
  if (USE_MOCK) {
    const order = mockOrders.find((o) => o.id === id);
    if (!order) throw new Error(`${type === 'SO' ? 'Sales' : 'Purchase'} order not found`);
    return order;
  }
  return apiClient<OrderHeader>(`/orders/${id}?type=${type}`);
}

export async function createOrder(dto: CreateOrderInput): Promise<OrderHeader> {
  if (USE_MOCK) {
    const party = mockParties.find((p) => p.id === dto.party_id);
    let subtotalPaise = 0;
    const lines: OrderLine[] = dto.lines.map((l, idx) => {
      const item = mockItems.find((i) => i.id === l.item_id);
      const lineAmtPaise = Math.round(Number(l.amount || 0) * 100);
      subtotalPaise += lineAmtPaise;
      return {
        id: `line_${Date.now()}_${idx}`,
        item_id: l.item_id,
        item_name: item?.name || 'Item',
        item_code: item?.code,
        unit: l.unit,
        pieces: l.pieces,
        weight_kg: l.weight_kg,
        rate: l.rate,
        amount: l.amount,
        fulfilled_pieces: 0,
        fulfilled_weight_kg: 0,
      };
    });

    const gstRate = 3.0;
    const gstPaise = Math.round((subtotalPaise * gstRate) / 100);
    const exactTotalPaise = subtotalPaise + gstPaise;
    const roundedTotalPaise = Math.round(exactTotalPaise / 100) * 100;
    const roundOffPaise = roundedTotalPaise - exactTotalPaise;

    const newOrder: OrderHeader = {
      id: `${dto.type.toLowerCase()}-${Date.now()}`,
      order_type: dto.type,
      order_no: mockOrders.filter((o) => o.order_type === dto.type).length + 101,
      order_date: new Date().toISOString(),
      party_id: dto.party_id,
      party_name: party?.name,
      party_type: party?.type,
      party_phone: party?.whatsapp_number,
      expected_delivery_date: dto.expected_delivery_date,
      status: 'PENDING',
      subtotal: subtotalPaise / 100,
      taxable_amount: subtotalPaise / 100,
      gst_rate: gstRate,
      gst_amount: gstPaise / 100,
      round_off: roundOffPaise / 100,
      total_amount: roundedTotalPaise / 100,
      notes: dto.notes,
      idempotency_key: dto.idempotency_key,
      created_by: 'u1',
      creator_name: 'Mihir Sharma',
      lines_count: lines.length,
      lines,
    };

    mockOrders.unshift(newOrder);

    mockAuditLogs.unshift({
      id: Date.now(),
      actor_id: 'u1',
      actor_name: 'Mihir Sharma',
      action: 'CREATE',
      table_name: dto.type === 'SO' ? 'sales_orders' : 'purchase_orders',
      record_id: newOrder.id,
      after_data: newOrder,
      at: new Date().toISOString(),
    });

    return newOrder;
  }
  return apiClient<OrderHeader>('/orders', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function convertOrderToBill(id: string, type: OrderType): Promise<OrderConvertResult> {
  if (USE_MOCK) {
    const order = mockOrders.find((o) => o.id === id);
    if (!order) throw new Error('Order not found');
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new Error(`Order is already ${order.status}`);
    }

    const prefilledLines = (order.lines || []).map((l) => {
      const pendingPieces = l.unit === 'PCS' ? Math.max(0, (l.pieces || 0) - (l.fulfilled_pieces || 0)) : undefined;
      const pendingWeight = l.unit === 'KG' ? Math.max(0, Number(l.weight_kg || 0) - Number(l.fulfilled_weight_kg || 0)) : undefined;
      const amount = l.unit === 'PCS'
        ? Math.round((pendingPieces || 0) * l.rate * 100) / 100
        : Math.round((pendingWeight || 0) * l.rate * 100) / 100;
      return {
        item_id: l.item_id,
        item_name: l.item_name,
        item_code: l.item_code,
        unit: l.unit,
        pieces: pendingPieces,
        weight_kg: pendingWeight,
        rate: l.rate,
        amount,
      };
    });

    order.status = 'COMPLETED';

    return {
      order_id: order.id,
      order_no: order.order_no,
      order_type: type,
      party_id: order.party_id,
      party_name: order.party_name,
      party_type: order.party_type,
      notes: `Converted from ${type} #${order.order_no}. ${order.notes || ''}`.trim(),
      prefilled_lines: prefilledLines,
      subtotal: order.subtotal,
      total_amount: order.total_amount,
    };
  }
  return apiClient<OrderConvertResult>(`/orders/${id}/convert?type=${type}`, { method: 'POST' });
}

export async function updateOrderStatus(
  id: string,
  type: OrderType,
  status: OrderStatus,
): Promise<OrderHeader> {
  if (USE_MOCK) {
    const order = mockOrders.find((o) => o.id === id);
    if (!order) throw new Error('Order not found');
    order.status = status;
    return order;
  }
  return apiClient<OrderHeader>(`/orders/${id}/status?type=${type}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteOrder(
  id: string,
  type: OrderType,
): Promise<{ success: boolean; message: string }> {
  if (USE_MOCK) {
    const idx = mockOrders.findIndex((o) => o.id === id);
    if (idx >= 0) {
      mockOrders.splice(idx, 1);
      return { success: true, message: `${type === 'SO' ? 'Sales' : 'Purchase'} order deleted` };
    }
    throw new Error('Order not found');
  }
  return apiClient<{ success: boolean; message: string }>(`/orders/${id}?type=${type}`, {
    method: 'DELETE',
  });
}

