# Examination Batch Cost Calculation Workflow (User Guide)

## Who this is for
Finance, production, and examination billing users managing class pricing in Examination Batches.

## 1. Create a Batch
1. Open Examination module.
2. Create a new batch (school, term, exam type).
3. Save.

What happens automatically:
- The system initializes BOM cost calculation.
- Active market adjustments are loaded.
- Initial suggested values are prepared for classes once classes/subjects exist.

## 2. Add Classes and Subjects
1. Add class name and candidature (number of learners).
2. Add all subjects with page counts and extra copies.
3. Open the batch detail view.

What happens automatically:
- Material consumption is recalculated.
- Suggested Cost Per Learner is recomputed.
- Total class and batch amounts refresh.

## 3. Review Suggested Cost Per Learner
In each class card, review:
- Suggested Cost / Learner
- Current Cost / Learner
- Live Total Preview

Formula:
- `Total Amount = Cost Per Learner x Candidature`

## 4. Apply Manual Override (Permission Required)
1. Enter a new Cost Per Learner.
2. Click `Apply Override`.
3. Enter override reason.

System behavior:
- Validates positive value.
- Prevents values that would produce negative adjustment charges.
- Computes percentage difference from suggested cost.
- Redistributes adjustment amounts proportionally across all class adjustments.
- Updates class and batch totals instantly.
- Writes full audit trail.

## 5. Reset to Suggested
If needed:
1. Click `Reset to Suggested` on the class.
2. System clears manual override and returns to calculated pricing.

## 6. Permission Rules
- Users need `examination.cost.override` permission to apply or reset overrides.
- Without permission, suggested values remain visible but override actions are disabled.

## 7. Audit and Traceability
Every pricing action is logged, including:
- system calculation
- manual override
- override reset
- auto recalculation
- validation warning / permission denial

This supports review and compliance requirements.

## 8. Performance Expectations
The pricing engine is tuned for large batches.
- Verified benchmark: 10,000 learners completed in about 1.04 seconds.
- Target threshold: under 2 seconds.
