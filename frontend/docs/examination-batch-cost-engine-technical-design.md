# Examination Batch Cost Engine - Technical Design

## 1. Purpose
This design defines the enhanced examination batch pricing flow for:
- Automatic BOM + adjustment calculation on batch creation.
- Suggested cost-per-learner derivation per class.
- Permission-gated manual override with automatic adjustment redistribution.
- Full auditability and performance guarantees for large candidature sizes.

## 2. Scope Implemented
- Backend pricing engine: [`server/services/examinationPricingEngine.cjs`](../server/services/examinationPricingEngine.cjs)
- Backend orchestration: [`server/services/examinationService.cjs`](../server/services/examinationService.cjs)
- API routes: [`server/routes/examination.cjs`](../server/routes/examination.cjs)
- Schema updates: [`server/db.cjs`](../server/db.cjs), [`server/migrations/add_examination_cost_engine.cjs`](../server/migrations/add_examination_cost_engine.cjs), [`database/erp_schema_postgresql.sql`](../database/erp_schema_postgresql.sql)
- Frontend integration: [`views/examination/ExaminationBatchDetail.tsx`](../views/examination/ExaminationBatchDetail.tsx), [`services/examinationBatchService.ts`](../services/examinationBatchService.ts)

## 3. Calculation Flow
1. Batch creation (`POST /api/examination/batches`)
- Creates `examination_batches` row.
- Triggers `calculateBatch(..., { trigger: 'AUTO_CREATE' })`.

2. Batch calculation (`calculateBatch`)
- Resolves default paper/toner materials.
- Resolves effective unit costs using:
  - weighted active material batch cost;
  - latest inbound transaction cost;
  - inventory fallback.
- Aggregates per-class sheets/pages from subjects.
- Computes material costs:
  - paper: `totalSheets / 500 * paperUnitCost`
  - toner: `totalPages / 20000 * tonerUnitCost`
- Loads all active adjustments from `market_adjustments`.
- Computes class suggested total cost:
  - sequential percentage/fixed adjustments on running total.
- Computes suggested cost per learner:
  - `suggestedTotal / numberOfLearners`.

3. Manual override flow
- Endpoint: `PUT /api/examination/classes/:id/pricing`
- Permission guard:
  - header `x-can-override-exam-cost=true`
  - or admin role fallback.
- On manual override:
  - validates positive cost and non-empty reason.
  - recalculates class final total:
    - `manualCostPerLearner * candidature`.
  - computes percentage difference from suggested CPL.
  - redistributes total adjustment proportionally across all original class adjustment rows.
  - writes adjusted rows to:
    - `examination_bom_calculations` (`component_type='ADJUSTMENT'`)
    - `examination_class_adjustments`
    - `market_adjustment_transactions` (adjustment module visibility)
- On reset:
  - clears manual override fields.
  - recalculates class using suggested pricing.

4. Batch totals
- Re-aggregates class totals into batch fields:
  - `total_amount`
  - `calculated_material_total`
  - `calculated_adjustment_total`
  - `expected_candidature`
  - `calculated_cost_per_learner`
  - `calculation_duration_ms`

## 4. Data Model Changes
### 4.1 `examination_batches` (new columns)
- `calculated_material_total REAL`
- `calculated_adjustment_total REAL`
- `expected_candidature INTEGER`
- `calculated_cost_per_learner REAL`
- `calculation_trigger TEXT`
- `calculation_duration_ms INTEGER`
- `last_calculated_at DATETIME`

### 4.2 `examination_classes` (new columns)
- `suggested_cost_per_learner REAL`
- `manual_cost_per_learner REAL`
- `is_manual_override INTEGER`
- `manual_override_reason TEXT`
- `manual_override_by TEXT`
- `manual_override_at DATETIME`
- `calculated_total_cost REAL`
- `material_total_cost REAL`
- `adjustment_total_cost REAL`
- `adjustment_delta_percent REAL`
- `cost_last_calculated_at DATETIME`

### 4.3 `examination_bom_calculations` (new columns)
- `component_type TEXT` (`MATERIAL|ADJUSTMENT`)
- `adjustment_id TEXT`
- `adjustment_name TEXT`
- `adjustment_type TEXT`
- `adjustment_value REAL`
- `allocation_ratio REAL`

### 4.4 New table: `examination_class_adjustments`
Per-class adjustment allocations storing original and redistributed amounts.

### 4.5 New table: `examination_pricing_audit`
Pricing history and change metadata:
- event type
- previous/suggested/new costs
- percentage difference
- trigger source
- detailed JSON payload

## 5. Validation and Error Handling
- Learners must be `> 0`.
- Subject pages must be `> 0`.
- Extra copies must be `>= 0`.
- Manual override cost must be `> 0`.
- Manual override total cannot go below material cost floor:
  - prevents negative effective adjustment charges.
- Invalid historical override values are automatically reset and logged as `VALIDATION_WARNING`.

## 6. Logging and Audit Trail
- `audit_logs`:
  - create, approve, invoice, and user-triggered calculate actions.
- `examination_pricing_audit`:
  - `SYSTEM_CALCULATION`
  - `MANUAL_OVERRIDE`
  - `MANUAL_OVERRIDE_RESET`
  - `AUTO_RECALC`
  - `VALIDATION_WARNING`
  - `PERMISSION_DENIED`

## 7. Transaction and Performance Strategy
- `calculateBatch` executes writes in a single SQLite transaction (`BEGIN TRANSACTION`/`COMMIT`).
- This reduces per-write fsync overhead and enabled the sub-2s 10k-learner target.

## 8. API Changes
- New:
  - `PUT /api/examination/classes/:id/pricing`
  - `GET /api/examination/classes/:id/pricing-history?limit=100`
- Existing:
  - `POST /api/examination/batches/:id/calculate` now forwards user context and trigger source.

## 9. Test Coverage and Verification
### Unit tests
- File: [`tests/services/examinationPricingEngine.test.ts`](../tests/services/examinationPricingEngine.test.ts)
- Command:
```bash
npx vitest run tests/services/examinationPricingEngine.test.ts --coverage --coverage.include=server/services/examinationPricingEngine.cjs
```
- Result:
  - Statements: `96%`
  - Lines: `96.29%`
  - Functions: `100%`

### Integration verification scripts
- [`server/tests/verify_full_flow.cjs`](../server/tests/verify_full_flow.cjs)
- [`server/tests/verify_examination_override.cjs`](../server/tests/verify_examination_override.cjs)

## 10. Performance Results
### Benchmark
- Script: [`server/tests/performance_examination_batch_calculation.cjs`](../server/tests/performance_examination_batch_calculation.cjs)
- Detailed report: [`docs/examination-batch-performance-results.md`](./examination-batch-performance-results.md)
- Scenario:
  - 1 class
  - 10,000 learners
  - 8 subjects
  - full BOM + active adjustments
- Measured duration:
  - `1035.14 ms`
- Target:
  - `<= 2000 ms`
- Status:
  - Passed
