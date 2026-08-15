const express = require('express');
const router = express.Router();
const ReferralService = require('../services/referralService.cjs');
const { requireRole } = require('../middleware/auth.cjs');
const { validateBody, validateQuery, referralSchemas } = require('../middleware/validation.cjs');
const { createLimiter } = require('../middleware/rateLimiter.cjs');

const referralCreateLimiter = createLimiter({ windowMs: 60 * 1000, maxRequests: 10, message: 'Too many referral creation attempts, please try again later' });
const rewardCreateLimiter = createLimiter({ windowMs: 60 * 1000, maxRequests: 20, message: 'Too many reward creation attempts, please try again later' });
const { idempotencyMiddleware } = require('../middleware/idempotency.cjs');

const referralService = new ReferralService();

// --- Analytics ---
router.get('/analytics/history', requireRole('Admin', 'Manager', 'Accountant', 'Viewer'), validateQuery(referralSchemas.getAnalyticsQuery), async (req, res) => {
  try {
    const result = await referralService.getAnalyticsHistory(req.query || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to get analytics history:', err);
    res.status(500).json({ error: 'Failed to get analytics history' });
  }
});

router.get('/analytics', requireRole('Admin', 'Manager', 'Accountant', 'Viewer'), validateQuery(referralSchemas.getAnalyticsQuery), async (req, res) => {
  try {
    const result = await referralService.getAnalytics(req.query || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to get analytics:', err);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// --- Campaigns ---
router.get('/campaigns', requireRole('Admin', 'Manager', 'Accountant', 'Viewer'), async (req, res) => {
  try {
    const result = await referralService.getAllCampaigns(req.query || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to list campaigns:', err);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

router.post('/campaigns', requireRole('Admin', 'Manager'), validateBody(referralSchemas.createCampaign), async (req, res) => {
  try {
    const data = await referralService.createCampaign({ ...req.body, createdBy: req.user.id } || '');
    res.status(201).json(data);
  } catch (err) {
    console.error('[Referrals] Failed to create campaign:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

router.put('/campaigns/:id', requireRole('Admin', 'Manager'), validateBody(referralSchemas.updateCampaign), async (req, res) => {
  try {
    const data = await referralService.updateCampaign(req.params.id, req.body || '');
    if (!data) return res.status(404).json({ error: 'Campaign not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to update campaign:', err);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

router.patch('/campaigns/:id/status', requireRole('Admin', 'Manager'), validateBody(referralSchemas.updateCampaignStatus), async (req, res) => {
  try {
    const data = await referralService.updateCampaignStatus(req.params.id, req.body.status || '');
    if (!data) return res.status(404).json({ error: 'Campaign not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to update campaign status:', err);
    res.status(500).json({ error: 'Failed to update campaign status' });
  }
});

// --- Reversals ---
router.get('/reversals', requireRole('Admin', 'Manager', 'Accountant', 'Viewer'), async (req, res) => {
  try {
    const result = await referralService.getAllReversals(req.query || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to list reversals:', err);
    res.status(500).json({ error: 'Failed to list reversals' });
  }
});

router.post('/reversals', requireRole('Admin', 'Manager'), validateBody(referralSchemas.createReversal), async (req, res) => {
  try {
    const data = await referralService.createReversal({ ...req.body, requestedBy: req.user.id } || '');
    res.status(201).json(data);
  } catch (err) {
    console.error('[Referrals] Failed to create reversal:', err);
    res.status(500).json({ error: 'Failed to create reversal' });
  }
});

router.patch('/reversals/:id/approve', requireRole('Admin', 'Manager'), idempotencyMiddleware(), validateBody(referralSchemas.approveReversal), async (req, res) => {
  try {
    const data = await referralService.approveReversal(req.params.id, req.body.approved_by, req.body.notes || '');
    if (!data) return res.status(404).json({ error: 'Reversal not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to approve reversal:', err);
    res.status(500).json({ error: 'Failed to approve reversal' });
  }
});

router.patch('/reversals/:id/reject', requireRole('Admin', 'Manager'), validateBody(referralSchemas.rejectReversal), async (req, res) => {
  try {
    const data = await referralService.rejectReversal(req.params.id, req.body.reason, req.body.rejected_by, req.body.notes || '');
    if (!data) return res.status(404).json({ error: 'Reversal not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to reject reversal:', err);
    res.status(500).json({ error: 'Failed to reject reversal' });
  }
});

// --- Rewards ---
router.get('/rewards', requireRole('Admin', 'Manager', 'Accountant', 'Clerk', 'Viewer'), async (req, res) => {
  try {
    const result = await referralService.getAllRewards(req.query || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to list rewards:', err);
    res.status(500).json({ error: 'Failed to list rewards' });
  }
});

router.get('/rewards/pending', requireRole('Admin', 'Manager', 'Accountant', 'Clerk', 'Viewer'), async (req, res) => {
  try {
    const result = await referralService.getPendingRewards();
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to get pending rewards:', err);
    res.status(500).json({ error: 'Failed to get pending rewards' });
  }
});

router.get('/rewards/:id', requireRole('Admin', 'Manager', 'Accountant', 'Clerk', 'Viewer'), async (req, res) => {
  try {
    const data = await referralService.getRewardById(req.params.id || '');
    if (!data) return res.status(404).json({ error: 'Reward not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to get reward:', err);
    res.status(500).json({ error: 'Failed to get reward' });
  }
});

router.post('/rewards', requireRole('Admin', 'Manager'), rewardCreateLimiter, idempotencyMiddleware(), validateBody(referralSchemas.createReward), async (req, res) => {
  try {
    const data = await referralService.createReward(req.body || '');
    res.status(201).json(data);
  } catch (err) {
    console.error('[Referrals] Failed to create reward:', err);
    res.status(500).json({ error: err.message || 'Failed to create reward' });
  }
});

router.patch('/rewards/:id/approve', requireRole('Admin', 'Manager'), idempotencyMiddleware(), validateBody(referralSchemas.approveReward), async (req, res) => {
  try {
    const data = await referralService.approveReward(req.params.id, req.body.approved_by || '');
    if (!data) return res.status(404).json({ error: 'Reward not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to approve reward:', err);
    res.status(500).json({ error: err.message || 'Failed to approve reward' });
  }
});

router.patch('/rewards/:id/reject', requireRole('Admin', 'Manager'), idempotencyMiddleware(), validateBody(referralSchemas.rejectReward), async (req, res) => {
  try {
    const data = await referralService.rejectReward(req.params.id, req.body.reason, req.body.rejected_by || '');
    if (!data) return res.status(404).json({ error: 'Reward not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to reject reward:', err);
    res.status(500).json({ error: err.message || 'Failed to reject reward' });
  }
});

// --- Settings ---
router.get('/settings', requireRole('Admin', 'Manager', 'Viewer'), async (req, res) => {
  try {
    const data = await referralService.getSettings();
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to get settings:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.put('/settings', requireRole('Admin', 'Manager'), validateBody(referralSchemas.updateSettings), async (req, res) => {
  try {
    const data = await referralService.updateSettings(req.body.settings);
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to update settings:', err);
    res.status(500).json({ error: err.message || 'Failed to update settings' });
  }
});

// --- Audit ---
router.get('/audit', requireRole('Admin', 'Manager', 'Auditor'), async (req, res) => {
  try {
    const result = await referralService.getAuditLogs(req.query || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to get audit logs:', err);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// --- CSV Export ---
router.get('/export/referrals', requireRole('Admin', 'Manager', 'Accountant', 'Viewer'), async (req, res) => {
  try {
    const result = await referralService.getAll({ ...req.query, limit: 10000 } || '');
    const rows = result.referrals || [];
    const header = 'id,customer_id,referred_by_id,referred_by_name,referral_code,status,pending_invoice_id,pending_invoice_amount,converted_invoice_id,notes,created_at,updated_at';
    const csv = rows.map(r =>
      `"${r.id}","${r.customer_id}","${r.referred_by_id || ''}","${(r.referred_by_name || '').replace(/"/g, '""')}","${r.referral_code}","${r.status}","${r.pending_invoice_id || ''}","${r.pending_invoice_amount || 0}","${r.converted_invoice_id || ''}","${(r.notes || '').replace(/"/g, '""')}","${r.created_at || ''}","${r.updated_at || ''}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="referrals.csv"');
    res.send(header + '\n' + csv);
  } catch (err) {
    console.error('[Referrals] Failed to export CSV:', err);
    res.status(500).json({ error: 'Failed to export referrals' });
  }
});

router.get('/export/rewards', requireRole('Admin', 'Manager', 'Accountant', 'Viewer'), async (req, res) => {
  try {
    const result = await referralService.getAllRewards({ ...req.query, limit: 10000 } || '');
    const rows = result.rewards || [];
    const header = 'id,referral_id,customer_id,invoice_id,invoice_amount,amount,status,approved_at,approved_by,wallet_transaction_id,created_at';
    const csv = rows.map(r =>
      `"${r.id}","${r.referral_id}","${r.customer_id}","${r.invoice_id}","${r.invoice_amount}","${r.amount}","${r.status}","${r.approved_at || ''}","${r.approved_by || ''}","${r.wallet_transaction_id || ''}","${r.created_at || ''}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="rewards.csv"');
    res.send(header + '\n' + csv);
  } catch (err) {
    console.error('[Referrals] Failed to export rewards CSV:', err);
    res.status(500).json({ error: 'Failed to export rewards' });
  }
});

router.get('/export/analytics', requireRole('Admin', 'Manager', 'Accountant', 'Viewer'), async (req, res) => {
  try {
    const result = await referralService.getAnalyticsHistory(req.query || '');
    const rows = Array.isArray(result) ? result : [];
    const header = 'period,period_start,period_end,total_referrals,active_referrals,converted_referrals,total_rewards_amount,approved_rewards_amount,paid_rewards_amount,pending_rewards_amount,average_reward_amount,conversion_rate,revenue_attributed,roi,generated_at';
    const csv = rows.map(r =>
      `"${r.period}","${r.period_start}","${r.period_end}","${r.total_referrals}","${r.active_referrals}","${r.converted_referrals}","${r.total_rewards_amount}","${r.approved_rewards_amount}","${r.paid_rewards_amount}","${r.pending_rewards_amount}","${r.average_reward_amount}","${r.conversion_rate}","${r.revenue_attributed}","${r.roi}","${r.generated_at || ''}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
    res.send(header + '\n' + csv);
  } catch (err) {
    console.error('[Referrals] Failed to export analytics CSV:', err);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

// --- Referrals ---
router.get('/', requireRole('Admin', 'Manager', 'Accountant', 'Clerk', 'Viewer'), validateQuery(referralSchemas.getReferralsQuery), async (req, res) => {
  try {
    const result = await referralService.getAll(req.query || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to list:', err);
    res.status(500).json({ error: 'Failed to list referrals' });
  }
});

router.get('/:id', requireRole('Admin', 'Manager', 'Accountant', 'Clerk', 'Viewer'), async (req, res) => {
  try {
    const data = await referralService.getById(req.params.id || '');
    if (!data) return res.status(404).json({ error: 'Referral not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to get referral:', err);
    res.status(500).json({ error: 'Failed to get referral' });
  }
});

router.post('/', requireRole('Admin', 'Manager'), referralCreateLimiter, idempotencyMiddleware(), validateBody(referralSchemas.createReferral), async (req, res) => {
  try {
    const data = await referralService.register(req.body || '');
    res.status(201).json(data);
  } catch (err) {
    console.error('[Referrals] Failed to create referral:', err);
    res.status(500).json({ error: err.message || 'Failed to create referral' });
  }
});

router.put('/:id', requireRole('Admin', 'Manager'), validateBody(referralSchemas.updateReferral), async (req, res) => {
  try {
    const data = await referralService.update(req.params.id, req.body || '');
    if (!data) return res.status(404).json({ error: 'Referral not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to update referral:', err);
    res.status(500).json({ error: 'Failed to update referral' });
  }
});

router.patch('/:id/cancel', requireRole('Admin', 'Manager'), validateBody(referralSchemas.cancelReferral), async (req, res) => {
  try {
    const data = await referralService.cancel(
      req.params.id,
      req.user.id,
      req.user.name || '',
      req.body.reason || ''
    );
    if (!data) return res.status(404).json({ error: 'Referral not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to cancel referral:', err);
    if (err.message && (err.message.includes('already cancelled') || err.message.includes('already expired'))) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to cancel referral' });
  }
});

router.patch('/:id/expire', requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const data = await referralService.expire(req.params.id || '');
    if (!data) return res.status(404).json({ error: 'Referral not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to expire referral:', err);
    if (err.message && err.message.includes('already expired')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to expire referral' });
  }
});

router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res) => {
  try {
    const data = await referralService.delete(req.params.id || '');
    if (!data) return res.status(404).json({ error: 'Referral not found' });
    res.json({ message: 'Referral deleted', referral: data });
  } catch (err) {
    console.error('[Referrals] Failed to delete referral:', err);
    res.status(500).json({ error: err.message || 'Failed to delete referral' });
  }
});

router.post('/audit/cleanup', requireRole('Admin'), async (req, res) => {
  try {
    const result = await referralService.cleanupAuditLogs(req.body.retention_days || 90 || '');
    res.json(result);
  } catch (err) {
    console.error('[Referrals] Failed to cleanup audit logs:', err);
    res.status(500).json({ error: 'Failed to cleanup audit logs' });
  }
});

router.get('/:id/timeline', requireRole('Admin', 'Manager', 'Accountant', 'Clerk', 'Viewer'), async (req, res) => {
  try {
    const data = await referralService.getTimeline(req.params.id || '');
    if (!data) return res.status(404).json({ error: 'Referral not found' });
    res.json(data);
  } catch (err) {
    console.error('[Referrals] Failed to get timeline:', err);
    res.status(500).json({ error: 'Failed to get referral timeline' });
  }
});

module.exports = router;
