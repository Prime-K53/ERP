process.env.JWT_SECRET = 'test-jwt-secret-for-acceptance-routes';

const request = require('supertest');
const express = require('express');

const mockService = {
  createRun: jest.fn(),
  joinRun: jest.fn(),
  startRun: jest.fn(),
  advanceRun: jest.fn(),
  patchRunData: jest.fn(),
  getRun: jest.fn(),
  listRuns: jest.fn(),
  getActiveRun: jest.fn(),
  closeRun: jest.fn(),
  addObservation: jest.fn(),
  addTelemetry: jest.fn(),
  storeEvidence: jest.fn(),
  countAcceptanceRows: jest.fn(),
  fetchAcceptanceRows: jest.fn(),
  verifyStorage: jest.fn(),
  verifyRunFile: jest.fn(),
  cleanupRun: jest.fn(),
};

jest.mock('../../services/acceptanceService.cjs', () => {
  const actual = jest.requireActual('../../services/acceptanceService.cjs');
  return { ...actual, ...mockService };
});

const acceptanceRoutes = require('../../routes/acceptance.cjs');

const buildApp = (role = 'Admin') => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'usr_admin_1', role };
    next();
  });
  app.use('/api/acceptance', acceptanceRoutes);
  return app;
};

const runShape = (runId) => ({
  runId,
  state: 'created',
  deviceA: { id: 'usr_admin_1', label: 'Device A' },
  deviceB: null,
  scenarioIndex: 0,
  scenarioKey: null,
  step: null,
  plan: [],
  data: {},
  createdAt: '2026-08-06T10:00:00.000Z',
  updatedAt: '2026-08-06T10:00:00.000Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  mockService.getRun.mockResolvedValue(runShape('ACC-2026-08-06-001'));
  mockService.getActiveRun.mockResolvedValue(null);
  mockService.listRuns.mockResolvedValue([]);
  mockService.createRun.mockImplementation(async (args) => runShape(args.runId));
  mockService.joinRun.mockImplementation(async (runId) => runShape(runId));
  mockService.startRun.mockImplementation(async (runId) => runShape(runId));
  mockService.advanceRun.mockImplementation(async (runId) => runShape(runId));
  mockService.patchRunData.mockImplementation(async (runId) => runShape(runId));
  mockService.closeRun.mockImplementation(async (runId) => runShape(runId));
  mockService.addObservation.mockImplementation(async (runId) => runShape(runId));
  mockService.addTelemetry.mockImplementation(async (runId) => runShape(runId));
  mockService.verifyStorage.mockResolvedValue({ count: 1, rows: [{ name: 'documents/x-acceptance-ACC-2026-08-06-001.txt' }] });
  mockService.verifyRunFile.mockResolvedValue({ found: true, name: 'x.txt', url: 'https://supabase/storage/v1/x' });
  mockService.countAcceptanceRows.mockResolvedValue(2);
  mockService.fetchAcceptanceRows.mockResolvedValue([{ id: '1' }, { id: '2' }]);
  mockService.cleanupRun.mockResolvedValue({ counts: { customers: 2 }, filesRemoved: 1, rowsRemoved: 2 });
});

describe('POST /api/acceptance/runs — admin gate + run id validation', () => {
  it('rejects non-admin roles with 403', async () => {
    const app = buildApp('Clerk');
    const res = await request(app).post('/api/acceptance/runs').send({ runId: 'ACC-2026-08-06-001' });
    expect(res.status).toBe(403);
    expect(mockService.createRun).not.toHaveBeenCalled();
  });

  it('rejects a missing runId with 400', async () => {
    const res = await request(buildApp()).post('/api/acceptance/runs').send({});
    expect(res.status).toBe(400);
    expect(mockService.createRun).not.toHaveBeenCalled();
  });

  it('rejects a malformed runId with 400', async () => {
    const res = await request(buildApp()).post('/api/acceptance/runs').send({ runId: 'DROP TABLE x' });
    expect(res.status).toBe(400);
  });

  it('creates a run with the initiator as device A', async () => {
    const res = await request(buildApp()).post('/api/acceptance/runs').send({
      runId: 'ACC-2026-08-06-001',
      label: 'Chrome on Windows',
      plan: [{ key: 'offline_create', title: 'Offline Create' }],
    });
    expect(res.status).toBe(201);
    expect(mockService.createRun).toHaveBeenCalledWith({
      runId: 'ACC-2026-08-06-001',
      deviceId: 'usr_admin_1',
      label: 'Chrome on Windows',
      plan: [{ key: 'offline_create', title: 'Offline Create' }],
    });
  });
});

describe('device coordination endpoints', () => {
  it('join forwards the joining device', async () => {
    const res = await request(buildApp()).post('/api/acceptance/runs/ACC-2026-08-06-001/join').send({ label: 'Device B' });
    expect(res.status).toBe(200);
    expect(mockService.joinRun).toHaveBeenCalledWith('ACC-2026-08-06-001', { deviceId: 'usr_admin_1', label: 'Device B' });
  });

  it('start and advance only act on the run', async () => {
    await request(buildApp()).post('/api/acceptance/runs/ACC-2026-08-06-001/start');
    expect(mockService.startRun).toHaveBeenCalledWith('ACC-2026-08-06-001', 'usr_admin_1');

    await request(buildApp()).post('/api/acceptance/runs/ACC-2026-08-06-001/advance').send({ scenarioIndex: 2, scenarioKey: 'conflict', step: 'Running Conflict Resolution' });
    expect(mockService.advanceRun).toHaveBeenCalledWith('ACC-2026-08-06-001', 'usr_admin_1', { scenarioIndex: 2, scenarioKey: 'conflict', step: 'Running Conflict Resolution' });
  });

  it('patch forwards the patch payload', async () => {
    await request(buildApp()).post('/api/acceptance/runs/ACC-2026-08-06-001/patch').send({ patch: { handoff: { bEditDone: true } } });
    expect(mockService.patchRunData).toHaveBeenCalledWith('ACC-2026-08-06-001', { handoff: { bEditDone: true } });
  });

  it('close forwards the close request', async () => {
    const res = await request(buildApp()).post('/api/acceptance/runs/ACC-2026-08-06-001/close');
    expect(res.status).toBe(200);
    expect(mockService.closeRun).toHaveBeenCalledWith('ACC-2026-08-06-001');
  });

  it('records observations and telemetry', async () => {
    const observation = { deviceId: 'usr_admin_1', scenarioKey: 'conflict', check: { name: 'x', status: 'pass' } };
    await request(buildApp()).post('/api/acceptance/runs/ACC-2026-08-06-001/observation').send(observation);
    expect(mockService.addObservation).toHaveBeenCalledWith('ACC-2026-08-06-001', 'usr_admin_1', observation);

    const telemetry = { telemetry: { scenarioKey: 'conflict', durationMs: 5 } };
    await request(buildApp()).post('/api/acceptance/runs/ACC-2026-08-06-001/telemetry').send(telemetry);
    expect(mockService.addTelemetry).toHaveBeenCalledWith('ACC-2026-08-06-001', 'usr_admin_1', telemetry);
  });

  it('getRun returns 404 when the service reports not found', async () => {
    mockService.getRun.mockResolvedValue(null);
    const res = await request(buildApp()).get('/api/acceptance/runs/ACC-2026-08-06-999');
    expect(res.status).toBe(404);
  });
});

describe('cloud verification & cleanup', () => {
  it('verify/cloud counts tagged rows and returns the rows', async () => {
    const res = await request(buildApp()).get('/api/acceptance/verify/cloud?runId=ACC-2026-08-06-001&table=customers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, runId: 'ACC-2026-08-06-001', table: 'customers', count: 2, rows: [{ id: '1' }, { id: '2' }] });
    expect(mockService.countAcceptanceRows).toHaveBeenCalledWith('customers', 'ACC-2026-08-06-001');
  });

  it('verify/cloud special-cases _storage via the storage listing', async () => {
    const res = await request(buildApp()).get('/api/acceptance/verify/cloud?runId=ACC-2026-08-06-001&table=_storage');
    expect(res.status).toBe(200);
    expect(res.body.table).toBe('_storage');
    expect(res.body.count).toBe(1);
    expect(mockService.verifyStorage).toHaveBeenCalledWith('ACC-2026-08-06-001');
    expect(mockService.countAcceptanceRows).not.toHaveBeenCalled();
  });

  it('verify/file returns the signed url result', async () => {
    const res = await request(buildApp()).get('/api/acceptance/verify/file?runId=ACC-2026-08-06-001');
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(mockService.verifyRunFile).toHaveBeenCalledWith('ACC-2026-08-06-001');
  });

  it('cleanup forwards tables, file paths and prefix', async () => {
    const res = await request(buildApp()).post('/api/acceptance/cleanup').send({
      runId: 'ACC-2026-08-06-001',
      tables: ['customers', 'invoices'],
      filePaths: ['documents/x.txt'],
    });
    expect(res.status).toBe(200);
    expect(res.body.rowsRemoved).toBe(2);
    expect(mockService.cleanupRun).toHaveBeenCalledWith('ACC-2026-08-06-001', {
      tables: ['customers', 'invoices'],
      filePaths: ['documents/x.txt'],
      prefix: undefined,
    });
  });

  it('cleanup requires a runId', async () => {
    const res = await request(buildApp()).post('/api/acceptance/cleanup').send({ tables: ['customers'] });
    expect(res.status).toBe(400);
  });
});
