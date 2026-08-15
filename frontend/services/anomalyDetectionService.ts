const msPerDay = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
};

const stdDev = (values: number[], avg?: number): number => {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const hoursDiff = (a: string, b: string): number => {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff / msPerDay;
};

const toDateKey = (date: string): string =>
  date ? new Date(date).toISOString().split('T')[0] : '';

const getSeverity = (deviation: number): 'low' | 'medium' | 'high' => {
  if (deviation >= 4) return 'high';
  if (deviation >= 3) return 'medium';
  return 'low';
};

export function detectDuplicatePayments(
  payments: any[]
): { paymentId: string; duplicateOf: string; confidence: number; reason: string }[] {
  const results: { paymentId: string; duplicateOf: string; confidence: number; reason: string }[] = [];
  const groups = new Map<string, any[]>();

  for (const p of payments || []) {
    const key = `${p.customerId || p.supplierId || ''}|${toNumber(p.amount)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (hoursDiff(a.date || '', b.date || '') <= 1) {
          const confidence = round2(100 - (hoursDiff(a.date || '', b.date || '') / 1) * 20);
          results.push({
            paymentId: String(a.id || a.paymentId || ''),
            duplicateOf: String(b.id || b.paymentId || ''),
            confidence: Math.min(100, confidence),
            reason: `Same amount (${toNumber(a.amount)}) to same ${a.customerId ? 'customer' : 'supplier'} within 24 hours`
          });
        }
      }
    }
  }

  return results;
}

function buildDailySalesMap(
  sales: any[],
  invoices: any[]
): Map<string, number> {
  const daily = new Map<string, number>();

  for (const sale of sales || []) {
    const date = toDateKey(sale.date || '');
    if (!date) continue;
    const amount = toNumber(sale.total ?? sale.totalAmount ?? sale.amount);
    daily.set(date, (daily.get(date) || 0) + amount);
  }

  for (const inv of invoices || []) {
    const date = toDateKey(inv.date || inv.invoiceDate || '');
    if (!date) continue;
    const amount = toNumber(inv.totalAmount ?? inv.total ?? inv.amount);
    daily.set(date, (daily.get(date) || 0) + amount);
  }

  return daily;
}

function detectSalesDeviation(
  sales: any[],
  invoices: any[],
  threshold: number,
  direction: 'spike' | 'drop'
): { date: string; amount: number; averageAmount: number; deviation: number; possibleCause: string; transactions: string[] }[] {
  const daily = buildDailySalesMap(sales, invoices);
  const amounts = Array.from(daily.values());
  const avg = mean(amounts);
  const sd = stdDev(amounts, avg);
  const results: { date: string; amount: number; averageAmount: number; deviation: number; possibleCause: string; transactions: string[] }[] = [];

  if (sd === 0) return results;

  for (const [date, amount] of daily) {
    const deviation = round2((amount - avg) / sd);
    if (direction === 'spike' && deviation <= threshold) continue;
    if (direction === 'drop' && deviation >= -threshold) continue;

    const txnIds: string[] = [];
    for (const sale of sales || []) {
      if (toDateKey(sale.date || '') === date) txnIds.push(String(sale.id || sale.saleId || ''));
    }
    for (const inv of invoices || []) {
      if (toDateKey(inv.date || inv.invoiceDate || '') === date) txnIds.push(String(inv.id || inv.invoiceId || ''));
    }

    const isSpike = deviation > 0;
    const possibleCause = isSpike
      ? 'Possible bulk order, promotion effect, or seasonal demand'
      : 'Possible holiday, operational issue, or demand drop';

    results.push({
      date,
      amount: round2(amount),
      averageAmount: round2(avg),
      deviation: round2(deviation),
      possibleCause,
      transactions: txnIds
    });
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

export function detectSalesSpikes(
  sales: any[],
  invoices: any[],
  threshold: number = 2.5
): { date: string; amount: number; averageAmount: number; deviation: number; possibleCause: string; transactions: string[] }[] {
  return detectSalesDeviation(sales, invoices, threshold, 'spike');
}

export function detectSalesDrops(
  sales: any[],
  invoices: any[],
  threshold: number = 2.5
): { date: string; amount: number; averageAmount: number; deviation: number; possibleCause: string; transactions: string[] }[] {
  return detectSalesDeviation(sales, invoices, threshold, 'drop');
}

export function detectUnusualInventoryMovements(
  inventory: any[],
  inventoryTransactions: any[]
): { itemId: string; itemName: string; movementType: string; quantity: number; averageQuantity: number; reason: string; severity: 'low' | 'medium' | 'high' }[] {
  const itemMovements = new Map<string, { type: string; qty: number }[]>();

  for (const txn of inventoryTransactions || []) {
    const itemId = String(txn.itemId || txn.item_id || txn.productId || '');
    if (!itemId) continue;
    const type = String(txn.type || txn.movementType || txn.movement_type || 'adjustment').toLowerCase();
    const qty = Math.abs(toNumber(txn.quantity ?? txn.qty ?? txn.change));
    if (!itemMovements.has(itemId)) itemMovements.set(itemId, []);
    itemMovements.get(itemId)!.push({ type, qty });
  }

  const results: { itemId: string; itemName: string; movementType: string; quantity: number; averageQuantity: number; reason: string; severity: 'low' | 'medium' | 'high' }[] = [];

  for (const [itemId, movements] of itemMovements) {
    const item = (inventory || []).find(
      (i: any) => String(i.id || i.itemId || i.productId || '') === itemId
    );
    const itemName = String(item?.name || item?.itemName || item?.productName || itemId);

    const typeGroups = new Map<string, number[]>();
    for (const m of movements) {
      if (!typeGroups.has(m.type)) typeGroups.set(m.type, []);
      typeGroups.get(m.type)!.push(m.qty);
    }

    for (const [type, quantities] of typeGroups) {
      const avg = mean(quantities);
      const sd = stdDev(quantities, avg);
      for (const qty of quantities) {
        if (sd === 0 && qty === avg) continue;
        const deviation = sd === 0 ? Infinity : (qty - avg) / sd;
        if (Math.abs(deviation) < 2) continue;
        const severity = getSeverity(Math.abs(deviation));
        results.push({
          itemId,
          itemName,
          movementType: type,
          quantity: qty,
          averageQuantity: round2(avg),
          reason: `Movement quantity ${qty} deviates ${round2(Math.abs(deviation))}σ from average ${round2(avg)} for ${type} movements`,
          severity
        });
      }
    }
  }

  return results;
}

export function detectSuspiciousDiscounts(
  sales: any[],
  invoices: any[],
  maxDiscountPercent: number = 40
): { transactionId: string; customerName: string; discountPercent: number; amount: number; reason: string; severity: 'low' | 'medium' | 'high' }[] {
  const results: { transactionId: string; customerName: string; discountPercent: number; amount: number; reason: string; severity: 'low' | 'medium' | 'high' }[] = [];

  const processTransaction = (txn: any, idField: string) => {
    const total = toNumber(txn.total ?? txn.totalAmount ?? txn.amount);
    const discount = toNumber(txn.discount ?? txn.discountAmount ?? txn.discount_amount);
    if (total <= 0 || discount <= 0) return;

    const discountPercent = round2((discount / (total + discount)) * 100);
    if (discountPercent > maxDiscountPercent) {
      const severity: 'low' | 'medium' | 'high' =
        discountPercent > 60 ? 'high' : discountPercent > 50 ? 'medium' : 'low';
      results.push({
        transactionId: String(txn[idField] || txn.id || ''),
        customerName: String(txn.customerName || txn.customer_name || 'Unknown'),
        discountPercent,
        amount: round2(discount),
        reason: `Discount of ${discountPercent}% exceeds maximum allowed ${maxDiscountPercent}%`,
        severity
      });
    }
  };

  for (const sale of sales || []) processTransaction(sale, 'saleId');
  for (const inv of invoices || []) processTransaction(inv, 'invoiceId');

  return results;
}

export function detectAbnormalExpensePatterns(
  expenses: any[],
  threshold: number = 2.5
): { expenseId: string; category: string; amount: number; averageAmount: number; deviation: number; reason: string; severity: 'low' | 'medium' | 'high' }[] {
  const categoryMap = new Map<string, number[]>();

  for (const exp of expenses || []) {
    const cat = String(exp.category || exp.categoryName || exp.expenseCategory || 'Uncategorized');
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(toNumber(exp.amount));
  }

  const results: { expenseId: string; category: string; amount: number; averageAmount: number; deviation: number; reason: string; severity: 'low' | 'medium' | 'high' }[] = [];

  for (const [category, amounts] of categoryMap) {
    const avg = mean(amounts);
    const sd = stdDev(amounts, avg);
    if (sd === 0) continue;

    for (const exp of expenses || []) {
      if (String(exp.category || exp.categoryName || exp.expenseCategory || 'Uncategorized') !== category) continue;
      const amount = toNumber(exp.amount);
      const deviation = round2((amount - avg) / sd);
      if (Math.abs(deviation) <= threshold) continue;

      results.push({
        expenseId: String(exp.id || exp.expenseId || ''),
        category,
        amount: round2(amount),
        averageAmount: round2(avg),
        deviation,
        reason: `Expense of ${round2(amount)} in ${category} deviates ${Math.abs(deviation)}σ from category average of ${round2(avg)}`,
        severity: getSeverity(Math.abs(deviation))
      });
    }
  }

  return results;
}

export function detectFraudIndicators(
  sales: any[],
  invoices: any[],
  expenses: any[],
  inventory: any[]
): { type: string; severity: 'low' | 'medium' | 'high'; detail: string; transactionId?: string; amount?: number; recommendation: string }[] {
  const results: { type: string; severity: 'low' | 'medium' | 'high'; detail: string; transactionId?: string; amount?: number; recommendation: string }[] = [];

  const voidedIds = new Set<string>();
  const createdIds = new Set<string>();

  for (const sale of sales || []) {
    const status = String(sale.status || '').toLowerCase();
    if (status === 'voided' || status === 'cancelled') {
      voidedIds.add(String(sale.id || ''));
    }
    if (status === 'completed' || status === 'paid') {
      createdIds.add(String(sale.id || ''));
    }
  }

  for (const inv of invoices || []) {
    const status = String(inv.status || '').toLowerCase();
    if (status === 'voided' || status === 'cancelled') {
      voidedIds.add(String(inv.id || ''));
    }
    if (status === 'paid' || status === 'completed' || status === 'sent') {
      createdIds.add(String(inv.id || ''));
    }
  }

  for (const id of voidedIds) {
    for (const sale of sales || []) {
      if (String(sale.id || '') !== id) continue;
      const refId = String(sale.referenceId || sale.invoiceId || '');
      if (refId && (voidedIds.has(refId) || createdIds.has(refId))) {
        results.push({
          type: 'void_then_recreate',
          severity: 'high',
          detail: `Transaction ${id} was voided and a related transaction ${refId} exists nearby`,
          transactionId: id,
          amount: round2(toNumber(sale.total ?? sale.totalAmount ?? sale.amount)),
          recommendation: 'Investigate void-recreate pattern which may indicate fraudulent activity'
        });
      }
    }
  }

  for (const sale of sales || []) {
    const amount = toNumber(sale.total ?? sale.totalAmount ?? sale.amount);
    if (amount > 0 && amount === Math.round(amount) && amount >= 100) {
      results.push({
        type: 'round_amount_transaction',
        severity: 'low',
        detail: `Transaction ${sale.id || ''} has a round amount of ${amount}`,
        transactionId: String(sale.id || ''),
        amount: round2(amount),
        recommendation: 'Review round-amount transactions for potential manipulation'
      });
    }
  }

  for (const inv of invoices || []) {
    const amount = toNumber(inv.totalAmount ?? inv.total ?? inv.amount);
    if (amount > 0 && amount === Math.round(amount) && amount >= 100) {
      results.push({
        type: 'round_amount_transaction',
        severity: 'low',
        detail: `Invoice ${inv.id || ''} has a round amount of ${amount}`,
        transactionId: String(inv.id || ''),
        amount: round2(amount),
        recommendation: 'Review round-amount transactions for potential manipulation'
      });
    }
  }

  for (const sale of sales || []) {
    const dateStr = sale.date || '';
    if (dateStr) {
      const hour = new Date(dateStr).getHours();
      if (hour >= 22 || hour < 6) {
        results.push({
          type: 'after_hours_transaction',
          severity: 'medium',
          detail: `Sale ${sale.id || ''} occurred at ${new Date(dateStr).toLocaleTimeString()}`,
          transactionId: String(sale.id || ''),
          amount: round2(toNumber(sale.total ?? sale.totalAmount ?? sale.amount)),
          recommendation: 'Verify after-hours transactions for legitimacy'
        });
      }
    }
  }

  for (const exp of expenses || []) {
    const dateStr = exp.date || '';
    if (dateStr) {
      const hour = new Date(dateStr).getHours();
      if (hour >= 22 || hour < 6) {
        results.push({
          type: 'after_hours_transaction',
          severity: 'medium',
          detail: `Expense ${exp.id || ''} recorded at ${new Date(dateStr).toLocaleTimeString()}`,
          transactionId: String(exp.id || ''),
          amount: round2(toNumber(exp.amount)),
          recommendation: 'Verify after-hours transactions for legitimacy'
        });
      }
    }
  }

  let adjustmentsCount = 0;
  for (const txn of (inventory || [])) {
    const adj = String(txn.type || txn.movementType || '').toLowerCase();
    if (adj === 'adjustment' || adj === 'write-off' || adj === 'write_off') {
      adjustmentsCount++;
    }
  }
  if (adjustmentsCount > 10) {
    results.push({
      type: 'excessive_adjustments',
      severity: 'medium',
      detail: `${adjustmentsCount} inventory adjustments found, which is unusually high`,
      amount: adjustmentsCount,
      recommendation: 'Review inventory adjustment frequency and authorization'
    });
  }

  for (const sale of sales || []) {
    const paymentMethod = String(sale.paymentMethod || sale.payment_method || '').toLowerCase();
    const invoiceId = String(sale.invoiceId || sale.invoice_id || '');
    if (invoiceId && paymentMethod) {
      const matchingInvoice = (invoices || []).find(
        (inv: any) => String(inv.id || inv.invoiceId || '') === invoiceId
      );
      if (matchingInvoice) {
        const invPaymentMethod = String(
          matchingInvoice.paymentMethod || matchingInvoice.payment_method || ''
        ).toLowerCase();
        if (invPaymentMethod && invPaymentMethod !== paymentMethod) {
          results.push({
            type: 'mismatched_payment_method',
            severity: 'low',
            detail: `Sale ${sale.id || ''} uses ${paymentMethod} but linked invoice uses ${invPaymentMethod}`,
            transactionId: String(sale.id || ''),
            amount: round2(toNumber(sale.total ?? sale.totalAmount ?? sale.amount)),
            recommendation: 'Verify payment method consistency between sales and invoices'
          });
        }
      }
    }
  }

  return results;
}
