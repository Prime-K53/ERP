/**
 * Portal authentication error-handling regression tests — hermetic.
 *
 * The Supabase repository is replaced via jest.mock with an in-memory stub
 * (tests/helpers/supabaseRepoStub.cjs), so no network or database is touched
 * while the REAL routes/portalAuth.cjs, services/portalAuthService.cjs and
 * middleware/portalAuth.cjs code paths run end to end.
 *
 * Defect under test: portal-auth error paths escaping their intended
 * route-level handling into HTTP 500s (global-handler response or route-level
 * catch-all) instead of the documented authentication failures.
 *
 * Covered contract:
 *   1. Valid portal login        -> existing successful response UNCHANGED.
 *   2. Unknown login user        -> 401 "Invalid credentials" (not 500).
 *   3. Invalid credentials       -> 401 (not 500).
 *   4. Valid refresh token       -> existing rotation response UNCHANGED.
 *   5. Invalid/unknown refresh   -> 401 "Invalid or expired refresh token".
 *   6. Expired refresh token     -> 401 documented semantics (not 500).
 *   7. Protected portal endpoint -> unaffected (/me auth gate intact).
 *   8. JWT verification          -> unaffected (tampered/expired rejected).
 *   + Malformed/untyped bodies   -> never reach the global error handler.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-portal-auth-errors';

// Supabase env vars are cleared only while THIS suite runs and restored
// afterwards — jest workers share process.env across sequential test files.
const SAVED_ENV = {};
function takeEnv(keys) {
  for (const key of keys) {
    SAVED_ENV[key] = process.env[key];
    delete process.env[key];
  }
}
function restoreEnv() {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
takeEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SECRET_KEY']);

jest.mock('../services/supabaseRepository.cjs', () =>
  require('./helpers/supabaseRepoStub.cjs').repo
);

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const repoStub = require('./helpers/supabaseRepoStub.cjs');
const { DEFAULT_PASSWORD } = repoStub;

// Known seeded user (mirrors supabaseRepoStub.seedUser defaults).
const KNOWN_USER = {
  id: 'pusr_test_1',
  customer_id: 'CUST-001',
  email: 'known@example.com',
  full_name: 'Known User',
  phone: '+265999000111',
  status: 'active',
};

// ── Real router/service/middleware chain over the stubbed repo ───────────────

let portalAuthRoutes;
let generatePortalToken;

beforeAll((done) => {
  // Require AFTER env + mocks are fully in place (middleware exits without JWT_SECRET).
  portalAuthRoutes = require('../routes/portalAuth.cjs');
  ({ generatePortalToken } = require('../middleware/portalAuth.cjs'));

  app = express();
  app.use(express.json());
  // Mirror index.cjs: unparseable bodies are answered at this boundary and
  // must NEVER escape to the global error handler below.
  app.use('/api/portal/auth', (err, req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    next(err);
  });
  app.use('/api/portal/auth', portalAuthRoutes);
  // Production-shaped global error handler — a hit here is a defect.
  app.use((err, req, res, next) => {
    globalHandlerHits.push(err && err.message);
    res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred. Please try again later.' });
  });

  server = app.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  restoreEnv();
  if (!server) return done();
  server.close(() => done());
});

let globalHandlerHits;

beforeEach(() => {
  globalHandlerHits = [];
  repoStub.reset();
  repoStub.seedUser();
});

const postJson = (path, rawOrObj, contentType = 'application/json') => {
  const payload = typeof rawOrObj === 'string'
    ? rawOrObj
    : JSON.stringify(rawOrObj === undefined ? {} : rawOrObj);
  return request(app)
    .post(path)
    .set('Content-Type', contentType)
    .send(payload);
};

describe('Portal auth documented error semantics (no 500 escapes)', () => {
  // ── 1. Successful login is unchanged ───────────────────────────────────────
  test('valid login-password keeps the documented success envelope', async () => {
    const res = await postJson('/api/portal/auth/login-password', {
      email: 'known@example.com',
      password: DEFAULT_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Login successful');
    expect(res.body.user).toMatchObject({
      id: KNOWN_USER.id,
      customer_id: KNOWN_USER.customer_id,
      email: KNOWN_USER.email,
      full_name: KNOWN_USER.full_name,
    });
    expect(typeof res.body.access_token).toBe('string');
    expect(res.body.access_token.split('.').length).toBe(3);
    expect(typeof res.body.refresh_token).toBe('string');
    expect(res.body.expires_in).toBe('30m');

    // JWT generation contract untouched: role must remain portal_customer.
    const decoded = jwt.verify(res.body.access_token, process.env.JWT_SECRET);
    expect(decoded.role).toBe('portal_customer');
    expect(decoded.email).toBe(KNOWN_USER.email);
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── 2. Unknown login user -> 401, not 500 ──────────────────────────────────
  test('unknown email returns documented 401 Invalid credentials', async () => {
    const res = await postJson('/api/portal/auth/login-password', {
      email: 'ghost-nonexistent@example.com',
      password: 'whatever123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
    expect(res.text.includes('Internal Server Error')).toBe(false);
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('unknown customer_id on /login returns documented 401', async () => {
    const res = await postJson('/api/portal/auth/login', {
      customer_id: 'NO-SUCH-CUSTOMER',
      full_name: 'Ghost',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── 3. Invalid credentials -> 401, not 500 ─────────────────────────────────
  test('wrong password returns documented 401 Invalid credentials', async () => {
    const res = await postJson('/api/portal/auth/login-password', {
      email: 'known@example.com',
      password: 'definitely-wrong',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('non-string password is an auth failure (401), not a crash (500)', async () => {
    const res = await postJson('/api/portal/auth/login-password', {
      email: 'known@example.com',
      password: 12345678,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('missing fields keep the existing 400 validation response', async () => {
    const res = await postJson('/api/portal/auth/login-password', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required');
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── 4. Refresh rotation success is unchanged ───────────────────────────────
  test('valid refresh token rotates exactly like production', async () => {
    repoStub.seedSession('rot-old-token');
    const res = await postJson('/api/portal/auth/refresh', { refresh_token: 'rot-old-token' });
    expect(res.status).toBe(200);
    expect(typeof res.body.access_token).toBe('string');
    expect(res.body.expires_in).toBe('30m');
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.refresh_token).not.toBe('rot-old-token');

    // Old token was revoked during rotation — one-time use preserved.
    const reuse = await postJson('/api/portal/auth/refresh', { refresh_token: 'rot-old-token' });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe('Invalid or expired refresh token');
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── 5. Invalid/unknown refresh token -> 401, not 500 ───────────────────────
  test('unknown refresh token returns documented 401', async () => {
    const res = await postJson('/api/portal/auth/refresh', { refresh_token: 'deadbeef-not-a-real-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired refresh token');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('non-string (numeric) refresh token returns documented 401, not 500', async () => {
    const res = await postJson('/api/portal/auth/refresh', { refresh_token: 12345 });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired refresh token');
    expect(res.body.error).not.toBe('Token refresh failed');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('object refresh token returns documented 401, not 500', async () => {
    const res = await postJson('/api/portal/auth/refresh', { refresh_token: { forged: true } });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired refresh token');
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── 6. Expired refresh token -> 401 documented semantics ───────────────────
  test('expired refresh token returns documented 401', async () => {
    repoStub.seedSession('expired-but-real-token', { expired: true });
    const res = await postJson('/api/portal/auth/refresh', { refresh_token: 'expired-but-real-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired refresh token');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('revoked refresh token returns documented 401', async () => {
    repoStub.seedSession('revoked-token', { revoked: true });
    const res = await postJson('/api/portal/auth/refresh', { refresh_token: 'revoked-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired refresh token');
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── Malformed bodies must never reach the global error handler ─────────────
  test('malformed JSON on login-password -> JSON 400 boundary, not global 500', async () => {
    const res = await postJson('/api/portal/auth/login-password', '{"email": broken', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
    expect(res.text.includes('Internal Server Error')).toBe(false);
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('malformed JSON on refresh -> JSON 400 boundary, not global 500', async () => {
    const res = await postJson('/api/portal/auth/refresh', '{"refresh_token": ', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
    expect(res.text.includes('Internal Server Error')).toBe(false);
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('request without JSON content-type falls back to field validation, not 500', async () => {
    const res = await postJson('/api/portal/auth/refresh', JSON.stringify({ refresh_token: 'some-token' }), 'text/plain');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Refresh token is required');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('empty POST body on refresh keeps existing 400 contract', async () => {
    const res = await postJson('/api/portal/auth/refresh', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Refresh token is required');
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── 7. Protected portal endpoint unaffected ────────────────────────────────
  test('/me still requires a bearer token (401 Access denied)', async () => {
    const res = await request(app).get('/api/portal/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Access denied');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('/me works end to end with a valid portal token', async () => {
    const token = generatePortalToken({ ...KNOWN_USER });
    const res = await request(app)
      .get('/api/portal/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(KNOWN_USER.email);
    expect(globalHandlerHits).toHaveLength(0);
  });

  // ── 8. JWT verification unaffected ─────────────────────────────────────────
  test('tampered/wrongly-signed token is rejected with 401 Invalid token', async () => {
    const forged = jwt.sign(
      { id: KNOWN_USER.id, role: 'portal_customer' },
      'some-other-secret'
    );
    const res = await request(app)
      .get('/api/portal/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('expired portal token is rejected with 401 Token expired', async () => {
    const expired = jwt.sign(
      { id: KNOWN_USER.id, email: KNOWN_USER.email, role: 'portal_customer' },
      process.env.JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const res = await request(app)
      .get('/api/portal/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expired');
    expect(globalHandlerHits).toHaveLength(0);
  });

  test('admin-role token is refused portal access (role gate intact)', async () => {
    const adminToken = jwt.sign(
      { id: 'admin_1', email: 'admin@example.com', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    const res = await request(app)
      .get('/api/portal/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid token role');
    expect(globalHandlerHits).toHaveLength(0);
  });
});
