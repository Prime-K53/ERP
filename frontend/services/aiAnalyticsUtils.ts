export function safeNumber(val: any, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function serializeDate(d: any): string | null {
  if (!d) return null;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

// ── Gang Run Optimizer ──────────────────────────────────────────
export interface GangRunGroup {
  jobs: any[];
  commonMaterials: string[];
  totalSetupSavings: number;
  sharedWorkCenter: string | null;
}

export function optimizeGangRun(workOrders: any[], boms: any[], workCenters: any[], options = {}) {
  const threshold = (options as any).similarityThreshold || 0.6;
  const maxGroupSize = (options as any).maxGroupSize || 10;
  const groups: GangRunGroup[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < workOrders.length; i++) {
    if (assigned.has(i)) continue;
    const group: GangRunGroup = { jobs: [workOrders[i]], commonMaterials: [], totalSetupSavings: 0, sharedWorkCenter: null };
    assigned.add(i);

    for (let j = i + 1; j < workOrders.length; j++) {
      if (assigned.has(j) || group.jobs.length >= maxGroupSize) continue;
      if (calcSimilarity(workOrders[i], workOrders[j]) >= threshold) {
        group.jobs.push(workOrders[j]);
        assigned.add(j);
      }
    }

    if (group.jobs.length > 1) {
      const centerIds = [...new Set(group.jobs.map((j: any) => j.work_center_id).filter(Boolean))];
      group.sharedWorkCenter = centerIds.length === 1
        ? (workCenters.find((w: any) => w.id === centerIds[0])?.name || 'Mixed')
        : 'Multiple Centers';
      group.totalSetupSavings = (group.jobs.length - 1) * 45;
      group.commonMaterials = findCommonMaterials(group.jobs, boms);
      groups.push(group);
    } else {
      groups.push({ jobs: group.jobs, commonMaterials: [], totalSetupSavings: 0, sharedWorkCenter: null });
    }
  }

  const ganged = groups.filter(g => g.jobs.length > 1);
  return {
    groups,
    metrics: {
      totalJobs: workOrders.length,
      gangedJobs: ganged.reduce((s, g) => s + g.jobs.length, 0),
      groupCount: ganged.length,
      setupHoursSaved: workOrders.length - groups.length,
      setupCostSaved: (workOrders.length - groups.length) * 45,
      utilizationRate: workOrders.length > 0 ? Math.round((ganged.reduce((s, g) => s + g.jobs.length, 0) / workOrders.length) * 100) : 0
    }
  };
}

function calcSimilarity(jobA: any, jobB: any): number {
  let score = 0, factors = 0;
  if (jobA.work_center_id && jobB.work_center_id) { score += jobA.work_center_id === jobB.work_center_id ? 0.4 : 0; factors += 0.4; }
  if (jobA.product_name && jobB.product_name) {
    const a = jobA.product_name.toLowerCase().split(' ');
    const b = jobB.product_name.toLowerCase().split(' ');
    const common = a.filter((w: string) => b.includes(w)).length;
    score += a.length || b.length ? (common / Math.max(a.length, b.length)) * 0.3 : 0;
    factors += 0.3;
  }
  if (jobA.bom_id && jobB.bom_id) { score += jobA.bom_id === jobB.bom_id ? 0.3 : 0; factors += 0.3; }
  return factors > 0 ? score / factors : 0;
}

function findCommonMaterials(jobs: any[], boms: any[]): string[] {
  const materialSets = jobs.map((job: any) => {
    const bom = boms.find((b: any) => b.id === job.bom_id);
    if (!bom?.items) return [];
    const items = typeof bom.items === 'string' ? JSON.parse(bom.items) : bom.items;
    return Array.isArray(items) ? items.map((i: any) => i.item_name || i.name).filter(Boolean) : [];
  });
  if (materialSets.length < 2) return [];
  return [...new Set(materialSets.reduce((a: string[], b: string[]) => a.filter(x => b.includes(x))))];
}

// ── Cash Flow Forecaster ─────────────────────────────────────────
export function forecastCashFlow(invoices: any[], expenses: any[], ar: any[], ap: any[], ledger: any[], days = 90) {
  const historicalIn = aggregateByDay(ledger.filter((l: any) => l.entry_type === 'debit'), 'entry_date', 'amount');
  const historicalOut = aggregateByDay(ledger.filter((l: any) => l.entry_type === 'credit'), 'entry_date', 'amount');
  const dailyBalances = projectDailyBalances(invoices, expenses, ar, ap, ledger, days);
  const trend = calcTrend(historicalIn, historicalOut);
  const summary = calcSummary(dailyBalances, invoices, expenses, ar, ap);

  return { projection: dailyBalances, summary, trend, parameters: { forecastDays: days, confidenceInterval: '±15%' } };
}

function aggregateByDay(entries: any[], dateField: string, amountField: string) {
  const map: Record<string, number> = {};
  for (const e of entries) {
    const day = serializeDate(e[dateField]);
    if (day) map[day] = (map[day] || 0) + safeNumber(e[amountField]);
  }
  return Object.entries(map).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));
}

function projectDailyBalances(invoices: any[], expenses: any[], ar: any[], ap: any[], ledger: any[], days: number) {
  const today = new Date();
  const projections: any[] = [];
  let cashBalance = Math.max(ledger.reduce((s: number, l: any) => s + (l.entry_type === 'debit' ? 1 : -1) * safeNumber(l.amount), 0), 1000);

  for (let d = 0; d < days; d++) {
    const date = new Date(today); date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    let inflow = 0, outflow = 0;

    for (const inv of invoices) {
      if (inv.due_date && serializeDate(inv.due_date) === dateStr && inv.status !== 'paid') inflow += safeNumber(inv.total);
    }
    for (const e of expenses) {
      if (e.expense_date && serializeDate(e.expense_date) === dateStr && e.status !== 'paid') outflow += safeNumber(e.amount);
    }
    for (const r of ar) {
      if (r.due_date && serializeDate(r.due_date) === dateStr) inflow += safeNumber(r.balance_due || r.amount);
    }
    for (const p of ap) {
      if (p.due_date && serializeDate(p.due_date) === dateStr) outflow += safeNumber(p.balance_due || p.amount);
    }

    cashBalance += inflow - outflow;
    projections.push({
      date: dateStr, inflow: Math.round(inflow * 100) / 100, outflow: Math.round(outflow * 100) / 100,
      netFlow: Math.round((inflow - outflow) * 100) / 100, balance: Math.round(cashBalance * 100) / 100
    });
  }
  return projections;
}

function calcTrend(histIn: any[], histOut: any[]) {
  const totalIn = histIn.reduce((s, d) => s + d.amount, 0);
  const totalOut = histOut.reduce((s, d) => s + d.amount, 0);
  const avgIn = histIn.length > 0 ? totalIn / histIn.length : 0;
  const avgOut = histOut.length > 0 ? totalOut / histOut.length : 0;
  return {
    averageDailyInflow: Math.round(avgIn * 100) / 100, averageDailyOutflow: Math.round(avgOut * 100) / 100,
    netDailyAverage: Math.round((avgIn - avgOut) * 100) / 100, direction: avgIn >= avgOut ? 'positive' : 'negative'
  };
}

function calcSummary(projections: any[], invoices: any[], _expenses: any[], ar: any[], ap: any[]) {
  const finalBalance = projections.length > 0 ? projections[projections.length - 1].balance : 0;
  const minBalance = Math.min(...projections.map(p => p.balance));
  const totalIn = projections.reduce((s, p) => s + p.inflow, 0);
  const totalOut = projections.reduce((s, p) => s + p.outflow, 0);
  return {
    startingBalance: projections.length > 0 ? projections[0].balance - projections[0].netFlow : 0,
    finalProjectedBalance: finalBalance, minimumProjectedBalance: Math.round(minBalance * 100) / 100,
    totalProjectedInflow: Math.round(totalIn * 100) / 100, totalProjectedOutflow: Math.round(totalOut * 100) / 100,
    netProjected: Math.round((totalIn - totalOut) * 100) / 100,
    daysUntilNegative: minBalance < 0 ? projections.findIndex(p => p.balance < 0) : null,
    outstandingReceivables: ar.reduce((s, r) => s + safeNumber(r.balance_due || r.amount), 0),
    outstandingPayables: ap.reduce((s, p) => s + safeNumber(p.balance_due || p.amount), 0),
    unpaidInvoices: invoices.filter(i => i.status !== 'paid').length,
    riskLevel: minBalance < 0 ? 'high' : finalBalance < projections[0].balance * 0.5 ? 'medium' : 'low'
  };
}

// ── Churn Predictor ──────────────────────────────────────────────
export function predictChurn(sales: any[], customers: any[]) {
  const now = new Date();
  const predictions: any[] = [];

  for (const cust of customers) {
    const name = cust.customer_name || cust.name;
    if (!name) continue;
    const customerSales = sales.filter((s: any) => (s.customer_name || '').toLowerCase() === name.toLowerCase());
    if (customerSales.length === 0) continue;

    const dates = customerSales.map((s: any) => new Date(s.created_at || s.date)).filter((d: Date) => !isNaN(d.getTime()));
    dates.sort((a: Date, b: Date) => b.getTime() - a.getTime());
    const lastOrderDate = dates[0];
    const firstOrderDate = dates[dates.length - 1];
    const daysSinceLastOrder = lastOrderDate ? Math.round((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const customerLifetime = firstOrderDate ? Math.round((now.getTime() - firstOrderDate.getTime()) / (1000 * 60 * 60 * 24)) : 1;
    const totalSpend = customerSales.reduce((s: number, sale: any) => s + safeNumber(sale.total_amount || sale.total), 0);
    const avgOrderValue = totalSpend / customerSales.length;
    const orderFrequency = customerLifetime > 0 ? customerSales.length / customerLifetime : 0;
    const last3Months = customerSales.filter((s: any) => {
      const d = new Date(s.created_at || s.date);
      return !isNaN(d.getTime()) && (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30) <= 3;
    }).length;

    let riskScore = 0;
    if (daysSinceLastOrder > 90) riskScore += 0.4; else if (daysSinceLastOrder > 60) riskScore += 0.25; else if (daysSinceLastOrder > 30) riskScore += 0.1;
    if (last3Months === 0 && daysSinceLastOrder > 45) riskScore += 0.3; else if (last3Months <= 1 && customerSales.length > 5) riskScore += 0.15;
    if (orderFrequency < 0.01 && customerLifetime > 180) riskScore += 0.2;
    if (customerSales.length <= 2) riskScore += 0.1;
    riskScore = Math.min(1, riskScore);

    const riskLevel = riskScore >= 0.5 ? 'high' : riskScore >= 0.25 ? 'medium' : 'low';
    const keyFactors: string[] = [];
    if (daysSinceLastOrder > 90) keyFactors.push('No orders in 90+ days'); else if (daysSinceLastOrder > 60) keyFactors.push('No orders in 60+ days');
    if (last3Months === 0) keyFactors.push('No activity in last quarter');
    if (orderFrequency < 0.005) keyFactors.push('Very low order frequency');

    predictions.push({
      customerName: name, customerPhone: cust.customer_phone, customerEmail: cust.customer_email,
      totalOrders: customerSales.length, totalSpend: Math.round(totalSpend * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      orderFrequency: Math.round(orderFrequency * 1000) / 1000, daysSinceLastOrder, customerLifetime,
      last3MonthsOrders: last3Months, riskScore: Math.round(riskScore * 100) / 100, riskLevel, keyFactors
    });
  }

  predictions.sort((a, b) => b.riskScore - a.riskScore);
  const high = predictions.filter(p => p.riskLevel === 'high');
  return {
    predictions, atRiskCount: high.length,
    moderateRiskCount: predictions.filter(p => p.riskLevel === 'medium').length,
    healthyCount: predictions.filter(p => p.riskLevel === 'low').length, totalCustomers: predictions.length,
    summary: { totalAtRisk: high.length, highValueAtRisk: high.filter((p: any) => p.totalSpend > 10000).length, estimatedRevenueAtRisk: Math.round(high.reduce((s: number, p: any) => s + p.totalSpend, 0) * 0.6) }
  };
}

// ── Reorder Optimizer ────────────────────────────────────────────
export function optimizeReorder(inventory: any[], transactions: any[]) {
  const results: any[] = [];
  for (const item of inventory) {
    const itemTxs = transactions.filter((t: any) => t.item_id === item.id || t.itemId === item.id);
    const outgoing = itemTxs.filter((t: any) => (t.type === 'out' || t.type === 'adjustment_out'));
    const totalOut = outgoing.reduce((s: number, t: any) => s + Math.abs(safeNumber(t.quantity)), 0);
    const monthlyUsage = (totalOut / 180) * 30;
    const leadTimeDays = 7;
    const dailyUsage = monthlyUsage / 30;
    const variability = monthlyUsage > 0 ? 0.3 : 0;
    const safetyStock = dailyUsage * (leadTimeDays * variability) * 1.65;
    const reorderPoint = dailyUsage * leadTimeDays + safetyStock;
    const annualDemand = monthlyUsage * 12;
    const unitCost = safeNumber(item.cost_per_unit);
    const holdingCost = unitCost > 0 ? unitCost * 0.2 : 10;
    const eoq = holdingCost > 0 ? Math.sqrt((2 * annualDemand * 50) / holdingCost) : monthlyUsage;
    const stock = safeNumber(item.quantity);
    const suggestedOrder = Math.max(0, reorderPoint - stock);
    let urgency = 0;
    if (stock <= 0) urgency = 100; else if (reorderPoint > 0) { const ratio = stock / reorderPoint; if (ratio <= 0.25) urgency = 90; else if (ratio <= 0.5) urgency = 70; else if (ratio <= 0.75) urgency = 50; else if (ratio <= 1) urgency = 30; else urgency = Math.max(0, Math.round((1 - ratio) * 20)); }

    results.push({
      itemId: item.id, itemName: item.material || item.name || 'Unknown', category: item.category || 'Uncategorized',
      currentStock: stock, suggestedReorderPoint: Math.round(reorderPoint), safetyStock: Math.round(safetyStock),
      economicOrderQty: Math.round(eoq), suggestedOrderQuantity: Math.round(suggestedOrder),
      monthlyUsage: Math.round(monthlyUsage), estimatedLeadTimeDays: leadTimeDays,
      demandVariability: 0.3, unitCost, urgency, isRecommended: suggestedOrder > 0
    });
  }

  results.sort((a, b) => b.urgency - a.urgency);
  return {
    recommendations: results,
    summary: {
      totalItems: results.length, needsReorder: results.filter(r => r.isRecommended).length,
      criticalItems: results.filter(r => r.urgency >= 80).length,
      totalOrderCost: Math.round(results.filter(r => r.isRecommended).reduce((s, r) => s + r.suggestedOrderQuantity * r.unitCost, 0))
    }
  };
}

// ── PO Matcher ───────────────────────────────────────────────────
export function matchPOs(purchases: any[], goodsReceipts: any[], apInvoices: any[], suppliers: any[]) {
  const matches = purchases.map(po => {
    const grs = goodsReceipts.filter((g: any) => g.purchase_order_id === po.id || g.purchaseOrderId === po.id);
    const ap = apInvoices.filter((a: any) =>
      a.supplier_id === po.supplier_id &&
      Math.abs(safeNumber(a.amount) - safeNumber(po.total_amount || po.total)) < safeNumber(po.total_amount || po.total) * 0.1
    );
    const poTotal = safeNumber(po.total_amount || po.total);
    const grTotal = grs.reduce((s: number, g: any) => s + safeNumber(g.total_amount || g.total), 0);
    const hasGR = grs.length > 0;
    const hasAP = ap.length > 0;
    let matchLevel = 'none', matchScore = 0, matchStatus = 'Pending Receipt & Invoice';
    if (hasGR && hasAP && Math.abs(poTotal - grTotal) / Math.max(poTotal, 1) < 0.05 && Math.abs(poTotal - ap.reduce((s: number, a: any) => s + safeNumber(a.amount), 0)) / Math.max(poTotal, 1) < 0.05) {
      matchLevel = 'full'; matchScore = 100; matchStatus = 'Fully Matched';
    } else if (hasGR && !hasAP) { matchLevel = 'partial'; matchScore = 30; matchStatus = 'Received, No Invoice'; }
    else if (hasAP && !hasGR) { matchLevel = 'partial'; matchScore = 25; matchStatus = 'Invoiced, Not Received'; }
    else if (hasGR && hasAP) { matchLevel = 'partial'; matchScore = 40; matchStatus = 'Partial Match'; }

    const discrepancies: any[] = [];
    if (poTotal > 0 && grTotal > 0 && Math.abs(poTotal - grTotal) / poTotal > 0.05) {
      discrepancies.push({ type: 'amount_mismatch', description: `PO $${poTotal} vs GR $${grTotal}`, severity: Math.abs(poTotal - grTotal) / poTotal > 0.2 ? 'high' : 'medium' });
    }
    const supplier = suppliers.find((s: any) => s.id === po.supplier_id);

    return {
      poId: po.id, poNumber: po.po_number || po.poNumber || 'N/A',
      supplierName: supplier?.name || po.supplier_name || 'Unknown',
      poTotal, grCount: grs.length, apCount: ap.length, matchLevel, matchScore, matchStatus, discrepancies
    };
  });

  matches.sort((a, b) => a.matchScore - b.matchScore);
  return {
    matches,
    summary: {
      total: matches.length, fullyMatched: matches.filter(m => m.matchLevel === 'full').length,
      partialMatch: matches.filter(m => m.matchLevel === 'partial').length,
      unmatched: matches.filter(m => m.matchLevel === 'none').length,
      totalDiscrepancies: matches.reduce((s, m) => s + m.discrepancies.length, 0)
    }
  };
}

// ── Smart Scheduler ──────────────────────────────────────────────
export function optimizeSchedule(workOrders: any[], workCenters: any[], resources: any[]) {
  const sorted = [...workOrders].sort((a, b) => {
    const p = { High: 0, Medium: 1, Low: 2 } as any;
    const ap = p[a.priority] ?? 1, bp = p[b.priority] ?? 1;
    if (ap !== bp) return ap - bp;
    return new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime();
  });

  const schedule: any[] = [];
  const centerLoads: Record<string, any> = {};

  for (const wo of sorted) {
    const center = workCenters.find((c: any) => c.id === wo.work_center_id);
    if (!center) { schedule.push({ workOrderId: wo.id, workOrderName: wo.product_name || wo.customer_name || 'Unknown', status: 'unassigned', reason: 'No work center' }); continue; }

    const hours = Math.max(1, (safeNumber(wo.quantity_planned) * 0.5 + 1) / Math.max(1, safeNumber(center.capacity_per_day) || 8));
    const ck = center.id;
    if (!centerLoads[ck]) centerLoads[ck] = { jobs: [], totalHours: 0 };
    const startDay = centerLoads[ck].jobs.length > 0 ? Math.max(...centerLoads[ck].jobs.map((j: any) => j.endDay)) : 0;
    const endDay = startDay + Math.ceil(hours);
    centerLoads[ck].jobs.push({ wo, startDay, endDay, hours });
    centerLoads[ck].totalHours += hours;

    const startDate = new Date(); startDate.setDate(startDate.getDate() + startDay);
    const endDate = new Date(); endDate.setDate(endDate.getDate() + endDay);
    schedule.push({
      workOrderId: wo.id, workOrderName: wo.product_name || wo.customer_name || 'Unknown',
      priority: wo.priority || 'Medium', dueDate: wo.due_date, workCenter: center.name,
      estimatedHours: Math.round(hours * 10) / 10,
      suggestedStartDate: startDate.toISOString().split('T')[0],
      suggestedEndDate: endDate.toISOString().split('T')[0],
      status: 'scheduled'
    });
  }

  const scheduled = schedule.filter(s => s.status === 'scheduled');
  const totalHours = scheduled.reduce((s: number, j: any) => s + j.estimatedHours, 0);
  const overdue = workOrders.filter((wo: any) => wo.due_date && new Date(wo.due_date) < new Date() && wo.status !== 'completed');
  const centerJobCounts: Record<string, any[]> = {};
  for (const job of scheduled) { if (!centerJobCounts[job.workCenter]) centerJobCounts[job.workCenter] = []; centerJobCounts[job.workCenter].push(job); }
  const bottlenecks = Object.entries(centerJobCounts).map(([name, jobs]) => ({ workCenter: name, scheduledJobs: jobs.length, totalHours: Math.round(jobs.reduce((s, j) => s + j.estimatedHours, 0) * 10) / 10, bottleneckScore: jobs.length > 5 ? Math.round((jobs.length / 10) * 100) : 0 })).filter(b => b.bottleneckScore > 0).sort((a, b) => b.bottleneckScore - a.bottleneckScore);

  const recommendations: string[] = [];
  if (overdue.length > 0) recommendations.push(`Prioritize ${overdue.length} overdue work orders`);
  bottlenecks.slice(0, 3).forEach(b => recommendations.push(`Redistribute load from "${b.workCenter}" (${b.totalHours}h)`));

  return {
    schedule, bottlenecks, recommendations,
    metrics: { totalScheduled: scheduled.length, totalUnscheduled: schedule.filter(s => s.status !== 'scheduled').length, totalEstimatedHours: Math.round(totalHours * 10) / 10, overdueJobs: overdue.length, estimatedCompletionDays: Math.round(totalHours / 8) }
  };
}

// ── BOM Generator ────────────────────────────────────────────────
export function generateBOM(productName: string, quantity: number, inventory: any[], boms: any[]) {
  const items: any[] = [];
  const paperItems = inventory.filter((i: any) =>
    (i.category || '').toLowerCase() === 'stationery' || (i.material || '').toLowerCase().includes('paper'));
  if (paperItems.length > 0) {
    const p = paperItems[0];
    items.push({ name: p.material || p.name, itemId: p.id, quantity, unit: 'sheets', unitCost: safeNumber(p.cost_per_unit), category: 'raw_material', estimatedHours: 0.5 });
  }
  const tonerItems = inventory.filter((i: any) => (i.material || '').toLowerCase().includes('toner'));
  if (tonerItems.length > 0) {
    const t = tonerItems[0];
    items.push({ name: t.material || t.name, itemId: t.id, quantity: 1, unit: 'unit', unitCost: safeNumber(t.cost_per_unit), category: 'consumable', estimatedHours: 0.25 });
  }
  if (items.length === 0) items.push({ name: 'Raw Material (estimate)', itemId: null, quantity, unit: 'units', unitCost: 5, category: 'raw_material', estimatedHours: 0.5 });

  const totalCost = items.reduce((s: number, i: any) => s + i.quantity * i.unitCost, 0);
  const laborCost = totalCost * 0.2, overhead = totalCost * 0.1;
  const similarBoms = boms.filter((b: any) => {
    const words = productName.toLowerCase().split(' ');
    return words.some((w: string) => w.length > 3 && (b.name || '').toLowerCase().includes(w));
  }).map((b: any) => ({ name: b.name, id: b.id, totalCost: b.total_cost }));

  return {
    bom: {
      name: productName, version: '1.0', status: 'draft', items,
      materialCost: Math.round(totalCost * 100) / 100, laborCost: Math.round(laborCost * 100) / 100,
      overheadCost: Math.round(overhead * 100) / 100, totalCost: Math.round((totalCost + laborCost + overhead) * 100) / 100,
      suggestedSellingPrice: Math.round(totalCost * 1.3 * 100) / 100, suggestedProfitMargin: '30%',
      estimatedProductionHours: items.reduce((s: number, i: any) => s + (i.estimatedHours || 0.5), 1)
    },
    similarBoms,
    inventorySuggestions: inventory.filter((i: any) => {
      const name = (i.material || i.name || '').toLowerCase();
      return name.includes('paper') || name.includes('ink') || name.includes('toner') || name.includes('binding');
    }).map((i: any) => ({ id: i.id, name: i.material || i.name, category: i.category, currentStock: i.quantity, unitCost: i.cost_per_unit }))
  };
}
