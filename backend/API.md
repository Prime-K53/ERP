# Prime ERP Backend API

Base URL: `http://localhost:3000/api`

Authentication: Bearer JWT token in `Authorization` header.
Company context: `x-company-id` header.

---

## Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server + database connectivity check |

## Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard?days=30` | Aggregated sales/invoice metrics |

## Sales
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sales` | view_sales | List sales with optional search/filter |
| POST | `/api/sales` | create_sale | Create POS sale |
| PUT | `/api/sales/:id` | edit_sale | Update sale |
| DELETE | `/api/sales/:id` | delete_sale | Soft-void sale |
| GET | `/api/sales-orders` | view_sales_orders | List sales orders |
| GET | `/api/sales-orders/:id` | view_sales_orders | Get sales order by ID |
| POST | `/api/sales-orders` | create_sales_order | Create sales order |
| PUT | `/api/sales-orders/:id` | edit_sales_order | Update sales order |
| DELETE | `/api/sales-orders/:id` | delete_sales_order | Delete sales order |
| GET | `/api/sales-exchanges` | view_exchanges | List exchanges |
| GET | `/api/sales-exchanges/:id` | view_exchanges | Get exchange detail |
| POST | `/api/sales-exchanges` | create_exchange | Create exchange request |
| POST | `/api/sales-exchanges/:id/approve` | approve_exchange | Approve exchange |

## Finance / Accounting
| Method | Path | Validation | Description |
|--------|------|-----------|-------------|
| GET | `/api/accounts` | — | List chart of accounts |
| GET | `/api/accounts/:id` | — | Get account by ID |
| POST | `/api/accounts` | accountSchemas.create | Create account |
| PUT | `/api/accounts/:id` | accountSchemas.update | Update account |
| DELETE | `/api/accounts/:id` | — | Delete account |
| GET | `/api/ledger` | — | List ledger entries (query: `?account_id=`) |
| POST | `/api/ledger` | journalEntry schema | Post journal entry (debit/credit lines) |
| GET | `/api/expenses` | — | List expenses |
| POST | `/api/expenses` | expenseSchemas.create | Create expense |
| PUT | `/api/expenses/:id` | expenseSchemas.update | Update expense |
| DELETE | `/api/expenses/:id` | — | Delete expense |
| GET | `/api/income` | — | List income records |
| POST | `/api/income` | incomeSchemas.create | Record income |
| DELETE | `/api/income/:id` | — | Delete income |
| GET | `/api/budgets` | — | List budgets |
| POST | `/api/budgets` | budgetSchemas.create | Create budget |
| PUT | `/api/budgets/:id` | budgetSchemas.update | Update budget |
| DELETE | `/api/budgets/:id` | — | Delete budget |
| GET | `/api/transfers` | — | List transfers (includes account names) |
| POST | `/api/transfers` | transferSchemas.create | Execute fund transfer |

## Procurement
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suppliers` | List suppliers |
| GET | `/api/suppliers/:id` | Get supplier detail |
| POST | `/api/suppliers` | Create supplier |
| PUT | `/api/suppliers/:id` | Update supplier |
| DELETE | `/api/suppliers/:id` | Delete supplier |
| GET | `/api/purchases` | List purchase orders |
| GET | `/api/purchases/:id` | Get PO with line items |
| POST | `/api/purchases` | Create PO (with items array) |
| PUT | `/api/purchases/:id/status` | Update PO status `{ "status": "Approved" }` |
| GET | `/api/grn` | List goods receipts |
| POST | `/api/grn` | Create goods receipt |

## Production
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/production/work-centers` | List active work centers |
| POST | `/api/production/work-centers` | Create work center |
| GET | `/api/production/resources` | List active resources |
| POST | `/api/production/resources` | Create resource |
| GET | `/api/production/work-orders` | List work orders |
| GET | `/api/production/work-orders/:id` | Get work order |
| POST | `/api/production/work-orders` | Create work order |
| PUT | `/api/production/work-orders/:id` | Update work order |
| DELETE | `/api/production/work-orders/:id` | Delete work order |
| GET | `/api/production/batches` | List production batches |
| POST | `/api/production/batches` | Create batch |

## HR
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/employees` | List employees |
| POST | `/api/employees` | Create employee |
| PUT | `/api/employees/:id` | Update employee |
| DELETE | `/api/employees/:id` | Delete employee |
| GET | `/api/payroll-runs` | List payroll runs |
| POST | `/api/payroll-runs` | Create payroll run |
| GET | `/api/payslips` | List payslips |
| POST | `/api/payslips` | Create payslip |

## Documents
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/documents/register` | create_document | Register or update document |
| POST | `/api/documents` | create_document | Create new document |
| PUT | `/api/documents/:id` | edit_document | Update document payload |
| POST | `/api/documents/:id/finalize` | finalize_document | Finalize with blueprint |
| POST | `/api/documents/:id/void` | void_document | Void document |
| GET | `/api/documents/:identifier/preview` | view_document | Get preview render model |
| GET | `/api/documents/:id/export` | export_document | Export document |
| POST | `/api/documents/batch/finalize` | batch_finalize | Batch finalize |
| POST | `/api/documents/batch/export` | batch_export | Batch export |
| GET | `/api/documents/:id/verify` | verify_document | Verify document integrity |
| GET | `/api/reprint-jobs` | view_reprints | List reprint jobs |
| PUT | `/api/reprint-jobs/:id` | edit_reprint | Update reprint job |

## System
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| All | `/api/system/*` | admin_settings | System configuration routes |
| All | `/api/whatsapp` | — | WhatsApp integration routes |
| All | `/api/tasks` | — | Background task management |

## Customer Portal Lifecycle (`/api/portal/*`, portal JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/portal/requests` | List the customer's requests |
| POST | `/portal/requests` | Submit a quotation/order request |
| GET | `/portal/requests/:id` | Request detail |
| POST | `/portal/requests/:id/cancel` | Cancel a draft/submitted request |
| GET | `/portal/quotations` | List official quotations (expiry enforced lazily) |
| GET | `/portal/quotations/:id` | Quotation detail (expiry enforced on read) |
| POST | `/portal/quotations/:id/accept` | Accept quotation (records digital signature) |
| POST | `/portal/quotations/:id/reject` | Reject quotation (records signature, requires `reason`) |
| POST | `/portal/quotations/:id/revision` | Request revision (records signature, requires `comments`) |
| GET | `/portal/quotations/:id/versions` | Quotation version history (immutable snapshots) |
| GET | `/portal/quotations/:id/versions/:version` | Single version snapshot detail |
| GET | `/portal/quotations/:id/signatures` | Decision signatures for a quotation |
| GET | `/portal/orders` | List official sales orders |
| GET | `/portal/orders/:id` | Order detail |
| POST | `/portal/orders/:id/reorder` | Create a reorder request from an order |
| GET | `/portal/document-chain?docType=&docId=` | Resolve request → quotation → order chain |
| GET | `/portal/timeline?docType=&docId=` | Merged chronological history for a document |
| POST | `/portal/downloads` | Record a gated+audited PDF download |
| GET | `/portal/comments?docType=&docId=` | Discussion comments visible to the customer |
| POST | `/portal/comments` | Post a customer comment on a document |
| GET | `/portal/dashboard` | Customer dashboard metrics |
| GET | `/portal/notifications` | Customer notifications |

## Portal Admin (`/api/portal/admin/*`, admin JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/portal/admin/requests` | List customer requests (optional `?status=`) |
| POST | `/portal/admin/requests/:id/mark` | Toggle the marked flag (admin follow-up) |
| DELETE | `/portal/admin/requests/:id` | Delete (clear) a request - soft delete (cancelled + deleted_at) |
| POST | `/portal/admin/requests/:id/generate-quotation` | Start quotation flow (no number reserved) |
| POST | `/portal/admin/requests/:id/complete-quotation` | Link saved ERP quotation (creates version 1 snapshot) |
| POST | `/portal/admin/requests/:id/generate-order` | Start sales-order flow (no number reserved) |
| POST | `/portal/admin/requests/:id/complete-order` | Link saved ERP sales order |
| GET | `/portal/admin/quotations` | List official quotations (`?status=` filter) |
| GET | `/portal/admin/quotations/:id` | Quotation detail |
| POST | `/portal/admin/quotations/:id/regenerate` | Regenerate after revision (creates version snapshot) |
| POST | `/portal/admin/quotations/:id/convert-to-order` | Convert accepted quotation into sales order |
| GET | `/portal/admin/quotations/:id/versions` | Quotation version history |
| GET | `/portal/admin/quotations/:id/versions/:version` | Single version snapshot detail |
| GET | `/portal/admin/quotations/:id/signatures` | Decision signatures for a quotation |
| GET | `/portal/admin/orders` | List official sales orders |
| POST | `/portal/admin/orders/:id/status` | Advance sales-order status (validated transition, notifies customer) |
| GET | `/portal/admin/comments?docType=&docId=` | All discussion comments incl. internal notes |
| POST | `/portal/admin/comments` | Post comment (`visibility`: `customer` \| `internal`) |
| GET | `/portal/admin/notifications` | Admin notifications |
| GET | `/portal/admin/analytics` | Request/quotation/download analytics |
| GET | `/portal/admin/activity` | Merged customer activity feed |

## Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/auth/users` | List users (admin) |

## Error Responses
All endpoints return JSON:
```json
{ "error": "message", "details": [...] }
```
HTTP status codes: 200 (success), 201 (created), 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error).
