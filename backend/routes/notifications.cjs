const express = require('express');
const router = express.Router();
const { sendSafeError } = require('../utils/errors.cjs');
const dispatchService = require('../services/notificationDispatchService.cjs');

router.post('/email/low-stock', async (req, res) => {
  try {
    const { items, recipients } = req.body;
    if (!items?.length || !recipients?.length) {
      return res.status(400).json({ error: 'items and recipients are required' });
    }
    const result = await dispatchService.dispatchLowStockAlert({
      items,
      recipients,
    });
    res.json(result);
  } catch (err) {
    console.error('[Notifications] Low stock email error:', err);
    sendSafeError(res, 500, 'EMAIL_FAILED');
  }
});

router.post('/email/approval', async (req, res) => {
  try {
    const { type, entityType, entityId, entityName, requestedBy, approverEmail, action } = req.body;
    if (!entityType || !entityName || !approverEmail) {
      return res.status(400).json({ error: 'entityType, entityName, and approverEmail are required' });
    }
    const result = await dispatchService.dispatchApprovalNotification({
      type,
      entityType,
      entityId,
      entityName,
      requestedBy: requestedBy || 'System',
      approverEmail,
      action: action || 'request',
    });
    res.json(result);
  } catch (err) {
    console.error('[Notifications] Approval email error:', err);
    sendSafeError(res, 500, 'EMAIL_FAILED');
  }
});

module.exports = router;
