/**
 * Prime ERP — Promotion Service
 *
 * Data-access layer for the promotion engine. Reads promotion definitions and
 * redemption history from Supabase (the single source of truth shared by the
 * Portal and the ERP). Writes usage atomically through the
 * apply_promotion_usage() Postgres function so concurrent checkouts can never
 * overshoot a usage limit.
 */

'use strict';

const axios = require('axios');
const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');
const engine = require('./promotionEngine.cjs');

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

const PROMOTION_TABLE = 'engagement_promotions';
const REDEMPTION_TABLE = 'promotion_redemptions';

const genId = (prefix = 'promo') => `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

async function callUsageRpc(params) {
  if (!SUPABASE_URL || !SECRET_KEY || SUPABASE_URL.includes('placeholder')) return null;
  try {
    const { data } = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/apply_promotion_usage`,
      params,
      {
        headers: {
          apikey: SECRET_KEY,
          Authorization: `Bearer ${SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return data && typeof data === 'object' ? data : null;
  } catch (err) {
    console.warn('[PromotionService] apply_promotion_usage RPC failed:', err?.response?.data || err?.message || err);
    return null;
  }
}

async function withEffectiveStatus(promo, now = new Date()) {
  if (!promo) return null;
  const n = engine.normalizePromotion(promo);
  return { ...promo, _effectiveStatus: engine.deriveStatus(n, now) };
}

const promotionService = {

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async listPromotions({ companyId = null, now = new Date() } = {}) {
    let rows = await repo.getAll(PROMOTION_TABLE);
    if (companyId) rows = rows.filter((p) => !p.companyId || p.companyId === companyId || p.company_id === companyId);
    const withStatus = await Promise.all(rows.map((r) => withEffectiveStatus(r, now)));
    return withStatus.sort((a, b) => {
      const pa = Number(a.priority ?? b.priority ?? 0) || 0;
      const pb = Number(b.priority ?? 0) || 0;
      return pb - pa;
    });
  },

  async getPromotion(id) {
    const row = await repo.getById(PROMOTION_TABLE, id);
    return withEffectiveStatus(row);
  },

  async createPromotion(payload) {
    const record = {
      ...payload,
      id: payload.id || genId(),
      channel: String(payload.channel || 'BOTH').toUpperCase(),
      status: payload.status || 'draft',
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      stackable: !!payload.stackable,
      isAutoApply: payload.isAutoApply !== undefined ? payload.isAutoApply : true,
      usedCount: Number(payload.usedCount || payload.used_count || 0) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repo.upsert(PROMOTION_TABLE, record);
    return withEffectiveStatus(record);
  },

  async updatePromotion(id, updates) {
    const existing = await repo.getById(PROMOTION_TABLE, id);
    if (!existing) return null;
    const record = {
      ...existing,
      ...updates,
      id,
      channel: updates.channel !== undefined ? String(updates.channel).toUpperCase() : existing.channel,
      updatedAt: new Date().toISOString(),
    };
    await repo.upsert(PROMOTION_TABLE, record);
    return withEffectiveStatus(record);
  },

  async deletePromotion(id) {
    const existing = await repo.getById(PROMOTION_TABLE, id);
    if (!existing) return null;
    await repo.softDelete(PROMOTION_TABLE, id);
    return { id, deleted: true };
  },

  // ─── Active / eligible fetch ─────────────────────────────────────────────

  /** Promotions that are currently active for the given channel (display + calc). */
  async getActivePromotions({ companyId = null, channel = null, now = new Date() } = {}) {
    const all = await this.listPromotions({ companyId, now });
    return all.filter((p) => {
      if (p._effectiveStatus !== 'active') return false;
      if (channel && !engine.isChannelEligible(p, channel)) return false;
      return true;
    });
  },

  // ─── Usage & redemptions ─────────────────────────────────────────────────

  async getRedemptions({ companyId = null, promotionId = null, customerId = null, limit = 500 } = {}) {
    let rows = await repo.getAll(REDEMPTION_TABLE);
    if (companyId) rows = rows.filter((r) => r.companyId === companyId || r.company_id === companyId);
    if (promotionId) rows = rows.filter((r) => r.promotionId === promotionId || r.promotion_id === promotionId);
    if (customerId) rows = rows.filter((r) => r.customerId === customerId || r.customer_id === customerId);
    return rows.slice(0, limit);
  },

  /** { [promotionId]: usedCount } — redemptions are authoritative, fall back to used_count. */
  async getUsageByPromotion({ companyId = null } = {}) {
    const [promotions, redemptions] = await Promise.all([
      this.listPromotions({ companyId }),
      this.getRedemptions({ companyId, limit: 10000 }),
    ]);
    const usage = {};
    for (const p of promotions) {
      usage[p.id] = Number(p.usedCount ?? p.used_count ?? 0) || 0;
    }
    for (const r of redemptions) {
      const pid = r.promotionId || r.promotion_id;
      if (pid) usage[pid] = Math.max(usage[pid] || 0, 1);
    }
    return usage;
  },

  /** { [promotionId]: countForCustomer } for a specific customer. */
  async getUsageByPromotionForCustomer(customerId, { companyId = null } = {}) {
    const redemptions = await this.getRedemptions({ companyId, customerId, limit: 10000 });
    const usage = {};
    for (const r of redemptions) {
      const pid = r.promotionId || r.promotion_id;
      if (pid) usage[pid] = (usage[pid] || 0) + 1;
    }
    return usage;
  },

  /**
   * Atomically record a promotion application on a source document.
   * Uses the Postgres RPC (row lock + limits + redemption insert). If the RPC
   * is unavailable (no Supabase), falls back to a best-effort used_count bump.
   * @returns {{success:boolean, reason?:string, duplicate?:boolean, usedCount?:number}}
   */
  async recordRedemption({
    promotionId,
    customerId = null,
    companyId = null,
    sourceType = 'request',
    sourceId = null,
    sourceNumber = null,
    discountAmount = 0,
    subtotalBefore = 0,
    subtotalAfter = 0,
    snapshot = {},
  }) {
    if (!promotionId || !sourceId) return { success: false, reason: 'missing_required' };

    const result = await callUsageRpc({
      p_promotion_id: String(promotionId),
      p_customer_id: customerId ? String(customerId) : null,
      p_source_type: String(sourceType),
      p_source_id: String(sourceId),
      p_source_number: sourceNumber ? String(sourceNumber) : null,
      p_company_id: companyId ? String(companyId) : null,
      p_discount_amount: Number(discountAmount) || 0,
      p_subtotal_before: Number(subtotalBefore) || 0,
      p_subtotal_after: Number(subtotalAfter) || 0,
      p_snapshot: snapshot && typeof snapshot === 'object' ? snapshot : {},
    });

    if (result) return result;

    // Best-effort fallback (offline / no Supabase): bump used_count directly.
    try {
      const existing = await repo.getById(PROMOTION_TABLE, promotionId);
      if (existing) {
        await repo.upsert(PROMOTION_TABLE, {
          ...existing,
          usedCount: Number(existing.usedCount ?? existing.used_count ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('[PromotionService] fallback usage bump failed:', err?.message || err);
    }
    return { success: true, fallback: true };
  },

  // ─── Analytics ───────────────────────────────────────────────────────────

  async getAnalytics({ companyId = null, promotionId = null } = {}) {
    // Analytics must be complete — never truncate totals/trend at a list page
    // size. The ledger is capped generously; paginate here if it ever grows.
    const [promotions, redemptions] = await Promise.all([
      this.listPromotions({ companyId }),
      this.getRedemptions({ companyId, promotionId, limit: 10000 }),
    ]);

    const byPromotion = {};
    for (const p of promotions) {
      byPromotion[p.id] = {
        id: p.id,
        name: p.name,
        code: p.code || p.promotionCode || null,
        status: p._effectiveStatus,
        channel: p.channel || 'BOTH',
        discountType: p.discountType || p.type || 'percentage',
        discountValue: Number(p.discountValue ?? p.value ?? 0),
        orders: 0,
        customers: new Set(),
        grossSales: 0,
        discountAmount: 0,
        netSales: 0,
      };
    }

    let totalOrders = 0;
    let totalCustomers = new Set();
    let totalGross = 0;
    let totalDiscount = 0;
    let totalNet = 0;

    for (const r of redemptions) {
      const pid = r.promotionId || r.promotion_id;
      const discount = Number(r.discountAmount ?? r.discount_amount ?? 0);
      const gross = Number(r.subtotalBefore ?? r.subtotal_before ?? 0);
      const net = Number(r.subtotalAfter ?? r.subtotal_after ?? 0);
      const customerId = r.customerId || r.customer_id || null;

      totalOrders += 1;
      if (customerId) totalCustomers.add(customerId);
      totalGross += gross;
      totalDiscount += discount;
      totalNet += net > 0 ? net : gross - discount;

      if (pid && byPromotion[pid]) {
        byPromotion[pid].orders += 1;
        if (customerId) byPromotion[pid].customers.add(customerId);
        byPromotion[pid].grossSales += gross;
        byPromotion[pid].discountAmount += discount;
        byPromotion[pid].netSales += net > 0 ? net : gross - discount;
      }
    }

    const promotionStats = Object.values(byPromotion).map((p) => ({
      ...p,
      customers: p.customers.size,
      averageOrderValue: p.orders > 0 ? engine.round2(p.netSales / p.orders) : 0,
    }));

    // ── Trend: last 30 days of redemption activity (for admin charts) ──
    const dayKey = (d) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const trendByDay = new Map();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      const key = dayKey(d);
      trendByDay.set(key, { date: key, orders: 0, grossSales: 0, discountAmount: 0, netSales: 0 });
    }
    for (const r of redemptions) {
      const ts = new Date(r.createdAt || r.created_at || r.created || null);
      if (Number.isNaN(ts.getTime())) continue;
      const bucket = trendByDay.get(dayKey(ts));
      if (!bucket) continue;
      const discount = Number(r.discountAmount ?? r.discount_amount ?? 0);
      const gross = Number(r.subtotalBefore ?? r.subtotal_before ?? 0);
      const net = Number(r.subtotalAfter ?? r.subtotal_after ?? 0);
      bucket.orders += 1;
      bucket.grossSales += gross;
      bucket.discountAmount += discount;
      bucket.netSales += net > 0 ? net : gross - discount;
    }
    const trend = [...trendByDay.values()].map((b) => ({
      ...b,
      grossSales: engine.round2(b.grossSales),
      discountAmount: engine.round2(b.discountAmount),
      netSales: engine.round2(b.netSales),
    }));

    return {
      totals: {
        orders: totalOrders,
        customers: totalCustomers.size,
        grossSales: engine.round2(totalGross),
        discountAmount: engine.round2(totalDiscount),
        netSales: engine.round2(totalNet),
        averageOrderValue: totalOrders > 0 ? engine.round2(totalNet / totalOrders) : 0,
      },
      byPromotion: promotionStats,
      trend,
    };
  },

  // ─── Dashboard counts for the admin UI ───────────────────────────────────

  async getDashboardStats({ companyId = null, now = new Date() } = {}) {
    const [promotions, analytics] = await Promise.all([
      this.listPromotions({ companyId, now }),
      this.getAnalytics({ companyId }),
    ]);

    const counts = { active: 0, scheduled: 0, expired: 0, paused: 0, draft: 0, cancelled: 0 };
    for (const p of promotions) {
      const s = p._effectiveStatus;
      if (counts[s] !== undefined) counts[s] += 1;
    }

    return {
      counts,
      totalPromotions: promotions.length,
      totalUsage: promotions.reduce((s, p) => s + (Number(p.usedCount ?? p.used_count ?? 0) || 0), 0),
      ...analytics.totals,
    };
  },
};

module.exports = promotionService;
