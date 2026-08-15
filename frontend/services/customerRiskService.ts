const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toMoney = (value: number): number => Math.round(value * 100) / 100;

export const classifyRiskCategory = (score: number): 'Low' | 'Medium' | 'High' => {
  if (score >= 71) return 'Low';
  if (score >= 41) return 'Medium';
  return 'High';
};

export const getCustomerPaymentHistory = (
  customerId: string,
  invoices: any[],
  payments: any[]
): { onTime: number; late: number; missed: number; totalPaid: number; averagePaymentDays: number } => {
  const customerInvoices = (invoices || []).filter(
    (inv: any) => String(inv.customerId || inv.customer_id || '') === customerId
  );
  const customerPayments = (payments || []).filter(
    (pmt: any) => String(pmt.customerId || pmt.customer_id || '') === customerId
  );

  let onTime = 0;
  let late = 0;
  let missed = 0;
  let totalPaid = 0;
  const paymentDays: number[] = [];

  for (const inv of customerInvoices) {
    const dueDate = new Date(inv.dueDate || inv.due_date || inv.date);
    const total = toNumber(inv.totalAmount ?? inv.total ?? inv.amount, 0);
    const invoicePayments = customerPayments.filter(
      (pmt: any) =>
        String(pmt.invoiceId || pmt.invoice_id || pmt.referenceId || '') === String(inv.id || '')
    );

    let paidOnInvoice = 0;
    for (const pmt of invoicePayments) {
      const pmtAmount = toNumber(pmt.amount ?? pmt.paidAmount ?? 0, 0);
      paidOnInvoice += pmtAmount;
      totalPaid += pmtAmount;

      const pmtDate = new Date(pmt.date || pmt.paymentDate || pmt.createdAt);
      const diffDays = Math.round(
        (pmtDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      paymentDays.push(diffDays);

      if (diffDays <= 0) onTime++;
      else late++;
    }

    if (total > 0 && paidOnInvoice < total) missed++;
  }

  const averagePaymentDays =
    paymentDays.length > 0
      ? Math.round(paymentDays.reduce((sum, d) => sum + d, 0) / paymentDays.length)
      : 0;

  return { onTime, late, missed, totalPaid: toMoney(totalPaid), averagePaymentDays };
};

export const getCustomerPurchaseFrequency = (
  customerId: string,
  sales: any[]
): { totalOrders: number; firstOrder: string; lastOrder: string; frequencyDays: number; trend: 'increasing' | 'stable' | 'declining' } => {
  const customerSales = (sales || [])
    .filter((s: any) => String(s.customerId || s.customer_id || '') === customerId)
    .sort((a: any, b: any) => {
      const da = new Date(a.date || a.orderDate || a.createdAt || 0).getTime();
      const db = new Date(b.date || b.orderDate || b.createdAt || 0).getTime();
      return da - db;
    });

  const totalOrders = customerSales.length;
  const firstOrder =
    totalOrders > 0 ? customerSales[0].date || customerSales[0].orderDate || customerSales[0].createdAt || '' : '';
  const lastOrder =
    totalOrders > 0
      ? customerSales[totalOrders - 1].date || customerSales[totalOrders - 1].orderDate || customerSales[totalOrders - 1].createdAt || ''
      : '';

  let frequencyDays = 0;
  if (totalOrders >= 2) {
    const first = new Date(firstOrder).getTime();
    const last = new Date(lastOrder).getTime();
    const span = last - first;
    frequencyDays = Math.round(span / (1000 * 60 * 60 * 24 * (totalOrders - 1)));
  }

  let trend: 'increasing' | 'stable' | 'declining' = 'stable';
  if (totalOrders >= 4) {
    const half = Math.floor(totalOrders / 2);
    const firstHalf = customerSales.slice(0, half);
    const secondHalf = customerSales.slice(-half);
    const firstSpan =
      firstHalf.length >= 2
        ? new Date(firstHalf[firstHalf.length - 1].date || firstHalf[firstHalf.length - 1].orderDate || firstHalf[firstHalf.length - 1].createdAt || 0).getTime() -
          new Date(firstHalf[0].date || firstHalf[0].orderDate || firstHalf[0].createdAt || 0).getTime()
        : 0;
    const secondSpan =
      secondHalf.length >= 2
        ? new Date(secondHalf[secondHalf.length - 1].date || secondHalf[secondHalf.length - 1].orderDate || secondHalf[secondHalf.length - 1].createdAt || 0).getTime() -
          new Date(secondHalf[0].date || secondHalf[0].orderDate || secondHalf[0].createdAt || 0).getTime()
        : 0;
    const firstFreq = firstHalf.length > 1 && firstSpan > 0 ? firstSpan / (1000 * 60 * 60 * 24 * (firstHalf.length - 1)) : 0;
    const secondFreq = secondHalf.length > 1 && secondSpan > 0 ? secondSpan / (1000 * 60 * 60 * 24 * (secondHalf.length - 1)) : 0;
    if (firstFreq > 0 && secondFreq > 0) {
      const ratio = secondFreq / firstFreq;
      if (ratio < 0.8) trend = 'increasing';
      else if (ratio > 1.2) trend = 'declining';
      else trend = 'stable';
    }
  }

  return { totalOrders, firstOrder, lastOrder, frequencyDays, trend };
};

export const getCustomerAverageOrderValue = (
  customerId: string,
  sales: any[],
  invoices: any[]
): { averageValue: number; medianValue: number; minValue: number; maxValue: number; trend: 'rising' | 'stable' | 'falling' } => {
  const allTransactions = [
    ...(sales || []).filter((s: any) => String(s.customerId || s.customer_id || '') === customerId),
    ...(invoices || []).filter((inv: any) => String(inv.customerId || inv.customer_id || '') === customerId),
  ];

  const values = allTransactions
    .map((t: any) => toNumber(t.totalAmount ?? t.total ?? t.amount ?? 0, 0))
    .filter((v: number) => v > 0);

  if (values.length === 0) {
    return { averageValue: 0, medianValue: 0, minValue: 0, maxValue: 0, trend: 'stable' };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const averageValue = toMoney(sum / sorted.length);
  const minValue = toMoney(sorted[0]);
  const maxValue = toMoney(sorted[sorted.length - 1]);
  const mid = Math.floor(sorted.length / 2);
  const medianValue = toMoney(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]);

  let trend: 'rising' | 'stable' | 'falling' = 'stable';
  if (allTransactions.length >= 4) {
    const sortedByDate = allTransactions.sort((a: any, b: any) => {
      const da = new Date(a.date || a.orderDate || a.createdAt || 0).getTime();
      const db = new Date(b.date || b.orderDate || b.createdAt || 0).getTime();
      return da - db;
    });
    const half = Math.floor(sortedByDate.length / 2);
    const firstHalfAvg =
      sortedByDate.slice(0, half).reduce((s: number, t: any) => s + toNumber(t.totalAmount ?? t.total ?? t.amount ?? 0, 0), 0) / half;
    const secondHalfAvg =
      sortedByDate.slice(-half).reduce((s: number, t: any) => s + toNumber(t.totalAmount ?? t.total ?? t.amount ?? 0, 0), 0) / half;
    if (firstHalfAvg > 0) {
      const ratio = secondHalfAvg / firstHalfAvg;
      if (ratio > 1.1) trend = 'rising';
      else if (ratio < 0.9) trend = 'falling';
    }
  }

  return { averageValue, medianValue, minValue, maxValue, trend };
};

export const getCustomerCreditUsage = (
  customerId: string,
  invoices: any[]
): { totalOutstanding: number; creditLimit: number; utilizationPercent: number; overdueAmount: number; overdueInvoices: number } => {
  const customerInvoices = (invoices || []).filter(
    (inv: any) => String(inv.customerId || inv.customer_id || '') === customerId
  );

  let totalOutstanding = 0;
  let overdueAmount = 0;
  let overdueInvoices = 0;
  let creditLimit = 0;

  const now = new Date();

  for (const inv of customerInvoices) {
    const total = toNumber(inv.totalAmount ?? inv.total ?? inv.amount, 0);
    const paid = toNumber(inv.paidAmount ?? inv.paid_amount ?? 0, 0);
    const outstanding = Math.max(0, total - paid);
    totalOutstanding += outstanding;

    if (outstanding > 0) {
      const dueDate = new Date(inv.dueDate || inv.due_date || inv.date);
      if (dueDate < now) {
        overdueAmount += outstanding;
        overdueInvoices++;
      }
    }

    const limit = toNumber(inv.creditLimit ?? inv.credit_limit ?? 0, 0);
    if (limit > creditLimit) creditLimit = limit;
  }

  const utilizationPercent =
    creditLimit > 0 ? Math.round((totalOutstanding / creditLimit) * 100) : 0;

  return {
    totalOutstanding: toMoney(totalOutstanding),
    creditLimit: toMoney(creditLimit),
    utilizationPercent,
    overdueAmount: toMoney(overdueAmount),
    overdueInvoices,
  };
};

export const getCustomerReturnRate = (
  customerId: string,
  sales: any[],
  exchanges?: any[]
): { totalReturns: number; returnRate: number; topReturnedItems: string[] } => {
  const customerSales = (sales || []).filter(
    (s: any) => String(s.customerId || s.customer_id || '') === customerId
  );

  const returnItemCount = new Map<string, number>();
  let totalReturns = 0;

  for (const sale of customerSales) {
    const status = String(sale.status || '').toLowerCase();
    if (status === 'returned' || status === 'refunded') {
      totalReturns++;
      const items = sale.items || sale.lineItems || [];
      for (const item of items) {
        const name = String(
          item.productName || item.name || item.itemName || item.description || ''
        ).trim();
        if (name) {
          returnItemCount.set(name, (returnItemCount.get(name) || 0) + 1);
        }
      }
    }
  }

  if (exchanges) {
    for (const ex of exchanges) {
      if (String(ex.customerId || ex.customer_id || '') === customerId) {
        totalReturns++;
        const items = ex.returnedItems || ex.items || [];
        for (const item of items) {
          const name = String(
            item.productName || item.name || item.itemName || item.description || ''
          ).trim();
          if (name) {
            returnItemCount.set(name, (returnItemCount.get(name) || 0) + 1);
          }
        }
      }
    }
  }

  const totalSales = customerSales.length;
  const returnRate = totalSales > 0 ? Math.round((totalReturns / totalSales) * 100) : 0;

  const topReturnedItems = Array.from(returnItemCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return { totalReturns, returnRate, topReturnedItems };
};

export const calculateCustomerRiskScore = (
  customer: any,
  invoices: any[],
  payments: any[],
  sales: any[]
): { customerId: string; customerName: string; score: number; category: 'Low' | 'Medium' | 'High'; factors: { name: string; impact: number; detail: string }[] } => {
  const customerId = String(customer?.id || customer?.customerId || '');
  const customerName = String(customer?.name || customer?.customerName || '');

  const factors: { name: string; impact: number; detail: string }[] = [];

  // Payment history (30%)
  const paymentHistory = getCustomerPaymentHistory(customerId, invoices, payments);
  let paymentScore = 50;
  if (paymentHistory.onTime + paymentHistory.late > 0) {
    const onTimeRatio = paymentHistory.onTime / (paymentHistory.onTime + paymentHistory.late);
    paymentScore = Math.round(onTimeRatio * 100);
  }
  if (paymentHistory.missed > 0) paymentScore = Math.max(0, paymentScore - paymentHistory.missed * 10);
  const paymentImpact = 30;
  paymentScore = Math.max(0, Math.min(100, paymentScore));
  factors.push({
    name: 'Payment History',
    impact: paymentImpact,
    detail: `${paymentHistory.onTime} on-time, ${paymentHistory.late} late, ${paymentHistory.missed} missed payments (avg ${paymentHistory.averagePaymentDays} days)`,
  });

  // Purchase frequency (20%)
  const frequency = getCustomerPurchaseFrequency(customerId, sales);
  let frequencyScore = 0;
  if (frequency.totalOrders >= 20) frequencyScore = 100;
  else if (frequency.totalOrders >= 10) frequencyScore = 80;
  else if (frequency.totalOrders >= 5) frequencyScore = 60;
  else if (frequency.totalOrders >= 2) frequencyScore = 40;
  else if (frequency.totalOrders === 1) frequencyScore = 20;
  if (frequency.trend === 'increasing') frequencyScore = Math.min(100, frequencyScore + 10);
  else if (frequency.trend === 'declining') frequencyScore = Math.max(0, frequencyScore - 10);
  const frequencyImpact = 20;
  factors.push({
    name: 'Purchase Frequency',
    impact: frequencyImpact,
    detail: `${frequency.totalOrders} orders, every ${frequency.frequencyDays} days (${frequency.trend})`,
  });

  // Average order value (20%)
  const aov = getCustomerAverageOrderValue(customerId, sales, invoices);
  let aovScore = 50;
  if (aov.averageValue > 0) {
    if (aov.averageValue >= 1000) aovScore = 100;
    else if (aov.averageValue >= 500) aovScore = 80;
    else if (aov.averageValue >= 200) aovScore = 60;
    else if (aov.averageValue >= 50) aovScore = 40;
    else aovScore = 20;
  }
  if (aov.trend === 'rising') aovScore = Math.min(100, aovScore + 10);
  else if (aov.trend === 'falling') aovScore = Math.max(0, aovScore - 10);
  const aovImpact = 20;
  factors.push({
    name: 'Average Order Value',
    impact: aovImpact,
    detail: `$${aov.averageValue} avg, $${aov.medianValue} median (${aov.trend})`,
  });

  // Credit usage (15%)
  const credit = getCustomerCreditUsage(customerId, invoices);
  let creditScore = 100;
  if (credit.utilizationPercent > 90) creditScore = 10;
  else if (credit.utilizationPercent > 70) creditScore = 30;
  else if (credit.utilizationPercent > 50) creditScore = 50;
  else if (credit.utilizationPercent > 25) creditScore = 70;
  if (credit.overdueInvoices > 0) {
    creditScore = Math.max(0, creditScore - credit.overdueInvoices * 15);
  }
  const creditImpact = 15;
  factors.push({
    name: 'Credit Usage',
    impact: creditImpact,
    detail: `${credit.utilizationPercent}% utilized, $${credit.overdueAmount} overdue across ${credit.overdueInvoices} invoices`,
  });

  // Complaints/returns (15%)
  const returns = getCustomerReturnRate(customerId, sales);
  let returnScore = 100;
  if (returns.returnRate >= 50) returnScore = 10;
  else if (returns.returnRate >= 30) returnScore = 30;
  else if (returns.returnRate >= 15) returnScore = 50;
  else if (returns.returnRate >= 5) returnScore = 70;
  const returnImpact = 15;
  factors.push({
    name: 'Complaints & Returns',
    impact: returnImpact,
    detail: `${returns.totalReturns} returns (${returns.returnRate}% rate)`,
  });

  // Weighted score
  const score = Math.round(
    (paymentScore * paymentImpact +
      frequencyScore * frequencyImpact +
      aovScore * aovImpact +
      creditScore * creditImpact +
      returnScore * returnImpact) /
      100
  );

  const clampedScore = Math.max(0, Math.min(100, score));
  const category = classifyRiskCategory(clampedScore);

  return { customerId, customerName, score: clampedScore, category, factors };
};
