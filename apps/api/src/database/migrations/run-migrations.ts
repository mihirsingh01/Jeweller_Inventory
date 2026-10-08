import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres123@localhost:5432/kumkum_payal';

  console.log(`Connecting to database for migrations: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
  const pool = new Pool({ connectionString });

  try {
    // Check connection
    await pool.query('SELECT 1');
    console.log('✓ Connected to PostgreSQL');

    // Create migrations tracking table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Look for init.sql
    const initSqlPath = path.resolve(__dirname, '../../../../infra/postgres/init.sql');
    if (fs.existsSync(initSqlPath)) {
      const { rows } = await pool.query('SELECT name FROM _migrations WHERE name = $1', ['001_initial_schema']);
      if (rows.length === 0) {
        console.log('Applying 001_initial_schema migration...');
        const sql = fs.readFileSync(initSqlPath, 'utf-8');
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (name) VALUES ($1)', ['001_initial_schema']);
        console.log('✓ 001_initial_schema applied successfully with all 17 tables, triggers, and sequences.');
      } else {
        console.log('✓ 001_initial_schema has already been applied.');
      }
    } else {
      console.warn(`Init SQL not found at ${initSqlPath}`);
    }

    // Migration 002: Add work_types column to parties table if missing
    const { rows: m2Rows } = await pool.query('SELECT name FROM _migrations WHERE name = $1', ['002_add_party_work_types']);
    if (m2Rows.length === 0) {
      console.log('Applying 002_add_party_work_types migration...');
      await pool.query('ALTER TABLE parties ADD COLUMN IF NOT EXISTS work_types TEXT;');
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', ['002_add_party_work_types']);
      console.log('✓ 002_add_party_work_types applied successfully.');
    } else {
      console.log('✓ 002_add_party_work_types has already been applied.');
    }

    // Migration 003: Add item code, allowed_units, default_unit, and idempotency keys
    const { rows: m3Rows } = await pool.query('SELECT name FROM _migrations WHERE name = $1', ['003_add_item_code_and_units_and_idempotency']);
    if (m3Rows.length === 0) {
      console.log('Applying 003_add_item_code_and_units_and_idempotency migration...');
      await pool.query(`
        ALTER TABLE items ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;
        ALTER TABLE items ADD COLUMN IF NOT EXISTS allowed_units TEXT NOT NULL DEFAULT 'BOTH';
        ALTER TABLE items ADD COLUMN IF NOT EXISTS default_unit TEXT NOT NULL DEFAULT 'KG';
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

        UPDATE items SET code = 'GO22' WHERE name = 'Gold Ornaments 22K' AND code IS NULL;
        UPDATE items SET code = 'SP92' WHERE name = 'Silver Payal 92.5' AND code IS NULL;
        UPDATE items SET code = 'SB80' WHERE name = 'Silver Bangles 80T' AND code IS NULL;
        UPDATE items SET code = 'CZ', allowed_units = 'PCS', default_unit = 'PCS' WHERE name = 'Loose Cubic Zirconia' AND code IS NULL;
      `);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', ['003_add_item_code_and_units_and_idempotency']);
      console.log('✓ 003_add_item_code_and_units_and_idempotency applied successfully.');
    } else {
      console.log('✓ 003_add_item_code_and_units_and_idempotency has already been applied.');
    }

    // Migration 004: Add sales extra charges, payment_reminders, and notification_outbox
    const { rows: m4Rows } = await pool.query('SELECT name FROM _migrations WHERE name = $1', ['004_add_sales_charges_reminders_outbox']);
    if (m4Rows.length === 0) {
      console.log('Applying 004_add_sales_charges_reminders_outbox migration...');
      await pool.query(`
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'AMOUNT';
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) NOT NULL DEFAULT 3.0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS transport_charges NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS packaging_charges NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS other_charges NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS round_off NUMERIC(6,2) NOT NULL DEFAULT 0;

        CREATE TABLE IF NOT EXISTS payment_reminders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
            purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
            party_id UUID NOT NULL REFERENCES parties(id),
            reminder_date DATE NOT NULL,
            amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'CANCELLED', 'DISMISSED')),
            created_by UUID NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS notification_outbox (
            id BIGSERIAL PRIMARY KEY,
            event_type TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id UUID NOT NULL,
            recipient_phone TEXT,
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            processed_at TIMESTAMPTZ,
            error_message TEXT
        );
      `);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', ['004_add_sales_charges_reminders_outbox']);
      console.log('✓ 004_add_sales_charges_reminders_outbox applied successfully.');
    } else {
      console.log('✓ 004_add_sales_charges_reminders_outbox has already been applied.');
    }

    // Migration 005: Add purchases extra charges, narration, and purchase_lines unit
    if (!appliedNames.has('005_add_purchases_charges_and_narration')) {
      console.log('Running migration: 005_add_purchases_charges_and_narration...');
      await pool.query(`
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NOT NULL DEFAULT 'PERCENT';
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) NOT NULL DEFAULT 3.0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS transport_charges NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS packaging_charges NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS other_charges NUMERIC(14,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS round_off NUMERIC(6,2) NOT NULL DEFAULT 0;
        ALTER TABLE purchases ADD COLUMN IF NOT EXISTS narration TEXT;

        ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS unit VARCHAR(10) NOT NULL DEFAULT 'KG';
      `);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', ['005_add_purchases_charges_and_narration']);
      console.log('✓ 005_add_purchases_charges_and_narration applied successfully.');
    } else {
      console.log('✓ 005_add_purchases_charges_and_narration has already been applied.');
    }

    // Migration 006: Add job_work_seq, job_work_entries extra columns and job_work_lines table
    if (!appliedNames.has('006_job_work_lines_and_sequence')) {
      console.log('Running migration: 006_job_work_lines_and_sequence...');
      await pool.query(`
        CREATE SEQUENCE IF NOT EXISTS job_work_seq START WITH 3001;
        
        ALTER TABLE job_work_entries ADD COLUMN IF NOT EXISTS entry_no BIGINT NOT NULL DEFAULT nextval('job_work_seq');
        ALTER TABLE job_work_entries ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;
        ALTER TABLE job_work_entries ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES job_work_entries(id) ON DELETE SET NULL;
        ALTER TABLE job_work_entries ALTER COLUMN item_id DROP NOT NULL;
        ALTER TABLE job_work_entries ALTER COLUMN weight_kg DROP NOT NULL;
        ALTER TABLE job_work_entries ALTER COLUMN weight_kg SET DEFAULT 0;

        CREATE TABLE IF NOT EXISTS job_work_lines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            job_work_id UUID NOT NULL REFERENCES job_work_entries(id) ON DELETE CASCADE,
            issue_line_id UUID REFERENCES job_work_lines(id) ON DELETE SET NULL,
            item_id UUID NOT NULL REFERENCES items(id),
            unit VARCHAR(10) NOT NULL DEFAULT 'KG',
            pieces INTEGER NOT NULL DEFAULT 0 CHECK (pieces >= 0),
            weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
            labour_charge NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (labour_charge >= 0),
            is_closed BOOLEAN NOT NULL DEFAULT false,
            notes TEXT,
            CONSTRAINT check_pieces_or_weight_jw CHECK (pieces > 0 OR weight_kg > 0)
        );
      `);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', ['006_job_work_lines_and_sequence']);
      console.log('✓ 006_job_work_lines_and_sequence applied successfully.');
    } else {
      console.log('✓ 006_job_work_lines_and_sequence has already been applied.');
    }

    // Migration 007: Add money_vouchers notes and idempotency_key
    if (!appliedNames.has('007_vouchers_notes_and_idempotency')) {
      console.log('Running migration: 007_vouchers_notes_and_idempotency...');
      await pool.query(`
        ALTER TABLE money_vouchers ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE money_vouchers ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;
      `);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', ['007_vouchers_notes_and_idempotency']);
      console.log('✓ 007_vouchers_notes_and_idempotency applied successfully.');
    } else {
      console.log('✓ 007_vouchers_notes_and_idempotency has already been applied.');
    }

    console.log('All migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
