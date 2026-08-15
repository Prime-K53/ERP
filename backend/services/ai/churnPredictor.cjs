const BaseAIService = require('./baseService.cjs');

class ChurnPredictor extends BaseAIService {
  async predict() {
    const sales = await this._all(
      `SELECT * FROM sales ORDER BY created_at DESC`,
      []
    );

    const customers = await this._all(
      `SELECT DISTINCT customer_name, customer_phone, customer_email FROM salescustomer_name IS NOT NULL`,
      []
    );

    const invoices = await this._all(
      `SELECT * FROM invoices ORDER BY created_at DESC`,
      []
    );

    const jobOrders = await this._all(
      `SELECT * FROM salestype = 'job_order' ORDER BY created_at DESC`,
      []
    );

    const customerMetrics = this._buildCustomerMetrics(customers, sales, invoices, jobOrders);
    const predictions = this._scoreCustomers(customerMetrics);

    return {
      predictions,
      atRiskCount: predictions.filter(p => p.riskLevel === 'high').length,
      moderateRiskCount: predictions.filter(p => p.riskLevel === 'medium').length,
      healthyCount: predictions.filter(p => p.riskLevel === 'low').length,
      totalCustomers: predictions.length,
      summary: this._generateSummary(predictions),
      generatedAt: new Date().toISOString()
    };
  }

  _buildCustomerMetrics(customers, sales, invoices, jobOrders) {
    const now = new Date();
    const metrics = [];

    for (const cust of customers) {
      const name = cust.customer_name;
      const customerSales = sales.filter(s =>
        s.customer_name?.toLowerCase() === name?.toLowerCase()
      );
      const customerInvoices = invoices.filter(i =>
        i.customer_name?.toLowerCase() === name?.toLowerCase()
      );
      const customerJobs = jobOrders.filter(j =>
        j.customer_name?.toLowerCase() === name?.toLowerCase()
      );

      if (customerSales.length === 0) continue;

      const dates = customerSales.map(s => new Date(s.created_at)).filter(d => !isNaN(d.getTime()));
      dates.sort((a, b) => b - a);

      const lastOrderDate = dates[0];
      const firstOrderDate = dates[dates.length - 1];
      const daysSinceLastOrder = lastOrderDate ? Math.round((now - lastOrderDate) / (1000 * 60 * 60 * 24)) : 999;
      const customerLifetime = firstOrderDate ? Math.round((now - firstOrderDate) / (1000 * 60 * 60 * 24)) : 1;
      const totalSpend = customerSales.reduce((s, sale) => s + this._safeNumber(sale.total_amount), 0);
      const avgOrderValue = totalSpend / customerSales.length;
      const orderFrequency = customerLifetime > 0 ? customerSales.length / customerLifetime : 0;

      const lastMonths = customerSales.filter(s => {
        const d = new Date(s.created_at);
        return !isNaN(d.getTime()) && (now - d) / (1000 * 60 * 60 * 24 * 30) <= 3;
      }).length;

      const outstandingBalance = customerInvoices
        .filter(i => i.status === 'pending' || i.status === 'overdue')
        .reduce((s, i) => s + this._safeNumber(i.total), 0);

      metrics.push({
        customerName: name,
        customerPhone: cust.customer_phone,
        customerEmail: cust.customer_email,
        totalOrders: customerSales.length,
        totalJobs: customerJobs.length,
        totalSpend,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        orderFrequency: Math.round(orderFrequency * 1000) / 1000,
        daysSinceLastOrder,
        customerLifetime,
        last3MonthsOrders: lastMonths,
        outstandingBalance,
        invoicesOverdue: customerInvoices.filter(i => i.status === 'overdue').length
      });
    }
    return metrics;
  }

  _scoreCustomers(metrics) {
    const scored = [];

    for (const m of metrics) {
      let riskScore = 0;

      if (m.daysSinceLastOrder > 90) riskScore += 0.4;
      else if (m.daysSinceLastOrder > 60) riskScore += 0.25;
      else if (m.daysSinceLastOrder > 30) riskScore += 0.1;

      if (m.last3MonthsOrders === 0 && m.daysSinceLastOrder > 45) riskScore += 0.3;
      else if (m.last3MonthsOrders <= 1 && m.totalOrders > 5) riskScore += 0.15;

      if (m.orderFrequency < 0.01 && m.customerLifetime > 180) riskScore += 0.2;

      if (m.outstandingBalance > m.totalSpend * 0.5 && m.totalSpend > 0) riskScore += 0.15;

      if (m.totalOrders <= 2) riskScore += 0.1;
      if (m.totalJobs === 0 && m.totalOrders > 0) riskScore += 0.05;

      riskScore = Math.min(1, riskScore);

      const riskLevel = riskScore >= 0.5 ? 'high' : riskScore >= 0.25 ? 'medium' : 'low';

      scored.push({
        ...m,
        riskScore: Math.round(riskScore * 100) / 100,
        riskLevel,
        keyFactors: this._keyFactors(m, riskScore)
      });
    }

    return scored.sort((a, b) => b.riskScore - a.riskScore);
  }

  _keyFactors(m, riskScore) {
    const factors = [];
    if (m.daysSinceLastOrder > 90) factors.push('No orders in 90+ days');
    else if (m.daysSinceLastOrder > 60) factors.push('No orders in 60+ days');
    if (m.last3MonthsOrders === 0) factors.push('No activity in last quarter');
    if (m.orderFrequency < 0.005) factors.push('Very low order frequency');
    if (m.outstandingBalance > 0) factors.push(`Outstanding balance: ${m.outstandingBalance}`);
    if (m.totalOrders <= 2) factors.push('New customer with few orders');
    return factors;
  }

  _generateSummary(predictions) {
    const high = predictions.filter(p => p.riskLevel === 'high');
    const medium = predictions.filter(p => p.riskLevel === 'medium');
    const highValue = high.filter(p => p.totalSpend > 10000);
    return {
      totalAtRisk: high.length,
      totalModerate: medium.length,
      highValueAtRisk: highValue.length,
      estimatedRevenueAtRisk: Math.round(high.reduce((s, p) => s + p.totalSpend, 0) * 0.6),
      topReason: 'customer_inactivity'
    };
  }
}

module.exports = ChurnPredictor;
