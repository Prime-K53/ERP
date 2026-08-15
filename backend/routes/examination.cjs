const express = require('express');
const router = express.Router();
const examinationService = require('../services/examinationService.cjs');
const batchWorkflow = require('../services/examinationBatchWorkflow.cjs');
const { validateBody, examinationSchemas, classSchemas, subjectSchemas, notificationSchemas } = require('../middleware/validation.cjs');
const { sendSafeError } = require('../utils/errors.cjs');

const canOverrideSuggestedCost = (req) => {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'admin' || req.user?.isSuperAdmin === true;
};

const createRequestAbortSignal = (req, res) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once('aborted', abort);
  res.once('close', () => {
    if (!res.writableEnded) {
      abort();
    }
  });
  return controller.signal;
};

const resolveWorkflowErrorStatus = (error) => {
  const code = String(error?.workflowCode || '');
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.BATCH_IMMUTABLE) return 409;
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.INVALID_TRANSITION) return 409;
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.APPROVAL_NOT_ALLOWED) return 409;
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.INVOICE_NOT_ALLOWED) return 409;
  return 500;
};

// --- Base Route ---
router.get('/', (req, res) => {
  res.json({ message: 'Examination API working' });
});

// --- Batches ---
router.get('/meta/adjustments', async (req, res) => {
  try {
    const adjustments = await examinationService.getMarketAdjustmentMeta();
    res.json({
      adjustments,
      fetched_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Examination] meta/adjustments error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/sync/market-adjustments', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.user_id || req.body?.userId || 'System';
    const signal = createRequestAbortSignal(req, res);
    const result = await examinationService.syncMarketAdjustments(req.body || {}, { userId, signal } || '');
    if (signal.aborted || res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    console.error('[Examination] sync/market-adjustments error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/sync/inventory-items', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.user_id || req.body?.userId || 'System';
    const signal = createRequestAbortSignal(req, res);
    const result = await examinationService.syncInventoryItems(req.body || {}, { userId, signal } || '');
    if (signal.aborted || res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    console.error('[Examination] sync/inventory-items error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.get('/sync/health', async (req, res) => {
  try {
    const result = await examinationService.getSyncHealth();
    res.json(result);
  } catch (err) {
    console.error('[Examination] sync/health error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/backfill/recalculate-non-invoiced', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.user_id || req.body?.userId || 'System';
    const signal = createRequestAbortSignal(req, res);
    const result = await examinationService.recalculateNonInvoicedBatches({
      trigger: req.body?.trigger || 'BACKFILL_NON_INVOICED',
      userId,
      includeApproved: req.body?.includeApproved ?? req.body?.include_approved,
      limit: req.body?.limit,
      signal,
      
    });
    if (signal.aborted || res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    console.error('[Examination] backfill/recalculate-non-invoiced error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/recalculate-batch/:batchId', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.user_id || req.body?.userId || 'System';
    const batchId = req.params.batchId;
    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }
    const result = await examinationService.calculateBatch(batchId, {
      trigger: 'MANUAL',
      userId
    } || '');
    if (res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    console.error('[Examination] recalculate-batch error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.get('/batches', async (req, res) => {
  try {
    const modeToken = String(req.query?.mode ?? req.query?.summary ?? '').trim().toLowerCase();
    const summaryModes = new Set(['1', 'true', 'summary', 'fast']);
    const liteModes = new Set(['lite', 'minimal', 'basic', 'bare']);
    const includeSubjectsRaw = req.query?.include_subjects ?? req.query?.includeSubjects;
    const includeClassStatsRaw = req.query?.include_class_stats ?? req.query?.includeClassStats;

    let includeClassStats;
    if (includeClassStatsRaw !== undefined) {
      const normalized = String(includeClassStatsRaw).trim().toLowerCase();
      includeClassStats = !(normalized === '0' || normalized === 'false' || normalized === 'no');
    } else {
      includeClassStats = !liteModes.has(modeToken);
    }

    let includeSubjectPages;
    if (includeSubjectsRaw !== undefined) {
      const normalized = String(includeSubjectsRaw).trim().toLowerCase();
      includeSubjectPages = !(normalized === '0' || normalized === 'false' || normalized === 'no');
    } else {
      includeSubjectPages = !(summaryModes.has(modeToken) || liteModes.has(modeToken));
    }

    if (!includeClassStats) {
      includeSubjectPages = false;
    }

    const batches = await examinationService.getAllBatches({ includeSubjectPages, includeClassStats});
    res.json(batches);
  } catch (err) {
    console.error('[Examination] GET batches error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.get('/batches/:id', async (req, res) => {
  try {
    const batch = await examinationService.getBatchById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(batch);
  } catch (err) {
    console.error('[Examination] GET batch by id error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.get('/batches/:id/cost-breakdown', async (req, res) => {
  try {
    const rows = await examinationService.getBOMCalculations(req.params.id || '');
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error('[Examination] cost-breakdown error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// --- Audit Logs ---
router.get('/audit-logs/:entityType/:id', async (req, res) => {
  try {
    const { entityType, id } = req.params;
    const logs = await examinationService.getAuditLogs(entityType, id || '');
    res.json(logs || []);
  } catch (err) {
    console.error('[Examination] audit-logs error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.get('/audit-trail/:correlationId', async (req, res) => {
  try {
    const { correlationId } = req.params;
    const trail = await examinationService.getAuditTrail(correlationId || '');
    res.json(trail || []);
  } catch (err) {
    console.error('[Examination] audit-trail error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.get('/batches/:id/bom', async (req, res) => {
  try {
    const rows = await examinationService.getBOMCalculations(req.params.id || '');
    res.set('X-Deprecated-Notice', 'GET /api/examination/batches/:id/bom is deprecated. Use /api/examination/batches/:id/cost-breakdown.');
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error('[Examination] BOM error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// --- Settings ---
router.get('/settings/pricing', async (req, res) => {
  try {
    const settings = await examinationService.getExamPricingSettings();
    res.json(settings);
  } catch (err) {
    console.error('[Examination] settings/pricing error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.put('/settings/pricing', validateBody(examinationSchemas.pricingSettings), async (req, res) => {
  try {
    const userId = req.user?.id || 'System';
    const result = await examinationService.updateExamPricingSettings(req.body || {}, { userId } || '');
    res.json(result);
  } catch (err) {
    console.error('[ERROR] settings/pricing failed:', err.message);
    res.status(500).json({ error: 'Failed to update pricing settings' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const userId = req.query.user_id || req.query.userId || req.user?.id;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    // Validate inputs
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      console.warn(`[notifications] Invalid user_id: ${userId}`);
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (limit < 1 || limit > 1000) {
      console.warn(`[notifications] Invalid limit: ${limit}`);
      return res.status(400).json({ error: 'limit must be between 1 and 1000' });
    }

    console.debug(`[notifications] Fetching notifications for user: ${userId}, limit: ${limit}`);
    const startTime = Date.now();

    // Set a timeout for the database query to prevent hanging
    const fetchPromise = examinationService.getNotifications(userId, limit || '');
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Database query timeout after 10 seconds')), 10000);
    });

    let notifications;
    try {
      notifications = await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
    const duration = Date.now() - startTime;

    console.debug(`[notifications] Fetched ${notifications?.length || 0} notifications for user ${userId} in ${duration}ms`);
    res.json(notifications);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout = errorMessage.toLowerCase().includes('timeout');
    console.error(`[notifications] Error fetching notifications: ${errorMessage}`, {
      userId: req.query.user_id || req.user?.id,
      limit: req.query.limit,
      stack: err instanceof Error ? err.stack : undefined
    });

    res.status(isTimeout ? 504 : 500).json({
      error: 'Failed to fetch notifications'
    });
  }
});

router.post('/notifications', validateBody(notificationSchemas.create), async (req, res) => {
  try {
    const notification = await examinationService.createNotification(req.body || {} || '');
    res.status(201).json(notification);
  } catch (err) {
    console.error('[Examination] create notification error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const userId = req.body?.user_id || req.body?.userId || req.user?.id;
    const result = await examinationService.markNotificationRead(req.params.id, userId || '');
    res.json(result);
  } catch (err) {
    console.error('[Examination] mark notification read error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.delete('/notifications/:id', async (req, res) => {
  try {
    const userId = req.query.user_id || req.query.userId || req.user?.id;
    const result = await examinationService.deleteNotification(req.params.id, userId || '');
    res.json(result);
  } catch (err) {
    console.error('[Examination] delete notification error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/audit/notifications', async (req, res) => {
  try {
    const result = await examinationService.createNotificationAuditLog(req.body || {} || '');
    res.json(result);
  } catch (err) {
    console.error('[Examination] audit notification error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/batches', validateBody(examinationSchemas.batch), async (req, res) => {
  try {
    const userId = req.user?.id;
    const body = { ...req.body };
    const batch = await examinationService.createBatch(body, userId);
    res.status(201).json(batch);
  } catch (err) {
    const message = String(err?.message || 'Failed to create batch');
    const normalized = message.toLowerCase();
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'route_batch_create_failed',
      userId: req.user?.id,
      error: message
    }));
    if (
      normalized.includes('required')
      || normalized.includes('invalid')
      || normalized.includes('constraint')
    ) {
      return sendSafeError(res, 400, 'VALIDATION_ERROR');
    }
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.put('/batches/:id', validateBody(examinationSchemas.batchUpdate), async (req, res) => {
  try {
    const userId = req.user?.id;
    const batch = await examinationService.updateBatch(req.params.id, req.body, userId);
    res.json(batch);
  } catch (err) {
    console.error('[Examination] batch update error:', err);
    sendSafeError(res, 500, 'UPDATE_FAILED');
  }
});

router.delete('/batches/:id', async (req, res) => {
  try {
    const userId = req.user?.id;
    await examinationService.deleteBatch(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Examination] batch delete error:', err);
    sendSafeError(res, 500, 'DELETE_FAILED');
  }
});

// --- Classes ---
router.post('/classes', validateBody(classSchemas.create), async (req, res) => {
  try {
    const body = req.body || {};

    const batch_id = body.batch_id || body.batchId || body.batch || req.query?.batch_id || req.query?.batchId;

    const class_name = body.class_name || body.name || body.className;
    const number_of_learners = body.number_of_learners ?? body.numberOfLearners ?? body.learners ?? body.candidates;

    if (!batch_id) {
      return res.status(400).json({ error: 'batch_id is required', message: 'Please provide a valid batch_id to create a class' });
    }
    if (!class_name) {
      return res.status(400).json({ error: 'class_name (name) is required', message: 'Please provide a class name (class_name or name) to create a class' });
    }

    const signal = createRequestAbortSignal(req, res);
    const userId = req.user?.id || 'System';

    const payload = { ...body, class_name, number_of_learners };

    const newClass = await examinationService.createClass(batch_id, payload, { userId, signal, canOverride: canOverrideSuggestedCost(req) } || '');
    if (signal.aborted || res.headersSent) return;
    return res.status(201).json(newClass);
  } catch (err) {
    try {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'route_class_create_failed',
        error: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : null,
        body: req.body
      }));
    } catch (logErr) {
      console.error('Failed to stringify error for logging', logErr, err);
    }

    const message = String(err?.message || err || 'Failed to create class');
    const normalized = message.toLowerCase();

    if (
      normalized.includes('batch not found')
      || (normalized.includes('batch') && normalized.includes('not found'))
    ) {
      return res.status(404).json({ error: 'Batch not found.', suggestion: 'Please create the batch first before creating classes' });
    }

    if (normalized.includes('required') || normalized.includes('must') || normalized.includes('missing')) {
      return sendSafeError(res, 400, 'VALIDATION_ERROR');
    }

    if (normalized.includes('constraint') || normalized.includes('duplicate') || normalized.includes('unique')) {
      return sendSafeError(res, 409, 'CONFLICT');
    }

    return sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.put('/classes/:id', async (req, res) => {
  try {
    const updatedClass = await examinationService.updateClass(req.params.id, req.body || '');
    res.json(updatedClass);
  } catch (err) {
    console.error('[Examination] class update error:', err);
    sendSafeError(res, 500, 'UPDATE_FAILED');
  }
});

router.put('/classes/:id/pricing', async (req, res) => {
  try {
    const userId = req.user?.id || 'System';
    const batch = await examinationService.updateClassPricing(req.params.id, req.body, {
      userId,
      trigger: 'MANUAL_OVERRIDE',
      canOverrideSuggestedCost: canOverrideSuggestedCost(req)
    } || '');
    res.json(batch);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.toLowerCase().includes('permission')) {
      return res.status(403).json({ error: 'You do not have permission to override pricing.' });
    }
    if (message.toLowerCase().includes('batch status')) {
      return res.status(409).json({ error: 'Cannot change pricing due to batch status.' });
    }
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('must')) {
      return res.status(400).json({ error: 'Missing required fields for pricing update.' });
    }
    console.error('[Examination] class pricing update error:', err);
    sendSafeError(res, 500, 'UPDATE_FAILED');
  }
});

router.get('/classes/:id/pricing-history', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const history = await examinationService.getClassPricingHistory(req.params.id, limit || '');
    res.json(history);
  } catch (err) {
    console.error('[Examination] class pricing history error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    await examinationService.deleteClass(req.params.id || '');
    res.json({ success: true });
  } catch (err) {
    console.error('[Examination] class delete error:', err);
    sendSafeError(res, 500, 'DELETE_FAILED');
  }
});

// --- Subjects ---
router.post('/subjects', validateBody(subjectSchemas.create), async (req, res) => {
  try {
    const { class_id, ...data } = req.body;
    const newSubject = await examinationService.createSubject(class_id, data || '');
    res.status(201).json(newSubject);
  } catch (err) {
    console.error('[Examination] subject create error:', err);
    sendSafeError(res, 500, 'CREATE_FAILED');
  }
});

router.put('/subjects/:id', async (req, res) => {
  try {
    const updatedSubject = await examinationService.updateSubject(req.params.id, req.body || '');
    res.json(updatedSubject);
  } catch (err) {
    console.error('[Examination] subject update error:', err);
    sendSafeError(res, 500, 'UPDATE_FAILED');
  }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    await examinationService.deleteSubject(req.params.id || '');
    res.json({ success: true });
  } catch (err) {
    console.error('[Examination] subject delete error:', err);
    sendSafeError(res, 500, 'DELETE_FAILED');
  }
});

// --- Classes (Additional Routes for Examination Pricing Redesign) ---
router.get('/classes/:id', async (req, res) => {
  try {
    const cls = await examinationService.getClassById(req.params.id || '');
    if (!cls) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json(cls);
  } catch (err) {
    console.error('[Examination] GET class error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.put('/classes/:id/financial-metrics', async (req, res) => {
  try {
    const userId = req.user?.id || 'System';
    const updatedClass = await examinationService.updateClassFinancialMetrics(
      req.params.id,
      req.body,
      { userId } || ''
    );
    res.json(updatedClass);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.toLowerCase().includes('batch status')) {
      return res.status(409).json({ error: 'Cannot update metrics due to batch status.' });
    }
    console.error('[Examination] financial metrics update error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// --- Batch Pricing Sync (Examination Pricing Redesign) ---
router.post('/batches/:id/sync-pricing', async (req, res) => {
  try {
    const userId = req.user?.id || 'System';
    const { settings, adjustments, triggerSource } = req.body;

    const result = await examinationService.syncPricingToBatchClasses(
      req.params.id,
      { settings, adjustments, triggerSource, userId } || ''
    );
    res.json(result);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.toLowerCase().includes('batch status')) {
      return res.status(409).json({ error: 'Cannot sync pricing due to batch status.' });
    }
    console.error('[Examination] sync-pricing error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// --- Actions ---
router.post('/batches/:id/calculate', async (req, res) => {
  try {
    const userId = req.user?.id || 'System';
    const requestOptions = (req.body && typeof req.body === 'object') ? req.body : {};
    const result = await examinationService.calculateBatch(req.params.id, {
      ...requestOptions,
      trigger: requestOptions.trigger || 'MANUAL_TRIGGER',
      userId
    } || '');
    res.json(result);
  } catch (error) {
    console.error('[Examination] Calculate batch error:', error);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

// Class preview endpoint - calculates without saving
router.post('/classes/:id/preview', async (req, res) => {
  try {
    const userId = req.user?.id || 'System';
    const result = await examinationService.calculateClassPreview(req.params.id, req.body || '');
    res.json(result);
  } catch (err) {
    console.error('[Examination] class preview error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/batches/:id/approve', async (req, res) => {
  try {
    const userId = req.user?.id;
    const result = await examinationService.approveBatch(req.params.id, userId || '');
    res.json(result);
  } catch (err) {
    console.error('[Examination] approve batch error:', err);
    res.status(resolveWorkflowErrorStatus(err)).json({ error: 'Failed to approve batch.' });
  }
});

router.post('/batches/:id/invoice', async (req, res) => {
  try {
    const userId = req.user?.id;
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body?.idempotency_key || req.body?.idempotencyKey;
    const invoiceNumber = req.body?.invoiceNumber || req.body?.invoice_number;
    const result = await examinationService.generateInvoice(req.params.id, userId, { idempotencyKey, invoiceNumber } || '');
    res.json(result);
  } catch (err) {
    console.error('[Examination] generate invoice error:', err);
    res.status(resolveWorkflowErrorStatus(err)).json({ error: 'Failed to generate invoice' });
  }
});

module.exports = router;
