# Kumkum Payal — Implementation Progress

Running log for the implementation phases defined in `Claude.pdf`.

## Phase Roadmap & TODOs

- [x] **Phase 1: Audit and Change Map (No code changes)**
  - Audit existing Next.js frontend, NestJS backend, Vite app, data flow, schema, and ledger conventions.
  - Created `docs/AUDIT.md`.
  - Created `docs/CHANGE_MAP.md` (Req 1–49 breakdown).
  - Listed 7 decisions needed from client with recommended defaults.
- [x] **Phase 2: Real Roles and Staff Isolation** (Req 1, 2, 41; Req 51 Tests 1–3)
  - Verified server-side role resolution from session (`users` table, `OWNER` | `STAFF`).
  - Verified `created_by` and `created_at DEFAULT now()` across all entry tables.
  - Enforced server-side scoping; changed cross-staff record access from 403 to 404 (`NotFoundException`) across Sales, Purchases, Job Work, and Vouchers.
  - Verified Owner-only edit and delete with reversible multi-table atomic cascades and linked reminder cancellations.
  - Gated demo role preview toggle behind `process.env.NODE_ENV === 'development'`.
  - Added automated tests for cross-staff 404 security and Owner visibility.
- [x] **Phase 3: Customer, Supplier, Karigar Masters & Alt Shortcuts** (Req 8–10, 18–20, 27–29, 42)
  - Unified/extended party model with name, mobile, address, work type (Polish/Meena).
  - Mobile masking in API responses (`••••••4321`) with Owner show toggle.
  - Shared `QuickAddPartyDialog(type)`.
  - Keyboard shortcuts: `Alt+C` (Sales), `Alt+S` (Purchase), `Alt+K` (Job Work).
  - Audit logs for party create/edit.
- [x] **Phase 4: Shared Fast-Entry Item Grid, Save Shortcut & Backspace** (Req 11, 12, 15, 16, 21, 22, 30, 42, 43, 44)
  - Unified `ItemEntryGrid` component with auto-focused first row and auto-appending new rows.
  - Tab/Enter navigation, arrow keys in item dropdown, `Ctrl+Delete` row deletion.
  - Units configuration (`PCS` integer, `KG` 3 decimals), pure zero-float calculation functions.
  - Shared save shortcut (`Ctrl+S` / `Cmd+S`, `Ctrl+Enter`) with in-flight lock and idempotency key.
  - Non-input Backspace navigation guard.
- [x] **Phase 5: Sales Bill** (Req 2, 11–17, 40, 46, 48, 49)
  - Wire `ItemEntryGrid` with customer selector and `Alt+C`.
  - Fetch previous balance from ledger: Previous Balance | This Bill | Closing Balance.
  - Configurable charges: GST, Discount (Fixed/Percent), Transport, Packaging, Other Charges, Round-Off.
  - Pure calculation engine `calculateBillTotals` with 0-float integer arithmetic and validation.
  - Optional payment reminder linked to sale (inserted into `payment_reminders`).
  - Dynamic historical ledger calculation on `findOne`: `balance_before | this_bill | balance_after`.
  - Atomic database transaction (bill header + lines + ledger + stock + reminder + audit + outbox).
- [x] **Phase 6: Purchase Bill** (Req 18–26)
  - Mirror Sales implementation with supplier selector and `Alt+S` quick add.
  - Supplier ledger direction (purchase increases accounts payable / credit to supplier).
  - 3-column live supplier balance indicator: Previous Balance | This Purchase | Closing Balance (Payable / Cr).
  - Narration text field (~500 chars) on purchase bill with counter and DB column.
  - Full charges breakdown: Subtotal, Discount, Taxable, GST (3%), Transport, Packaging, Other, Round-off.
  - Optional payment reminder linked to purchase bill (`payment_reminders` row).
  - Atomic transaction (header + lines + stock inward + ledger payable + reminder + audit + outbox).
  - Unified All Entries table supporting both Sales (↗) and Purchases (↙) with type filters and soft-delete reversal.
- [x] **Phase 7: Job Work (Karigar)** (Req 27–33)
  - Sent (Issue) screen using `ItemEntryGrid` with empty first row and fast keyboard entry.
  - Karigar selector with `Alt+K` quick add dialog and live ledger balance (Payable / Cr).
  - Received Back screen listing ONLY lines sent to THAT Karigar with pending > 0, grouped by issue.
  - Line-by-line `Sent | Already Received | Receive Input | Difference` (-2 red, +2 green, 0 neutral; 3 decimals for KG).
  - Partial receipts supported across multiple entries; remainder stays pending by default with 'Close line with shortage' checkbox option.
  - Labour charges per line posted to Karigar ledger as payable on Receive Back.
  - Stock movements correctly updated: leaves workshop on Issue, returns on Receive.
  - Full atomic transactions, staff isolation scoping, and soft-delete reversal safeguards.
- [x] **Phase 8: Receipt and Payment with Cash/Bank and Balances** (Req 34–39, 46)
  - Pre-requisite architectural review of existing Cash/Bank books and ledger design explained to user.
  - Receipt (money IN) and Payment (money OUT) recorded with exactly ONE atomic cash/bank update (authoritative query over non-deleted `money_vouchers`).
  - Added migration `007_vouchers_notes_and_idempotency` (`idempotency_key UUID UNIQUE`, `notes TEXT`).
  - Dynamic party ledger calculation on `findOne`: `balance_before | this_voucher | balance_after`.
  - Frontend live 3-column balance card: `Previous Balance | This Entry | Closing Balance` (with Dr/Cr indicators).
  - Non-blocking Advance Payment warning banner (Req 36) when payment exceeds payable balance.
  - Bill allocation table across unpaid invoices with zero-float integer paise validation.
  - Save shortcut (`Ctrl+S`, `Cmd+S`, `Ctrl+Enter`) with in-flight lock, UUID idempotency key, and backspace navigation guard.
  - Outbox notification event `VOUCHER_CREATED` and audit log snapshots.
  - Automated unit test suite `test/voucher-calculations.test.ts` (7/7 tests passing).
- [x] **Phase 9: Reminders Module Extension** (Req 5, 14, 24)
  - Backend payment reminders management API (`GET /reminders`, `POST /reminders`, `PATCH /reminders/:id/status`) with staff isolation.
  - Linked reminders from sales and purchases bills with cancellation cascades on bill soft-delete.
  - Manual payment reminder creation with party selector, date picker, integer paise amount, and notes.
  - Reminders categorization engine (`lib/calculations/reminder-calculations.ts`): Overdue, Due Today, Upcoming, Settled, Cancelled, Dismissed.
  - Reminders UI (`components/RemindersView.tsx`): 4 KPI cards (Overdue, Today, Upcoming, Settled), filter chips, party filter, dynamic queue table, quick status actions (`✓ Settle`, `Dismiss`, `Cancel`), and scheduler automation settings.
  - Added Reminders tab to `STAFF_NAV` so staff can manage their own overdue follow-ups.
  - Automated unit test suite `test/reminders-filtering.test.ts` (5/5 tests passing).
- [x] **Phase 10: Notifications and WhatsApp** (Req 3, 4, 34, 37, 47)
  - Atomic `notification_outbox` table writes for all mutations (`SALE_CREATED`, `PURCHASE_CREATED`, `JOB_WORK_CREATED`, `VOUCHER_CREATED`).
  - Outbox API endpoints: `GET /whatsapp/outbox` with delivery status filters, `POST /whatsapp/outbox/process`, and `POST /whatsapp/outbox/:id/retry` (Req 4).
  - Outbox log table in Admin Settings UI with real-time delivery status badges (`SENT`, `FAILED`, `PENDING`), error details, and retry actions.
  - WhatsApp message formatting engine (`lib/calculations/whatsapp-share.ts`) with Indian phone normalization and encoded prefilled `wa.me` links.
  - One-click "📱 WhatsApp" share button in `AllEntriesView` with rich bill summary prefilling.
  - Automated unit test suite `test/notifications-dispatch.test.ts` (5/5 tests passing).
- [x] **Phase 11: Sales Orders and Purchase Orders** (Req 6, 7)
  - Database schema & migration `008_sales_orders_and_purchase_orders`: `sales_orders`, `sales_order_lines`, `purchase_orders`, `purchase_order_lines`, and foreign key `order_id` links on `sales` and `purchases`.
  - Non-financial commitment invariant: Orders do not affect ledger entries or stock movements until conversion.
  - Server-enforced staff isolation: staff see only own orders; cross-staff access returns 404 `NotFoundException`; owner-only soft delete.
  - Backend NestJS Orders module (`apps/api/src/orders/`) with `findAll`, `findOne`, `create`, `convertToBill`, `updateStatus`, `softDelete`.
  - Linked bill creation: `sales.order_id` and `purchases.order_id` with automatic status transition to `COMPLETED`.
  - Frontend Orders view (`components/OrdersView.tsx`): SO and PO switcher, 4 KPI cards (Total, Pending, Value, Fulfilled), status filters, text search, fast-entry `ItemEntryGrid`, `Ctrl+S` shortcut, WhatsApp share, and "⚡ Convert to Bill" workflow.
  - Added Orders tab to `OWNER_NAV` and `STAFF_NAV` in `app/page.tsx`.
  - Automated unit test suite `test/orders-calculations.test.ts` (5/5 tests passing).
- [ ] **Phase 12: Audit Log Verification, Acceptance Testing & Change Report** (Req 41, 50, 51, 52)
  - Comprehensive audit log filters and verification.
  - 14 acceptance test runs across Owner and Staff roles.
  - Edge cases, shortcuts, and ledger integrity verification script.
  - Final `docs/CHANGE_REPORT.md`.

---

## Current Status
- **Completed:** Phase 1 (Audit & Change Map), Phase 2 (Real Roles and Staff Isolation), Phase 3 (Customer, Supplier, Karigar Masters & Alt Shortcuts), Phase 4 (Shared Fast-Entry Item Grid, Save Shortcut & Backspace), Phase 5 (Sales Bill with Charges, Dynamic Ledger Balance, and Payment Reminder), Phase 6 (Purchase Bill with Accounts Payable, Narration, and Charges), Phase 7 (Job Work with Issue Grid, Linked Receive Lines, Difference Calculation, and Labour Charges), Phase 8 (Receipt and Payment Vouchers with Cash/Bank Books, Live Balances, and Advance Warnings), Phase 9 (Reminders Module Extension with Queue Table, KPI Cards, and Manual Creation), Phase 10 (Notifications and WhatsApp with Outbox Tracking, Retries, and One-Click Bill Sharing), Phase 11 (Sales Orders and Purchase Orders with Decoupled Invariants and Convert to Bill Workflow).
- **Next Phase:** Phase 12 — Audit Log Verification, Acceptance Testing & Change Report (Req 41, 50, 51, 52).



