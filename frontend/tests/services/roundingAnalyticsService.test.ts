import { describe, expect, it } from 'vitest';
import { computeRealizedProfitFromData, selectRoundingLogForLine } from '../../services/roundingAnalyticsService';
import { Invoice, RoundingLog, Sale } from '../../types';

describe('roundingAnalyticsService', () => {
  it('matches the correct rounding log version by transaction date and computes realized profit', () => {
    const logs: RoundingLog[] = [
      {
        id: 'RLG-1',
        product_id: 'P1',
        product_name: 'Pamphlet',
        date: '2026-01-01T00:00:00.000Z',
        calculated_price: 100,
        rounded_price: 110,
        rounding_difference: 10,
        rounding_method: 'ALWAYS_UP_10',
        user_id: 'USR-1',
        version: 1
      },
      {
        id: 'RLG-2',
        product_id: 'P1',
        product_name: 'Pamphlet',
        date: '2026-01-10T00:00:00.000Z',
        calculated_price: 100,
        rounded_price: 120,
        rounding_difference: 20,
        rounding_method: 'ALWAYS_UP_10',
        user_id: 'USR-1',
        version: 2
      }
    ];

    const sales: Sale[] = [
      {
        id: 'S-1',
        date: '2026-01-05T12:00:00.000Z',
        totalAmount: 220,
        discount: 0,
        status: 'Paid',
        items: [
          { id: 'P1', name: 'Pamphlet', quantity: 2, price: 110, cost: 80, type: 'Product', stock: 0, minStockLevel: 0, category: 'Print', unit: 'pcs', sku: 'P1' }
        ],
        paymentMethod: 'Cash',
        payments: [{ method: 'Cash', amount: 220 }],
        cashierId: 'U-1',
        total: 220
      }
    ];

    const invoices: Invoice[] = [
      {
        id: 'I-1',
        date: '2026-01-15T12:00:00.000Z',
        dueDate: '2026-01-20T12:00:00.000Z',
        customerName: 'Client A',
        totalAmount: 120,
        paidAmount: 0,
        status: 'Unpaid',
        items: [{ id: 'P1', name: 'Pamphlet', quantity: 1, price: 120, cost: 80, type: 'Product', stock: 0, minStockLevel: 0, category: 'Print', unit: 'pcs', sku: 'P1' }]
      }
    ];

    const result = computeRealizedProfitFromData(logs, sales, invoices);

    expect(result.total_realized_profit).toBe(40);
    expect(result.total_quantity_sold).toBe(3);
    expect(result.rows[0].rounding_version).toBe(1);
    expect(result.rows[0].realized_rounding_profit).toBe(20);
    expect(result.rows[1].rounding_version).toBe(2);
    expect(result.rows[1].realized_rounding_profit).toBe(20);
  });

  it('uses variant log when present and falls back to product log for non-variant lines', () => {
    const logs: RoundingLog[] = [
      {
        id: 'RLG-P',
        product_id: 'P2',
        product_name: 'Flyers',
        date: '2026-02-01T00:00:00.000Z',
        calculated_price: 48,
        rounded_price: 50,
        rounding_difference: 2,
        rounding_method: 'ALWAYS_UP_50',
        version: 1
      },
      {
        id: 'RLG-V',
        product_id: 'P2',
        product_name: 'Flyers',
        variant_id: 'V1',
        variant_name: 'Flyers A5',
        date: '2026-02-01T00:00:00.000Z',
        calculated_price: 45,
        rounded_price: 50,
        rounding_difference: 5,
        rounding_method: 'ALWAYS_UP_50',
        version: 1
      }
    ];

    const sales: Sale[] = [
      {
        id: 'S-2',
        date: '2026-02-05T08:00:00.000Z',
        totalAmount: 200,
        discount: 0,
        status: 'Paid',
        items: [
          { id: 'V1', parentId: 'P2', name: 'Flyers A5', quantity: 10, price: 50, cost: 30, type: 'Product', stock: 0, minStockLevel: 0, category: 'Print', unit: 'pcs', sku: 'F-A5' },
          { id: 'P2', name: 'Flyers', quantity: 5, price: 50, cost: 30, type: 'Product', stock: 0, minStockLevel: 0, category: 'Print', unit: 'pcs', sku: 'F' }
        ],
        paymentMethod: 'Cash',
        payments: [{ method: 'Cash', amount: 200 }],
        cashierId: 'U-1',
        total: 200
      }
    ];

    const result = computeRealizedProfitFromData(logs, sales, []);

    expect(result.total_realized_profit).toBe(60);
    const variantRow = result.rows.find((row) => row.variant_id === 'V1');
    const productRow = result.rows.find((row) => !row.variant_id);
    expect(variantRow?.rounding_difference).toBe(5);
    expect(variantRow?.realized_rounding_profit).toBe(50);
    expect(productRow?.rounding_difference).toBe(2);
    expect(productRow?.realized_rounding_profit).toBe(10);
  });

  it('prefers price-matched log when transaction timestamp is before first log', () => {
    const logs: RoundingLog[] = [
      {
        id: 'RLG-POST',
        product_id: 'P3',
        product_name: 'Booklet',
        date: '2026-02-10T00:00:00.000Z',
        calculated_price: 170,
        rounded_price: 200,
        rounding_difference: 30,
        rounding_method: 'ALWAYS_UP_50',
        version: 1
      }
    ];

    const selected = selectRoundingLogForLine(logs, {
      transactionDate: '2026-02-01T00:00:00.000Z',
      unitPrice: 200
    });

    expect(selected?.id).toBe('RLG-POST');
  });
});
