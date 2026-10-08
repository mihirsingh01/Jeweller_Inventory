# Requirements Change Map: Kumkum Payal (Req 1–49)

This matrix maps every requirement from the client specifications against the existing codebase, identifying the exact changes across the database, server API, UI, and permission layers.

---

## Change Map Matrix

| Req | Exists today? | Required change | DB change | Server/API change | UI change | Permission change | Risk | Phase |
| :---: | :---: | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **1** | Partial | Enforce strict staff isolation across all queries | Verify `created_by` on all entry tables | Query scoping helper; return 404 on other staff records | Remove client role toggle | Staff queries scoped to `created_by = user.id` | Low | 2 |
| **2** | Partial | Owner sees and manages everything; staff cannot edit/delete | None | Reject staff edit/delete at API layer | Hide edit/delete actions for staff | Only `OWNER` role permitted to update/delete | Low | 2 |
| **3** | Partial | Owner alert on new entries via WhatsApp | Add `notification_outbox` table | Queue outbox row in same DB transaction | None | None | Med | 10 |
| **4** | Partial | Notification delivery status and retry | Fields in `notification_outbox` | Delivery status webhook and retry cron | Show delivery badge and Retry button | Owner-only notifications log | Low | 10 |
| **5** | Partial | Overdue payment reminder scheduler | Link reminders to sales/purchases | Filter reminders (due today, overdue, upcoming) | Overdue highlighted badge | Staff see only own reminders | Low | 9 |
| **6** | No | Sales Orders (SO series, no ledger impact) | Create `sales_orders` and lines tables | CRUD API for SO; "Convert to Bill" endpoint | SO form + convert to sales bill action | Staff isolation per Phase 2 | Med | 11 |
| **7** | No | Purchase Orders (PO series, no ledger impact) | Create `purchase_orders` and lines tables | CRUD API for PO; "Convert to Bill" endpoint | PO form + convert to purchase bill action | Staff isolation per Phase 2 | Med | 11 |
| **8** | Yes | Customer Master with mobile and address | None | Validate Indian mobile (10 digits) | Address and phone fields in form | None | Low | 3 |
| **9** | No | Mask customer phone number in API responses | None | Return masked `••••••4321` to non-owners | Owner show/reveal toggle button | Staff never receive unmasked phone from server | Low | 3 |
| **10** | No | Quick-add Customer with Alt+C shortcut | None | Quick party create endpoint | `QuickAddPartyDialog` + `Alt+C` hook | None | Low | 3 |
| **11** | Partial | Shared fast-entry item grid (auto-focus first row, auto-add row) | None | None | Implement reusable `ItemEntryGrid` | None | Low | 4 |
| **12** | Partial | Item type-ahead by name and short code | Add `code` column to `items` table | Search items by name or code | Autocomplete supporting code search | None | Low | 4 |
| **13** | Partial | Customer balance display: Previous \| This Bill \| Closing Balance | None | Endpoint returning ledger-derived balance | Live balance display below customer selector | Staff view balance figure, not other staff entries | Med | 5 |
| **14** | Partial | Payment reminder option on sales bill | None | Save reminder in same transaction | Toggle 'Set reminder' on bill form | None | Low | 5 |
| **15** | No | Item bill charges: GST, Discount, Transport, Packaging, Other | Add charge breakdown columns to `sales` | Calculate and persist individual charge values | Tax & charges fields below item grid | None | Med | 5 |
| **16** | No | Save shortcut (`Ctrl+S`/`Cmd+S`, `Ctrl+Enter`) & in-flight lock | Add `idempotency_key` column | Verify idempotency key on submission | Global keyboard save handler with loading lock | None | Low | 4 |
| **17** | Yes | Atomic sales save across header, lines, stock, and ledger | None | Ensure `withTransaction` wraps all entities | Toast notification with bill number | None | Low | 5 |
| **18** | Yes | Supplier Master with mobile and address | None | Validate Indian mobile format | Address and phone fields in form | None | Low | 3 |
| **19** | No | Mask supplier phone number in API responses | None | Mask in serializer (`••••••4321`) | Owner show/reveal toggle | Staff never receive unmasked phone | Low | 3 |
| **20** | No | Quick-add Supplier with Alt+S shortcut | None | Quick party create endpoint | `QuickAddPartyDialog` + `Alt+S` hook | None | Low | 3 |
| **21** | Yes | Purchase bill item grid supporting PCS and KG | None | Validate units per line | `ItemEntryGrid` wired to purchase form | None | Low | 6 |
| **22** | Yes | Purchase rate and line amount calculations | None | Pure unit-tested calculation logic | Real-time amount calculation | None | Low | 4 |
| **23** | Partial | Supplier balance: Previous \| This Purchase \| Closing Balance | None | Derive supplier balance from ledger | Live balance display (Payable / Cr) | None | Med | 6 |
| **24** | Partial | Payment reminder option on purchase bill | None | Save supplier reminder atomically | Toggle 'Set reminder' on purchase form | None | Low | 6 |
| **25** | No | Narration text field (~500 chars) on purchase bill | Add `narration` column to `purchases` | Persist narration on purchase save | Multiline narration textarea on purchase form | None | Low | 6 |
| **26** | Yes | Atomic purchase save (header, lines, stock, ledger) | None | Transaction wrapping all mutations | Reset form upon success | None | Low | 6 |
| **27** | Partial | Karigar Master with work type (Polish / Meena) | Add `work_types` column to `parties` | Validate work type on creation | Work type multiselect on Karigar form | None | Low | 3 |
| **28** | No | Mask Karigar phone number in API responses | None | Mask in serializer (`••••••4321`) | Owner show/reveal toggle | Staff receive masked phone | Low | 3 |
| **29** | No | Quick-add Karigar with Alt+K shortcut | None | Quick party create endpoint | `QuickAddPartyDialog` + `Alt+K` hook | None | Low | 3 |
| **30** | Yes | Job Work Issue screen with fast item entry | None | None | Wire `ItemEntryGrid` to Job Work Issue | None | Low | 7 |
| **31** | Partial | Karigar Previous Balance \| Labour This Entry \| Closing Balance | None | Dynamic Karigar ledger calculation | Live balance indicators | None | Med | 7 |
| **32** | No | Job Work Received Back linked to issue lines with Difference | Add `issue_line_id` FK to receive lines | Compute Sent - Received difference | Group pending issue lines; color-coded diff | None | High | 7 |
| **33** | Partial | Labour charge per line posted to Karigar ledger | None | Post labour charge on receive back | Labour charge inputs per line | None | Med | 7 |
| **34** | Yes | Receipt voucher (money IN from customer) | None | Record receipt atomically | Receipt form with mode and bank account | None | Low | 8 |
| **35** | Ambiguous | Customer receipt bill allocation / ledger integrity | None | Do not build auto-supplier postings until clarified | Standard allocation list | None | Low | 8 |
| **36** | Yes | Payment voucher (money OUT to supplier/karigar) | None | Record payment atomically | Payment form with warning if taking balance negative | None | Low | 8 |
| **37** | Partial | WhatsApp confirmation message to party after voucher save | Outbox row | Enqueue party receipt/payment notification | WhatsApp status feedback | None | Med | 10 |
| **38** | Yes | Bank receipt updates bank balance immediately | None | Verify bank ledger synchronization | Live bank account balance refresh | None | Low | 8 |
| **39** | Yes | Exactly ONE cash/bank ledger entry per voucher | None | Verify single-posting invariant | None | None | Low | 8 |
| **40** | Yes | Sales bill print / view showing ledger-based balances | None | Compute historical balance at entry time | Print layout with Before/This/Closing balance | None | Low | 5 |
| **41** | Partial | Reversible Owner edit and delete with audit trail | Ensure soft-delete columns on all entities | Reversing ledger/stock rows + snapshot audit | Owner edit/delete buttons with confirmation modal | Owner only | High | 2 |
| **42** | No | Backspace-to-go-back keyboard navigation guard | None | None | Shared hook guarding non-input Backspace | None | Low | 4 |
| **43** | Partial | Pure mathematical calculations without floating point errors | None | Implement `calculateBillTotals()` using integer paise | Pure utility functions shared across forms | None | Low | 4 |
| **44** | Partial | Items configured with allowed units (`PCS`, `KG`, or both) | Add `allowed_units`, `default_unit` to `items` | Validate line units against allowed item units | Unit dropdown offering only valid units | None | Low | 4 |
| **45** | Yes | Stock register item tracking computed from movements | None | Verify append-only movement balance calculation | Real-time stock register table | None | Low | 4 |
| **46** | Yes | Ledger integrity: displayed balance equals sum of ledger entries | None | Enforce invariant across all views | Real-time calculation | None | Low | 5, 8 |
| **47** | Partial | One-click 'Send Bill on WhatsApp' with PNG rendering | None | Headless rendering and public expiring media URL | Action button on bill view (API / Web share fallback) | None | Med | 10 |
| **48** | Yes | Race-safe sequential bill numbering via database sequences | Sequences exist in schema | Use `nextval()` within transaction | Read-only sequence display | None | Low | 5, 6 |
| **49** | Yes | Atomic multi-table rollback on error | None | Wrap all entity mutations in `withTransaction` | Detailed error toast on failure | None | Low | 5, 6 |

---

## Decisions Needed from Client

The following 7 decisions have been identified from the requirements. The recommended defaults will be utilized unless overridden:

1. **Can staff edit or delete their own entries?** (Affects Phase 2)  
   - *Recommended Default:* **Owner only**. Staff cannot edit or delete entries once saved.
2. **Can staff see a customer's total outstanding balance?** (Affects Phases 2, 5)  
   - *Recommended Default:* **Yes, show the total balance figure**, but do not reveal underlying entries created by other staff members.
3. **What does Req 35 mean (supplier/karigar postings from customer receipt)?** (Affects Phase 8)  
   - *Recommended Default:* **Do not implement automatic cross-party postings** from customer receipts until explicitly clarified by the client.
4. **Mask mobile numbers or hide them fully? Can Owner reveal them?** (Affects Phase 3)  
   - *Recommended Default:* **Mask in API responses (`••••••4321`)** for staff. Provide a show/reveal toggle for the Owner.
5. **GST rates, discount application order, and transport/packaging taxation?** (Affects Phases 5, 6)  
   - *Recommended Default:* **Discount first**, then apply GST on the resulting taxable value:  
     $$\text{Taxable Value} = \text{Subtotal} - \text{Discount}$$  
     $$\text{Grand Total} = \text{Taxable Value} + \text{GST} + \text{Transport} + \text{Packaging} + \text{Other}$$
6. **Will the client provide an official Meta WhatsApp Business API account?** (Affects Phase 10)  
   - *Recommended Default:* **Support both**: Use Cloud API when credentials are provided in `.env`; otherwise fall back to direct `wa.me` prefilled chat links on desktop and native Web Share on mobile.
7. **Labour charge timing for Job Work?** (Affects Phase 7)  
   - *Recommended Default:* **Per-line charge posted to the Karigar ledger when work is received back**, not when originally issued.
