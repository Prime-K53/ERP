# Financial Integrity Audit

## Scope

This audit reviewed the active financial paths across the offline-first frontend data layer and the examination backend.

Primary frontend financial sources reviewed:

- `frontend/services/transactionService.ts`
- `frontend/services/api.ts`
- `frontend/services/bankingService.ts`
- `frontend/services/financialReportingService.ts`
- `frontend/services/reconciliationService.ts`
- `frontend/views/Dashboard.tsx`
- `frontend/context/SalesContext.tsx`
- `frontend/context/FinanceContext.tsx`
- `frontend/context/ExaminationContext.tsx`

Primary backend financial sources reviewed:

- `backend/db.cjs`
- `backend/index.cjs`
- `backend/routes/examination.cjs`
- `backend/services/examinationService.cjs`

## Findings

### 1. Multiple financial write paths existed

Before this refactor, financial records could be created through:

- `transactionService`
- direct `dbService.put(...)` calls in API helpers
- direct banking service writes
- backend examination invoice generation

This made it possible for records to exist in one store but not the others that should have reflected the same event.

### 2. Banking mirrors were incomplete

Customer payments already mirrored to `bankTransactions`, but several other financial flows did not:

- approved expenses
- income postings
- supplier payments
- internal transfers
- some order payment flows

That meant cash/bank reporting could drift away from the ledger and operational records.

### 3. Dashboard revenue had a fallback outside the ledger

The dashboard previously added examination invoice revenue directly from invoices when it could not find a ledger posting. That prevented an obvious undercount, but it also meant the dashboard could diverge from ledger truth.

### 4. Reconciliation coverage was partial

The existing reconciliation service checked customer and supplier balances plus basic orphaned ledger entries, but it did not flag:

- invoice/payment allocation mismatches
- missing bank mirrors
- broken examination invoice links
- duplicate ledger lines

### 5. Frontend and backend are not yet one physical database

The frontend IndexedDB layer remains the main persistence path for most ERP modules, while the backend SQLite database is primarily used by the examination API. This is still an architectural split and should be treated as a medium-term consolidation target.

## Refactor Implemented

### Central verified finance service

Added `frontend/services/financialIntegrityService.ts` to provide:

- verified dashboard metrics derived from persisted ledger/accounts/payments/invoices/purchases
- full audit checks for missing ledger postings
- invoice/payment reconciliation checks
- bank mirror validation
- examination link validation
- duplicate-ledger detection
- customer/supplier balance reconciliation against AR/AP

### Idempotency guardrail

Added `idempotencyKeys` store in IndexedDB and enforced duplicate-request blocking in major posting paths:

- sales
- invoices
- customer payments
- expense posting / approval
- income posting
- transfers
- supplier payments / reversals
- order posting / order payments
- goods receipts
- purchase-order approval / cancellation
- manual ledger and wallet API writes

### Missing bank mirrors fixed

The following flows now create mirrored `bankTransactions` when they hit the ledger:

- expenses
- income
- transfers
- supplier payments
- order payments

### Dashboard consistency

The dashboard now uses verified financial metrics from `financialIntegrityService` rather than supplementing ledger revenue with invoice-only fallbacks.

### Reconciliation expansion

`reconciliationService` now folds in the broader financial integrity audit so reconciliation surfaces more than just balance mismatches.

## Remaining Architecture Risks

These items still need a larger follow-on phase if the goal is a single runtime financial authority across every module:

- unify frontend IndexedDB finance posting and backend examination finance posting behind one persistent ledger service
- move all manual bank/ledger mutation entry points behind the same posting contract
- add database-level relational constraints in the backend for the non-examination ERP entities
- create a backend financial reporting API if the deployment model requires server-authoritative reports

## Expected Outcome After This Refactor

- duplicate financial submissions are blocked much earlier
- more financial flows are fully mirrored into banking
- dashboard figures are traceable back to verified persisted records
- reconciliation now exposes dead ends and broken links instead of silently tolerating them
