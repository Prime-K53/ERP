/**
 * acceptance.cjs — HTTP surface for the Live Multi-Device Acceptance
 * Framework. Mounted after the global verifyToken in index.cjs; every route
 * here additionally requires an Admin role.
 *
 * Device A (initiator) drives the run lifecycle and the scenario state
 * machine. Device B (observer) joins, watches the run state, and reports
 * observations + telemetry. All scenario business data flows through the
 * standard sync gateway — nothing in this module writes business tables.
 */
const express = require('express');
const router = express.Router();
const acceptanceService = require('../services/acceptanceService.cjs');
const repo = require('../services/supabaseRepository.cjs');

const ADMIN_ROLES = new Set(['admin', 'company admin', 'owner']);

const isAdmin = (req) => {
  const role = String(req.user?.role || '').toLowerCase();
  return ADMIN_ROLES.has(role);
};

const requireAdmin = (req, res, next) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin role required for acceptance framework' });
  }
  next();
};

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    const status = err?.status || (String(err?.message || '').includes('not found') ? 404 : 400);
    res.status(status).json({ error: err?.message || 'Acceptance API error' });
  });
};

router.use(requireAdmin);

// ─── runs ───────────────────────────────────────────────────────────────────
router.post('/runs', wrap(async (req, res) => {
  const { runId, plan = [] } = req.body || {};
  if (!runId || !/^ACC-[A-Z0-9-]+$/.test(String(runId))) {
    return res.status(400).json({ error: 'runId must look like ACC-YYYY-MM-DD-###' });
  }
  const run = await acceptanceService.createRun({
    runId,
    deviceId: req.user.id,
    label: req.body?.label,
    plan,
  });
  res.status(201).json({ ok: true, run });
}));

router.get('/runs', wrap(async (req, res) => {
  const runs = await acceptanceService.listRuns(Number(req.query.limit) || 10);
  res.json({ ok: true, runs });
}));

router.get('/runs/active', wrap(async (req, res) => {
  const run = await acceptanceService.getActiveRun();
  res.json({ ok: true, run });
}));

router.get('/runs/:id', wrap(async (req, res) => {
  const run = await acceptanceService.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json({ ok: true, run });
}));

// ─── device coordination ────────────────────────────────────────────────────
router.post('/runs/:id/join', wrap(async (req, res) => {
  const run = await acceptanceService.joinRun(req.params.id, {
    deviceId: req.user.id,
    label: req.body?.label,
  });
  res.json({ ok: true, run });
}));

router.post('/runs/:id/start', wrap(async (req, res) => {
  const run = await acceptanceService.startRun(req.params.id, req.user.id);
  res.json({ ok: true, run });
}));

router.post('/runs/:id/advance', wrap(async (req, res) => {
  const run = await acceptanceService.advanceRun(req.params.id, req.user.id, req.body || {});
  res.json({ ok: true, run });
}));

router.post('/runs/:id/close', wrap(async (req, res) => {
  const run = await acceptanceService.closeRun(req.params.id);
  res.json({ ok: true, run });
}));

router.post('/runs/:id/patch', wrap(async (req, res) => {
  const run = await acceptanceService.patchRunData(req.params.id, req.body?.patch || {});
  res.json({ ok: true, run });
}));

// ─── observations & telemetry ───────────────────────────────────────────────
router.post('/runs/:id/observation', wrap(async (req, res) => {
  const run = await acceptanceService.addObservation(req.params.id, req.user.id, req.body || {});
  res.json({ ok: true, run });
}));

router.post('/runs/:id/telemetry', wrap(async (req, res) => {
  const run = await acceptanceService.addTelemetry(req.params.id, req.user.id, req.body || {});
  res.json({ ok: true, run });
}));

// ─── evidence ───────────────────────────────────────────────────────────────
router.post('/runs/:id/evidence', wrap(async (req, res) => {
  const { name, payload } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const file = await acceptanceService.storeEvidence(req.params.id, name, payload);
  res.json({ ok: true, file });
}));

// ─── cloud verification & cleanup ───────────────────────────────────────────
router.get('/verify/cloud', wrap(async (req, res) => {
  const { runId, table } = req.query || {};
  if (!runId || !table) return res.status(400).json({ error: 'runId and table are required' });
  if (table === '_storage') {
    const storage = await acceptanceService.verifyStorage(String(runId));
    return res.json({ ok: true, runId, table: '_storage', count: storage.count, rows: storage.rows });
  }
  const count = await acceptanceService.countAcceptanceRows(String(table), String(runId));
  const rows = await acceptanceService.fetchAcceptanceRows(String(table), String(runId));
  res.json({ ok: true, runId, table, count, rows });
}));

router.get('/verify/file', wrap(async (req, res) => {
  const { runId } = req.query || {};
  if (!runId) return res.status(400).json({ error: 'runId is required' });
  const result = await acceptanceService.verifyRunFile(String(runId));
  res.json({ ok: true, runId, ...result });
}));

router.post('/cleanup', wrap(async (req, res) => {
  const { runId, tables = [], filePaths = [], prefix } = req.body || {};
  if (!runId) return res.status(400).json({ error: 'runId is required' });
  const result = await acceptanceService.cleanupRun(runId, { tables, filePaths, prefix });
  res.json({ ok: true, ...result });
}));

router.delete('/runs/:id', wrap(async (req, res) => {
  const run = await acceptanceService.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  await acceptanceService.removeEvidenceDir(req.params.id);
  await repo.softDelete('acceptance_runs', req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
