const BaseAIService = require('./baseService.cjs');

class ReorderOptimizer extends BaseAIService {
  async optimize() {
    const items = await this._all(
      `SELECT i.*, COALESCE(SUM(it.quantity), 0) as total_consumed
       FROM inventory i
       LEFT JOIN inventory_transactions it ON i.id = it.item_id AND it.type = 'out'
       GROUP BY i.id`,
      []
    );

    const transactions = await this._all(
      `SELECT item_id, type, quantity, created_at FROM inventory_transactionscreated_at >= datetime('now', '-180 days')
       ORDER BY created_at`,
      []
    );

    const sales = await this._all(
      `SELECT id, created_at FROM salescreated_at >= datetime('now', '-180 days')
       ORDER BY created_at`,
      []
    );

    const examinationBatches = await this._all(
      `SELECT id, created_at FROM examination_batchescreated_at >= datetime('now', '-180 days')`,
      []
    );

    const results = [];

    for (const item of items) {
      const itemTxs = transactions.filter(t => t.item_id === item.id);
      const monthlyUsage = this._calcMonthlyUsage(itemTxs, 180);
      const leadTimeDays = this._estimateLeadTime(item);
      const demandVariability = this._calcDemandVariability(itemTxs);
      const reorderPoint = this._calcReorderPoint(monthlyUsage, leadTimeDays, demandVariability);
      const economicOrderQty = this._calcEOQ(monthlyUsage, item.cost_per_unit);
      const safetyStock = this._calcSafetyStock(monthlyUsage, leadTimeDays, demandVariability);
      const suggestedOrder = Math.max(0, reorderPoint - this._safeNumber(item.quantity));
      const urgency = this._calcUrgency(item, reorderPoint);

      results.push({
        itemId: item.id,
        itemName: item.material || item.name || 'Unknown',
        category: item.category || 'Uncategorized',
        currentStock: this._safeNumber(item.quantity),
        currentReorderPoint: this._safeNumber(item.reorder_point),
        suggestedReorderPoint: Math.round(reorderPoint),
        safetyStock: Math.round(safetyStock),
        economicOrderQty: Math.round(economicOrderQty),
        suggestedOrderQuantity: Math.max(0, Math.round(suggestedOrder)),
        monthlyUsage: Math.round(monthlyUsage),
        estimatedLeadTimeDays: leadTimeDays,
        demandVariability: Math.round(demandVariability * 100) / 100,
        unitCost: this._safeNumber(item.cost_per_unit),
        estimatedMonthlyCost: Math.round(monthlyUsage * this._safeNumber(item.cost_per_unit)),
        urgency,
        isRecommended: suggestedOrder > 0
      });
    }

    return {
      recommendations: results.sort((a, b) => b.urgency - a.urgency),
      summary: {
        totalItems: results.length,
        needsReorder: results.filter(r => r.isRecommended).length,
        criticalItems: results.filter(r => r.urgency >= 80).length,
        totalOrderCost: Math.round(results.filter(r => r.isRecommended).reduce((s, r) => s + r.suggestedOrderQuantity * r.unitCost, 0)),
        generatedAt: new Date().toISOString()
      }
    };
  }

  _calcMonthlyUsage(transactions, days) {
    const outgoing = transactions.filter(t => t.type === 'out' || t.type === 'adjustment_out');
    if (outgoing.length === 0) return 0;
    const totalOut = outgoing.reduce((s, t) => s + Math.abs(this._safeNumber(t.quantity)), 0);
    return days > 0 ? (totalOut / days) * 30 : 0;
  }

  _estimateLeadTime(item) {
    return item.lead_time_days || 7;
  }

  _calcDemandVariability(transactions) {
    const outgoing = transactions.filter(t => t.type === 'out').map(t => Math.abs(this._safeNumber(t.quantity)));
    if (outgoing.length < 3) return 0.3;
    const mean = outgoing.reduce((s, v) => s + v, 0) / outgoing.length;
    if (mean === 0) return 0.3;
    const variance = outgoing.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / outgoing.length;
    return Math.sqrt(variance) / mean;
  }

  _calcReorderPoint(monthlyUsage, leadTimeDays, variability) {
    const dailyUsage = monthlyUsage / 30;
    const leadTimeDemand = dailyUsage * leadTimeDays;
    const safetyStock = this._calcSafetyStock(monthlyUsage, leadTimeDays, variability);
    return leadTimeDemand + safetyStock;
  }

  _calcSafetyStock(monthlyUsage, leadTimeDays, variability) {
    const dailyUsage = monthlyUsage / 30;
    const serviceFactor = 1.65;
    const leadTimeStd = leadTimeDays * variability;
    return dailyUsage * leadTimeStd * serviceFactor;
  }

  _calcEOQ(monthlyUsage, unitCost) {
    const annualDemand = monthlyUsage * 12;
    const orderCost = 50;
    const holdingCost = unitCost > 0 ? unitCost * 0.2 : 10;
    if (holdingCost <= 0) return monthlyUsage;
    return Math.sqrt((2 * annualDemand * orderCost) / holdingCost);
  }

  _calcUrgency(item, reorderPoint) {
    const stock = this._safeNumber(item.quantity);
    if (stock <= 0) return 100;
    if (reorderPoint <= 0) return 0;
    const ratio = stock / reorderPoint;
    if (ratio <= 0.25) return 90;
    if (ratio <= 0.5) return 70;
    if (ratio <= 0.75) return 50;
    if (ratio <= 1) return 30;
    return Math.max(0, Math.round((1 - ratio) * 20));
  }
}

module.exports = ReorderOptimizer;
