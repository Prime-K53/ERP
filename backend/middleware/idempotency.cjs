const { randomUUID } = require('crypto');
const repo = require('../services/supabaseRepository.cjs');

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const idempotencyMiddleware = (options = {}) => {
  const {
    ttlMs = IDEMPOTENCY_TTL_MS,
    methods = ['POST', 'PATCH', 'PUT'],
    headerName = 'Idempotency-Key'
  } = options;

  return async (req, res, next) => {
    if (!methods.includes(req.method)) {
      return next();
    }

    const key = req.headers[headerName.toLowerCase()] || req.headers[headerName];
    if (!key) {
      return next();
    }

    if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
      return res.status(400).json({
        error: 'Invalid idempotency key',
        message: 'Idempotency-Key must be a string between 8 and 128 characters'
      });
    }

    const rows = await repo.getAll('idempotency_keys', { 'data->>key': `eq.${key}` });
    const existing = rows[0] || null;

    if (existing) {
      const d = existing.data || existing;
      if (new Date(d.expires_at) < new Date()) {
        await repo.softDelete('idempotency_keys', existing.id);
        return storeAndProceed();
      }
      return res.status(d.response_code || 200).json(JSON.parse(d.response_body || '{}'));
    }

    await storeAndProceed();

    async function storeAndProceed() {
      const id = randomUUID();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();

      const record = {
        id,
        data: {
          key,
          method: req.method,
          path: req.originalUrl || req.url,
          user_id: req.user?.id || null,
          expires_at: expiresAt,
        },
      };
      await repo.upsert('idempotency_keys', record);

      const originalJson = res.json.bind(res);
      res.json = function(body) {
        const d = record.data || record;
        repo.upsert('idempotency_keys', {
          ...record,
          data: {
            ...d,
            response_code: res.statusCode,
            response_body: JSON.stringify(body),
          },
          updated_at: new Date().toISOString(),
        }).catch(() => {});
        return originalJson(body);
      };

      next();
    }
  };
};

module.exports = { idempotencyMiddleware };
