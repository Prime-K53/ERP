/*
 * One-off data fix: normalize the ERP customer portal emails to the
 * recommended `{name-word}@primeportal.com` pattern.
 *
 * Updates backend SQLite:
 *   - portal_users.email   (the address the customer uses to log into the portal)
 *   - customers.email      (the ERP customer row mirrored to the portal DB)
 *
 * Updates Supabase (if configured):
 *   - customers.data.portalEmail  (frontend portal display reads this from cloud)
 *
 * Run with the backend stopped (or the connection may contend on the SQLite
 * file):
 *   node scripts/fix-customer-emails.cjs
 */
require('dotenv').config();
const { getDbPath } = require('../runtimePaths.cjs');
const sqlite3 = require('sqlite3');
const axios = require('axios');

const FIX = {
  'CUST-0001': 'mtakataka@primeportal.com',
  'CUST-0002': 'msungo@primeportal.com',
  'CUST-0003': 'police@primeportal.com',
};

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('placeholder'));
if (SUPABASE_ENABLED) {
  console.log(`[FixEmails] Supabase enabled: ${SUPABASE_URL}`);
} else {
  console.log('[FixEmails] Supabase disabled or not configured — skipping cloud patch');
}

const dbPath = getDbPath();
console.log(`[FixEmails] Using database: ${dbPath}`);

const db = new sqlite3.Database(dbPath);
db.serialize(() => {
  db.run('PRAGMA busy_timeout = 10000');

  for (const [customerId, email] of Object.entries(FIX)) {
    db.run(
      `UPDATE portal_users SET email = ?, updated_at = datetime('now') WHERE customer_id = ?`,
      [email, customerId],
      function (err) {
        if (err) {
          console.error(`[FixEmails] portal_users ${customerId}:`, err.message);
        } else {
          console.log(`[FixEmails] portal_users customer ${customerId} -> ${email} (rows: ${this.changes})`);
        }
      }
    );
    db.run(
      `UPDATE customers SET email = ? WHERE id = ?`,
      [email, customerId],
      function (err) {
        if (err) {
          console.error(`[FixEmails] customers ${customerId}:`, err.message);
        } else {
          console.log(`[FixEmails] customers ${customerId} -> ${email} (rows: ${this.changes})`);
        }
      }
    );
  }
});

async function patchSupabasePortalEmail(customerId, email) {
  if (!SUPABASE_ENABLED) return;
  try {
    const base = `${SUPABASE_URL}/rest/v1/customers`;
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };
    const { data: rows } = await axios.get(base, {
      params: { id: `eq.${customerId}`, select: 'data' },
      headers,
      timeout: 10000,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[FixEmails] Supabase ${customerId}: no customer row found`);
      return;
    }
    const current = (rows[0].data && typeof rows[0].data === 'object') ? rows[0].data : {};
    const next = { ...current, portalEmail: email };
    await axios.patch(base, { data: next }, { params: { id: `eq.${customerId}` }, headers, timeout: 10000 });
    console.log(`[FixEmails] Supabase customers.data.portalEmail ${customerId} -> ${email}`);
  } catch (err) {
    console.error(`[FixEmails] Supabase ${customerId}:`, err.message);
  }
}

(async () => {
  for (const [customerId, email] of Object.entries(FIX)) {
    await patchSupabasePortalEmail(customerId, email);
  }
  db.close((err) => {
    if (err) console.error('[FixEmails] close error:', err.message);
    console.log('[FixEmails] done');
  });
})();