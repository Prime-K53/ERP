/**
 * B8 — Error classification tests for the sync gateway.
 *
 * Verifies that:
 *   1. Network errors (no status) → retryable
 *   2. 429 rate limiting → retryable
 *   3. 5xx server errors → retryable
 *   4. 409 conflict → retryable
 *   5. 400 PGRST204 (schema) → non-retryable
 *   6. 404 PGRST205 (table not found) → non-retryable
 *   7. 401/403 auth errors → non-retryable
 *   8. Constraint violations → non-retryable
 */
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  instance.create = jest.fn(() => instance);
  return instance;
});

const axios = require('axios');
const cloudSyncStore = require('../../services/cloudSyncStore.cjs');

function makeHttpError(status, data) {
  const err = new Error(`Request failed with status ${status}`);
  err.response = { status, data };
  return err;
}

function makeNetworkError() {
  return new Error('Network Error');
}

describe('B8 — error classification (retryable vs non-retryable)', () => {
  beforeEach(() => jest.clearAllMocks());

  const baseOp = { table: 'products', recordId: 'r1', operation: 'upsert', payload: { id: 'r1', name: 'test' } };

  it('classifies network errors (no status) as retryable', async () => {
    axios.get.mockRejectedValueOnce(makeNetworkError());

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('classifies 429 rate limiting as retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(429, { message: 'rate limit exceeded' }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('classifies 500 server errors as retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(500, { message: 'internal server error' }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('classifies 503 service unavailable as retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(503, { message: 'service unavailable' }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('classifies 409 conflict as retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(409, { message: 'unique constraint' }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('classifies 400 PGRST204 (column not found) as non-retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(400, {
      code: 'PGRST204',
      message: 'Could not find the \'nonexistent_column\' column in the schema cache',
    }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain('PGRST204');
  });

  it('classifies 404 PGRST205 (table not found) as non-retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(404, {
      code: 'PGRST205',
      message: 'Table \'nonexistent_table\' not found',
    }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('classifies 401 unauthorized as non-retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(401, { message: 'unauthorized' }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('classifies 403 forbidden as non-retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(403, { message: 'forbidden' }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('classifies 400 constraint violation as non-retryable', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(400, {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('retains diagnostic information in the error field', async () => {
    axios.get.mockRejectedValueOnce(makeHttpError(400, {
      code: 'PGRST204',
      message: 'Could not find the \'bad_col\' column in the schema cache',
    }));

    const result = await cloudSyncStore.applyOp(baseOp);

    expect(result.error).toBeDefined();
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.error.length).toBeLessThanOrEqual(300);
  });
});
