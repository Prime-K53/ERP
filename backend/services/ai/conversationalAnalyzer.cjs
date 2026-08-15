const BaseAIService = require('./baseService.cjs');
const LLMClient = require('./llmClient.cjs');

class ConversationalAnalyzer extends BaseAIService {
  constructor() {
    super();
    this.llm = new LLMClient();
  }

  async query( question, options = {}) {
    const context = await this._buildContext( question);

    const systemPrompt = `You are Prime ERP's AI business analyst. You have access to business data context.
Answer questions concisely with specific numbers. When appropriate, include JSON data that can be used for charts.
Available data: sales, inventory, production, finances, customers, suppliers, purchase orders, employees, invoices, products, examinations, work orders.
Respond in markdown. If the user asks for a chart or visualization, include a JSON codeblock with chart data.`;

    let answer;
    if (options.useLLM !== false && process.env.AI_API_KEY) {
      answer = await this.llm.generate(systemPrompt, `Context:\n${context}\n\nQuestion: ${question}`);
    } else {
      answer = this._ruleBasedAnswer(question, context);
    }

    return {
      question,
      answer,
      context,
      timestamp: new Date().toISOString()
    };
  }

  _matchesWord(q, keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(q);
  }

  _mentions(q, keywords) {
    return keywords.some(k => this._matchesWord(q, k));
  }

  _detectIntent(q) {
    const intents = [];
    if (this._matchesWord(q, 'compare') || q.includes('vs') || q.includes('versus') || q.includes('difference')) intents.push('comparison');
    if (this._matchesWord(q, 'trend') || q.includes('over time') || q.includes('monthly') || q.includes('weekly') || this._matchesWord(q, 'growth')) intents.push('trend');
    if (this._matchesWord(q, 'percentage') || q.includes('percent') || q.includes('%') || q.includes('ratio')) intents.push('percentage');
    if (this._matchesWord(q, 'aging') || q.includes('aged') || q.includes('overdue') || q.includes('outstanding')) intents.push('aging');
    if (this._matchesWord(q, 'forecast') || q.includes('projection') || q.includes('predict')) intents.push('forecast');
    if (intents.length === 0) intents.push('default');
    return intents;
  }

  async _buildContext( question) {
    const q = question.toLowerCase();
    const parts = [];
    const intents = this._detectIntent(q);
    const promises = [];
    const pushResult = (label, dataPromise) => {
      promises.push(
        dataPromise.then(data => {
          if (data) parts.push(`${label}: ${data}`);
        }).catch(() => {})
      );
    };

    if (this._mentions(q, ['sale', 'revenue', 'income', 'order', 'customer', 'client'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as total FROM sales`,
            []
          ),
          this._all(
            `SELECT customer_name, COUNT(*) as orders, COALESCE(SUM(total_amount),0) as total
             FROM salescustomer_name IS NOT NULL
             GROUP BY customer_name ORDER BY total DESC LIMIT 10`,
            []
          ),
          this._all(
            `SELECT s.status, COUNT(*) as count, COALESCE(SUM(s.total_amount),0) as total
             FROM sales s GROUP BY s.status`,
            []
          )
        ]).then(([salesData, topCustomers, statusData]) => {
          const r = [];
          r.push(`${salesData[0].count} transactions totaling ${Math.round(salesData[0].total)}`);
          if (statusData.length > 0) r.push(`Status: ${statusData.map(s => `${s.status} (${s.count}, ${Math.round(s.total)})`).join(', ')}`);
          if (topCustomers.length > 0) r.push(`Top Customers: ${topCustomers.map(c => `${c.customer_name} (${c.orders} orders, ${Math.round(c.total)})`).join(', ')}`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Sales: ${d}`); })
      );

      if (intents.includes('trend')) {
        pushResult('Sales Trend',
          this._all(
            `SELECT strftime('%Y-%m', date) as month, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total
             FROM salesdate >= datetime('now', '-12 months')
             GROUP BY month ORDER BY month ASC`,
            []
          ).then(rows => rows.length > 0 ? rows.map(r => `${r.month} (${Math.round(r.total)})`).join(', ') : null)
        );
      }

      if (intents.includes('comparison')) {
        const [thisMonth, lastMonth] = await Promise.all([
          this._get(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count FROM salesstrftime('%Y-%m', date) = strftime('%Y-%m', 'now')`, []),
          this._get(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count FROM salesstrftime('%Y-%m', date) = strftime('%Y-%m', 'now', '-1 month')`, [])
        ]);
        const diff = thisMonth.total - lastMonth.total;
        const pct = lastMonth.total > 0 ? Math.round((diff / lastMonth.total) * 100) : 0;
        parts.push(`Sales Comparison: This month ${Math.round(thisMonth.total)} (${thisMonth.count} orders) vs Last month ${Math.round(lastMonth.total)} (${lastMonth.count} orders) — ${pct >= 0 ? '+' : ''}${pct}%`);
      }
    }

    if (this._mentions(q, ['inventory', 'stock', 'item', 'material', 'warehouse'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT COUNT(*) as count, COALESCE(SUM(quantity),0) as total_qty,
                    COALESCE(SUM(quantity * cost_per_unit),0) as total_value
             FROM inventory`,
            []
          ),
          this._all(
            `SELECT material, quantity, reorder_point FROM inventoryreorder_point > 0 AND quantity <= reorder_point
             ORDER BY quantity ASC LIMIT 10`,
            []
          ),
          this._all(
            `SELECT type, COUNT(*) as count, COALESCE(SUM(quantity),0) as qty
             FROM inventory GROUP BY type`,
            []
          )
        ]).then(([invData, lowStock, typeData]) => {
          const r = [];
          r.push(`${invData[0].count} items, ${Math.round(invData[0].total_qty)} units, value ${Math.round(invData[0].total_value)}`);
          if (typeData.length > 0) r.push(`Types: ${typeData.map(t => `${t.type} (${t.count} items, ${t.qty} units)`).join(', ')}`);
          if (lowStock.length > 0) r.push(`Low Stock Items: ${lowStock.map(i => `${i.material} (${i.quantity}/${i.reorder_point})`).join(', ')}`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Inventory: ${d}`); })
      );

      if (intents.includes('trend')) {
        pushResult('Inventory Movements',
          this._all(
            `SELECT strftime('%Y-%m', timestamp) as month, type, COUNT(*) as count, COALESCE(SUM(quantity),0) as qty
             FROM inventory_transactionstimestamp >= datetime('now', '-6 months')
             GROUP BY month, type ORDER BY month ASC`,
            []
          ).then(rows => rows.length > 0 ? rows.map(r => `${r.month} ${r.type} (${r.qty} units)`).join(', ') : null)
        );
      }
    }

    if (this._mentions(q, ['finance', 'account', 'ledger', 'expense', 'budget', 'profit', 'cash'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT type, COUNT(*) as count FROM chart_of_accounts GROUP BY type`,
            []
          ),
          this._all(
            `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE status='paid' AND expense_date >= datetime('now', '-30 days')`,
            []
          ),
          this._all(
            `SELECT COALESCE(SUM(amount),0) as total FROM income WHERE income_date >= datetime('now', '-30 days')`,
            []
          ),
          this._all(
            `SELECT strftime('%Y-%m', expense_date) as month, COALESCE(SUM(amount),0) as total
             FROM expenses WHERE status='paid' AND expense_date >= datetime('now', '-6 months')
             GROUP BY month ORDER BY month ASC`,
            []
          )
        ]).then(([accounts, expenses, income, expenseTrend]) => {
          const r = [];
          if (accounts.length > 0) r.push(`Accounts: ${accounts.map(a => `${a.type} (${a.count})`).join(', ')}`);
          r.push(`Last 30 days: Expenses ${Math.round(expenses[0].total)}, Income ${Math.round(income[0].total)}`);
          if (income[0].total > 0 || expenses[0].total > 0) {
            const profit = income[0].total - expenses[0].total;
            const pct = income[0].total > 0 ? Math.round((profit / income[0].total) * 100) : 0;
            r.push(`Net Profit: ${Math.round(profit)} (${pct}% margin)`);
          }
          if (expenseTrend.length > 0 && intents.includes('trend')) r.push(`Expense Trend: ${expenseTrend.map(e => `${e.month} (${Math.round(e.total)})`).join(', ')}`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Finance: ${d}`); })
      );

      if (intents.includes('aging')) {
        promises.push(
          this._all(
            `SELECT '0-30' as bucket, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE status='unpaid' AND julianday('now') - julianday(created_at) <= 30
             UNION ALL SELECT '31-60', COUNT(*), COALESCE(SUM(total_amount),0) FROM invoices WHERE status='unpaid' AND julianday('now') - julianday(created_at) BETWEEN 31 AND 60
             UNION ALL SELECT '61-90', COUNT(*), COALESCE(SUM(total_amount),0) FROM invoices WHERE status='unpaid' AND julianday('now') - julianday(created_at) BETWEEN 61 AND 90
             UNION ALL SELECT '90+', COUNT(*), COALESCE(SUM(total_amount),0) FROM invoices WHERE status='unpaid' AND julianday('now') - julianday(created_at) > 90`,
            []
          ).then(aging => aging.length > 0 ? aging.map(a => `${a.bucket}d: ${a.count} invoices (${Math.round(a.total)})`).join(', ') : null)
            .then(d => { if (d) parts.push(`AR Aging: ${d}`); })
        );
      }
    }

    if (this._mentions(q, ['production', 'work order', 'batch', 'manufacturing', 'bom'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT status, COUNT(*) as count FROM work_orders GROUP BY status`,
            []
          ),
          this._all(
            `SELECT COUNT(*) as count, COALESCE(SUM(CASE WHEN status='completed' AND due_date < completed_at THEN 1 ELSE 0 END),0) as late,
                    COALESCE(SUM(CASE WHEN status='completed' AND due_date >= completed_at THEN 1 ELSE 0 END),0) as on_time
             FROM work_orders WHERE status='completed'`,
            []
          )
        ]).then(([prodData, perfData]) => {
          const r = [];
          r.push(prodData.map(d => `${d.status} (${d.count})`).join(', '));
          const totalDone = perfData[0].count;
          if (totalDone > 0) r.push(`On-time: ${perfData[0].on_time}/${totalDone} (${Math.round(perfData[0].on_time/totalDone*100)}%)`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Work Orders: ${d}`); })
      );
    }

    if (this._mentions(q, ['employee', 'staff', 'personnel', 'payroll', 'hr'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT COUNT(*) as count, COALESCE(SUM(salary),0) as total_salary
             FROM employeesstatus = 'active'`,
            []
          ),
          this._all(
            `SELECT department, COUNT(*) as count FROM employeesstatus = 'active' GROUP BY department`,
            []
          )
        ]).then(([empData, deptData]) => {
          const r = [];
          r.push(`${empData[0].count} active, total salary ${Math.round(empData[0].total_salary)}`);
          if (deptData.length > 0) r.push(`Departments: ${deptData.map(d => `${d.department || 'Unassigned'} (${d.count})`).join(', ')}`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Employees: ${d}`); })
      );
    }

    if (this._mentions(q, ['invoice', 'summary', 'billing', 'receivable', 'unpaid', 'overdue'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as total,
                    COALESCE(SUM(CASE WHEN status='unpaid' THEN total_amount ELSE 0 END),0) as unpaid_total
             FROM invoices`,
            []
          ),
          this._all(
            `SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total
             FROM invoices GROUP BY status`,
            []
          ),
          this._all(
            `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total
             FROM invoicescreated_at >= datetime('now', '-12 months')
             GROUP BY month ORDER BY month ASC`,
            []
          )
        ]).then(([invoiceData, statusBreakdown, invTrend]) => {
          const r = [];
          r.push(`${invoiceData[0].count} total, ${Math.round(invoiceData[0].total)} total amount, ${Math.round(invoiceData[0].unpaid_total)} unpaid`);
          if (statusBreakdown.length > 0) r.push(`Status: ${statusBreakdown.map(s => `${s.status} (${s.count}, ${Math.round(s.total)})`).join(', ')}`);
          if (intents.includes('trend') && invTrend.length > 0) r.push(`Monthly: ${invTrend.map(t => `${t.month} (${Math.round(t.total)})`).join(', ')}`);
          if (intents.includes('percentage') && invoiceData[0].count > 0) {
            const pctUnpaid = Math.round((invoiceData[0].unpaid_total / invoiceData[0].total) * 100);
            r.push(`${pctUnpaid}% of value is unpaid`);
          }
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Invoices: ${d}`); })
      );
    }

    if (this._mentions(q, ['product', 'top selling', 'best selling', 'most sold', 'popular', 'fast moving', 'slow moving'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT si.item_name, SUM(si.quantity) as total_qty, SUM(si.line_total) as total_revenue
             FROM sale_items si JOIN sales s ON si.sale_id = s.idsi.item_name IS NOT NULL
             GROUP BY si.item_name ORDER BY total_qty DESC LIMIT 10`,
            []
          ),
          this._all(
            `SELECT si.item_name, SUM(si.line_total) as total_revenue, SUM(si.quantity) as total_qty
             FROM sale_items si JOIN sales s ON si.sale_id = s.idsi.item_name IS NOT NULL
             GROUP BY si.item_name ORDER BY total_revenue DESC LIMIT 10`,
            []
          ),
          this._all(
            `SELECT si.item_name, SUM(si.quantity) as total_qty, SUM(si.line_total) as total_revenue,
                    SUM(si.line_total - si.quantity * COALESCE(si.unit_cost,0)) as total_profit
             FROM sale_items si JOIN sales s ON si.sale_id = s.idsi.item_name IS NOT NULL AND si.unit_cost > 0
             GROUP BY si.item_name ORDER BY total_profit DESC LIMIT 10`,
            []
          )
        ]).then(([topProducts, productsByRevenue, profitData]) => {
          const r = [];
          if (topProducts.length > 0) r.push(`Top Selling: ${topProducts.map(p => `${p.item_name} (${p.total_qty} units, ${Math.round(p.total_revenue)})`).join(', ')}`);
          if (productsByRevenue.length > 0) r.push(`Top Revenue: ${productsByRevenue.map(p => `${p.item_name} (${Math.round(p.total_revenue)} revenue)`).join(', ')}`);
          if (profitData.length > 0 && intents.includes('percentage')) r.push(`Most Profitable: ${profitData.map(p => `${p.item_name} (${Math.round(p.total_profit)} profit)`).join(', ')}`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Products: ${d}`); })
      );
    }

    if (this._mentions(q, ['purchase order', 'po', 'supplier order', 'procurement', 'stationery'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT COUNT(*) as count FROM purchase_orders`,
            []
          ),
          this._all(
            `SELECT status, COUNT(*) as count FROM purchase_orders GROUP BY status`,
            []
          ),
          this._all(
            `SELECT poi.item_name, SUM(poi.quantity) as total_qty, SUM(poi.total_price) as total_cost
             FROM purchase_order_items poi JOIN purchase_orders po ON poi.purchase_order_id = po.idpoi.item_name IS NOT NULL
             GROUP BY poi.item_name ORDER BY total_qty DESC LIMIT 20`,
            []
          )
        ]).then(([poData, poStatus, poItems]) => {
          const r = [];
          r.push(`${poData[0].count} total`);
          if (poStatus.length > 0) r.push(`Status: ${poStatus.map(s => `${s.status} (${s.count})`).join(', ')}`);
          if (poItems.length > 0) r.push(`Items: ${poItems.map(i => `${i.item_name} (${i.total_qty} units, ${Math.round(i.total_cost)})`).join(', ')}`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Purchase Orders: ${d}`); })
      );

      if (this._matchesWord(q, 'stationery') || this._matchesWord(q, 'stationery')) {
        promises.push(
          this._all(
            `SELECT poi.item_name, SUM(poi.quantity) as total_qty, SUM(poi.total_price) as total_cost
             FROM purchase_order_items poi JOIN purchase_orders po ON poi.purchase_order_id = po.idpoi.item_name IS NOT NULL
             GROUP BY poi.item_name ORDER BY total_qty DESC`,
            []
          ).then(rows => {
            const w = ['stationery', 'paper', 'book', 'notebook', 'pen', 'pencil', 'ink', 'toner', 'staple', 'folder', 'envelope', 'marker', 'eraser', 'ruler', 'tape', 'glue', 'scissors', 'file', 'binder'];
            const filtered = rows.filter(i => {
              const n = i.item_name.toLowerCase();
              return w.some(k => n.includes(k));
            });
            if (filtered.length > 0) {
              const top5 = filtered.slice(0, 5);
              parts.push(`Stationery Items in POs: ${top5.map(i => `${i.item_name} (${i.total_qty} units)`).join(', ')}`);
              if (filtered.length > 5) parts.push(`Plus ${filtered.length - 5} more stationery items found.`);
            } else if (rows.length > 0) {
              parts.push(`No stationery items found by name. Check the inventory type/column for categorization.`);
            }
          }).catch(() => {})
        );
      }

      promises.push(
        this._all(
          `SELECT s.name, COUNT(po.id) as po_count, COALESCE(SUM(poi.total_price),0) as total_spend
           FROM suppliers s LEFT JOIN purchase_orders po ON po.supplier_id = s.id
           LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id GROUP BY s.name HAVING po_count > 0 ORDER BY total_spend DESC LIMIT 10`,
          []
        ).then(rows => rows.length > 0 ? rows.map(s => `${s.name} (${s.po_count} POs, ${Math.round(s.total_spend)} spend)`).join(', ') : null)
          .then(d => { if (d) parts.push(`Suppliers: ${d}`); })
      );
    }

    if (this._mentions(q, ['examination', 'exam', 'school', 'class', 'subject', 'learner', 'batch'])) {
      promises.push(
        Promise.all([
          this._all(
            `SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as total FROM examination_batches`,
            []
          ),
          this._all(
            `SELECT status, COUNT(*) as count FROM examination_batches GROUP BY status`,
            []
          ),
          this._all(
            `SELECT COUNT(DISTINCT school_id) as schools, COALESCE(SUM(expected_candidature),0) as candidates FROM examination_batches`,
            []
          )
        ]).then(([batchData, batchStatus, batchStats]) => {
          const r = [];
          r.push(`${batchData[0].count} batches totaling ${Math.round(batchData[0].total)}`);
          if (batchStatus.length > 0) r.push(`Status: ${batchStatus.map(s => `${s.status} (${s.count})`).join(', ')}`);
          if (batchStats[0].schools > 0) r.push(`${batchStats[0].schools} schools, ${batchStats[0].candidates} candidates`);
          return r.join(' | ');
        }).then(d => { if (d) parts.push(`Examinations: ${d}`); })
      );
    }

    if (this._mentions(q, ['bom', 'bill of material', 'cost', 'component'])) {
      promises.push(
        this._all(
          `SELECT name, total_cost, created_at FROM bill_of_materials ORDER BY created_at DESC LIMIT 10`,
          []
        ).then(rows => rows.length > 0 ? rows.map(r => `${r.name} (${Math.round(r.total_cost)})`).join(', ') : null)
          .then(d => { if (d) parts.push(`BOMs: ${d}`); })
      );
    }

    await Promise.all(promises);

    return parts.join('\n') || 'No specific data found for this query. Available data includes sales, inventory, finance, production, HR, invoices, products, purchase orders, and examination information.';
  }

  _ruleBasedAnswer(question, context) {
    const q = question.toLowerCase();

    if (this._matchesWord(q, 'top customer') || (this._matchesWord(q, 'customer') && (q.includes('most') || q.includes('top')))) {
      const match = context.match(/Top Customers: (.+?)(?: \| |$)/);
      if (match) return `**Top Customers:**\n\n${match[1].split(', ').map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
    }
    if (this._matchesWord(q, 'low stock') || this._matchesWord(q, 'reorder') || this._matchesWord(q, 'restock') || this._matchesWord(q, 'shortage')) {
      const match = context.match(/Low Stock Items: (.+?)(?: \| |$)/);
      if (match) return `**Low Stock Alerts:**\n\n${match[1].split(', ').map(i => `- ${i}`).join('\n')}\n\nConsider reviewing these items and placing reorders.`;
    }
    if (this._matchesWord(q, 'revenue') || this._matchesWord(q, 'sale') || this._matchesWord(q, 'income')) {
      const saleMatch = context.match(/Sales: (.+?)(?:\n|$)/);
      if (saleMatch) return `**Sales Overview:**\n\n${saleMatch[1]}`;
    }
    if (this._matchesWord(q, 'expense') || this._matchesWord(q, 'spend') || this._matchesWord(q, 'cost')) {
      const match = context.match(/Expenses (.+?)(?: \| |$)/);
      if (match) return `**Expenses (Last 30 days):** ${match[1]}`;
    }
    if (this._matchesWord(q, 'profit') || this._matchesWord(q, 'margin')) {
      const profitMatch = context.match(/Net Profit: (.+?)(?: \| |$)/);
      if (profitMatch) return `**Profit Analysis:** ${profitMatch[1]}`;
      const incomeMatch = context.match(/Income (.+?)(?: \| |$)/);
      const expenseMatch = context.match(/Expenses (.+?)(?: \| |$)/);
      if (incomeMatch && expenseMatch) {
        return `**Profit Summary (Last 30 days):**\n- Income: ${incomeMatch[1]}\n- Expenses: ${expenseMatch[1]}`;
      }
    }
    if (this._matchesWord(q, 'invoice') && (this._matchesWord(q, 'summary') || this._matchesWord(q, 'status') || this._matchesWord(q, 'overview'))) {
      const match = context.match(/Invoices: (.+?)(?:\n|$)/);
      if (match) {
        let answer = `**Invoice Summary:**\n\n${match[1]}`;
        return answer;
      }
    }
    if (this._matchesWord(q, 'top') && this._matchesWord(q, 'selling') || this._matchesWord(q, 'best') && this._matchesWord(q, 'selling') || (this._matchesWord(q, 'product') && (this._matchesWord(q, 'top') || this._matchesWord(q, 'most') || this._matchesWord(q, 'popular')))) {
      const match = context.match(/Top Selling: (.+?)(?: \| |$)/);
      if (match) return `**Top Selling Products:**\n\n${match[1].split(', ').map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
    }
    if ((this._matchesWord(q, 'profit') || this._matchesWord(q, 'profitable')) && this._matchesWord(q, 'product')) {
      const match = context.match(/Most Profitable: (.+?)(?: \| |$)/);
      if (match) return `**Most Profitable Products:**\n\n${match[1].split(', ').map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
    }
    if ((this._matchesWord(q, 'purchase order') || this._matchesWord(q, 'po') || this._matchesWord(q, 'procurement')) && (this._matchesWord(q, 'stationery') || this._matchesWord(q, 'item') || this._matchesWord(q, 'list'))) {
      const stationeryMatch = context.match(/Stationery Items in POs: (.+?)(?:\n|$)/);
      if (stationeryMatch) return `**Stationery Items in Purchase Orders:**\n\n${stationeryMatch[1].split(', ').map(i => `- ${i}`).join('\n')}`;
    }
    if (this._matchesWord(q, 'supplier') || this._matchesWord(q, 'vendor')) {
      const match = context.match(/Suppliers: (.+?)(?:\n|$)/);
      if (match) return `**Supplier Overview:**\n\n${match[1].split(', ').map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }
    if (this._matchesWord(q, 'compare') || q.includes('vs') || q.includes('versus')) {
      const match = context.match(/Sales Comparison: (.+?)(?:\n|$)/);
      if (match) return `**Sales Comparison:**\n\n${match[1]}`;
    }
    if (this._matchesWord(q, 'aging') || (this._matchesWord(q, 'receivable') && (this._matchesWord(q, 'overdue') || this._matchesWord(q, 'outstanding')))) {
      const match = context.match(/AR Aging: (.+?)(?:\n|$)/);
      if (match) return `**Accounts Receivable Aging:**\n\n${match[1].split(', ').map(a => `- ${a}`).join('\n')}`;
    }
    if (this._matchesWord(q, 'examination') || this._matchesWord(q, 'exam') || this._matchesWord(q, 'batch')) {
      const match = context.match(/Examinations: (.+?)(?:\n|$)/);
      if (match) return `**Examination Summary:**\n\n${match[1]}`;
    }
    if (this._matchesWord(q, 'work order') || (this._matchesWord(q, 'production') && this._matchesWord(q, 'performance'))) {
      const match = context.match(/Work Orders: (.+?)(?:\n|$)/);
      if (match) return `**Work Order Summary:**\n\n${match[1]}`;
    }

    return `**Analysis based on available data:**\n\n${context}\n\nFor more detailed analysis, please ask a more specific question or configure an AI provider in settings.`;
  }
}

module.exports = ConversationalAnalyzer;
