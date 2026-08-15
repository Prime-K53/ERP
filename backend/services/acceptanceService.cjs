/**
 * acceptanceService.cjs — server-side coordinator for the Live Multi-Device
 * Acceptance Framework.
 *
 * Runs are coordinated through the backend only. Two devices (A = initiator,
 * B = observer) communicate via this API plus the normal sync + realtime
 * pipeline; they never talk to each other directly. Every generated business
 * record carries `acceptanceRunId` so the whole dataset can be located and
 * removed cleanly at the end of a run.
 *
 * This module owns:
 *   - run lifecycle state (created -> awaiting_device_b -> running -> complete
 *     -> closed)
 *   - device join/registration
 *   - observation + telemetry ingestion from both devices
 *   - evidence file storage under the workspace "Acceptance Reports" folder
 *   - cloud verification (service-role row counts by acceptanceRunId) and
 *     cleanup (hard-delete of acceptance-tagged rows + storage objects)
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const repo = require('./supabaseRepository.cjs');
const workspaceService = require('./workspaceService.cjs');

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const FILE_BUCKET = 'prime-erp-files';
const FINAL_STATES = new Set(['complete', 'closed']);

const isCloudConfigured = () => Boolean(
  SUPABASE_URL
  && SECRET_KEY
  && !SUPABASE_URL.includes('placeholder')
  && !SECRET_KEY.includes('placeholder')
);

function adminHeaders() {
  return {
    apikey: SECRET_KEY,
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'count=exact',
  };
}

const now = () => new Date().toISOString();

function parseRun(row) {
  if (!row) return null;
  const data = row.data || row;
  return {
    runId: data.run_id || row.run_id,
    state: data.state,
    deviceA: { id: data.device_a_id, label: data.device_a_label },
    deviceB: { id: data.device_b_id, label: data.device_b_label },
    scenarioIndex: data.scenario_index,
    scenarioKey: data.scenario_key,
    step: data.step,
    plan: Array.isArray(data.plan) ? data.plan : [],
    data: typeof data.run_data === 'string' ? JSON.parse(data.run_data || '{}') : (data.run_data || {}),
    createdAt: data.created_at || row.created_at,
    updatedAt: data.updated_at || row.updated_at,
  };
}

async function setRun(runId, rowPatch) {
  const old = await repo.getById('acceptance_runs', runId);
  if (!old) throw new Error('run not found');
  const data = old.data || old;
  const updated = {
    ...old,
    data: {
      ...data,
      ...rowPatch,
      updated_at: now(),
    },
  };
  await repo.upsert('acceptance_runs', updated);
}

async function ensureSchema() {
  return Promise.resolve();
}

async function createRun({ runId, deviceId, label, plan = [] }) {
  await ensureSchema();
  const existing = await repo.getById('acceptance_runs', runId);
  if (existing) throw new Error('run already exists');
  const record = {
    id: runId,
    data: {
      run_id: runId,
      state: 'created',
      device_a_id: deviceId,
      device_a_label: label || 'Device A',
      scenario_index: 0,
      plan: plan || [],
      run_data: {},
      created_at: now(),
      updated_at: now(),
    },
  };
  await repo.upsert('acceptance_runs', record);
  return getRun(runId);
}

async function joinRun(runId, { deviceId, label }) {
  await ensureSchema();
  const row = await repo.getById('acceptance_runs', runId);
  if (!row) throw new Error('run not found');
  const data = row.data || row;
  if (FINAL_STATES.has(data.state)) throw new Error('run already closed');
  if (data.device_b_id && data.device_b_id !== deviceId) throw new Error('another device already joined');
  await setRun(runId, { device_b_id: deviceId, device_b_label: label || 'Device B' });
  return getRun(runId);
}

async function startRun(runId, deviceId) {
  await ensureSchema();
  const row = await repo.getById('acceptance_runs', runId);
  if (!row) throw new Error('run not found');
  const data = row.data || row;
  if (data.device_a_id !== deviceId) throw new Error('only the initiator can start the run');
  const first = Array.isArray(data.plan) ? data.plan[0] : null;
  await setRun(runId, { state: 'running', scenario_index: 0, scenario_key: first?.key || 'offline_create' });
  return getRun(runId);
}

async function advanceRun(runId, deviceId, { scenarioIndex, scenarioKey, step, state }) {
  await ensureSchema();
  const row = await repo.getById('acceptance_runs', runId);
  if (!row) throw new Error('run not found');
  if (FINAL_STATES.has(state || '')) {
    await setRun(runId, { state, scenario_index: scenarioIndex, scenario_key: scenarioKey, step: step || null });
  } else {
    await setRun(runId, { scenario_index: scenarioIndex, scenario_key: scenarioKey, step: step || null });
  }
  return getRun(runId);
}

async function patchRunData(runId, patch) {
  await ensureSchema();
  const row = await repo.getById('acceptance_runs', runId);
  if (!row) throw new Error('run not found');
  const data = row.data || row;
  const runData = typeof data.run_data === 'string' ? JSON.parse(data.run_data || '{}') : (data.run_data || {});
  await setRun(runId, { run_data: { ...runData, ...patch } });
  return getRun(runId);
}

async function getRun(runId) {
  await ensureSchema();
  const row = await repo.getById('acceptance_runs', runId);
  return parseRun(row);
}

async function listRuns(limit = 10) {
  await ensureSchema();
  const rows = await repo.getAll('acceptance_runs');
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return rows.slice(0, limit).map(parseRun);
}

async function getActiveRun() {
  await ensureSchema();
  const rows = await repo.getAll('acceptance_runs');
  const active = rows.find((r) => {
    const data = r.data || r;
    return !FINAL_STATES.has(data.state);
  });
  return parseRun(active || null);
}

async function closeRun(runId) {
  await ensureSchema();
  await setRun(runId, { state: 'closed' });
  return getRun(runId);
}

async function appendToRunData(runId, key, entry) {
  const row = await repo.getById('acceptance_runs', runId);
  if (!row) throw new Error('run not found');
  const data = row.data || row;
  const runData = typeof data.run_data === 'string' ? JSON.parse(data.run_data || '{}') : (data.run_data || {});
  const list = Array.isArray(runData[key]) ? runData[key] : [];
  list.push(entry);
  await setRun(runId, { run_data: { ...runData, [key]: list } });
  return getRun(runId);
}

async function addObservation(runId, deviceId, observation) {
  return appendToRunData(runId, 'observations', { deviceId, at: now(), ...observation });
}

async function addTelemetry(runId, deviceId, telemetry) {
  return appendToRunData(runId, 'telemetry', { deviceId, at: now(), ...telemetry });
}

async function storeEvidence(runId, name, payload) {
  const run = await getRun(runId);
  if (!run) throw new Error('run not found');
  const workspaceConfig = workspaceService.getWorkspaceConfig();
  if (!workspaceConfig?.workspacePath) throw new Error('Workspace not initialized');
  const evidenceDir = path.join(workspaceConfig.workspacePath, 'Acceptance Reports', runId);
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }
  const safeName = name.replace(/[^a-zA-Z0-9_\-.]/g, '_');
  const targetPath = path.join(evidenceDir, safeName);
  let content = payload;
  if (typeof payload === 'object' && payload !== null) {
    content = JSON.stringify(payload, null, 2);
  }
  fs.writeFileSync(targetPath, content);
  return { name: safeName, path: targetPath, size: fs.statSync(targetPath).size };
}

async function verifyStorage(runId) {
  const run = await getRun(runId);
  if (!run) return { count: 0, rows: [] };
  const workspaceConfig = workspaceService.getWorkspaceConfig();
  if (!workspaceConfig?.workspacePath) return { count: 0, rows: [] };
  const evidenceDir = path.join(workspaceConfig.workspacePath, 'Acceptance Reports', runId);
  if (!fs.existsSync(evidenceDir)) return { count: 0, rows: [] };
  const files = fs.readdirSync(evidenceDir).map((name) => {
    const stats = fs.statSync(path.join(evidenceDir, name));
    return { name, size: stats.size, modified: stats.mtime.toISOString() };
  });
  return { count: files.length, rows: files };
}

async function verifyRunFile(runId) {
  const storage = await verifyStorage(runId);
  return {
    storage: { count: storage.count, rows: storage.rows },
    storageOk: storage.count > 0,
  };
}

async function countAcceptanceRows(table, runId) {
  if (!isCloudConfigured()) return 0;
  try {
    const { data, error } = await axios.get(`${SUPABASE_URL}/rest/v1/${table}`, {
      params: { acceptanceRunId: `eq.${runId}`, select: 'id' },
      headers: adminHeaders(),
      timeout: 10000,
    });
    if (error) return 0;
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

async function fetchAcceptanceRows(table, runId) {
  if (!isCloudConfigured()) return [];
  try {
    const { data } = await axios.get(`${SUPABASE_URL}/rest/v1/${table}`, {
      params: { acceptanceRunId: `eq.${runId}` },
      headers: adminHeaders(),
      timeout: 10000,
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function cleanupRun(runId, { tables = [], filePaths = [], prefix }) {
  const results = { tables: 0, files: 0, errors: [] };

  if (isCloudConfigured()) {
    for (const table of tables) {
      try {
        await axios.delete(`${SUPABASE_URL}/rest/v1/${table}`, {
          params: { acceptanceRunId: `eq.${runId}` },
          headers: adminHeaders(),
          timeout: 60000,
        });
        results.tables++;
      } catch (err) {
        results.errors.push(`${table}: ${err.message}`);
      }
    }
  }

  for (const relPath of filePaths) {
    try {
      const fullPath = path.join(workspaceService.getWorkspaceConfig()?.workspacePath || '', prefix || '', relPath);
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        results.files++;
      }
    } catch {
      // ignore file cleanup errors
    }
  }

  return results;
}

async function removeEvidenceDir(runId) {
  const workspaceConfig = workspaceService.getWorkspaceConfig();
  if (!workspaceConfig?.workspacePath) return;
  const evidenceDir = path.join(workspaceConfig.workspacePath, 'Acceptance Reports', runId);
  if (fs.existsSync(evidenceDir)) {
    fs.rmSync(evidenceDir, { recursive: true, force: true });
  }
}

module.exports = {
  createRun,
  listRuns,
  getActiveRun,
  getRun,
  joinRun,
  startRun,
  advanceRun,
  closeRun,
  patchRunData,
  addObservation,
  addTelemetry,
  storeEvidence,
  verifyStorage,
  verifyRunFile,
  countAcceptanceRows,
  fetchAcceptanceRows,
  cleanupRun,
  removeEvidenceDir,
};
