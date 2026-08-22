const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const portalAuthService = require('../services/portalAuthService.cjs');
const { generatePortalToken, verifyPortalToken } = require('../middleware/portalAuth.cjs');

// In-memory store for pending 2FA verifications (keyed by a temporary token)
const pendingTwoFactor = new Map();

function issuePendingTwoFactor(user) {
  const token = crypto.randomBytes(32).toString('hex');
  pendingTwoFactor.set(token, { user, createdAt: Date.now() });
  setTimeout(() => pendingTwoFactor.delete(token), 5 * 60 * 1000);
  return token;
}

router.post('/login', async (req, res) => {
  try {
    const { customer_id, full_name, two_factor_code } = req.body || {};
    if (!customer_id || !full_name) {
      return res.status(400).json({ error: 'Customer ID and full name are required' });
    }
    if (typeof customer_id !== 'string' || typeof full_name !== 'string') {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Customer ID and full name do not match our records' });
    }
    const user = await portalAuthService.loginWithCustomerId(customer_id, full_name);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Customer ID and full name do not match our records' });
    }

    const twoFactorEnabled = await portalAuthService.isTwoFactorEnabled(user.id);
    if (twoFactorEnabled) {
      if (!two_factor_code) {
        const pendingToken = issuePendingTwoFactor(user);
        return res.json({ requires_two_factor: true, pending_token: pendingToken, user: { id: user.id, email: user.email } });
      }
      const secret = await portalAuthService.getTwoFactorSecret(user.id);
      const isValid = await portalAuthService.verifyTwoFactorToken(secret, two_factor_code);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid verification code' });
      }
    }
    const token = generatePortalToken(user);
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'];
    const session = await portalAuthService.createSession(user.id, refreshToken, ip, ua);
    portalAuthService.recordLoginHistory(user.id, ip, ua).catch(() => {});
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        customer_id: user.customer_id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone
      },
      access_token: token,
      refresh_token: refreshToken,
      expires_in: '30m'
    });
  } catch (err) {
    console.error('[PortalAuth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/login-password', async (req, res) => {
  try {
    const { email, password, two_factor_code } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Email and password do not match our records' });
    }
    const user = await portalAuthService.authenticatePortalUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Email and password do not match our records' });
    }

    const twoFactorEnabled = await portalAuthService.isTwoFactorEnabled(user.id);
    if (twoFactorEnabled) {
      if (!two_factor_code) {
        const pendingToken = issuePendingTwoFactor(user);
        return res.json({ requires_two_factor: true, pending_token: pendingToken, user: { id: user.id, email: user.email } });
      }
      const secret = await portalAuthService.getTwoFactorSecret(user.id);
      const isValid = await portalAuthService.verifyTwoFactorToken(secret, two_factor_code);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid verification code' });
      }
    }

    const token = generatePortalToken(user);
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'];
    const session = await portalAuthService.createSession(user.id, refreshToken, ip, ua);
    portalAuthService.recordLoginHistory(user.id, ip, ua).catch(() => {});
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        customer_id: user.customer_id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone
      },
      access_token: token,
      refresh_token: refreshToken,
      expires_in: '30m'
    });
  } catch (err) {
    console.error('[PortalAuth] Password login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body || {};
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    if (typeof refresh_token !== 'string') {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    const session = await portalAuthService.findSessionByRefreshToken(refresh_token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    await portalAuthService.revokeSession(session.id);
    const user = await portalAuthService.getPortalUserById(session.portal_user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const token = generatePortalToken(user);
    const newRefreshToken = crypto.randomBytes(48).toString('hex');
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'];
    await portalAuthService.createSession(user.id, newRefreshToken, ip, ua);
    res.json({
      access_token: token,
      refresh_token: newRefreshToken,
      expires_in: '30m'
    });
  } catch (err) {
    console.error('[PortalAuth] Refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await portalAuthService.getPortalUserByEmail(email);
    if (user && user.status === 'active') {
      const code = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await portalAuthService.revokeUserPasswordResets(user.id);
      await portalAuthService.createPasswordReset(user.id, code, expiresAt);

      const { sendEmail } = require('../services/emailService.cjs');
      try {
        await sendEmail({
          to: user.email,
          subject: 'Password reset code',
          text: `Your Prime ERP customer portal password reset code is ${code}. It expires in 30 minutes. If you did not request this, you can ignore this email.`,
          html: `<p>Your Prime ERP customer portal password reset code is:</p>
                 <h2 style="font-size:28px;letter-spacing:4px;">${code}</h2>
                 <p>It expires in 30 minutes. If you did not request this, you can ignore this email.</p>`
        });
      } catch (emailErr) {
        console.error('[PortalAuth] Reset email send failed:', emailErr.message);
        console.log('[PortalAuth] Dev fallback — reset code for', user.email, ':', code);
      }
    }
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[PortalAuth] Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.post('/activate', async (req, res) => {
  try {
    const { customer_id, code, password } = req.body;
    if (!customer_id || !code || !password) {
      return res.status(400).json({ error: 'Customer ID, invite code, and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await portalAuthService.activatePortalUser({
      customer_id,
      code,
      password
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired invite code' });
    const token = generatePortalToken(user);
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'];
    const session = await portalAuthService.createSession(user.id, refreshToken, ip, ua);
    portalAuthService.recordLoginHistory(user.id, ip, ua).catch(() => {});
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        customer_id: user.customer_id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone
      },
      access_token: token,
      refresh_token: refreshToken,
      expires_in: '30m'
    });
  } catch (err) {
    console.error('[PortalAuth] Activate error:', err);
    res.status(err.code === 'NOT_INVITED' ? 409 : 400).json({ error: err.message || 'Failed to activate account' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await portalAuthService.getPortalUserByEmail(email);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset code' });

    const reset = await portalAuthService.findValidPasswordReset(user.id, String(code).trim());
    if (!reset) return res.status(400).json({ error: 'Invalid or expired reset code' });

    await portalAuthService.updatePassword(user.id, password);
    await portalAuthService.markPasswordResetUsed(reset.id);
    await portalAuthService.revokeAllSessions(user.id);
    res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('[PortalAuth] Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.get('/me', verifyPortalToken, async (req, res) => {
  try {
    const user = await portalAuthService.getPortalUserById(req.portalUser.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('[PortalAuth] Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.post('/logout', verifyPortalToken, async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      const session = await portalAuthService.findSessionByRefreshToken(refresh_token);
      if (session) await portalAuthService.revokeSession(session.id);
    }
    await portalAuthService.revokeAllSessions(req.portalUser.id);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[PortalAuth] Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/sessions', verifyPortalToken, async (req, res) => {
  try {
    const sessions = await portalAuthService.listSessions(req.portalUser.id);
    res.json(sessions);
  } catch (err) {
    console.error('[PortalAuth] List sessions error:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.delete('/sessions/:sessionId', verifyPortalToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const success = await portalAuthService.revokeSessionById(sessionId, req.portalUser.id);
    if (!success) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Session revoked successfully' });
  } catch (err) {
    console.error('[PortalAuth] Revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ─── Two-Factor Authentication Routes ───

router.get('/two-factor/status', verifyPortalToken, async (req, res) => {
  try {
    const status = await portalAuthService.getTwoFactorStatus(req.portalUser.id);
    res.json(status);
  } catch (err) {
    console.error('[PortalAuth] 2FA status error:', err);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

router.post('/two-factor/setup', verifyPortalToken, async (req, res) => {
  try {
    const user = await portalAuthService.getPortalUserById(req.portalUser.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { secret, otpauth } = portalAuthService.generateTwoFactorSecret(
      user.id, user.email, 'Prime ERP Portal'
    );
    await portalAuthService.saveTwoFactorSecret(user.id, secret);
    res.json({ secret, otpauth_uri: otpauth });
  } catch (err) {
    console.error('[PortalAuth] 2FA setup error:', err);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

router.post('/two-factor/enable', verifyPortalToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Verification code is required' });
    await portalAuthService.enableTwoFactor(req.portalUser.id, String(code));
    // Revoke and recreate sessions to invalidate old tokens
    await portalAuthService.revokeAllSessions(req.portalUser.id);
    res.json({ message: 'Two-factor authentication enabled successfully' });
  } catch (err) {
    console.error('[PortalAuth] 2FA enable error:', err);
    res.status(err.code === 'INVALID_TOKEN' ? 401 : 400).json({ error: err.message });
  }
});

router.post('/two-factor/disable', verifyPortalToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Verification code is required' });
    await portalAuthService.disableTwoFactor(req.portalUser.id, String(code));
    await portalAuthService.revokeAllSessions(req.portalUser.id);
    res.json({ message: 'Two-factor authentication disabled successfully' });
  } catch (err) {
    console.error('[PortalAuth] 2FA disable error:', err);
    res.status(err.code === 'INVALID_TOKEN' ? 401 : err.code === 'NOT_ENABLED' ? 400 : 500).json({ error: err.message });
  }
});

module.exports = router;
