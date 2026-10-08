-- Kumkum Payal - Full Database Schema (17 Tables)
-- Compliant with database_design.pdf and erdiagram.pdf

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('OWNER', 'STAFF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE party_type AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE work_type AS ENUM ('POLISH', 'MEENA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE pay_mode AS ENUM ('CASH', 'BANK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE bill_status AS ENUM ('OPEN', 'PARTIAL', 'PAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Sequences for continuous invoice and voucher tracking
CREATE SEQUENCE IF NOT EXISTS sale_bill_seq START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS purchase_bill_seq START WITH 5001;
CREATE SEQUENCE IF NOT EXISTS voucher_seq START WITH 2001;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'STAFF',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id)
);

-- 2. Parties table (Customers, Suppliers, Karigars)
CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type party_type NOT NULL,
    whatsapp_number TEXT,
    address TEXT,
    work_types TEXT,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL REFERENCES users(id)
);

-- 3. Items table
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- 4. Bank accounts table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- 5. Sales table
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_no BIGINT NOT NULL UNIQUE DEFAULT nextval('sale_bill_seq'),
    party_id UUID NOT NULL REFERENCES parties(id),
    entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date DATE NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
    status bill_status NOT NULL DEFAULT 'OPEN',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id)
);

-- 6. Sale lines table
CREATE TABLE IF NOT EXISTS sale_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    pieces INTEGER NOT NULL DEFAULT 0 CHECK (pieces >= 0),
    weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
    rate NUMERIC(14,2) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    CONSTRAINT check_pieces_or_weight_sale CHECK (pieces > 0 OR weight_kg > 0)
);

-- 7. Purchases table
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_no BIGINT NOT NULL UNIQUE DEFAULT nextval('purchase_bill_seq'),
    party_id UUID NOT NULL REFERENCES parties(id),
    entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date DATE,
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
    status bill_status NOT NULL DEFAULT 'OPEN',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id)
);

-- 8. Purchase lines table
CREATE TABLE IF NOT EXISTS purchase_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    pieces INTEGER NOT NULL DEFAULT 0 CHECK (pieces >= 0),
    weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
    rate NUMERIC(14,2) NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    CONSTRAINT check_pieces_or_weight_purchase CHECK (pieces > 0 OR weight_kg > 0)
);

-- 9. Job work entries table (Polish / Meena)
CREATE TABLE IF NOT EXISTS job_work_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_type work_type NOT NULL,
    party_id UUID NOT NULL REFERENCES parties(id),
    item_id UUID NOT NULL REFERENCES items(id),
    direction TEXT NOT NULL CHECK (direction IN ('ISSUE', 'RECEIVE')),
    weight_kg NUMERIC(12,3) NOT NULL CHECK (weight_kg > 0),
    charge_amount NUMERIC(14,2) DEFAULT 0,
    entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id)
);

-- 10. Money vouchers (Receipt / Payment)
CREATE TABLE IF NOT EXISTS money_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_no BIGINT NOT NULL UNIQUE DEFAULT nextval('voucher_seq'),
    kind TEXT NOT NULL CHECK (kind IN ('RECEIPT', 'PAYMENT')),
    party_id UUID NOT NULL REFERENCES parties(id),
    mode pay_mode NOT NULL,
    bank_account_id UUID REFERENCES bank_accounts(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    reference_no TEXT,
    entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL REFERENCES users(id),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id),
    CONSTRAINT check_bank_mode CHECK ((mode = 'BANK') = (bank_account_id IS NOT NULL))
);

-- 11. Voucher allocations
CREATE TABLE IF NOT EXISTS voucher_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id UUID NOT NULL REFERENCES money_vouchers(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id),
    purchase_id UUID REFERENCES purchases(id),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    CONSTRAINT check_single_allocation CHECK ((sale_id IS NULL) <> (purchase_id IS NULL))
);

-- 12. Ledger entries (Append-only party ledger)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    party_id UUID NOT NULL REFERENCES parties(id),
    entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_type TEXT NOT NULL,
    source_id UUID NOT NULL,
    debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- 13. Stock movements (Append-only item stock movements)
CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGSERIAL PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES items(id),
    entry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_type TEXT NOT NULL,
    source_id UUID NOT NULL,
    pieces_delta INTEGER NOT NULL DEFAULT 0,
    kg_delta NUMERIC(12,3) NOT NULL DEFAULT 0
);

-- 14. Reminder settings (Single row config)
CREATE TABLE IF NOT EXISTS reminder_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    repeat_days SMALLINT NOT NULL DEFAULT 3 CHECK (repeat_days > 0),
    send_time TIME NOT NULL DEFAULT '10:00',
    owner_whatsapp TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- 15. Reminder log
CREATE TABLE IF NOT EXISTS reminder_log (
    id BIGSERIAL PRIMARY KEY,
    sale_id UUID REFERENCES sales(id),
    party_id UUID REFERENCES parties(id),
    kind TEXT NOT NULL CHECK (kind IN ('CUSTOMER_BILL', 'OWNER_SUMMARY')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL
);

-- 16. WhatsApp messages log
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    to_number TEXT NOT NULL,
    template_name TEXT,
    payload JSONB,
    related_type TEXT,
    related_id UUID,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    provider_msg_id TEXT,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. Bill images
CREATE TABLE IF NOT EXISTS bill_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    file_path TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_id BIGINT REFERENCES whatsapp_messages(id)
);

-- 18. Audit log (Append-only)
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    before_data JSONB,
    after_data JSONB,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only enforcement triggers
CREATE OR REPLACE FUNCTION block_immutable_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is strictly append-only. UPDATE and DELETE are blocked.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_immutable ON ledger_entries;
CREATE TRIGGER trg_ledger_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION block_immutable_update_delete();

DROP TRIGGER IF EXISTS trg_stock_immutable ON stock_movements;
CREATE TRIGGER trg_stock_immutable
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION block_immutable_update_delete();

DROP TRIGGER IF EXISTS trg_audit_immutable ON audit_log;
CREATE TRIGGER trg_audit_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION block_immutable_update_delete();

-- Performance and isolation indexes
CREATE INDEX IF NOT EXISTS idx_sales_staff ON sales(created_by, entry_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_reminders ON sales(party_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_purchases_staff ON purchases(created_by, entry_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobwork_staff ON job_work_entries(created_by, entry_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_staff ON money_vouchers(created_by, entry_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_party_time ON ledger_entries(party_id, entry_at);
CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_status ON whatsapp_messages(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reminder_last ON reminder_log(sale_id, sent_at DESC);

-- Seed initial data
INSERT INTO users (id, name, username, password_hash, role)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Mihir Sharma (Owner)', 'mihir', '$argon2id$v=19$m=65536,t=3,p=4$2q1zT4K9gqB$a/X5+hG3cK', 'OWNER'),
    ('22222222-2222-2222-2222-222222222222', 'Amit Verma (Staff)', 'amit', '$argon2id$v=19$m=65536,t=3,p=4$2q1zT4K9gqB$a/X5+hG3cK', 'STAFF')
ON CONFLICT (username) DO NOTHING;

INSERT INTO items (id, name, category)
VALUES 
    ('aaaaaaaa-1111-0000-0000-000000000001', 'Gold Ornaments 22K', 'Gold Ornaments'),
    ('aaaaaaaa-1111-0000-0000-000000000002', 'Silver Payal 92.5', 'Silver Ornaments'),
    ('aaaaaaaa-1111-0000-0000-000000000003', 'Silver Bangles 80T', 'Silver Ornaments'),
    ('aaaaaaaa-1111-0000-0000-000000000004', 'Loose Cubic Zirconia', 'Stones')
ON CONFLICT (name) DO NOTHING;

INSERT INTO bank_accounts (id, name, opening_balance)
VALUES 
    ('bbbbbbbb-1111-0000-0000-000000000001', 'HDFC Bank - Current A/C (..4012)', 450000.00),
    ('bbbbbbbb-1111-0000-0000-000000000002', 'SBI Bank - Trade A/C (..8821)', 280000.00)
ON CONFLICT DO NOTHING;

INSERT INTO parties (id, name, type, whatsapp_number, address, opening_balance, created_by)
VALUES 
    ('cccccccc-1111-0000-0000-000000000001', 'Rajasthan Jewellers', 'CUSTOMER', '+919829012345', 'Johri Bazaar, Jaipur', 125000.00, '11111111-1111-1111-1111-111111111111'),
    ('cccccccc-1111-0000-0000-000000000002', 'Mehta Gold Works', 'SUPPLIER', '+919829054321', 'Sarafa Bazaar, Meerut', -75000.00, '11111111-1111-1111-1111-111111111111'),
    ('cccccccc-1111-0000-0000-000000000003', 'Shree Balaji Arts', 'BOTH', '+919829098765', 'Zaveri Bazaar, Mumbai', 0.00, '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO reminder_settings (id, repeat_days, send_time, owner_whatsapp, is_active)
VALUES (1, 3, '10:00', '+919690000000', true)
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- PostgreSQL Row-Level Security (RLS) Policies
-- Enforces DB-level isolation for staff entries
-- ==========================================

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_work_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_vouchers ENABLE ROW LEVEL SECURITY;

-- 1. Sales RLS Policy
DROP POLICY IF EXISTS sales_staff_isolation_policy ON sales;
CREATE POLICY sales_staff_isolation_policy ON sales
    FOR ALL
    USING (
        current_setting('app.current_role', true) = 'OWNER' 
        OR created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

-- 2. Purchases RLS Policy
DROP POLICY IF EXISTS purchases_staff_isolation_policy ON purchases;
CREATE POLICY purchases_staff_isolation_policy ON purchases
    FOR ALL
    USING (
        current_setting('app.current_role', true) = 'OWNER' 
        OR created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

-- 3. Job Work RLS Policy
DROP POLICY IF EXISTS job_work_staff_isolation_policy ON job_work_entries;
CREATE POLICY job_work_staff_isolation_policy ON job_work_entries
    FOR ALL
    USING (
        current_setting('app.current_role', true) = 'OWNER' 
        OR created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

-- 4. Money Vouchers RLS Policy
DROP POLICY IF EXISTS vouchers_staff_isolation_policy ON money_vouchers;
CREATE POLICY vouchers_staff_isolation_policy ON money_vouchers
    FOR ALL
    USING (
        current_setting('app.current_role', true) = 'OWNER' 
        OR created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

