import {
  User,
  Party,
  Item,
  BankAccount,
  Sale,
  Purchase,
  JobWorkEntry,
  MoneyVoucher,
  LedgerEntry,
  StockRegisterItem,
  OwnerDashboardData,
  ReminderSettings,
  AuditLogItem,
} from '../types';

const rawBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API_BASE = rawBase ? (rawBase.endsWith('/api/v1') ? rawBase : `${rawBase}/api/v1`) : '/api/v1';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Also pass Bearer token if stored as fallback
  const token = localStorage.getItem('kp_token');
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Ensures httpOnly cookies (access_token, refresh_token) are sent
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (err: any) {
    throw new ApiError(0, 'Network connection error. Please check your internet or server connection.');
  }

  // Auto-refresh token if 401 Unauthorized
  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData.accessToken) {
          localStorage.setItem('kp_token', refreshData.accessToken);
          headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
        }
        // Retry original request
        response = await fetch(url, { ...config, headers });
      } else {
        localStorage.removeItem('kp_token');
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login?expired=1';
        }
      }
    } catch {
      localStorage.removeItem('kp_token');
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login?expired=1';
      }
    }
  }

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    let errorData: any = null;
    try {
      errorData = await response.json();
      if (errorData?.message) {
        errorMsg = Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : errorData.message;
      }
    } catch {
      errorMsg = await response.text().catch(() => errorMsg);
    }
    throw new ApiError(response.status, errorMsg, errorData);
  }

  // Check if response has content
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return {} as T;
}

export const api = {
  // Authentication
  auth: {
    login: async (username: string, password: string): Promise<{ accessToken: string; user: User }> => {
      const res = await fetchWithAuth<{ accessToken: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (res.accessToken) {
        localStorage.setItem('kp_token', res.accessToken);
      }
      return res;
    },
    logout: async (): Promise<{ success: boolean }> => {
      try {
        await fetchWithAuth('/auth/logout', { method: 'POST' });
      } finally {
        localStorage.removeItem('kp_token');
      }
      return { success: true };
    },
    getMe: async (): Promise<User> => {
      return fetchWithAuth<User>('/auth/me');
    },
  },

  // Masters
  masters: {
    getParties: async (type?: string): Promise<Party[]> => {
      const q = type ? `?type=${encodeURIComponent(type)}` : '';
      return fetchWithAuth<Party[]>(`/masters/parties${q}`);
    },
    createParty: async (data: Partial<Party>): Promise<Party> => {
      return fetchWithAuth<Party>('/masters/parties', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    getItems: async (): Promise<Item[]> => {
      return fetchWithAuth<Item[]>('/masters/items');
    },
    createItem: async (data: Partial<Item>): Promise<Item> => {
      return fetchWithAuth<Item>('/masters/items', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    getBankAccounts: async (): Promise<BankAccount[]> => {
      return fetchWithAuth<BankAccount[]>('/masters/bank-accounts');
    },
    createBankAccount: async (data: Partial<BankAccount>): Promise<BankAccount> => {
      return fetchWithAuth<BankAccount>('/masters/bank-accounts', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  },

  // Sales
  sales: {
    getSales: async (params?: { party_id?: string; limit?: number; offset?: number }): Promise<Sale[]> => {
      const query = new URLSearchParams();
      if (params?.party_id) query.set('party_id', params.party_id);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return fetchWithAuth<Sale[]>(`/sales?${query.toString()}`);
    },
    getSale: async (id: string): Promise<Sale> => {
      return fetchWithAuth<Sale>(`/sales/${id}`);
    },
    createSale: async (data: {
      party_id: string;
      due_date: string;
      lines: Array<{ item_id: string; pieces: number; weight_kg: number; rate_per_kg: number }>;
    }): Promise<Sale> => {
      return fetchWithAuth<Sale>('/sales', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    updateSale: async (id: string, data: any): Promise<Sale> => {
      return fetchWithAuth<Sale>(`/sales/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    deleteSale: async (id: string): Promise<{ success: boolean }> => {
      return fetchWithAuth<{ success: boolean }>(`/sales/${id}`, {
        method: 'DELETE',
      });
    },
    sendBillWhatsApp: async (id: string): Promise<{ success: boolean; bill_no: number; mediaUrl?: string }> => {
      return fetchWithAuth<{ success: boolean; bill_no: number; mediaUrl?: string }>(`/sales/${id}/bill`, {
        method: 'POST',
      });
    },
    getBillPreviewUrl: (id: string): string => {
      return `${API_BASE}/sales/${id}/bill/preview`;
    },
  },

  // Purchases
  purchases: {
    getPurchases: async (params?: { supplier_id?: string; limit?: number; offset?: number }): Promise<Purchase[]> => {
      const query = new URLSearchParams();
      if (params?.supplier_id) query.set('supplier_id', params.supplier_id);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return fetchWithAuth<Purchase[]>(`/purchases?${query.toString()}`);
    },
    getPurchase: async (id: string): Promise<Purchase> => {
      return fetchWithAuth<Purchase>(`/purchases/${id}`);
    },
    createPurchase: async (data: {
      supplier_id: string;
      due_date: string;
      lines: Array<{ item_id: string; pieces: number; weight_kg: number; rate_per_kg: number }>;
    }): Promise<Purchase> => {
      return fetchWithAuth<Purchase>('/purchases', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    updatePurchase: async (id: string, data: any): Promise<Purchase> => {
      return fetchWithAuth<Purchase>(`/purchases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    deletePurchase: async (id: string): Promise<{ success: boolean }> => {
      return fetchWithAuth<{ success: boolean }>(`/purchases/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // Polish & Meena Job Work
  jobWork: {
    getEntries: async (params?: { party_id?: string; type?: string; limit?: number; offset?: number }): Promise<JobWorkEntry[]> => {
      const query = new URLSearchParams();
      if (params?.party_id) query.set('party_id', params.party_id);
      if (params?.type) query.set('type', params.type);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return fetchWithAuth<JobWorkEntry[]>(`/job-work?${query.toString()}`);
    },
    createEntry: async (data: {
      entry_type: 'POLISH' | 'MEENA';
      direction: 'ISSUE' | 'RECEIVE';
      party_id: string;
      weight_kg: number;
      charge_amount?: number;
      notes?: string;
    }): Promise<JobWorkEntry> => {
      return fetchWithAuth<JobWorkEntry>('/job-work', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    updateEntry: async (id: string, data: any): Promise<JobWorkEntry> => {
      return fetchWithAuth<JobWorkEntry>(`/job-work/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    deleteEntry: async (id: string): Promise<{ success: boolean }> => {
      return fetchWithAuth<{ success: boolean }>(`/job-work/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // Money Vouchers
  vouchers: {
    getVouchers: async (params?: { party_id?: string; type?: string; limit?: number; offset?: number }): Promise<MoneyVoucher[]> => {
      const query = new URLSearchParams();
      if (params?.party_id) query.set('party_id', params.party_id);
      if (params?.type) query.set('type', params.type);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return fetchWithAuth<MoneyVoucher[]>(`/vouchers?${query.toString()}`);
    },
    createVoucher: async (data: {
      party_id: string;
      voucher_type: 'RECEIPT' | 'PAYMENT';
      mode: 'CASH' | 'BANK';
      bank_account_id?: string;
      amount: number;
      reference_no?: string;
      notes?: string;
      allocations?: Array<{ sale_id?: string; purchase_id?: string; allocated_amount: number }>;
    }): Promise<MoneyVoucher> => {
      return fetchWithAuth<MoneyVoucher>('/vouchers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    getOpenBills: async (partyId: string): Promise<Array<{
      id: string;
      bill_no: number | string;
      total_amount: number;
      allocated_amount: number;
      outstanding_amount: number;
      due_date: string;
      type: 'SALE' | 'PURCHASE';
    }>> => {
      return fetchWithAuth(`/vouchers/open-bills/${partyId}`);
    },
  },

  // Ledgers & Books
  ledger: {
    getPartyStatement: async (partyId: string, fromDate?: string, toDate?: string): Promise<{
      party: Party;
      opening_balance: number;
      opening_balance_type: 'DEBIT' | 'CREDIT';
      closing_balance: number;
      closing_balance_type: 'DEBIT' | 'CREDIT';
      entries: LedgerEntry[];
    }> => {
      const q = new URLSearchParams();
      if (fromDate) q.set('fromDate', fromDate);
      if (toDate) q.set('toDate', toDate);
      return fetchWithAuth(`/ledger/party/${partyId}?${q.toString()}`);
    },
    getCashBook: async (fromDate?: string, toDate?: string): Promise<{
      opening_balance: number;
      closing_balance: number;
      entries: Array<{
        id: string;
        entry_at: string;
        voucher_no: string;
        party_name: string;
        narration: string;
        debit: number;
        credit: number;
        running_balance: number;
      }>;
    }> => {
      const q = new URLSearchParams();
      if (fromDate) q.set('fromDate', fromDate);
      if (toDate) q.set('toDate', toDate);
      return fetchWithAuth(`/ledger/cash-book?${q.toString()}`);
    },
    getBankBook: async (bankAccountId: string, fromDate?: string, toDate?: string): Promise<{
      bank: BankAccount;
      opening_balance: number;
      closing_balance: number;
      entries: Array<{
        id: string;
        entry_at: string;
        voucher_no: string;
        party_name: string;
        reference_no: string;
        narration: string;
        debit: number;
        credit: number;
        running_balance: number;
      }>;
    }> => {
      const q = new URLSearchParams();
      if (fromDate) q.set('fromDate', fromDate);
      if (toDate) q.set('toDate', toDate);
      return fetchWithAuth(`/ledger/bank-book/${bankAccountId}?${q.toString()}`);
    },
  },

  // Stock Register
  stock: {
    getStockRegister: async (fromDate?: string, toDate?: string): Promise<StockRegisterItem[]> => {
      const q = new URLSearchParams();
      if (fromDate) q.set('fromDate', fromDate);
      if (toDate) q.set('toDate', toDate);
      return fetchWithAuth<StockRegisterItem[]>(`/stock/register?${q.toString()}`);
    },
    adjustStock: async (data: { item_id: string; pieces_delta: number; kg_delta: number; reason?: string }): Promise<any> => {
      return fetchWithAuth('/stock/adjust', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    getItemMovements: async (itemId: string): Promise<any> => {
      return fetchWithAuth(`/stock/movements/${itemId}`);
    },
  },

  // Owner Dashboard
  dashboard: {
    getOwnerMetrics: async (asOfDate?: string): Promise<OwnerDashboardData> => {
      const q = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
      return fetchWithAuth<OwnerDashboardData>(`/dashboard/owner${q}`);
    },
  },

  // Reminders
  reminders: {
    getSettings: async (): Promise<ReminderSettings> => {
      return fetchWithAuth<ReminderSettings>('/reminders/settings');
    },
    updateSettings: async (settings: Partial<ReminderSettings>): Promise<ReminderSettings> => {
      return fetchWithAuth<ReminderSettings>('/reminders/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
    },
    triggerReminders: async (dryRun: boolean = false): Promise<{
      run_date: string;
      reminders_sent: number;
      summary_sent: boolean;
      overdue_bills_evaluated: number;
    }> => {
      return fetchWithAuth('/reminders/trigger', {
        method: 'POST',
        body: JSON.stringify({ dry_run: dryRun }),
      });
    },
    getStaffOverdue: async (): Promise<any[]> => {
      return fetchWithAuth('/reminders/staff-overdue');
    },
  },

  // Users (Staff Management)
  users: {
    getStaffList: async (): Promise<User[]> => {
      return fetchWithAuth<User[]>('/users');
    },
    createStaff: async (data: { name: string; username: string; mobile_number: string; password: string }): Promise<User> => {
      return fetchWithAuth<User>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    updateStaff: async (id: string, data: Partial<User>): Promise<User> => {
      return fetchWithAuth<User>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    deactivateStaff: async (id: string): Promise<{ success: boolean }> => {
      return fetchWithAuth<{ success: boolean }>(`/users/${id}/deactivate`, {
        method: 'POST',
      });
    },
    resetPassword: async (id: string, newPassword: string): Promise<{ success: boolean }> => {
      return fetchWithAuth<{ success: boolean }>(`/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
    },
  },

  // Audit Logs
  audit: {
    getLogs: async (params?: { entity?: string; limit?: number; offset?: number }): Promise<AuditLogItem[]> => {
      const q = new URLSearchParams();
      if (params?.entity) q.set('entity', params.entity);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      return fetchWithAuth<AuditLogItem[]>(`/audit?${q.toString()}`);
    },
  },
};
