const express = require('express');
const router = express.Router();
const metaWhatsApp = require('../services/metaWhatsappService.cjs');
const repo = require('../services/supabaseRepository.cjs');

async function loadConfig() {
  const rows = await repo.getAll('settings', { 'data->>key': 'eq.meta_whatsapp_config' });
  if (!rows || rows.length === 0) return false;
  try {
    const config = JSON.parse(rows[0].value);
    metaWhatsApp.setConfig(config.phoneNumberId, config.accessToken);
    return true;
  } catch {
    return false;
  }
}

async function saveConfig(phoneNumberId, accessToken) {
  const rows = await repo.getAll('settings', { 'data->>key': 'eq.meta_whatsapp_config' });
  const value = JSON.stringify({ phoneNumberId, accessToken });
  if (rows.length > 0) {
    await repo.upsert('settings', { ...rows[0], value });
  } else {
    await repo.upsert('settings', { id: `setting-${Date.now()}`, key: 'meta_whatsapp_config', value });
  }
}

router.get('/status', async (req, res) => {
  await loadConfig();
  res.json(metaWhatsApp.getStatus());
});

router.post('/config', async (req, res) => {
  const { phoneNumberId, accessToken } = req.body;
  if (!phoneNumberId || !accessToken) {
    return res.status(400).json({ success: false, error: 'Phone Number ID and Access Token are required' });
  }
  try {
    metaWhatsApp.setConfig(phoneNumberId, accessToken);
    const valid = await metaWhatsApp.verifyCredentials();
    if (!valid) {
      return res.status(400).json({ success: false, error: 'Invalid credentials — could not verify with Meta' });
    }
    await saveConfig(phoneNumberId, accessToken);
    res.json({ success: true, status: metaWhatsApp.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    await loadConfig();
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ success: false, error: 'Missing "to" or "message" fields' });
    }
    const result = await metaWhatsApp.sendMessage(to, message);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/config', async (req, res) => {
  await loadConfig();
  res.json({
    configured: metaWhatsApp.configured,
    phoneNumberId: metaWhatsApp.phoneNumberId || null,
  });
});

module.exports = router;
