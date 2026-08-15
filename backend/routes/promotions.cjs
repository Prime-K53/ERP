/**
 * Prime ERP — Promotion Administration API
 *
 * Mounted at /api/promotions (staff-authenticated). All promotion definitions
 * are stored in Supabase and shared by the ERP and the Customer Portal. The
 * calculation engine is server-authoritative — these routes only read/write
 * promotion definitions and report usage/analytics.
 */

'use strict';

const express = require('express');
const router = express.Router();
const promotionService = require('../services/promotionService.cjs');
const promotionEngine = require('../services/promotionEngine.cjs');

const CHANNELS = ['ERP', 'PORTAL', 'BOTH'];
const STATUSES = ['draft', 'scheduled', 'active', 'paused', 'expired', 'cancelled'];

function companyIdOf(req) {
  return req.user?.companyId || req.user?.company_id || req.headers['x-company-id'] || null;
}

function validatePromotionPayload(body, { partial = false } = {}) {
  const errors = [];
  if (!partial || body.name !== undefined) {
    if (!body.name || !String(body.name).trim()) errors.push('name is required');
  }
  if (!partial || body.channel !== undefined) {
    if (!CHANNELS.includes(String(body.channel || '').toUpperCase())) errors.push('channel must be ERP, PORTAL or BOTH');
  }
  if (!partial || body.discountType !== undefined || body.type !== undefined) {
    const type = String(body.discountType || body.type || 'percentage');
    if (!Object.values(promotionEngine.DISCOUNT_TYPES).includes(type)) errors.push(`unsupported discountType: ${type}`);
  }
  if (!partial || body.discountValue !== undefined) {
    const value = Number(body.discountValue ?? body.value ?? 0);
    if (!Number.isFinite(value) || value < 0) errors.push('discountValue must be a non-negative number');
  }
  if (!partial || body.status !== undefined) {
    if (body.status && !STATUSES.includes(String(body.status))) errors.push(`status must be one of ${STATUSES.join(', ')}`);
  }
  if (!partial || body.startsAt !== undefined) {
    if (body.startsAt && Number.isNaN(new Date(body.startsAt).getTime())) errors.push('startsAt must be a valid date');
  }
  if (!partial || body.endsAt !== undefined) {
    if (body.endsAt && Number.isNaN(new Date(body.endsAt).getTime())) errors.push('endsAt must be a valid date');
  }
  return errors;
}

// ─── List ───────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, channel, search, type } = req.query;
    let rows = await promotionService.listPromotions({ companyId: companyIdOf(req) });
    if (status) rows = rows.filter((p) => p._effectiveStatus === String(status).toLowerCase());
    if (channel) rows = rows.filter((p) => String(p.channel || '').toUpperCase() === String(channel).toUpperCase());
    if (type) rows = rows.filter((p) => String(p.discountType || p.type || '') === String(type));
    if (search) {
      const q = String(search).toLowerCase();
      rows = rows.filter((p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.code || p.promotionCode || '').toLowerCase().includes(q)
      );
    }
    res.json(rows);
  } catch (err) {
    console.error('[Promotions] List error:', err);
    res.status(500).json({ error: err.message || 'Failed to load promotions' });
  }
});

// ─── Dashboard stats ────────────────────────────────────────────────────────
router.get('/stats/dashboard', async (req, res) => {
  try {
    const stats = await promotionService.getDashboardStats({ companyId: companyIdOf(req) });
    res.json(stats);
  } catch (err) {
    console.error('[Promotions] Dashboard stats error:', err);
    res.status(500).json({ error: err.message || 'Failed to load promotion stats' });
  }
});

// ─── Analytics ──────────────────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const { promotionId } = req.query;
    const analytics = await promotionService.getAnalytics({
      companyId: companyIdOf(req),
      promotionId: promotionId || null,
    });
    res.json(analytics);
  } catch (err) {
    console.error('[Promotions] Analytics error:', err);
    res.status(500).json({ error: err.message || 'Failed to load promotion analytics' });
  }
});

// ─── Create ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const errors = validatePromotionPayload(req.body || {});
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    const record = await promotionService.createPromotion({
      ...(req.body || {}),
      companyId: (req.body && req.body.companyId) || companyIdOf(req) || null,
      createdBy: req.user?.id || req.user?.username || 'system',
    });
    res.status(201).json(record);
  } catch (err) {
    console.error('[Promotions] Create error:', err);
    res.status(500).json({ error: err.message || 'Failed to create promotion' });
  }
});

// ─── Preview (admin-side calculation sandbox) ───────────────────────────────
router.post('/preview', async (req, res) => {
  try {
    const body = req.body || {};
    const companyId = companyIdOf(req);
    const active = await promotionService.getActivePromotions({
      companyId,
      channel: body.channel || 'PORTAL',
    });
    const usage = await promotionService.getUsageByPromotion({ companyId });
    const items = Array.isArray(body.items)
      ? body.items.map((i) => ({
          productId: i.productId,
          name: i.name || 'Item',
          quantity: Number(i.quantity) || 1,
          unitPrice: Number(i.unitPrice ?? i.price ?? 0) || 0,
        }))
      : [{ name: 'Sample', quantity: 1, unitPrice: Number(body.unitPrice ?? body.price ?? 10000) || 10000 }];
    const result = promotionEngine.calculatePromotion({
      companyId,
      customer: body.customer ? { id: body.customer.id || body.customer.customerId, createdAt: body.customer.createdAt } : null,
      channel: body.channel || 'PORTAL',
      items,
      promotionCode: body.promotionCode || null,
      promotions: active,
      usageByPromotion: usage,
      options: { stackingRule: body.stackingRule, maxStacked: body.maxStacked, maxTotalDiscountPct: body.maxTotalDiscountPct },
    });
    res.json(result);
  } catch (err) {
    console.error('[Promotions] Preview error:', err);
    res.status(500).json({ error: err.message || 'Failed to preview promotion' });
  }
});

// ─── Get one ────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const promo = await promotionService.getPromotion(req.params.id);
    if (!promo) return res.status(404).json({ error: 'Promotion not found' });
    if (companyIdOf(req) && promo.companyId && promo.companyId !== companyIdOf(req)) {
      return res.status(404).json({ error: 'Promotion not found' });
    }
    res.json(promo);
  } catch (err) {
    console.error('[Promotions] Get error:', err);
    res.status(500).json({ error: err.message || 'Failed to load promotion' });
  }
});

// ─── Update ─────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const errors = validatePromotionPayload(req.body || {}, { partial: true });
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });
    const updated = await promotionService.updatePromotion(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Promotion not found' });
    res.json(updated);
  } catch (err) {
    console.error('[Promotions] Update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update promotion' });
  }
});

// ─── Delete ─────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await promotionService.deletePromotion(req.params.id);
    if (!result) return res.status(404).json({ error: 'Promotion not found' });
    res.json(result);
  } catch (err) {
    console.error('[Promotions] Delete error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete promotion' });
  }
});

// ─── Usage for one promotion ────────────────────────────────────────────────
router.get('/:id/usage', async (req, res) => {
  try {
    const redemptions = await promotionService.getRedemptions({
      companyId: companyIdOf(req),
      promotionId: req.params.id,
    });
    const promo = await promotionService.getPromotion(req.params.id);
    res.json({
      usedCount: promo ? Number(promo.usedCount ?? promo.used_count ?? 0) || 0 : 0,
      usageLimit: promo ? Number(promo.usageLimit ?? promo.usage_limit ?? 0) || 0 : 0,
      redemptions: redemptions.slice(0, 200),
    });
  } catch (err) {
    console.error('[Promotions] Usage error:', err);
    res.status(500).json({ error: err.message || 'Failed to load usage' });
  }
});

module.exports = router;
