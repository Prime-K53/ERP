# Examination Batch Performance Results

## Objective
Validate that examination batch calculations complete within 2 seconds for workloads up to 10,000 learners.

## Test Script
- [`server/tests/performance_examination_batch_calculation.cjs`](../server/tests/performance_examination_batch_calculation.cjs)

## Scenario
- 1 batch
- 1 class
- 10,000 learners
- 8 subjects
- Active market adjustments enabled
- Full calculation path (materials, adjustments, BOM rows, class/batch updates, audits)

## Command
```bash
node server/tests/performance_examination_batch_calculation.cjs
```

## Result
- Measured calculation duration: **1035.14 ms**
- SLA target: **<= 2000 ms**
- Status: **Pass**

## Notes
- Key optimization applied: single-transaction write batching in `calculateBatch`.
- Performance result includes DB writes, not just in-memory math.
