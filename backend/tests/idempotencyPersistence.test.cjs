/**
 * F2 FINAL FIX — idempotency persistence-contract tests.
 *
 * Unlike the hermetic suites, these tests exercise the REAL repository +
 * REAL cloudSyncStore + REAL Supabase (staging) so the envelope
 * transformation that caused `data.data.key` is NOT mocked away.
 *
 * Contract under test (canonical):
 *   middleware passes domain-level fields
 *     { id, key, method, path, user_id, expires_at, ... }
 *   → repo.upsert → cloudSyncStore.upsertRow stores them verbatim in `data`
 *   → cloud row: { id, data: { key, ..., response_code, response_body } }
 *   → lookup: GET ?data->>key=eq.<key>&data->>user_id=eq.<user>
 *
 * Skipped when the repository is not configured (no .env / no cloud access).
 * Rows created by these tests are soft-deleted in afterAll.
 */

const { randomUUID } = require('crypto');
const express = require('express');

process.env.JWT_SECRET = 'test-jwt-secret';
require('dotenv').config();

const repo = require('../services/supabaseRepository.cjs');
const { idempotencyMiddleware } = require('../middleware/idempotency.cjs');

const configured = repo.isConfigured();
const describeIf = configured ? describe : describe.skip;

const KEY_PREFIX = 'f2-persist-contract-';
const createdIds = new Set();

function makeApp({ identity = 'portal' } = {}) {
  const app = express();
  app.use(express.json());
  let executions = 0;
  app.post('/test', (req, res, next) => {
    const user = req.header('x-user') || 'pusr_default';
    if (identity === 'staff') {
      req.user = { id: user, role: 'Admin' };
    } else {
      req.portalUser = { id: user, customer_id: 'CUST_X' };
    }
    next();
  }, idempotencyMiddleware(), (req, res) => {
    executions += 1;
    res.status(201).json({ executions, echo: req.body.echo || null });
  });
  return { app, getExecutions: () => executions };
}

function makeKey(label) {
  return `${KEY_PREFIX}${label}-${randomUUID()}`;
}

async function findRawRows(key) {
  const rows = await repo.request('idempotency_keys', {
    'data->>key': `eq.${key}`,
    select: '*',
  });
  return Array.isArray(rows) ? rows : [];
}

async function findFlattened(key, userId) {
  const filters = { 'data->>key': `eq.${key}` };
  if (userId) filters['data->>user_id'] = `eq.${userId}`;
  return repo.getAll('idempotency_keys', filters);
}

describeIf('F2 idempotency persistence contract (real repo + real cloud)', () => {
  afterAll(async () => {
    const pending = [...createdIds];
    createdIds.clear();
    await Promise.all(pending.map((id) =>
      repo.softDelete('idempotency_keys', id).catch(() => {})
    ));
  }, 120000);

  it('Test A — stored JSON shape is canonical data.key (NOT data.data.key), response persisted', async () => {
    const key = makeKey('shape');
    const { app } = makeApp();
    const upsertSpy = jest.spyOn(repo, 'upsert');

    const res = await new Promise((resolve) => {
      const server = app.listen(0, () => {
        const port = server.address().port;
        const http = require('http');
        const body = JSON.stringify({ echo: 'shape-check' });
        const req = http.request({
          host: 'localhost', port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'x-user': 'pusr_contract_a',
            'Idempotency-Key': key,
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => {
            server.close();
            resolve({ status: r.statusCode, body: data });
          });
        });
        req.end(body);
      });
    });

    expect(res.status).toBe(201);

    // 1) The object handed to the repository is domain-level (no `data` wrapper).
    const firstUpsert = upsertSpy.mock.calls.find((c) => c[0] === 'idempotency_keys' && c[1].key === key);
    expect(firstUpsert).toBeTruthy();
    expect(firstUpsert[1].key).toBe(key);
    expect(firstUpsert[1].data).toBeUndefined();

    // 2) The raw cloud row stores data.key (canonical), never data.data.key.
    const raw = await findRawRows(key);
    expect(raw.length).toBe(1);
    const row = raw[0];
    expect(row.data.key).toBe(key);
    expect(row.data.data).toBeUndefined();
    expect(row.data.method).toBe('POST');
    expect(row.data.user_id).toBe('pusr_contract_a');
    expect(row.data.expires_at).toBeTruthy();

    // 3) Response metadata was persisted (proves the versioned response write).
    expect(row.data.response_code).toBe(201);
    const storedBody = JSON.parse(row.data.response_body);
    expect(storedBody.echo).toBe('shape-check');

    createdIds.add(row.id);
    upsertSpy.mockRestore();
  });

  it('Test B — lookup finds the stored key and replays (same user, same key)', async () => {
    const key = makeKey('replay');
    const { app, getExecutions } = makeApp();

    const first = await new Promise((resolve) => {
      const server = app.listen(0, () => {
        const http = require('http');
        const body = JSON.stringify({ echo: 'replay-me' });
        const req = http.request({
          host: 'localhost', port: server.address().port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'x-user': 'pusr_contract_b',
            'Idempotency-Key': key,
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => { server.close(); resolve({ status: r.statusCode, body: data }); });
        });
        req.end(body);
      });
    });
    expect(first.status).toBe(201);
    expect(getExecutions()).toBe(1);

    const replay = await new Promise((resolve) => {
      const server = app.listen(0, () => {
        const http = require('http');
        const body = JSON.stringify({ echo: 'replay-me' });
        const req = http.request({
          host: 'localhost', port: server.address().port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'x-user': 'pusr_contract_b',
            'Idempotency-Key': key,
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => { server.close(); resolve({ status: r.statusCode, body: data }); });
        });
        req.end(body);
      });
    });

    expect(replay.status).toBe(201);
    expect(getExecutions()).toBe(1);
    expect(JSON.parse(replay.body)).toEqual(JSON.parse(first.body));

    const rows = await findRawRows(key);
    expect(rows.length).toBe(1);
    createdIds.add(rows[0].id);
  });

  it('Test C — same-user replay returns the identical stored response', async () => {
    const key = makeKey('sameuser');
    const { app, getExecutions } = makeApp();
    const send = (body, user) => new Promise((resolve) => {
      const server = app.listen(0, () => {
        const http = require('http');
        const payload = JSON.stringify(body);
        const req = http.request({
          host: 'localhost', port: server.address().port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-user': user,
            'Idempotency-Key': key,
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => { server.close(); resolve({ status: r.statusCode, body: data }); });
        });
        req.end(payload);
      });
    });

    const first = await send({ echo: 'same-user' }, 'pusr_contract_c');
    const second = await send({ echo: 'same-user' }, 'pusr_contract_c');
    expect(getExecutions()).toBe(1);
    expect(second.status).toBe(first.status);
    expect(JSON.parse(second.body)).toEqual(JSON.parse(first.body));

    const rows = await findRawRows(key);
    expect(rows.length).toBe(1);
    createdIds.add(rows[0].id);
  });

  it('Test D — cross-user isolation: same key, different user → fresh request, never a leak', async () => {
    const key = makeKey('isolation');
    const { app, getExecutions } = makeApp();
    const send = (body, user) => new Promise((resolve) => {
      const server = app.listen(0, () => {
        const http = require('http');
        const payload = JSON.stringify(body);
        const req = http.request({
          host: 'localhost', port: server.address().port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-user': user,
            'Idempotency-Key': key,
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => { server.close(); resolve({ status: r.statusCode, body: data }); });
        });
        req.end(payload);
      });
    });

    const aRes = await send({ echo: 'customer-A' }, 'pusr_contract_da');
    expect(aRes.status).toBe(201);
    expect(getExecutions()).toBe(1);

    const bRes = await send({ echo: 'customer-B' }, 'pusr_contract_db');
    expect(bRes.status).toBe(201);
    expect(getExecutions()).toBe(2);
    expect(JSON.parse(bRes.body).echo).toBe('customer-B');
    expect(JSON.parse(bRes.body)).not.toEqual(JSON.parse(aRes.body));

    const aReplay = await send({ echo: 'customer-A' }, 'pusr_contract_da');
    expect(aReplay.status).toBe(201);
    expect(getExecutions()).toBe(2);
    expect(JSON.parse(aReplay.body)).toEqual(JSON.parse(aRes.body));

    const rows = await findRawRows(key);
    expect(rows.length).toBe(2);
    for (const r of rows) createdIds.add(r.id);
  });

  it('Test E — no Idempotency-Key: proceeds exactly as before, no persistence', async () => {
    const key = makeKey('nokey');
    const { app, getExecutions } = makeApp();
    const upsertSpy = jest.spyOn(repo, 'upsert');

    const res = await new Promise((resolve) => {
      const server = app.listen(0, () => {
        const http = require('http');
        const body = JSON.stringify({ echo: 'no-key' });
        const req = http.request({
          host: 'localhost', port: server.address().port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'x-user': 'pusr_contract_e',
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => { server.close(); resolve({ status: r.statusCode, body: data }); });
        });
        req.end(body);
      });
    });

    expect(res.status).toBe(201);
    expect(getExecutions()).toBe(1);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect((await findRawRows(key)).length).toBe(0);
    upsertSpy.mockRestore();
  });

  it('Test F — different key creates a separate request record', async () => {
    const key1 = makeKey('diff-1');
    const key2 = makeKey('diff-2');
    const { app, getExecutions } = makeApp();
    const send = (body, key) => new Promise((resolve) => {
      const server = app.listen(0, () => {
        const http = require('http');
        const payload = JSON.stringify(body);
        const req = http.request({
          host: 'localhost', port: server.address().port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-user': 'pusr_contract_f',
            'Idempotency-Key': key,
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => { server.close(); resolve({ status: r.statusCode, body: data }); });
        });
        req.end(payload);
      });
    });

    const r1 = await send({ echo: 'first-key' }, key1);
    const r2 = await send({ echo: 'second-key' }, key2);
    expect(getExecutions()).toBe(2);
    expect(JSON.parse(r1.body)).not.toEqual(JSON.parse(r2.body));

    const rows1 = await findRawRows(key1);
    const rows2 = await findRawRows(key2);
    expect(rows1.length).toBe(1);
    expect(rows2.length).toBe(1);
    expect(rows1[0].id).not.toBe(rows2[0].id);
    for (const r of [...rows1, ...rows2]) createdIds.add(r.id);
  });

  it('Test G — referral-style (staff req.user) uses the same canonical contract', async () => {
    const key = makeKey('referral-style');
    const { app, getExecutions } = makeApp({ identity: 'staff' });
    const send = (body, user) => new Promise((resolve) => {
      const server = app.listen(0, () => {
        const http = require('http');
        const payload = JSON.stringify(body);
        const req = http.request({
          host: 'localhost', port: server.address().port, path: '/test', method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-user': user,
            'Idempotency-Key': key,
          },
        }, (r) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => { server.close(); resolve({ status: r.statusCode, body: data }); });
        });
        req.end(payload);
      });
    });

    const first = await send({ echo: 'staff-create' }, 'usr_staff_1');
    const replay = await send({ echo: 'staff-create' }, 'usr_staff_1');
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(getExecutions()).toBe(1);
    expect(JSON.parse(replay.body)).toEqual(JSON.parse(first.body));

    const raw = await findRawRows(key);
    expect(raw.length).toBe(1);
    expect(raw[0].data.key).toBe(key);
    expect(raw[0].data.user_id).toBe('usr_staff_1');
    expect(raw[0].data.data).toBeUndefined();

    const fresh = await send({ echo: 'staff-other' }, 'usr_staff_2');
    expect(fresh.status).toBe(201);
    expect(getExecutions()).toBe(2);
    expect(JSON.parse(fresh.body).echo).toBe('staff-other');

    const allRows = await findRawRows(key);
    expect(allRows.length).toBe(2);
    for (const r of allRows) createdIds.add(r.id);
  });
});