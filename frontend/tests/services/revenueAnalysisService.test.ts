import { describe, expect, it } from 'vitest';
import { buildRevenueAnalysisDataset } from '../../services/revenueAnalysisService';
import { buildRevenueReportingSnapshot } from '../../services/revenueReportingService';

describe('revenueAnalysisService', () => {
  it('skips mirrored POS invoices and excludes profit margin snapshots from the adjustment ledger', () => {
    const saleItems = [
      {
        id: 'ITEM-1',
        productId: 'ITEM-1',
        productName: 'Flyers',
        quantity: 1,
        price: 120,
        subtotal: 120,
        cost: 60,
        adjustmentSnapshots: [
          { name: 'Paper uplift', type: 'FIXED', value: 10, calculatedAmount: 10 },
          { name: 'Profit Margin', type: 'FIXED', value: 50, calculatedAmount: 50 },
        ],
        adjustmentTotal: 10,
        profitMarginAmount: 50,
        roundingDifference: 0,
      },
    ];

    const dataset = buildRevenueAnalysisDataset({
      sales: [
        {
          id: 'POS-001',
          date: '2026-04-20T10:00:00.000Z',
          status: 'Paid',
          customerName: 'Walk-in',
          items: saleItems,
        },
      ],
      invoices: [
        {
          id: 'INV-001',
          date: '2026-04-20T10:00:00.000Z',
          status: 'Paid',
          customerName: 'Walk-in',
          reference: 'POS-001',
          notes: 'POS Sale - Source: POS',
          items: saleItems,
        },
      ],
    });

    expect(dataset.transactions).toHaveLength(2);
    expect(dataset.transactions[0].source).toBe('POS');
    expect(dataset.adjustmentLedger).toHaveLength(1);
    expect(dataset.adjustmentLedger[0].adjustmentName).toBe('Paper uplift');
    expect(dataset.adjustmentLedger[0].totalAmount).toBe(20);
  });

  it('captures examination adjustments, rounding, margin, and sub-account tagging from batches', () => {
    const report = buildRevenueReportingSnapshot({
      invoices: [
        {
          id: 'EXM-INV-001',
          date: '2026-04-21T09:30:00.000Z',
          status: 'Unpaid',
          originModule: 'examination',
          batchId: 'BATCH-001',
          customerName: 'Northview Academy',
          totalAmount: 105,
          items: [
            { id: 'EXAM-LINE-1', name: 'Examination Service', quantity: 1, price: 105, total: 105 },
          ],
        },
      ],
      batches: [
        {
          id: 'BATCH-001',
          school_name: 'Northview Academy',
          sub_account_name: 'Campus A',
          rounding_adjustment_total: 5,
          classes: [
            {
              id: 'CLS-1',
              class_name: 'Form 4',
              number_of_learners: 10,
              live_total_preview: 100,
              material_total_cost: 60,
              adjustment_total_cost: 10,
              rounding_adjustment: 5,
            },
          ],
        },
      ],
    });

    expect(report.totals.revenue).toBe(100);
    expect(report.totals.adjustmentTotal).toBe(10);
    expect(report.totals.roundingTotal).toBe(5);
    expect(report.totals.profitMargin).toBe(25);
    expect(report.transactions).toHaveLength(1);
    expect(report.transactions[0].source).toBe('EXAMINATION');
    expect(report.transactions[0].subAccountName).toBe('Campus A');
  });

  it('uses batch class pricing when invoice adjustment totals already include rounding', () => {
    const report = buildRevenueReportingSnapshot({
      invoices: [
        {
          id: 'EXM-INV-002',
          date: '2026-05-23T09:30:00.000Z',
          status: 'Unpaid',
          originModule: 'examination',
          batchId: 'BATCH-002',
          customerName: 'Mankhamba LEA School',
          totalAmount: 5000,
          materialTotal: 2511,
          adjustmentTotal: 1178.7,
          profitMarginTotal: 1310.3,
          roundingTotal: 0,
          adjustmentSnapshots: [
            { name: 'Transport/Logistics', type: 'FIXED', value: 1049.6, calculatedAmount: 1049.6 },
            { name: 'Rounding', type: 'FIXED', value: 129.1, calculatedAmount: 129.1 },
          ],
          items: [
            { id: 'EXAM-LINE-1', name: 'Examination Service', quantity: 1, price: 5000, total: 5000 },
          ],
        },
      ],
      batches: [
        {
          id: 'BATCH-002',
          school_name: 'Mankhamba LEA School',
          sub_account_name: 'Main Campus',
          classes: [
            {
              id: 'CLS-1',
              class_name: 'Form 4',
              number_of_learners: 1,
              live_total_preview: 5000,
              material_total_cost: 2511,
              market_adjustment_total: 1049.6,
              adjustment_total_cost: 1178.7,
              rounding_adjustment: 129.1,
              margin_amount: 1310.3,
            },
          ],
          adjustmentSnapshots: [
            { id: 'transport', name: 'Transport/Logistics', type: 'FIXED', total_amount: 1049.6, calculatedAmount: 1049.6 },
            { id: 'auto-rounding', name: 'Rounding', type: 'FIXED', total_amount: 129.1, calculatedAmount: 129.1, is_rounding: true },
          ],
        },
      ],
    });

    expect(report.totals.revenue).toBe(5000);
    expect(report.totals.materialCost).toBe(2511);
    expect(report.totals.adjustmentTotal).toBe(1049.6);
    expect(report.totals.profitMargin).toBe(1310.3);
    expect(report.totals.roundingTotal).toBe(129.1);
    expect(report.transactions).toHaveLength(1);
    expect(report.transactions[0].adjustmentTotal).toBe(1049.6);
    expect(report.transactions[0].roundingTotal).toBe(129.1);
    expect(report.transactions[0].subAccountName).toBe('Main Campus');
  });
});
