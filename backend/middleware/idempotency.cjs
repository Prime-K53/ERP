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

    // Keys are scoped to the authenticated actor so a replay can never hand
    // one user another user's stored response (staff routes set req.user,
    // portal routes set req.portalUser). Falls back to key-only lookup when
    // no authenticated identity exists, preserving legacy behavior.
    const userId = req.user?.id || req.portalUser?.id || null;
    const keyFilters = { 'data->>key': `eq.${key}` };
    if (userId) {
      keyFilters['data->>user_id'] = `eq.${userId}`;
    }
    const rows = await repo.getAll('idempotency_keys', keyFilters);
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

      // Canonical storage contract: the metadata fields live AT the domain
      // level. repo.upsert() → cloudSyncStore.upsertRow() stores the payload
      // verbatim in the `data` JSONB column, so wrapping the fields in a
      // `data` key produced a double-wrapped `data.data.key` row that the
      // `data->>key` lookup could never match. The response write must also
      // carry the version returned by the create so upsertRow can perform its
      // atomic versioned PATCH (an unversioned update on an existing row is
      // rejected as a version_required conflict).
      const record = {
        id,
        key,
        method: req.method,
        path: req.originalUrl || req.url,
        user_id: userId,
        expires_at: expiresAt,
      };
      const created = await repo.upsert('idempotency_keys', record);
      const baseVersion = created && Number.isFinite(Number(created.version))
        ? Number(created.version)
        : null;

      const originalJson = res.json.bind(res);
      res.json = function(body) {
        repo.upsert('idempotency_keys', {
          ...record,
          ...(baseVersion != null ? { version: baseVersion } : {}),
          response_code: res.statusCode,
          response_body: JSON.stringify(body),
          updated_at: new Date().toISOString(),
        }).catch(() => {});
        return originalJson(body);
      };

      next();
    }
  };
};

module.exports = { idempotencyMiddleware };
