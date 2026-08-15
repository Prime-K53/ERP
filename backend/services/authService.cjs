const bcrypt = require('bcryptjs');
const axios = require('axios');
const repo = require('./supabaseRepository.cjs');

const SALT_ROUNDS = 10;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const SUPABASE_ANON_KEY = SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const ensureAuthSchema = async () => {
  return Promise.resolve();
};

const registerUser = async ({ username, email, password, role = 'Clerk', permissions = [] }) => {
  const id = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const permissionsJson = JSON.stringify(permissions);

  const record = {
    id,
    username,
    email: email || null,
    password_hash,
    role,
    permissions: permissionsJson,
    is_active: 1,
  };
  await repo.upsert('users', record);
  return { id, username, email, role, permissions };
};

const upsertLocalStaffUser = async (user) => {
  const permissionsJson = JSON.stringify(user.permissions || []);
  const existing = await repo.getAll('users', { 'data->>username': `eq.${user.username}` });
  if (existing.length > 0) {
    await repo.upsert('users', {
      ...existing[0],
      data: {
        ...existing[0].data,
        email: user.email || existing[0].data?.email || '',
        role: user.role || existing[0].data?.role || 'Clerk',
        permissions: permissionsJson,
        is_active: 1,
      },
    });
  } else {
    await repo.upsert('users', {
      id: user.id,
      username: user.username,
      email: user.email || null,
      password_hash: 'supabase-auth',
      role: user.role || 'Clerk',
      permissions: permissionsJson,
      is_active: 1,
    });
  }
};

const isSupabaseMirrorRow = (row) => {
  const data = row?.data || row;
  if (data?.password_hash === 'supabase-auth') return true;
  return Boolean(data?.password_hash && typeof data.password_hash === 'string' && !/^\$2[aby]\$/.test(data.password_hash));
};

const authenticateUser = async (usernameOrEmail, password) => {
  const term = String(usernameOrEmail).toLowerCase().trim();
  const rows = await repo.getAll('users');
  const row = rows.find((r) => {
    const d = r.data || r;
    return (d.username === term || d.email === term);
  });

  if (row) {
    const d = row.data || row;
    if (!isSupabaseMirrorRow(row)) {
      if (!d.is_active) return null;
      const match = await bcrypt.compare(password, d.password_hash);
      if (!match) return null;
      return {
        id: row.id,
        username: d.username,
        email: d.email,
        role: d.role,
        permissions: JSON.parse(d.permissions || '[]'),
      };
    }
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('placeholder')) {
    return null;
  }

  try {
    const { data } = await axios.post(
      `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`,
      { email: term, password },
      {
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        timeout: 8000,
      }
    );
    if (!data?.user?.id) return null;
    const meta = data.user.user_metadata || {};
    const staff = {
      id: data.user.id,
      username: data.user.email || data.user.id,
      email: data.user.email || null,
      role: meta.role || 'Admin',
      permissions: Array.isArray(meta.permissions) ? meta.permissions : [],
      is_super_admin: meta.is_super_admin === true,
    };
    await upsertLocalStaffUser(staff);
    return staff;
  } catch (err) {
    return null;
  }
};

const getUserById = async (id) => {
  const row = await repo.getById('users', id);
  if (!row) return null;
  const d = row.data || row;
  return {
    ...row,
    ...d,
    permissions: JSON.parse(d.permissions || '[]'),
  };
};

module.exports = { ensureAuthSchema, registerUser, authenticateUser, getUserById };
