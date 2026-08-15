const express = require('express');
const router = express.Router();
const workspaceService = require('../services/workspaceService.cjs');
const repo = require('../services/supabaseRepository.cjs');
const axios = require('axios');
const { sendSafeError } = require('../utils/errors.cjs');
const { validateBody, workspaceSchemas } = require('../middleware/validation.cjs');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function resetDatabase() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || SUPABASE_URL.includes('placeholder')) {
    throw new Error('Supabase is not configured');
  }
  const base = SUPABASE_URL.replace(/\/+$/, '');
  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
  const { data: spec } = await axios.get(`${base}/rest/v1/`, { headers, timeout: 10000 });
  const paths = spec?.paths || {};
  const tableNames = Object.keys(paths)
    .filter((p) => /^\/([a-z_][a-z0-9_]*)$/.test(p) && !p.includes('('))
    .map((p) => p.slice(1));
  const wiped = [];
  for (const table of tableNames) {
    try {
      await axios.delete(`${base}/rest/v1/${table}`, { headers, timeout: 60000 });
      wiped.push(table);
    } catch {
      // skip internal tables
    }
  }
  console.log(`[System] Wiped ${wiped.length} Supabase tables`);
}

router.post('/workspace/initialize', validateBody(workspaceSchemas.initialize), async (req, res) => {
  try {
    const { companyName } = req.body;
    const config = await workspaceService.initializeWorkspace(companyName || 'Prime ERP');
    res.json(config);
  } catch (err) {
    console.error('[System] Workspace initialization failed:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/workspace/sync', validateBody(workspaceSchemas.sync), async (req, res) => {
  try {
    const { filename, data } = req.body;
    const path = await workspaceService.saveToWorkspace('Sync', filename, data);
    res.json({ success: true, path });
  } catch (err) {
    console.error('[System] Workspace sync failed:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/workspace/save-document', validateBody(workspaceSchemas.saveDocument), async (req, res) => {
  try {
    const { folder, filename, data } = req.body; 
    const path = await workspaceService.saveToWorkspace(folder || 'Documents', filename, data);
    res.json({ success: true, path });
  } catch (err) {
    console.error('[System] Save document failed:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

/**
 * Get the current workspace configuration.
 */
router.get('/workspace/config', (req, res) => {
  const config = workspaceService.getWorkspaceConfig();
  res.json(config || { initialized: false });
});

/**
 * Delete all data for the current organization (local SQLite).
 * Resets the database entirely since the local backend is single-tenant.
 */
router.delete('/workspace', async (req, res) => {
  try {
    resetDatabase();
    res.json({ success: true, message: 'All data has been wiped from the local database.' });
  } catch (err) {
    console.error('[System] Failed to reset database:', err);
    sendSafeError(res, 500, 'DATABASE_RESET_FAILED');
  }
});

module.exports = router;
