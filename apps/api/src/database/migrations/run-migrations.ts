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

    console.log('All migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
