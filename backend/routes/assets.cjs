const express = require('express');
const router = express.Router();
const repo = require('../services/supabaseRepository.cjs');
const { sendSafeError } = require('../utils/errors.cjs');

router.get('/', async (req, res) => {
  try {
    const assets = await repo.getAll('assets');
    assets.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json(assets);
  } catch (err) {
    console.error('[Assets] List error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const asset = await repo.getById('assets', req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    res.json(asset);
  } catch (err) {
    console.error('[Assets] Get error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (!body.name || !body.asset_type) return res.status(400).json({ error: 'Name and asset_type are required' });
    const id = body.id || `AST-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const now = new Date().toISOString();
    const record = {
      id,
      name: body.name,
      asset_type: body.asset_type,
      serial_number: body.serial_number || null,
      model: body.model || null,
      manufacturer: body.manufacturer || null,
      purchase_date: body.purchase_date || null,
      purchase_cost: body.purchase_cost || 0,
      current_value: body.current_value || body.purchase_cost || 0,
      useful_life_years: body.useful_life_years || 5,
      status: body.status || 'active',
      location: body.location || null,
      assigned_to: body.assigned_to || null,
      notes: body.notes || null,
      warranty_expiry: body.warranty_expiry || null,
      created_at: now,
      updated_at: now,
    };
    await repo.upsert('assets', record);
    const asset = await repo.getById('assets', id);
    res.status(201).json(asset);
  } catch (err) {
    console.error('[Assets] Create error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await repo.getById('assets', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Asset not found' });
    const fields = ['name', 'asset_type', 'serial_number', 'model', 'manufacturer', 'purchase_date', 'purchase_cost', 'current_value', 'useful_life_years', 'status', 'location', 'assigned_to', 'notes', 'warranty_expiry', 'last_maintenance', 'next_maintenance'];
    const updates = { ...existing };
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    updates.updated_at = new Date().toISOString();
    await repo.upsert('assets', updates);
    const asset = await repo.getById('assets', req.params.id);
    res.json(asset);
  } catch (err) {
    console.error('[Assets] Update error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await repo.getById('assets', req.params.id);
    if (!existing) return res.status(404).json({ error: 'Asset not found' });
    await repo.softDelete('assets', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Assets] Delete error:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

module.exports = router;
