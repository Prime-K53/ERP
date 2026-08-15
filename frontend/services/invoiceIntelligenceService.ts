import type { Invoice } from '../types';

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const daysBetween = (a: string, b: string): number => {
  const d1 = new Date(a);
  const d2 = new Date(b);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return Infinity;
  return Math.abs(Math.floor((d1.getTime() - d2.getTime()) / 86400000));
};

const normalizeStatus = (status?: string): string =>
  String(status || '').trim().toLowerCase();

export async function detectDuplicateInvoices(
  invoices: any[]
): Promise<{ invoiceId: string; duplicateOf: string; confidence: number; reason: string }[]> {
  const results: { invoiceId: string; duplicateOf: string; confidence: number; reason: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < invoices.length; i++) {
    if (seen.has(invoices[i].id)) continue;
    const a = invoices[i];
    const aNum = String(a.invoiceNumber || '').trim().toLowerCase();

    for (let j = i + 1; j < invoices.length; j++) {
      if (seen.has(invoices[j].id)) continue;
      const b = invoices[j];
      const bNum = String(b.invoiceNumber || '').trim().toLowerCase();

      if (aNum && bNum && aNum === bNum) {
        results.push({
          invoiceId: b.id,
          duplicateOf: a.id,
          confidence: 1,
          reason: `Same invoice number "${a.invoiceNumber}"`
        });
        seen.add(b.id);
        continue;
      }

      const aCustomer = String(a.customerId || a.customerName || '').trim().toLowerCase();
      const bCustomer = String(b.customerId || b.customerName || '').trim().toLowerCase();
      if (!aCustomer || !bCustomer || aCustomer !== bCustomer) continue;

      const aAmount = toSafeNumber(a.totalAmount);
      const bAmount = toSafeNumber(b.totalAmount);
      if (Math.abs(aAmount - bAmount) > 0.01) continue;

      const daysDiff = daysBetween(a.date, b.date);
      if (daysDiff <= 3) {
        results.push({
          invoiceId: b.id,
          duplicateOf: a.id,
          confidence: daysDiff === 0 ? 0.95 : 0.8,
          reason: `Same customer, same amount (${aAmount.toFixed(2)}), ${daysDiff} day(s) apart`
        });
        seen.add(b.id);
      }
    }
  }

  return results;
}

export function validateInvoiceTotals(invoice: any): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  const totalAmount = toSafeNumber(invoice.totalAmount);
  const items = invoice.items || [];

  const itemsSum = items.reduce((sum: number, item: any) => {
    const qty = toSafeNumber(item.quantity, 1);
    const price = toSafeNumber(item.price);
    return sum + qty * price;
  }, 0);

  if (items.length > 0 && Math.abs(itemsSum - totalAmount) > 0.01) {
    issues.push(
      `Line items sum (${itemsSum.toFixed(2)}) does not match totalAmount (${totalAmount.toFixed(2)})`
    );
  }

  const tax = toSafeNumber(invoice.tax);
  const taxRate = toSafeNumber(invoice.taxRate);
  const subtotal = items.length > 0 ? itemsSum : totalAmount;

  if (tax && taxRate) {
    const expectedTax = Math.round(subtotal * taxRate * 100) / 10000;
    if (Math.abs(tax - expectedTax) > 0.01) {
      issues.push(
        `Tax amount (${tax.toFixed(2)}) does not match expected tax at rate ${taxRate}% (${expectedTax.toFixed(2)})`
      );
    }
  }

  const discount = toSafeNumber(invoice.discount);
  if (discount && items.length > 0) {
    const discountedSum = itemsSum - discount;
    if (Math.abs(discountedSum - totalAmount) > 0.01) {
      issues.push(
        `After discount (${discount.toFixed(2)}), expected total ${discountedSum.toFixed(2)} but got ${totalAmount.toFixed(2)}`
      );
    }
  }

  const paidAmount = toSafeNumber(invoice.paidAmount);
  if (paidAmount > totalAmount + 0.01) {
    issues.push(
      `Paid amount (${paidAmount.toFixed(2)}) exceeds totalAmount (${totalAmount.toFixed(2)})`
    );
  }

  return { valid: issues.length === 0, issues };
}

export function identifyMissingTaxInfo(invoice: any): string[] {
  const missing: string[] = [];

  if (invoice.tax === undefined || invoice.tax === null) {
    missing.push('tax');
  }
  if (invoice.taxRate === undefined || invoice.taxRate === null) {
    missing.push('taxRate');
  }

  if (!invoice.currency) {
    missing.push('currency');
  }

  return missing;
}

export function flagOverduePayments(
  invoices: any[],
  config: { lateFeeEnabled: boolean; graceDays: number }
): { invoiceId: string; customerName: string; amountDue: number; daysOverdue: number; severity: 'low' | 'medium' | 'high' }[] {
  const now = new Date();
  const results: { invoiceId: string; customerName: string; amountDue: number; daysOverdue: number; severity: 'low' | 'medium' | 'high' }[] = [];

  for (const invoice of invoices) {
    const status = normalizeStatus(invoice.status);
    if (status === 'paid' || status === 'cancelled' || status === 'voided') continue;

    const dueDate = invoice.dueDate || invoice.date;
    if (!dueDate) continue;

    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) continue;

    const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400000);
    if (daysOverdue < 0) continue;

    const effectiveDays = Math.max(0, daysOverdue - config.graceDays);
    if (effectiveDays === 0) continue;

    const totalAmount = toSafeNumber(invoice.totalAmount);
    const paidAmount = toSafeNumber(invoice.paidAmount);
    const amountDue = Math.max(0, totalAmount - paidAmount);

    if (amountDue <= 0) continue;

    let severity: 'low' | 'medium' | 'high';
    if (effectiveDays <= 15) severity = 'low';
    else if (effectiveDays <= 45) severity = 'medium';
    else severity = 'high';

    results.push({
      invoiceId: invoice.id,
      customerName: invoice.customerName || 'Unknown',
      amountDue,
      daysOverdue: effectiveDays,
      severity
    });
  }

  return results;
}

export function detectSuspiciousInvoices(
  invoices: any[],
  thresholds?: { maxAmount: number; maxDiscountPercent: number }
): { invoiceId: string; flags: string[]; riskScore: number }[] {
  const maxAmount = thresholds?.maxAmount ?? 100000;
  const maxDiscountPct = thresholds?.maxDiscountPercent ?? 50;

  const results: { invoiceId: string; flags: string[]; riskScore: number }[] = [];

  for (const invoice of invoices) {
    const status = normalizeStatus(invoice.status);
    if (status === 'voided' || status === 'cancelled') continue;

    const flags: string[] = [];
    let riskScore = 0;

    const amount = toSafeNumber(invoice.totalAmount);
    if (amount > maxAmount) {
      flags.push(`Amount (${amount.toFixed(2)}) exceeds threshold (${maxAmount.toFixed(2)})`);
      riskScore += 30;
    }

    const items = invoice.items || [];
    const itemsSum = items.reduce((sum: number, item: any) => {
      const qty = toSafeNumber(item.quantity, 1);
      const price = toSafeNumber(item.price);
      return sum + qty * price;
    }, 0);

    if (itemsSum > 0) {
      const discount = toSafeNumber(invoice.discount);
      const discountPct = (discount / itemsSum) * 100;
      if (discountPct > maxDiscountPct) {
        flags.push(`Discount ${discountPct.toFixed(1)}% exceeds max ${maxDiscountPct}%`);
        riskScore += 25;
      }
    }

    const invoiceNum = String(invoice.invoiceNumber || '').trim().toLowerCase();
    if (invoiceNum) {
      const sameNum = invoices.filter(
        inv =>
          String(inv.invoiceNumber || '').trim().toLowerCase() === invoiceNum &&
          inv.id !== invoice.id
      );
      if (sameNum.length > 0) {
        flags.push(`Duplicate invoice number "${invoice.invoiceNumber}" used ${sameNum.length} other time(s)`);
        riskScore += 35;
      }
    }

    const customerKey = String(invoice.customerId || invoice.customerName || '').trim().toLowerCase();
    if (customerKey) {
      const recentVoided = invoices.filter(
        inv =>
          String(inv.customerId || inv.customerName || '').trim().toLowerCase() === customerKey &&
          (normalizeStatus(inv.status) === 'voided' || normalizeStatus(inv.status) === 'cancelled') &&
          daysBetween(inv.date, invoice.date) <= 7
      );
      if (recentVoided.length >= 2) {
        flags.push(`Frequent void/recreate cycle: ${recentVoided.length} voided/cancelled invoices in 7 days`);
        riskScore += 40;
      }
    }

    results.push({ invoiceId: invoice.id, flags, riskScore: Math.min(100, riskScore) });
  }

  return results;
}
