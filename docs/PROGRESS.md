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
- [ ] **Phase 7: Job Work (Karigar)** (Req 27–33)
  - Sent (Issue) with work type (Polish/Meena), item, qty, weight.
  - Received Back linked to issue lines showing Sent | Received | Difference.
  - Partial receipts and surplus handling.
  - Labour charges per line posted to Karigar ledger.
- [ ] **Phase 8: Receipt and Payment with Cash/Bank and Balances** (Req 34–39, 46)
  - Explain existing Cash/Bank design.
  - Receipt (money IN) and Payment (money OUT) with single cash/bank ledger posting.
  - Real-time balance updates (Balance Before | This Entry | Closing Balance).
- [ ] **Phase 9: Reminders Module Extension** (Req 5, 14, 24)
  - Link reminders to transactions (Sales/Purchases) and support manual reminders.
  - Filters: Due today, Overdue, Upcoming, Completed, Cancelled.
  - Cancellation cascade when linked bill is deleted.
- [ ] **Phase 10: Notifications and WhatsApp** (Req 3, 4, 34, 37, 47)
  - Atomic `notification_outbox` table written inside the accounting transaction.
  - Post-commit async dispatcher.
  - `WhatsAppProvider` (Cloud API + manual `wa.me` fallback).
  - Bill image generator (PNG/JPEG) with one-click send.
- [ ] **Phase 11: Sales Orders and Purchase Orders** (Req 6, 7)
  - Orders tables decoupled from financial ledger and stock.
  - Statuses: Pending, Partially fulfilled, Completed, Cancelled.
  - "Convert to Bill" flow prefilling pending quantities.
- [ ] **Phase 12: Audit Log Verification, Acceptance Testing & Change Report** (Req 41, 50, 51, 52)
  - Comprehensive audit log filters and verification.
  - 14 acceptance test runs across Owner and Staff roles.
  - Edge cases, shortcuts, and ledger integrity verification script.
  - Final `docs/CHANGE_REPORT.md`.

---

## Current Status
- **Completed:** Phase 1 (Audit & Change Map), Phase 2 (Real Roles and Staff Isolation), Phase 3 (Customer, Supplier, Karigar Masters & Alt Shortcuts), Phase 4 (Shared Fast-Entry Item Grid, Save Shortcut & Backspace), Phase 5 (Sales Bill with Charges, Dynamic Ledger Balance, and Payment Reminder), Phase 6 (Purchase Bill with Accounts Payable, Narration, and Charges).
- **Next Phase:** Phase 7 — Job Work (Karigar Issue & Receive Back with Difference and Labour Charges) (Req 27–33).


