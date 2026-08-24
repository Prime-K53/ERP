const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { totp, authenticator } = require('otplib');
const axios = require('axios');
const repo = require('./supabaseRepository.cjs');

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '30m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function genId(prefix = 'pusr') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function generateEventTicket(userOrCustomerId, purpose = 'portal') {
  const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET || 'prime-erp-portal-secret';
  const user = typeof userOrCustomerId === 'object' && userOrCustomerId !== null
    ? userOrCustomerId
    : { customer_id: userOrCustomerId };
  return jwt.sign(
    {
      id: user.id || user.portal_user_id || null,
      customer_id: user.customer_id,
      email: user.email || null,
      role: 'portal_customer',
      purpose,
      sse: true
    },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

const ensurePortalSchema = async () => {
  if (!SUPABASE_URL || !SECRET_KEY || SUPABASE_URL.includes('placeholder')) {
    console.warn('[PortalAuth] Supabase not configured — skipping portal schema verification.');
    return;
  }

  const headers = {
    apikey: SECRET_KEY,
    Authorization: `Bearer ${SECRET_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const tables = ['portal_users', 'portal_sessions', 'portal_password_resets', 'portal_login_history'];
  for (const table of tables) {
    try {
      await axios.get(`${SUPABASE_URL}/rest/v1/${table}`, {
        headers,
        params: { limit: 1 },
        timeout: 5000,
      });
    } catch (err) {
      const status = err.response && err.response.status;
      if (status === 404 || status === 400) {
        console.warn(`[PortalAuth] Portal table "${table}" is missing in Supabase. Run the portal tables SQL migration in the Supabase SQL Editor.`);
      } else {
        console.warn(`[PortalAuth] Could not verify portal table "${table}":`, err.message);
      }
    }
  }
};

async function syncCustomerPortalData(customerId, updates) {
  if (!repo.isConfigured()) return;
  try {
    const customer = await repo.getById('customers', customerId);
    if (!customer) return;
    const { id, updated_at, version, ...data } = customer;
    const merged = { ...data, ...updates };
    await repo.entities.customers.upsert({ id, ...merged });
  } catch (err) {
    console.warn('[PortalAuth] Customer portal sync failed:', err.message);
  }
}

const registerPortalUser = async ({ id, customer_id, email, password, full_name, phone, status = 'active' }) => {
  const portalUserId = id || genId('pusr');
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const normalizedEmail = email.toLowerCase().trim();
  try {
    await repo.portalEntities.portal_users.upsert({
      id: portalUserId,
      customer_id,
      email: normalizedEmail,
      password_hash,
      full_name: full_name || null,
      phone: phone || null,
      status,
    });
  } catch (err) {
    if (err.message && err.message.includes('unique')) {
      throw new Error('Email already registered');
    }
    throw err;
  }
  if (repo.isConfigured()) {
    syncCustomerPortalData(customer_id, { portalEmail: normalizedEmail, portalPasswordHash: password_hash, portalStatus: status }).catch(() => {});
  }

  // ── Referral linkage for immediately-active users ──────────────────
  if (status === 'active') {
    try {
      const ReferralService = require('./referralService.cjs');
      const referralSvc = new ReferralService();
      const customer = await repo.getById('customers', customer_id);
      if (customer) {
        await referralSvc.linkCustomerToReferral({
          customerId: customer_id,
          email: customer.email || normalizedEmail,
          phone: customer.phone || phone,
        });
      }
    } catch (referralErr) {
      console.error('[PortalAuth] Referral linkage failed (non-critical):', referralErr.message);
    }
  }

  return { id: portalUserId, customer_id, email, full_name, phone, status };
};

const authenticatePortalUser = async (email, password) => {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const row = await repo.portalEntities.portal_users.getByEmail(normalizedEmail);
  if (!row) {
    return authenticatePortalUserFromSupabase(normalizedEmail, password);
  }
  if (row.status !== 'active') return null;
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return null;
  repo.portalEntities.portal_users.update(row.id, { last_login_at: new Date().toISOString() }).catch(() => {});
  return {
    id: row.id,
    customer_id: row.customer_id,
    email: row.email,
    full_name: row.full_name,
    phone: row.phone
  };
};

const authenticatePortalUserFromSupabase = async (email, password) => {
  if (!repo.isConfigured()) {
    console.warn(`[PortalAuth] Supabase fallback DISABLED for ${email}: repo not configured`);
    return null;
  }
  try {
    const rows = await repo.getAll('customers', { 'data->>portalEmail': `eq.${email}`, limit: 1 });
    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn(`[PortalAuth] Supabase fallback: no customer found for ${email}`);
      return null;
    }
    const row = rows[0];
    const info = { ...row };
    delete info.id;
    delete info.updated_at;
    delete info.version;
    const hash = info.portalPasswordHash;
    if (!hash || !info.portalUserId) {
      console.warn(`[PortalAuth] Supabase fallback: no portal mirror for ${email} (customer ${row.id})`);
      return null;
    }
    if (info.portalStatus && info.portalStatus !== 'active') {
      console.warn(`[PortalAuth] Supabase fallback: account ${email} is not active (${info.portalStatus})`);
      return null;
    }
    const match = await bcrypt.compare(password, hash);
    if (!match) {
      console.warn(`[PortalAuth] Supabase fallback: password mismatch for ${email} (customer ${row.id})`);
      return null;
    }
    console.log(`[PortalAuth] Supabase fallback: authenticated ${email} (customer ${row.id})`);
    await repo.portalEntities.portal_users.upsert({
      id: info.portalUserId,
      customer_id: row.id,
      email,
      password_hash: hash,
      full_name: info.name || '',
      phone: info.phone || '',
      status: 'active',
    });
    return {
      id: info.portalUserId,
      customer_id: row.id,
      email,
      full_name: info.name || '',
      phone: info.phone || ''
    };
  } catch (err) {
    console.warn(`[PortalAuth] Supabase fallback ERROR for ${email}: ${err.message}`);
    return null;
  }
};

const finishPortalLogin = async (existing, customer) => {
  if (!existing) return null;
  if (existing.status !== 'active') return null;
  await repo.portalEntities.portal_users.update(existing.id, { last_login_at: new Date().toISOString() });
  return {
    id: existing.id,
    customer_id: existing.customer_id,
    email: existing.email || customer.email || '',
    full_name: existing.full_name || customer.name,
    phone: existing.phone || customer.phone || ''
  };
};

const resolvePortalUserForCustomer = async (customer, fullName) => {
  if (String(customer.name || '').trim().toLowerCase() !== String(fullName || '').trim().toLowerCase()) {
    return null;
  }
  const customerId = customer.customer_id || customer.id;
  const existing = await repo.portalEntities.portal_users.getByCustomerId(customerId);
  return finishPortalLogin(existing, customer);
};

const loginWithCustomerId = async (customerId, fullName) => {
  const customer = await repo.getById('customers', customerId);
  if (!customer) return null;
  return resolvePortalUserForCustomer(customer, fullName);
};

const findCustomerInSupabase = async (customerId) => {
  const row = await repo.getById('customers', customerId);
  if (!row) return null;
  const { id, updated_at, version, ...domain } = row;
  return {
    id,
    name: domain.name || '',
    email: domain.email || '',
    phone: domain.phone || '',
    address: domain.address || '',
    city: domain.city || '',
    state: domain.state || '',
    zip: domain.zip || '',
    country: domain.country || '',
    balance: domain.balance || 0,
    walletBalance: domain.walletBalance || 0,
    creditLimit: domain.creditLimit || 0,
    outstandingBalance: domain.outstandingBalance || 0,
    status: domain.status || '',
  };
};

const findCustomerByPortalUserId = async (portalUserId) => {
  const rows = await repo.getAll('customers', { 'data->>portalUserId': `eq.${portalUserId}`, limit: 1 });
  if (!rows || rows.length === 0) return null;
  const { id, ...data } = rows[0];
  return { id, data };
};

const getPortalUserById = async (id) => {
  return repo.portalEntities.portal_users.getById(id);
};

const getPortalUserByCustomerId = async (customerId) => {
  return repo.portalEntities.portal_users.getByCustomerId(customerId);
};

const getPortalUserByEmail = async (email) => {
  return repo.portalEntities.portal_users.getByEmail(String(email || '').toLowerCase().trim());
};

const createPasswordReset = async (portalUserId, code, expiresAt) => {
  const id = genId('prst');
  await repo.portalEntities.portal_password_resets.upsert({
    id,
    portal_user_id: portalUserId,
    code,
    expires_at: expiresAt,
  });
  return { id, code };
};

const findValidPasswordReset = async (portalUserId, code) => {
  const rows = await repo.getAll('portal_password_resets', {
    'portal_user_id': `eq.${portalUserId}`,
    'code': `eq.${code}`,
    'used_at': 'is.null',
    'expires_at': `gt.${new Date().toISOString()}`,
    order: 'created_at.desc',
    limit: 1
  });
  return rows?.[0] || null;
};

const markPasswordResetUsed = async (resetId) => {
  await repo.portalEntities.portal_password_resets.update(resetId, { used_at: new Date().toISOString() });
};

const revokeUserPasswordResets = async (portalUserId) => {
  const resets = await repo.getAll('portal_password_resets', {
    'portal_user_id': `eq.${portalUserId}`,
    'used_at': 'is.null'
  });
  const now = new Date().toISOString();
  await Promise.all(resets.map(r => repo.portalEntities.portal_password_resets.update(r.id, { used_at: now })));
};

const createInviteCode = async (portalUserId) => {
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await revokeUserPasswordResets(portalUserId);
  await createPasswordReset(portalUserId, code, expiresAt);
  return { code, expires_at: expiresAt };
};

const setPortalUserStatus = async (id, status) => {
  const user = await repo.portalEntities.portal_users.getById(id);
  if (!user) return;
  await repo.portalEntities.portal_users.update(id, { status, updated_at: new Date().toISOString() });
  syncCustomerPortalData(user.customer_id, { portalStatus: status }).catch(() => {});
};

const activatePortalUser = async ({ customer_id, code, password }) => {
  const user = await repo.portalEntities.portal_users.getByCustomerId(customer_id);
  if (!user) {
    const err = new Error('Invalid customer ID or invite code');
    err.code = 'INVALID_INVITE';
    throw err;
  }
  if (user.status !== 'invited') {
    const err = new Error('This account has no pending invite. Please sign in or use forgot password.');
    err.code = 'NOT_INVITED';
    throw err;
  }
  const reset = await findValidPasswordReset(user.id, String(code).trim());
  if (!reset) {
    const err = new Error('Invalid or expired invite code');
    err.code = 'INVALID_CODE';
    throw err;
  }
  await updatePassword(user.id, password);
  await markPasswordResetUsed(reset.id);
  await setPortalUserStatus(user.id, 'active');
  await revokeAllSessions(user.id);

  // ── Referral linkage: link any pending prospective referral ────────
  // When a new customer activates their portal account, check if there is
  // a pending referral whose email/phone matches this customer. If so,
  // link the referral to this customer.
  try {
    const ReferralService = require('./referralService.cjs');
    const referralSvc = new ReferralService();
    const customer = await repo.getById('customers', customer_id);
    if (customer) {
      await referralSvc.linkCustomerToReferral({
        customerId: customer_id,
        email: customer.email || user.email,
        phone: customer.phone || user.phone,
      });
    }
  } catch (referralErr) {
    // Referral linkage failure must not break customer activation.
    console.error('[PortalAuth] Referral linkage failed (non-critical):', referralErr.message);
  }

  return getPortalUserById(user.id);
};

const updatePortalUser = async (id, fields) => {
  const allowed = ['full_name', 'phone', 'email', 'address', 'city', 'state', 'zip', 'country'];
  const updates = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates[key] = key === 'email' ? String(fields[key]).toLowerCase().trim() : fields[key];
    }
  }
  if (Object.keys(updates).length === 0) return;
  updates.updated_at = new Date().toISOString();
  await repo.portalEntities.portal_users.update(id, updates);
};

const changePassword = async (id, currentPassword, newPassword) => {
  const user = await repo.portalEntities.portal_users.getById(id);
  if (!user) throw new Error('User not found');
  if (user.password_hash) {
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) throw new Error('Current password is incorrect');
  }
  const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await repo.portalEntities.portal_users.update(id, { password_hash, updated_at: new Date().toISOString() });
};

const updatePassword = async (id, newPassword) => {
  const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const user = await repo.portalEntities.portal_users.getById(id);
  if (!user) throw new Error('User not found');
  await repo.portalEntities.portal_users.update(id, { password_hash, updated_at: new Date().toISOString() });
  syncCustomerPortalData(user.customer_id, { email: user.email, portalPasswordHash: password_hash }).catch(() => {});
};

const createSession = async (portalUserId, refreshToken, ipAddress, userAgent) => {
  const id = genId('pses');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await repo.portalEntities.portal_sessions.upsert({
    id,
    portal_user_id: portalUserId,
    refresh_token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  });
  return { id, expiresAt };
};

const findSessionByRefreshToken = async (refreshToken) => {
  const tokenHash = hashToken(refreshToken);
  const rows = await repo.portalEntities.portal_sessions.getAll({ 'refresh_token_hash': `eq.${tokenHash}` });
  if (!rows || rows.length === 0) return null;
  const now = new Date();
  const row = rows.find(r => !r.revoked_at && new Date(r.expires_at) > now);
  return row || null;
};

const revokeSession = async (sessionId) => {
  await repo.portalEntities.portal_sessions.update(sessionId, { revoked_at: new Date().toISOString() });
};

const revokeAllSessions = async (portalUserId) => {
  const sessions = await repo.portalEntities.portal_sessions.getAll({
    'portal_user_id': `eq.${portalUserId}`,
    'revoked_at': 'is.null'
  });
  const now = new Date().toISOString();
  await Promise.all(sessions.map(s => repo.portalEntities.portal_sessions.update(s.id, { revoked_at: now })));
};

const revokeSessionById = async (sessionId, portalUserId) => {
  const session = await repo.portalEntities.portal_sessions.getById(sessionId);
  if (!session || session.portal_user_id !== portalUserId) return false;
  await repo.portalEntities.portal_sessions.update(sessionId, { revoked_at: new Date().toISOString() });
  return true;
};

const recordLoginHistory = async (portalUserId, ip, userAgent) => {
  await repo.portalEntities.portal_login_history.upsert({
    id: genId('plog'),
    portal_user_id: portalUserId,
    ip_address: ip || null,
    user_agent: userAgent || null,
  });
};

const listSessions = async (portalUserId) => {
  const now = new Date().toISOString();
  return repo.portalEntities.portal_sessions.getAll({
    'portal_user_id': `eq.${portalUserId}`,
    'revoked_at': 'is.null',
    'expires_at': `gt.${now}`,
    order: 'created_at.desc'
  });
};

const TOTP_WINDOW = 1;

const generateTwoFactorSecret = (portalUserId, email, serviceName) => {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, serviceName || 'Prime ERP', email);
  return { secret, otpauth };
};

const saveTwoFactorSecret = async (portalUserId, secret) => {
  await repo.portalEntities.portal_users.update(portalUserId, { two_factor_secret: secret, updated_at: new Date().toISOString() });
};

const verifyTwoFactorToken = async (secret, token) => {
  try {
    return authenticator.check(token, secret, TOTP_WINDOW);
  } catch {
    return false;
  }
};

const enableTwoFactor = async (portalUserId, token) => {
  const user = await repo.portalEntities.portal_users.getById(portalUserId);
  if (!user || !user.two_factor_secret) {
    const err = new Error('No 2FA secret found');
    err.code = 'NO_SECRET';
    throw err;
  }
  if (!verifyTwoFactorToken(user.two_factor_secret, token)) {
    const err = new Error('Invalid verification code');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  await repo.portalEntities.portal_users.update(portalUserId, { two_factor_enabled: true, two_factor_confirmed: true, updated_at: new Date().toISOString() });
};

const disableTwoFactor = async (portalUserId, token) => {
  const user = await repo.portalEntities.portal_users.getById(portalUserId);
  if (!user || user.two_factor_enabled !== true) {
    const err = new Error('Two-factor authentication is not enabled');
    err.code = 'NOT_ENABLED';
    throw err;
  }
  if (user.two_factor_secret && !verifyTwoFactorToken(user.two_factor_secret, token)) {
    const err = new Error('Invalid verification code');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  await repo.portalEntities.portal_users.update(portalUserId, { two_factor_enabled: false, two_factor_secret: null, two_factor_confirmed: false, updated_at: new Date().toISOString() });
};

const isTwoFactorEnabled = async (portalUserId) => {
  const user = await repo.portalEntities.portal_users.getById(portalUserId);
  return user && user.two_factor_enabled === true;
};

const getTwoFactorStatus = async (portalUserId) => {
  const user = await repo.portalEntities.portal_users.getById(portalUserId);
  return {
    enabled: user?.two_factor_enabled === true,
    confirmed: user?.two_factor_confirmed === true,
  };
};

const getTwoFactorSecret = async (portalUserId) => {
  const user = await repo.portalEntities.portal_users.getById(portalUserId);
  return user?.two_factor_secret || null;
};

module.exports = {
  ensurePortalSchema,
  registerPortalUser,
  authenticatePortalUser,
  loginWithCustomerId,
  findCustomerInSupabase,
  findCustomerByPortalUserId,
  getPortalUserById,
  getPortalUserByCustomerId,
  getPortalUserByEmail,
  createPasswordReset,
  findValidPasswordReset,
  markPasswordResetUsed,
  revokeUserPasswordResets,
  updatePortalUser,
  changePassword,
  updatePassword,
  createInviteCode,
  setPortalUserStatus,
  activatePortalUser,
  createSession,
  findSessionByRefreshToken,
  revokeSession,
  revokeAllSessions,
  revokeSessionById,
  recordLoginHistory,
  listSessions,
  generateTwoFactorSecret,
  saveTwoFactorSecret,
  verifyTwoFactorToken,
  enableTwoFactor,
  disableTwoFactor,
  isTwoFactorEnabled,
  getTwoFactorStatus,
  getTwoFactorSecret,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY_DAYS,
  generateEventTicket
};
