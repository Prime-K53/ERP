const { sendEmail } = require('./emailService.cjs');
const repo = require('./supabaseRepository.cjs');
const crypto = require('crypto');

const requestVerification = async ({ email, purpose = 'email_verification' }) => {
  const id = crypto.randomUUID();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const record = {
    id,
    data: {
      email,
      code,
      purpose,
      expires_at: expiresAt,
      verified: 0,
    },
  };
  await repo.upsert('email_verifications', record);

  await sendEmail({
    to: email,
    subject: 'Verify your email — Prime ERP',
    text: `Your verification code is: ${code}\n\nThis code expires in 30 minutes.\n\n— Prime ERP System`,
    html: `<div style="font-family:system-ui;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">Verify your email</h2>
      <p style="color:#475569;margin:0 0 24px;">Use the code below to verify your email address:</p>
      <div style="background:#f1f5f9;padding:16px 24px;border-radius:8px;text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;color:#0f172a;">${code}</div>
      <p style="color:#94a8b8;font-size:13px;margin:16px 0 0;">This code expires in 30 minutes.</p>
    </div>`,
  });
  return { success: true, code, expiresAt };
};

const verifyCode = async ({ email, code }) => {
  const rows = await repo.getAll('email_verifications', {
    'data->>email': `eq.${email}`,
    'data->>code': `eq.${code}`,
    'data->>purpose': 'eq.email_verification',
    'data->>verified': 'eq.0',
  });
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const row = rows[0] || null;
  if (!row) return { success: false, error: 'Invalid or expired code' };

  const oldData = row.data || row;
  await repo.upsert('email_verifications', {
    ...row,
    data: {
      ...oldData,
      verified: 1,
      verified_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });
  return { success: true };
};

const findLatestPending = async (email) => {
  const rows = await repo.getAll('email_verifications', {
    'data->>email': `eq.${email}`,
    'data->>verified': 'eq.0',
  });
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return rows[0] || null;
};

const sendVerificationEmail = async (email) => requestVerification({ email });

module.exports = {
  requestVerification,
  verifyCode,
  findLatestPending,
  sendVerificationEmail,
};
