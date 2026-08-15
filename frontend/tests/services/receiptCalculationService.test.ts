import { describe, expect, it } from 'vitest';
import type { Sale } from '../../types';
import {
  buildPosReceiptDoc,
  calculateCustomerPaymentSnapshot
} from '../../services/receiptCalculationService';
import { PosReceiptSchema, ReceiptSchema } from '../../views/shared/components/PDF/schemas';

describe('receiptCalculationService.calculateCustomerPaymentSnapshot', () => {
  it('calculates exact payment as paid with zero excess', () => {
    const snapshot = calculateCustomerPaymentSnapshot({
      amountTendered: 100,
      appliedInvoices: [
        { invoiceId: 'INV-001', allocationAmount: 100, outstandingAmount: 100 }
      ]
    });

    expect(snapshot.amountApplied).toBe(100);
    expect(snapshot.walletDeposit).toBe(0);
    expect(snapshot.changeGiven).toBe(0);
    expect(snapshot.amountRetained).toBe(100);
    expect(snapshot.paymentStatus).toBe('Paid');
  });

  it('calculates partial payment with outstanding balance', () => {
    const snapshot = calculateCustomerPaymentSnapshot({
      amountTendered: 60,
      appliedInvoices: [
        { invoiceId: 'INV-002', allocationAmount: 60, outstandingAmount: 100 }
      ]
    });

    expect(snapshot.paymentStatus).toBe('Partial');
    expect(snapshot.balanceDueAfterPayment).toBe(40);
  });

  it('handles overpayment to wallet when excess policy is Wallet', () => {
    const snapshot = calculateCustomerPaymentSnapshot({
      amountTendered: 120,
      appliedInvoices: [
        { invoiceId: 'INV-003', allocationAmount: 100, outstandingAmount: 100 }
      ],
      excessHandling: 'Wallet'
    });

    expect(snapshot.walletDeposit).toBe(20);
    expect(snapshot.changeGiven).toBe(0);
    expect(snapshot.amountRetained).toBe(120);
    expect(snapshot.paymentStatus).toBe('Overpaid');
  });

  it('handles overpayment as change when excess policy is Change', () => {
    const snapshot = calculateCustomerPaymentSnapshot({
      amountTendered: 120,
      appliedInvoices: [
        { invoiceId: 'INV-004', allocationAmount: 100, outstandingAmount: 100 }
      ],
      excessHandling: 'Change'
    });

    expect(snapshot.walletDeposit).toBe(0);
    expect(snapshot.changeGiven).toBe(20);
    expect(snapshot.amountRetained).toBe(100);
    expect(snapshot.paymentStatus).toBe('Paid');
  });

  it('handles wallet top-up with no allocations', () => {
    const snapshot = calculateCustomerPaymentSnapshot({
      amountTendered: 50,
      appliedInvoices: [],
      excessHandling: 'Wallet'
    });

    expect(snapshot.paymentPurpose).toBe('WALLET_TOPUP');
    expect(snapshot.amountApplied).toBe(0);
    expect(snapshot.walletDeposit).toBe(50);
    expect(snapshot.amountRetained).toBe(50);
    expect(snapshot.paymentStatus).toBe('Overpaid');
  });

  it('preserves explicit exam payment purpose', () => {
    const snapshot = calculateCustomerPaymentSnapshot({
      amountTendered: 80,
      appliedInvoices: [
        { invoiceId: 'EXAM-001', allocationAmount: 80, outstandingAmount: 80 }
      ],
      paymentPurpose: 'EXAM_PAYMENT'
    });

    expect(snapshot.paymentPurpose).toBe('EXAM_PAYMENT');
  });

  it('normalizes decimal rounding safely', () => {
    const snapshot = calculateCustomerPaymentSnapshot({
      amountTendered: 10.019,
      appliedInvoices: [
        { invoiceId: 'INV-005', allocationAmount: 10.009, outstandingAmount: 10.009 }
      ],
      excessHandling: 'Change'
    });

    expect(snapshot.amountTendered).toBe(10.02);
    expect(snapshot.amountApplied).toBe(10.01);
    expect(snapshot.changeGiven).toBe(0.01);
    expect(snapshot.amountRetained).toBe(10.01);
  });
});

describe('receiptCalculationService.buildPosReceiptDoc', () => {
  it('builds split-payment payload with footer message', () => {
    const payload = buildPosReceiptDoc({
        sale: {
          id: 'SALE-001',
          date: '2026-02-20T10:00:00.000Z',
          totalAmount: 100,
          discount: 0,
          paymentMethod: 'Split',
          payments: [
            { method: 'Cash', amount: 70 },
            { method: 'Card', amount: 30, accountId: '1050' }
          ],
          cashierId: 'U-1',
          customerName: 'Acme',
          items: [
            { id: 'ITEM-1', name: 'Photocopy', quantity: 2, price: 50 }
          ]
        } as Sale,
      cashierName: 'Cashier 1',
      footerMessage: 'POS Footer'
    });

    expect(payload.payments).toHaveLength(2);
    expect(payload.footerMessage).toBe('POS Footer');
    expect(payload.amountTendered).toBe(100);
    expect(payload.changeGiven).toBe(0);
  });
});

describe('receipt schemas', () => {
  it('accepts receipt payload with new optional fields', () => {
    const parsed = ReceiptSchema.safeParse({
      receiptNumber: 'RCPT-001',
      date: '22/02/2026',
      customerName: 'Acme',
      amountReceived: 120,
      amountApplied: 100,
      amountRetained: 100,
      changeGiven: 20,
      paymentMethod: 'Cash',
      appliedInvoices: ['INV-001'],
      invoiceTotal: 100,
      paymentStatus: 'PAID',
      balanceDue: 0,
      overpaymentAmount: 0,
      narrative: 'Test',
      currentBalance: 0,
      walletDeposit: 0,
      calculationVersion: 1
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts POS payload with split payments and footer', () => {
    const parsed = PosReceiptSchema.safeParse({
      receiptNumber: 'SALE-001',
      date: '2026-02-20T10:00:00.000Z',
      cashierName: 'Cashier 1',
      customerName: 'Acme',
      items: [{ desc: 'Photocopy', qty: 2, price: 50, total: 100 }],
      subtotal: 100,
      discount: 0,
      tax: 0,
      totalAmount: 100,
      paymentMethod: 'Split',
      amountTendered: 100,
      changeGiven: 0,
      payments: [
        { method: 'Cash', amount: 70 },
        { method: 'Card', amount: 30, accountId: '1050' }
      ],
      footerMessage: 'POS Footer'
    });

    expect(parsed.success).toBe(true);
  });
});
