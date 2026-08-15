# Examination Module Guide
## Prime ERP System

Last updated: February 26, 2026

## 1. Scope

The examination module currently has two active implementation layers:

- Batch workflow (server-backed): create, price, approve, and invoice examination batches.
- Job/group workflow (local IndexedDB): legacy-compatible job pricing, invoice grouping, and recurring profile automation.

This guide documents the current behavior and routes implemented in code.

## 2. Frontend Routes

### 2.1 Batch workflow (primary)

- `/examination/batches`
- `/examination/batches/new`
- `/examination/batches/:id`

### 2.2 Job/group workflow (legacy-compatible screens)

- `/examination/jobs/new`
- `/examination/jobs/:id`
- `/examination/groups`
- `/examination/recurring`

Notes:
- `/examination` redirects to `/examination/batches`.
- Sales invoice navigation targets `/sales-flow/invoices`.

## 3. Core Frontend Files

- `views/examination/ExaminationHub.tsx`
- `views/examination/ExaminationBatchForm.tsx`
- `views/examination/ExaminationBatchDetail.tsx`
- `views/examination/ExaminationJobForm.tsx`
- `views/examination/InvoiceGroupManager.tsx`
- `views/examination/RecurringProfiles.tsx`
- `context/ExaminationContext.tsx`
- `services/examinationBatchService.ts`
- `services/examinationJobService.ts`
- `services/examinationSyncService.ts`

## 4. Server API (Batch workflow)

Base path: `/api/examination`

### 4.1 Batches

- `GET /batches`
- `GET /batches/:id`
- `POST /batches`
- `PUT /batches/:id`
- `DELETE /batches/:id`
- `POST /batches/:id/calculate`
- `POST /batches/:id/approve`
- `POST /batches/:id/invoice`

### 4.2 Classes and subjects

- `POST /classes`
- `PUT /classes/:id`
- `PUT /classes/:id/pricing`
- `GET /classes/:id/pricing-history`
- `DELETE /classes/:id`
- `POST /subjects`
- `PUT /subjects/:id`
- `DELETE /subjects/:id`

### 4.3 Pricing settings and sync

- `GET /settings/pricing`
- `PUT /settings/pricing`
- `GET /meta/adjustments`
- `POST /sync/market-adjustments`
- `POST /sync/inventory-items`
- `GET /sync/health`
- `POST /backfill/recalculate-non-invoiced`

### 4.4 Deprecated endpoint

- `GET /batches/:id/bom` returns an empty list and is kept for backward compatibility.

## 5. Data and Pricing Behavior

- Batch pricing is class-based and stores calculated and manual-override values.
- Manual class override requires reason entry and permission `examination.cost.override`.
- Invoice generation supports idempotency using `x-idempotency-key`.
- Market adjustments and BOM-relevant inventory can be synced from local stores to backend before recalculation.

## 6. Recurring Profiles

Recurring profiles are persisted locally in `examinationRecurringProfiles` store.

Supported actions:
- Create recurring profile from job or group source.
- Pause profile.
- Resume profile.
- Delete profile.
- Run recurring billing now.

Validation rules:
- Start date is required.
- End date cannot be earlier than start date.
- Duplicate non-expired profile for the same source is blocked.

## 7. Troubleshooting

### 7.1 Batch cannot calculate

- Confirm classes and subjects have valid learner/page counts.
- Confirm pricing settings contain valid paper/toner material mapping.
- Check backend `/api/examination/sync/health` for drift indicators.

### 7.2 Invoice generated but not visible in Sales

- Ensure invoice sync succeeded from examination batch flow.
- Open `/sales-flow/invoices` and filter by generated invoice id in navigation state.

### 7.3 Recurring profile resume fails

- Profile may already be expired by end date.
- Update or recreate profile with a valid end date window.

## 8. Related Docs

- `docs/examination-batch-cost-engine-technical-design.md`
- `docs/examination-batch-cost-workflow.md`
- `docs/examination-module-bom-configuration-analysis.md`
