/**
 * Portal authentication rate-limiter tests — hermetic (no network, no DB).
 *
 * Verifies:
 *   1. Normal login is allowed (within limit).
 *   2. Refresh does NOT consume the login-password brute-force budget.
 *   3. Repeated failed password attempts are still rate limited.
 *   4. Successful authentication does not consume the failed-login budget
 *      (skipSuccessfulRequests).
 *   5. Existing ERP API rate limits remain unchanged.
 *   6. Refresh has its own independent, higher-limit bucket.
 *   7. portalAuthLimiter skips the /refresh path (Express path stacking).
 */

const http = require('http');
const express = require('express');
const { clearAllRateLimits } = require('../services/redisRateLimiter.cjs');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Express app that mounts the portal auth routes with the
 *  same rate-limit configuration as production index.cjs. */
function buildTestApp() {
  const {
    createLimiter,
    portalAuthLimiter,
    portalRefreshLimiter,
  } = require('../services/redisRateLimiter.cjs');

  const app = express();
  app.use(express.json());

  // Mirror production: global /api limiter (generous for tests)
  app.use('/api', createLimiter({ windowMs: 60_000, maxRequests: 600 }));

  // Mirror production: refresh gets its own bucket
  app.use('/api/portal/auth/refresh', portalRefreshLimiter({ windowMs: 60_000, maxRequests: 5 }));

  // Mirror production: credential endpoints share a bucket with skipSuccessfulRequests
  // The auth limiter skips /refresh so it doesn't double-count.
  app.use('/api/portal/auth', portalAuthLimiter({ windowMs: 60_000, maxRequests: 5 }));

  // Stub route handlers — we only test the limiter, not real auth logic.
  app.post('/api/portal/auth/login-password', (req, res) => {
    const { email, password } = req.body || {};
    if (email === 'bad@test.com' || password === 'wrong') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ message: 'Login successful', access_token: 'tok_test', refresh_token: 'ref_test' });
  });

  app.post('/api/portal/auth/refresh', (req, res) => {
    const { refresh_token } = req.body || {};
    if (!refresh_token || refresh_token === 'invalid') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    res.json({ access_token: 'tok_new', refresh_token: 'ref_new', expires_in: '30m' });
  });

  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch { /* non-JSON */ }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function waitForFinish() {
  return new Promise((r) => setTimeout(r, 30));
}

// ── Tests ────────────────────────────────────────────────────────────────────

let server, port;

beforeAll(async () => {
  const app = buildTestApp();
  ({ server, port } = await listen(app));
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  clearAllRateLimits();
});

describe('Portal auth rate limiting', () => {
  test('1. successful login returns 200', async () => {
    const res = await post(port, '/api/portal/auth/login-password', {
      email: 'user@test.com',
      password: 'correct',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Login successful');
  });

  test('2. refresh calls do not consume login-password rate-limit bucket', async () => {
    // Burn through the refresh bucket (limit 5).
    for (let i = 0; i < 5; i++) {
      await post(port, '/api/portal/auth/refresh', { refresh_token: 'valid' });
    }
    // 6th refresh should be rate-limited (limit 5).
    const blocked = await post(port, '/api/portal/auth/refresh', { refresh_token: 'valid' });
    expect(blocked.status).toBe(429);

    // Login should still work — refresh bucket is independent.
    const loginRes = await post(port, '/api/portal/auth/login-password', {
      email: 'user@test.com',
      password: 'correct',
    });
    expect(loginRes.status).toBe(200);
  });

  test('3. repeated failed logins eventually get 429', async () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await post(port, '/api/portal/auth/login-password', {
        email: 'bad@test.com',
        password: 'wrong',
      }));
    }
    // First 5 within limit, 6th blocked.
    expect(results[4].status).toBe(401);
    expect(results[5].status).toBe(429);
    expect(results[5].body.error).toBe('Rate limit exceeded');
  });

  test('4. successful logins are excluded from rate-limit count', async () => {
    // Send a mix of successes and failures: each success decrements the
    // counter so the bucket never fills up.
    for (let i = 0; i < 10; i++) {
      const res = await post(port, '/api/portal/auth/login-password', {
        email: i % 2 === 0 ? 'user@test.com' : 'bad@test.com',
        password: i % 2 === 0 ? 'correct' : 'wrong',
      });
      // Even successes never count (skipSuccessfulRequests), and failures
      // are interleaved so they don't accumulate past the limit.
      expect([200, 401]).toContain(res.status);
      if (res.status === 200) await waitForFinish();
    }
  });

  test('5. global /api limiter is still active', async () => {
    const res = await post(port, '/api/portal/auth/login-password', {
      email: 'user@test.com',
      password: 'correct',
    });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
  });

  test('6. refresh and login have separate rate-limit buckets', async () => {
    // Burn out the refresh bucket.
    for (let i = 0; i < 5; i++) {
      await post(port, '/api/portal/auth/refresh', { refresh_token: 'valid' });
    }
    const refreshBlocked = await post(port, '/api/portal/auth/refresh', { refresh_token: 'valid' });
    expect(refreshBlocked.status).toBe(429);

    // Login should still work (different bucket).
    const loginOk = await post(port, '/api/portal/auth/login-password', {
      email: 'user@test.com',
      password: 'correct',
    });
    expect(loginOk.status).toBe(200);
  });

  test('7. refresh requests do not count against auth limiter', async () => {
    // Burn out the refresh bucket (limit 5).
    for (let i = 0; i < 5; i++) {
      await post(port, '/api/portal/auth/refresh', { refresh_token: 'valid' });
    }
    const blocked = await post(port, '/api/portal/auth/refresh', { refresh_token: 'valid' });
    expect(blocked.status).toBe(429);

    // The auth limiter should have ZERO count from those refresh requests
    // because portalAuthLimiter skips /refresh.  Login should work 5 times.
    for (let i = 0; i < 5; i++) {
      const res = await post(port, '/api/portal/auth/login-password', {
        email: 'user@test.com',
        password: 'correct',
      });
      expect(res.status).toBe(200);
    }
  });
});
