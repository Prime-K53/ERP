const BaseAIService = require('./baseService.cjs');

class POMatcher extends BaseAIService {
  async matchAll() {
    const purchaseOrders = await this._all(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.idpo.status NOT IN ('cancelled')`,
      []
    );

    const goodsReceipts = await this._all(
      `SELECT gr.*, po.po_number, po.supplier_id
       FROM goods_receipts gr
       JOIN purchase_orders po ON gr.purchase_order_id = po.id`,
      []
    );

    const apInvoices = await this._all(
      `SELECT * FROM accounts_payable`,
      []
    );

    const matches = [];

    for (const po of purchaseOrders) {
      const pos = await this._all(
        `SELECT poi.* FROM purchase_order_items poi
         JOIN purchase_orders po2 ON poi.purchase_order_id = po2.id
         WHERE poi.purchase_order_id = ?`,
        [po.id]
      );

      const grs = goodsReceipts.filter(g => g.purchase_order_id === po.id);

      const apMatch = apInvoices.filter(a =>
        a.supplier_id === po.supplier_id &&
        Math.abs(this._safeNumber(a.amount) - this._safeNumber(po.total_amount)) < this._safeNumber(po.total_amount) * 0.1
      );

      const matchStatus = this._determineMatchStatus(po, pos, grs, apMatch);
      const discrepancies = this._findDiscrepancies(pos, grs, apMatch);

      matches.push({
        poId: po.id,
        poNumber: po.po_number || 'N/A',
        supplierName: po.supplier_name,
        poStatus: po.status,
        poTotal: this._safeNumber(po.total_amount),
        itemCount: pos.length,
        receivedCount: grs.reduce((s, g) => s + (g.items_received ? (() => { try { return JSON.parse(g.items_received || '[]').length; } catch { return 0; } })() : 0), 0),
        grCount: grs.length,
        apCount: apMatch.length,
        apTotal: apMatch.reduce((s, a) => s + this._safeNumber(a.amount), 0),
        ...matchStatus,
        discrepancies,
        score: matchStatus.matchScore
      });
    }

    matches.sort((a, b) => a.score - b.score);

    return {
      matches,
      summary: {
        total: matches.length,
        fullyMatched: matches.filter(m => m.matchLevel === 'full').length,
        partialMatch: matches.filter(m => m.matchLevel === 'partial').length,
        unmatched: matches.filter(m => m.matchLevel === 'none').length,
        totalDiscrepancies: matches.reduce((s, m) => s + m.discrepancies.length, 0),
        estimatedSavings: this._estimateSavings(matches),
        generatedAt: new Date().toISOString()
      }
    };
  }

  _determineMatchStatus(po, poItems, goodsReceipts, apMatches) {
    const poTotal = this._safeNumber(po.total_amount);
    const hasGR = goodsReceipts.length > 0;
    const hasAP = apMatches.length > 0;

    if (hasGR && hasAP && goodsReceipts.length >= 1) {
      const grTotal = goodsReceipts.reduce((s, g) => s + this._safeNumber(g.total_amount || g.total), 0);
      const apTotal = apMatches.reduce((s, a) => s + this._safeNumber(a.amount), 0);

      if (Math.abs(poTotal - grTotal) / Math.max(poTotal, 1) < 0.05 &&
          Math.abs(poTotal - apTotal) / Math.max(poTotal, 1) < 0.05) {
        return { matchLevel: 'full', matchScore: 100, matchStatus: 'Fully Matched' };
      }

      const maxDiff = Math.max(Math.abs(poTotal - grTotal), Math.abs(poTotal - apTotal));
      if (maxDiff / Math.max(poTotal, 1) < 0.15) {
        return { matchLevel: 'partial', matchScore: 60, matchStatus: 'Partial Match (small variance)' };
      }
      return { matchLevel: 'partial', matchScore: 40, matchStatus: 'Partial Match (significant variance)' };
    }

    if (hasGR && !hasAP) {
      return { matchLevel: 'partial', matchScore: 30, matchStatus: 'Received, No Invoice' };
    }
    if (hasAP && !hasGR) {
      return { matchLevel: 'partial', matchScore: 25, matchStatus: 'Invoiced, Not Received' };
    }

    return { matchLevel: 'none', matchScore: 0, matchStatus: 'Pending Receipt & Invoice' };
  }

  _findDiscrepancies(poItems, goodsReceipts, apMatches) {
    const discrepancies = [];

    const poQty = poItems.reduce((s, i) => s + this._safeNumber(i.quantity), 0);
    const grItems = goodsReceipts.flatMap(g => {
      try { return JSON.parse(g.items_received || '[]'); } catch { return []; }
    });
    const grQty = grItems.reduce((s, i) => s + this._safeNumber(i.quantity_received || i.quantity || 0), 0);

    if (poQty > 0 && Math.abs(poQty - grQty) / poQty > 0.05) {
      discrepancies.push({
        type: 'quantity_mismatch',
        description: `PO qty ${poQty} vs Received qty ${grQty}`,
        severity: Math.abs(poQty - grQty) / poQty > 0.2 ? 'high' : 'medium'
      });
    }

    if (apMatches.length > 1) {
      discrepancies.push({
        type: 'multiple_invoices',
        description: `${apMatches.length} invoices match this PO`,
        severity: 'medium'
      });
    }

    return discrepancies;
  }

  _estimateSavings(matches) {
    const partial = matches.filter(m => m.matchLevel === 'partial');
    return partial.reduce((s, m) => {
      const overpayment = Math.max(0, this._safeNumber(m.apTotal) - this._safeNumber(m.poTotal));
      return s + overpayment;
    }, 0);
  }
}

module.exports = POMatcher;
