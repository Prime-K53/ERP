const express = require('express');
const router = express.Router();
const profitMarginService = require('../services/profitMarginService.cjs');
const { auditCrudMiddleware } = require('../auditMiddleware.cjs');
const { validateBody, profitMarginSchemas } = require('../middleware/validation.cjs');
const { sendSafeError } = require('../utils/errors.cjs');

/**
 * Middleware to check for ADMIN or FINANCE_MANAGER roles.
 */
const authorizePricing = (req, res, next) => {
  const role = req.user?.role || '';
  if (role === 'Admin' || role === 'Finance Manager' || role === 'FINANCE_MANAGER') {
    next();
  } else {
    res.status(403).json({ 
      error: 'Forbidden: You do not have permission to manage pricing settings.',
      code: 'ACCESS_DENIED'
    });
  }
};

// GET /api/settings/profit-margins - List all (filterable by scope)
router.get('/profit-margins', async (req, res) => {
  try {
    const { scope } = req.query;
    const settings = await profitMarginService.listSettings(scope || '');
    res.json(settings);
  } catch (err) {
    console.error('[Settings] list profit margins error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// GET /api/settings/profit-margins/audit-log - Paginated audit history
router.get('/profit-margins/audit-log', async (req, res) => {
  try {
    const { scope, user, startDate, endDate, limit, offset } = req.query;
    const logs = await profitMarginService.getAuditLog({
      scope, user, startDate, endDate,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0
    } || '');
    res.json(logs);
  } catch (err) {
    console.error('[Settings] audit log error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// GET /api/settings/profit-margins/resolve - Resolve effective margin for a product/category
// Used by the frontend getEffectiveMargin() utility and all pricing calculations.
router.get('/profit-margins/resolve', async (req, res) => {
  try {
    const { lineItemId, categoryId } = req.query;
    const result = await profitMarginService.getEffectiveMargin(
      lineItemId || null,
      categoryId || null || ''
    );
    res.json(result);
  } catch (err) {
    console.error('[Settings] resolve margin error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// GET /api/settings/profit-margins/:id - Get single
router.get('/profit-margins/:id', async (req, res) => {
  try {
    const setting = await profitMarginService.getById(req.params.id || '');
    if (!setting) return res.status(404).json({ error: 'Not found' });
    res.json(setting);
  } catch (err) {
    console.error('[Settings] get profit-margin error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// POST /api/settings/profit-margins - Create override
router.post('/profit-margins', authorizePricing, validateBody(profitMarginSchemas.create), auditCrudMiddleware('profit_margin_setting'), async (req, res) => {
  try {
    const userId = req.user?.id || 'system';
    const result = await profitMarginService.createSetting(req.body, userId || '');
    res.status(201).json(result);
  } catch (err) {
    if (err.message.includes('already exists')) {
      return res.status(409).json({ error: 'A setting with these values already exists.' });
    }
    console.error('[Settings] create profit-margin error:', err);
    sendSafeError(res, 400, 'VALIDATION_ERROR');
  }
});

// PATCH /api/settings/profit-margins/:id - Update override
router.patch('/profit-margins/:id', authorizePricing, validateBody(profitMarginSchemas.update), auditCrudMiddleware('profit_margin_setting'), async (req, res) => {
  try {
    const userId = req.user?.id || 'system';
    const result = await profitMarginService.updateSetting(req.params.id, req.body, userId || '');
    res.json(result);
  } catch (err) {
    console.error('[Settings] update profit-margin error:', err);
    sendSafeError(res, 400, 'UPDATE_FAILED');
  }
});

// DELETE /api/settings/profit-margins/:id - Soft delete
router.delete('/profit-margins/:id', authorizePricing, auditCrudMiddleware('profit_margin_setting'), async (req, res) => {
  try {
    const userId = req.user?.id || 'system';
    const { reason } = req.body;
    await profitMarginService.deleteSetting(req.params.id, userId, reason || 'User requested deletion' || '');
    res.json({ success: true });
  } catch (err) {
    console.error('[Settings] delete profit-margin error:', err);
    sendSafeError(res, 400, 'DELETE_FAILED');
  }
});

// POST /api/settings/profit-margins/bulk-upload - CSV import
router.post('/profit-margins/bulk-upload', authorizePricing, validateBody(profitMarginSchemas.bulkUpload), async (req, res) => {
  try {
    const userId = req.user?.id || 'system';
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Invalid rows data' });
    
    const results = await profitMarginService.bulkUpload(rows, userId || '');
    res.json(results);
  } catch (err) {
    console.error('[Settings] bulk upload error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

module.exports = router;
