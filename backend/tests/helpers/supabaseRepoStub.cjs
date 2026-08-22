/**
 * Hermetic Supabase repository stub for portal-auth tests.
 *
 * Loaded through jest.mock('../services/supabaseRepository.cjs') so the REAL
 * routes/portalAuth.cjs -> services/portalAuthService.cjs chain runs end to
 * end against in-memory state — no network, no database, no live Supabase.
 *
 * Exposes seed/reset helpers so tests control exactly which users and
 * sessions "exist" without touching any other module's internals.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const state = {
  usersById: new Map(),
  usersByEmail: new Map(),
  sessionsByHash: new Map(),
};

const DEFAULT_PASSWORD = 'correct-horse-battery';
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Repository filters arrive PostgREST-style ("eq.<value>", "gt.<value>",
// "is.null"). Normalize before comparing against plain row values.
function unwrapFilter(value) {
  const s = String(value);
  if (s === 'is.null') return null;
  return s.replace(/^(eq|neq|gt|gte|lt|lte|like|ilike)\./, '');
}

function seedUser(overrides = {}) {
  const user = {
    id: 'pusr_test_1',
    customer_id: 'CUST-001',
    email: 'known@example.com',
    full_name: 'Known User',
    phone: '+265999000111',
    status: 'active',
    two_factor_enabled: false,
    password_hash: DEFAULT_PASSWORD_HASH,
    ...overrides,
  };
  state.usersById.set(user.id, user);
  state.usersByEmail.set(user.email.toLowerCase(), user);
  return { ...user };
}

function seedSession(token, { userId = 'pusr_test_1', expired = false, revoked = false } = {}) {
  const row = {
    id: `pses_${hashToken(token).slice(0, 12)}`,
    portal_user_id: userId,
    refresh_token_hash: hashToken(token),
    expires_at: new Date(Date.now() + (expired ? -1000 : 30 * 24 * 60 * 60 * 1000)).toISOString(),
    revoked_at: revoked ? new Date(Date.now() - 500).toISOString() : null,
  };
  state.sessionsByHash.set(row.refresh_token_hash, row);
  return row;
}

function reset() {
  state.usersById.clear();
  state.usersByEmail.clear();
  state.sessionsByHash.clear();
}

const repo = {
  isConfigured: () => false,
  request: async () => null,
  getAll: async () => [],
  getAllStrict: async () => [],
  getById: async () => null,
  upsert: async () => null,
  softDelete: async () => null,
  count: async () => 0,
  fromSupabaseRow: (r) => r && r.data ? { ...r.data, id: r.id } : (r || null),
  toSupabaseRow: (d) => ({ id: d && d.id, data: d }),
  getAllFlat: async () => [],
  getByIdFlat: async () => null,
  upsertFlat: async () => null,
  updateFlat: async () => null,
  portalEntities: {
    portal_users: {
      getAll: async () => [...state.usersById.values()],
      getById: async (id) => state.usersById.get(id) || null,
      getByEmail: async (email) =>
        state.usersByEmail.get(String(email || '').toLowerCase().trim()) || null,
      getByCustomerId: async (cid) =>
        [...state.usersById.values()].find(u => u.customer_id === cid) || null,
      upsert: async (row) => {
        const merged = { ...(state.usersById.get(row.id) || {}), ...row };
        state.usersById.set(row.id, merged);
        if (merged.email) state.usersByEmail.set(merged.email.toLowerCase(), merged);
        return { ...merged };
      },
      update: async (id, updates) => {
        const u = state.usersById.get(id);
        if (!u) return null;
        Object.assign(u, updates);
        return u;
      },
    },
    portal_sessions: {
      getAll: async (filters = {}) => {
        let rows = [...state.sessionsByHash.values()];
        for (const [key, rawValue] of Object.entries(filters)) {
          if (rawValue == null) continue;
          if (key === 'revoked_at' && String(rawValue) === 'is.null') {
            rows = rows.filter(r => !r.revoked_at);
          } else if (key === 'expires_at') {
            const op = String(rawValue).split('.')[0];
            const bound = new Date(unwrapFilter(rawValue)).getTime();
            rows = rows.filter(r => {
              const t = new Date(r.expires_at).getTime();
              if (op === 'gt') return t > bound;
              if (op === 'lt') return t < bound;
              return true;
            });
          } else {
            const wanted = unwrapFilter(rawValue);
            rows = rows.filter(r => String(r[key]) === wanted);
          }
        }
        return rows;
      },
      getById: async (id) => [...state.sessionsByHash.values()].find(s => s.id === id) || null,
      upsert: async (row) => {
        const merged = { ...(state.sessionsByHash.get(row.refresh_token_hash) || {}), ...row };
        state.sessionsByHash.set(row.refresh_token_hash, merged);
        return { ...merged };
      },
      update: async (id, updates) => {
        for (const r of state.sessionsByHash.values()) {
          if (r.id === id) { Object.assign(r, updates); return r; }
        }
        return null;
      },
    },
    portal_password_resets: {
      getAll: async () => [], getById: async () => null, upsert: async () => null, update: async () => null,
    },
    portal_login_history: {
      getAll: async () => [], getById: async () => null, upsert: async () => null,
    },
  },
};

module.exports = {
  repo,
  state,
  hashToken,
  seedUser,
  seedSession,
  reset,
  DEFAULT_PASSWORD,
};
