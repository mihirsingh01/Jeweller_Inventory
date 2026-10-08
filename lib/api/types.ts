export type UserRole = 'OWNER' | 'STAFF';
export type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
export type WorkType = 'POLISH' | 'MEENA';
export type PayMode = 'CASH' | 'BANK';
export type BillStatus = 'OPEN' | 'PARTIAL' | 'PAID';

export interface User {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  whatsapp_number?: string;
  address?: string;
  work_types?: string;
  raw_phone_masked?: boolean;
  opening_balance: number;
  current_balance?: number;
  is_active: boolean;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  category?: string;
  code?: string;
  allowed_units?: 'PCS' | 'KG' | 'BOTH';
  default_unit?: 'PCS' | 'KG';
  stock_pieces: number;
  stock_kg: number;
  is_active: boolean;
}

export interface GridLineItem {
  id: string;
  item_id: string;
  item_name?: string;
  item_code?: string;
  unit: 'PCS' | 'KG';
  pieces: number;
  weight_kg: number;
  rate: number;
  amount: number;
  isValid?: boolean;
  error?: string;
}

export interface CreateItemDto {
  name: string;
  category?: string;
  stock_pieces?: number;
  stock_kg?: number;
}

export interface AdjustStockDto {
  item_id: string;
  pieces_delta: number;
  kg_delta: number;
  reason?: string;
}

export interface StockMovement {
  id: string | number;
  item_id: string;
  entry_at: string;
  source_type: string;
  source_id?: string;
  reference?: string;
  pieces_delta: number;
  kg_delta: number;
}

export interface BankAccount {
  id: string;
  name: string;
  opening_balance: number;
  current_balance?: number;
  is_active: boolean;
}

export interface SaleLine {
  id?: string;
  item_id: string;
  item_name?: string;
  unit?: 'PCS' | 'KG';
  pieces: number;
  weight_kg: number;
  rate: number;
  amount: number;
}

export interface Sale {
  id: string;
  bill_no: number;
  idempotency_key?: string;
  party_id: string;
  party_name?: string;
  party_phone?: string;
  entry_at: string;
  due_date: string;
  subtotal?: number;
  discount_type?: 'AMOUNT' | 'PERCENT';
  discount_value?: number;
  discount_amount?: number;
  taxable_amount?: number;
  gst_rate?: number;
  gst_amount?: number;
  transport_charges?: number;
  packaging_charges?: number;
  other_charges?: number;
  round_off?: number;
  total_amount: number;
  balance_before?: number;
  this_bill?: number;
  balance_after?: number;
  allocated_amount?: number;
  outstanding_amount?: number;
  status: BillStatus;
  notes?: string;
  created_by: string;
  creator_name?: string;
  lines?: SaleLine[];
  reminder?: any;
}

export interface PurchaseLine {
  id?: string;
  item_id: string;
  item_name?: string;
  unit?: 'PCS' | 'KG';
  pieces: number;
  weight_kg: number;
  rate: number;
  amount: number;
}

export interface Purchase {
  id: string;
  bill_no: number;
  idempotency_key?: string;
  party_id: string;
  party_name?: string;
  party_phone?: string;
  entry_at: string;
  due_date?: string;
  subtotal?: number;
  discount_type?: 'AMOUNT' | 'PERCENT';
  discount_value?: number;
  discount_amount?: number;
  taxable_amount?: number;
  gst_rate?: number;
  gst_amount?: number;
  transport_charges?: number;
  packaging_charges?: number;
  other_charges?: number;
  round_off?: number;
  total_amount: number;
  balance_before?: number;
  this_purchase?: number;
  balance_after?: number;
  allocated_amount?: number;
  outstanding_amount?: number;
  status: BillStatus;
  notes?: string;
  narration?: string;
  created_by: string;
  creator_name?: string;
  lines?: PurchaseLine[];
  reminder?: any;
}

export interface JobWorkLine {
  id?: string;
  issue_line_id?: string;
  item_id: string;
  item_name?: string;
  item_code?: string;
  unit: 'PCS' | 'KG';
  pieces: number;
  weight_kg: number;
  labour_charge?: number;
  is_closed?: boolean;
  notes?: string;
  orig_pieces?: number;
  orig_weight_kg?: number;
}

export interface PendingJobWorkLine {
  issue_line_id: string;
  job_work_id: string;
  entry_no: number;
  work_type: WorkType;
  entry_at: string;
  item_id: string;
  item_name: string;
  item_code?: string;
  unit: 'PCS' | 'KG';
  sent_pieces: number;
  sent_weight_kg: number;
  already_received_pieces: number;
  already_received_weight_kg: number;
  pending_pieces: number;
  pending_weight_kg: number;
}

export interface JobWorkEntry {
  id: string;
  entry_no?: number;
  work_type: WorkType;
  party_id: string;
  party_name?: string;
  party_phone?: string;
  item_id?: string;
  item_name?: string;
  direction: 'ISSUE' | 'RECEIVE';
  issue_id?: string;
  weight_kg: number;
  charge_amount?: number;
  total_labour_charge?: number;
  entry_at: string;
  notes?: string;
  created_by: string;
  creator_name?: string;
  balance_before?: number;
  this_labour?: number;
  balance_after?: number;
  lines?: JobWorkLine[];
}

export interface CreateJobWorkInput {
  work_type: WorkType;
  party_id: string;
  direction: 'ISSUE' | 'RECEIVE';
  issue_id?: string;
  notes?: string;
  idempotency_key?: string;
  item_id?: string;
  weight_kg?: number;
  charge_amount?: number;
  lines?: Array<{
    issue_line_id?: string;
    item_id?: string;
    unit?: 'PCS' | 'KG';
    pieces?: number;
    weight_kg?: number;
    labour_charge?: number;
    is_closed?: boolean;
    notes?: string;
  }>;
}

export interface VoucherAllocation {
  id?: string;
  sale_id?: string;
  purchase_id?: string;
  amount: number;
}

export interface CreateVoucherInput {
  kind: 'RECEIPT' | 'PAYMENT';
  party_id: string;
  mode: PayMode;
  bank_account_id?: string;
  amount: number;
  reference_no?: string;
  notes?: string;
  idempotency_key?: string;
  allocations?: VoucherAllocation[];
}

export interface MoneyVoucher {
  id: string;
  voucher_no: number;
  kind: 'RECEIPT' | 'PAYMENT';
  party_id: string;
  party_name?: string;
  party_type?: 'CUSTOMER' | 'SUPPLIER' | 'KARIGAR';
  mode: PayMode;
  bank_account_id?: string;
  bank_name?: string;
  amount: number;
  reference_no?: string;
  notes?: string;
  idempotency_key?: string;
  balance_before?: number;
  this_voucher?: number;
  balance_after?: number;
  entry_at: string;
  created_by: string;
  creator_name?: string;
  allocations?: VoucherAllocation[];
}

export interface LedgerRow {
  id: number;
  entry_at: string;
  source_type: string;
  source_id: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface StockRow {
  id: number;
  entry_at: string;
  source_type: string;
  source_id: string;
  pieces_delta: number;
  kg_delta: number;
}

export interface ReminderSettings {
  id: number;
  repeat_days: number;
  send_time: string;
  owner_whatsapp: string;
  is_active: boolean;
}

export interface PaymentReminder {
  id: string;
  party_id: string;
  party_name?: string;
  party_type?: 'CUSTOMER' | 'SUPPLIER' | 'KARIGAR';
  party_phone?: string;
  sale_id?: string;
  sale_bill_no?: number;
  sale_total?: number;
  purchase_id?: string;
  purchase_bill_no?: number;
  purchase_total?: number;
  reminder_date: string;
  amount: number;
  notes?: string;
  status: 'PENDING' | 'SENT' | 'COMPLETED' | 'CANCELLED' | 'DISMISSED';
  created_by: string;
  creator_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface AuditLogRow {
  id: number;
  actor_id: string;
  actor_name?: string;
  action: string;
  table_name: string;
  record_id: string;
  before_data?: any;
  after_data?: any;
  at: string;
}

export interface NotificationOutboxRow {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: string;
  recipient_phone?: string;
  payload: any;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  created_at: string;
  processed_at?: string;
  error_message?: string;
}

export interface DashboardStats {
  totalReceivable: number;
  totalPayable: number;
  overdueAmount: number;
  overdueCount: number;
  todaySales: number;
  todayPurchases: number;
  cashBalance: number;
  bankBalance: number;
  topCustomersByDues: Array<{
    id: string;
    customer_name: string;
    pending_amount: number;
    whatsapp_number?: string;
  }>;
  lowStockItems: Array<{
    id: string;
    name: string;
    category?: string;
    pieces: number;
    weight_kg: number;
  }>;
  recentEntries: Array<{
    id: string;
    type: string;
    party_name: string;
    amount: number;
    entry_at: string;
    creator_name: string;
  }>;
}
