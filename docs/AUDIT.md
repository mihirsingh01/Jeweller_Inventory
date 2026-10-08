# Technical Audit: Kumkum Payal (कुंकुम पायल)

**Audit Date:** October 8, 2026  
**Auditor:** Antigravity Engineering Agent  
**Scope:** Existing Architecture, Monorepo Layout, Auth & Roles, Data Model, Accounting Engine, and Feature Completeness.

---

## 1. System Stack & Architecture

| Component | Technology | Version | Location / Details |
| :--- | :--- | :--- | :--- |
| **Primary Frontend (Vercel Root)** | Next.js (App Router) | `16.3.3` | Root `/app` directory, React 19, `@base-ui/react`, Shadcn UI |
| **Secondary Frontend (Vite SPA)** | React + Vite | `18.2.0` / `5.1.6` | `apps/web`, React Router DOM v7, TanStack Query, React Hook Form, Zod |
| **Backend REST API** | NestJS | `10.3.0` | `apps/api`, TypeScript `5.3.3`, Express platform |
| **Database & Client** | PostgreSQL | `16` | Pure `pg` connection pool (`DatabaseService`), no heavy ORM (raw SQL queries) |
| **Cache & Queue Broker** | Redis + BullMQ | Redis 7, BullMQ `5.4.0` | `apps/api` (`WhatsAppQueueService`, `RemindersService`), IORedis `5.3.2` |
| **Auth & Security** | JWT + Cookie / Header | Argon2id `0.40.1` | `@nestjs/jwt`, `passport-jwt`, `cookie-parser` |
| **Bill Rendering** | Puppeteer + Sharp | Puppeteer `22.6.0`, Sharp `0.33.3` | HTML template to high-DPI JPG / PNG conversion |
| **Styling** | Tailwind CSS | Root: v4 / `apps/web`: v3.4.1 | Custom luxury jewelry palette (Kumkum Red, Antique Gold, Warm Off-White) |
| **Environment Variables** | Node / Shell | — | `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRATION_TIME`, `REDIS_URL`, `WHATSAPP_PROVIDER`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `STORAGE_DRIVER`, `PUBLIC_APP_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCK`, `VITE_API_URL` |

---

## 2. Real vs. Mock Data Analysis

### The Root Next.js Frontend (`app/page.tsx` & `lib/api/services.ts`)
- **Data Source:** Currently controlled by `const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false';` in `lib/api/services.ts`.
- **Default State:** Because `NEXT_PUBLIC_USE_MOCK` is not explicitly set to `'false'` in local environments, the Next.js app defaults to an **in-memory mock store** (`mockUsers`, `mockParties`, `mockItems`, `mockSales`, etc.).
- **Live UI Observation:** The live header displays a "Demo Role Preview · Switch Role" toggle. This toggle only mutates local React state (`const [role, setRole] = useState<'Owner' | 'Staff'>('Owner')`) and does not hit the backend authentication service.
- **Static Dates:** Hardcoded sample dates in `lib/api/services.ts` (e.g. `2026-09-30`) explain why the dashboard showed non-current dates in the live v0 preview.

### The Vite Frontend (`apps/web`) & NestJS Backend (`apps/api`)
- In `apps/web` and `apps/api`, real database operations are implemented. When connected to PostgreSQL, queries run against 17 relational tables with ACID transactions.

---

## 3. Authentication & Role Enforcement

1. **How Users Log In:**
   - In `apps/api/src/auth/auth.controller.ts`: Endpoint `POST /api/v1/auth/login` accepts `{ username, password }`.
   - Compares passwords using `argon2.verify(user.password_hash, password)`.
   - Implements brute-force protection with in-memory lockout (5 failed attempts &rarr; 5-minute lockout).
   - Issues short-lived access JWT (15 mins) and long-lived refresh JWT (7 days) via `httpOnly` secure cookies as well as JSON response payload.
2. **Where Roles Are Stored:**
   - Stored in the `users` database table as enum `user_role` (`OWNER`, `STAFF`).
   - Encoded inside the JWT payload: `{ sub: user.id, username, name, role }`.
3. **Server-Side Enforcement:**
   - `JwtAuthGuard` extracts and verifies the JWT.
   - `RolesGuard` enforces role restrictions per controller/route using `@Roles('OWNER')`. Routes without `@Roles` are denied by default.
4. **What "Switch Role" in the UI Does:**
   - In the root Next.js app, "Switch Role" is **purely cosmetic client-side state**. It changes navigation links and UI views between `OWNER_NAV` and `STAFF_NAV`, but does not issue or refresh server credentials.
   - Under Phase 2, this must be gated behind an explicit dev-only flag, and all API endpoints must validate identity from verified server sessions.

---

## 4. Data Model & PostgreSQL Schema

The schema contains 18 database objects (17 tables + sequences/triggers) defined in `infra/postgres/init.sql`:

1. **`users`**: `id` (UUID), `name`, `username` (unique), `password_hash`, `role` (`OWNER` | `STAFF`), `is_active`, `last_login_at`, `created_at`, `created_by`.
2. **`parties`**: `id` (UUID), `name`, `type` (`CUSTOMER` | `SUPPLIER` | `BOTH`), `whatsapp_number`, `address`, `opening_balance` (numeric 14,2), `is_active`, `created_at`, `created_by` (FK to users).
   - *Audit Finding:* Customers, Suppliers, and Artisans (Karigars) share this single table differentiated by `type`. Karigar-specific work types (Polish/Meena) are not yet columns in `parties`.
3. **`items`**: `id` (UUID), `name` (unique), `category`, `is_active`.
   - *Audit Finding:* Items currently lack explicit `code` / `short_code` and unit configuration (`PCS` vs `KG`).
4. **`bank_accounts`**: `id` (UUID), `name`, `opening_balance` (numeric 14,2), `is_active`.
5. **`sales`**: `id` (UUID), `bill_no` (BIGINT unique sequence), `party_id` (FK), `entry_at` (TIMESTAMPTZ default `now()`), `due_date` (DATE), `total_amount` (numeric 14,2), `status` (`OPEN` | `PARTIAL` | `PAID`), `notes`, `created_by` (FK), `is_deleted`, `deleted_at`, `deleted_by`.
6. **`sale_lines`**: `id`, `sale_id` (FK cascade), `item_id` (FK), `pieces` (INT), `weight_kg` (numeric 12,3), `rate` (numeric 14,2), `amount` (numeric 14,2).
7. **`purchases`**: `id`, `bill_no` (sequence), `party_id` (FK), `entry_at`, `due_date`, `total_amount`, `status`, `notes`, `created_by`, `is_deleted`, `deleted_at`, `deleted_by`.
8. **`purchase_lines`**: `id`, `purchase_id` (FK cascade), `item_id` (FK), `pieces`, `weight_kg`, `rate`, `amount`.
9. **`job_work_entries`**: `id`, `work_type` (`POLISH` | `MEENA`), `party_id` (FK), `item_id` (FK), `direction` (`ISSUE` | `RECEIVE`), `weight_kg` (numeric 12,3), `charge_amount` (numeric 14,2), `entry_at`, `notes`, `created_by`, `is_deleted`.
   - *Audit Finding:* Currently, `RECEIVE` entries are not directly linked to specific issue lines with pending quantity tracking.
10. **`money_vouchers`**: `id`, `voucher_no` (sequence), `kind` (`RECEIPT` | `PAYMENT`), `party_id` (FK), `mode` (`CASH` | `BANK`), `bank_account_id` (FK nullable), `amount`, `reference_no`, `entry_at`, `created_by`, `is_deleted`.
11. **`voucher_allocations`**: `id`, `voucher_id` (FK), `sale_id` (FK nullable), `purchase_id` (FK nullable), `allocated_amount`.
12. **`ledger_entries`**: `id` (BIGSERIAL), `party_id` (FK), `entry_at`, `source_type` (`SALE`, `PURCHASE`, `VOUCHER`, `JOB_WORK`, `OPENING`), `source_id`, `debit` (numeric 14,2), `credit` (numeric 14,2). Strictly append-only.
13. **`stock_movements`**: `id` (BIGSERIAL), `item_id` (FK), `entry_at`, `source_type`, `source_id`, `pieces_delta`, `kg_delta`. Strictly append-only.
14. **`reminder_settings`**: `id = 1`, `repeat_days`, `send_time`, `owner_whatsapp`, `is_active`.
15. **`reminder_log`**: `id`, `sale_id`, `party_id`, `kind`, `sent_at`, `status`.
16. **`whatsapp_messages`**: `id`, `kind`, `to_number`, `template_name`, `payload`, `status`, `provider_msg_id`, `attempts`, `created_at`.
17. **`bill_images`**: `id`, `sale_id`, `file_path`, `generated_at`, `message_id`.
18. **`audit_log`**: `id` (BIGSERIAL), `actor_id` (FK), `action`, `table_name`, `record_id`, `before_data` (JSONB), `after_data` (JSONB), `at` (TIMESTAMPTZ default `now()`). Strictly append-only.

### Triggers & Row-Level Security (RLS)
- **Immutable Triggers:** Attached to `ledger_entries`, `stock_movements`, and `audit_log`. Any `UPDATE` or `DELETE` statement triggers `block_immutable_update_delete()` and raises an exception.
- **Row-Level Security:** Declared in `init.sql` for `sales`, `purchases`, `job_work_entries`, and `money_vouchers`.
  - Condition: `current_setting('app.current_role', true) = 'OWNER' OR created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid`.

---

## 5. Ledger Engine & Sign Conventions

### Architecture
- Running balances are **computed dynamically from transactions**:
  $$\text{Current Party Balance} = \text{opening\_balance} + \sum(\text{debit}) - \sum(\text{credit})$$
- The ledger is never manually typed by users; Balance Before and Closing Balance are computed live.

### Debit / Credit Convention
- **Customer:**
  - Sale $\rightarrow$ **Debit** (Increases amount customer owes to business).
  - Receipt $\rightarrow$ **Credit** (Reduces customer debt).
  - Balance $> 0$ &rarr; Customer owes business (Receivable / Dr).
- **Supplier:**
  - Purchase $\rightarrow$ **Credit** (Increases amount business owes to supplier).
  - Payment $\rightarrow$ **Debit** (Reduces amount owed to supplier).
  - Balance $< 0$ &rarr; Business owes supplier (Payable / Cr).
- **Karigar (Artisan):**
  - Labour charges received back $\rightarrow$ **Credit** (Business owes artisan for labour).
  - Payment to artisan $\rightarrow$ **Debit** (Settles artisan dues).
- **Cash & Bank:**
  - Receipt $\rightarrow$ Increases cash or bank balance.
  - Payment $\rightarrow$ Decreases cash or bank balance.

### Worked Example: Customer Sale + Receipt
1. Customer *Rajasthan Jewellers* starts with `opening_balance = 0.00`.
2. **Sale #1001** of ₹25,000 is saved:
   - Sale header recorded: `total_amount = 25000.00`.
   - `ledger_entries`: `debit = 25000.00, credit = 0.00`.
   - New Balance: $0.00 + 25000.00 = ₹25,000.00\text{ Dr}$ (Receivable).
3. **Receipt Voucher #2001** of ₹15,000 via HDFC Bank:
   - Voucher recorded: `kind = 'RECEIPT', mode = 'BANK', amount = 15000.00`.
   - `ledger_entries`: `debit = 0.00, credit = 15000.00`.
   - Closing Balance: $25000.00 - 15000.00 = ₹10,000.00\text{ Dr}$.
   - HDFC Bank balance increments by ₹15,000.00.

---

## 6. Module-by-Module Audit

| Module | Routes / Components | Current Status | Gaps / Work Needed |
| :--- | :--- | :--- | :--- |
| **Sales** | `NewSaleModal.tsx` / `NewSalePage.tsx`, `/sales` API | Working atomic save (header + lines + stock + ledger) | Needs `ItemEntryGrid` with empty first row, Alt+C, charges breakdown (GST/Discount/Transport), and reminder link. |
| **Purchases** | `NewPurchaseModal.tsx` / `NewPurchasePage.tsx`, `/purchases` API | Working atomic save | Needs Alt+S quick add, Narration field (~500 chars), and unified calculation grid. |
| **Job Work** | `JobWorkModal.tsx` / `NewJobWorkPage.tsx`, `/job-work` API | Working basic Issue/Receive | Needs line linking (Issue line $\rightarrow$ Receive line), Difference column (Sent - Received), surplus/shortage handling, and Alt+K shortcut. |
| **Vouchers** | `VoucherModal.tsx` / `NewVoucherPage.tsx`, `/vouchers` API | Working Receipt/Payment & bill allocation | Needs instant cash/bank ledger reflections and verification that no duplicate postings occur. |
| **Parties** | `PartiesView.tsx`, `/parties` API | Working list/create | Missing mobile number masking (`••••••4321`) in API responses, Owner reveal toggle, and Karigar work types. |
| **Stock** | `StockView.tsx`, `/stock` API | Working real-time balance aggregation | Needs item short code support and dual unit (`PCS` vs `KG`) configuration. |
| **Cash & Bank** | `CashBankView.tsx`, `/bank-accounts` API | Working bank list and balance display | Needs real-time ledger link so every receipt/payment reflects immediately. |
| **Staff** | `StaffManagementView.tsx`, `/users` API | Working Owner staff management | Enforce server-side 404 scoping for staff queries. |
| **Reminders** | `RemindersView.tsx`, `/reminders` API | Working scheduler and manual triggers | Needs list filters (Due today, Overdue, Upcoming, Completed, Cancelled) and bill deletion cancellation cascade. |
| **Notifications** | `whatsapp-queue.service.ts` | Working BullMQ queue and template builder | Needs atomic `notification_outbox` table inside the DB transaction, and one-click bill image share. |
| **Audit Log** | `AuditLogView.tsx`, `/audit` API | Working audit table and logging | Needs owner-only filters (actor, entity, date range). |
| **Dashboard** | `OwnerDashboard.tsx`, `StaffHome.tsx`, `/dashboard` API | Working KPIs and summary cards | Update to reflect live server data rather than mock fallbacks. |

---

## 7. Existing Utilities, Features & Tests

- **Race-Safe Bill Numbering:** Sequences `sale_bill_seq`, `purchase_bill_seq`, and `voucher_seq` are utilized to ensure unique bill numbers across concurrent requests.
- **Transactions:** `DatabaseService.withTransaction(async (client) => { ... })` wraps multi-table operations atomically.
- **Bill View & Rendering:** `BillRendererService` generates HTML templates and converts to JPG using Puppeteer and Sharp, with a fallback to Sharp canvas rendering.
- **WhatsApp Architecture:** Pluggable `IWhatsAppProvider` with `CloudApiWhatsAppProvider` and `MockWhatsAppProvider`.
- **Existing Tests:** Unit/integration test suites exist in `apps/api/test` and `apps/web`.

---

## 8. Identified Risks & Technical Debt

1. **Floating Point Rounding:** Javascript expressions like `Number((line.weight_kg * line.rate).toFixed(2))` risk rounding differences. A single pure, unit-tested `calculateBillTotals()` using integer paise or exact decimal math is required.
2. **Staff Isolation Leakage:** Currently, querying another staff member's record throws a `403 Forbidden` (`You can only view your own entries`). To prevent enumeration, this must return a `404 Not Found`.
3. **Mock Mode Fallback:** Root Next.js app has `USE_MOCK` defaulting to true when `NEXT_PUBLIC_USE_MOCK !== 'false'`. Production builds must communicate directly with the backend API.
4. **Phone Privacy:** Full phone numbers are currently exposed in API responses. Phone numbers must be masked at the API serializer level (`••••••4321`) for non-owner requests.
