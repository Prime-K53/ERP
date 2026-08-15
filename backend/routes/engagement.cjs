const express = require('express')
const router = express.Router()
const sq = require('../services/supabaseQuery.cjs')
const repo = require('../services/supabaseRepository.cjs')

function parseJson(value) {
  if (!value || value === 'null' || value === 'undefined') return null
  try { return JSON.parse(value) } catch { return value }
}

async function withDb(query, params = []) {
  return sq.getAll(query, params)
}

async function getOne(query, params = []) {
  return sq.getOne(query, params)
}

async function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    sq.run(query, params, (err, result) => {
      if (err) reject(err)
      else resolve(result || { id: null, changes: 0 })
    })
  })
}

// ─── Membership Tiers ───
router.get('/tiers', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_membership_tiers', [])
    res.json(rows.map(r => ({ ...r, benefits: parseJson(r.benefits_json) })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/tiers', async (req, res) => {
  try {
    const body = req.body
    const id = body.id || `T${Date.now()}`
    const record = {
      id,
      name: body.name,
      level: body.level || 0,
      description: body.description || null,
      color: body.color || null,
      icon: body.icon || null,
      min_spend: body.minSpend || 0,
      entry_spend: body.entrySpend || 0,
      min_frequency: body.minFrequency || 0,
      min_clv: body.minClv || 0,
      point_multiplier: body.pointMultiplier || 1,
      cashback_rate: body.cashbackRate || 0,
      priority_support: body.prioritySupport ? 1 : 0,
      exclusive_pricing: body.exclusivePricing ? 1 : 0,
      exclusive_campaigns: body.exclusiveCampaigns ? 1 : 0,
      free_shipping: body.freeShipping ? 1 : 0,
      birthday_reward: body.birthdayReward || 0,
      annual_reward: body.annualReward || 0,
      benefits_json: body.benefits ? JSON.stringify(body.benefits) : null,
      status: body.status || 'active',
    }
    await repo.upsert('engagement_membership_tiers', record)
    res.status(201).json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/tiers/:id', async (req, res) => {
  try {
    const body = req.body
    const old = await repo.getById('engagement_membership_tiers', req.params.id)
    if (!old) return res.status(404).json({ error: 'Not found' })
    const updates = { ...old }
    const fieldMap = {
      name: 'name', level: 'level', description: 'description', color: 'color',
      icon: 'icon', minSpend: 'min_spend', entrySpend: 'entry_spend',
      minFrequency: 'min_frequency', minClv: 'min_clv',
      pointMultiplier: 'point_multiplier', cashbackRate: 'cashback_rate',
      prioritySupport: 'priority_support', exclusivePricing: 'exclusive_pricing',
      exclusiveCampaigns: 'exclusive_campaigns', freeShipping: 'free_shipping',
      birthdayReward: 'birthday_reward', annualReward: 'annual_reward',
      benefits: 'benefits_json', status: 'status',
    }
    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) {
        updates[dbField] = key === 'benefits' ? JSON.stringify(body[key]) : (key === 'prioritySupport' || key === 'exclusivePricing' || key === 'exclusiveCampaigns' || key === 'freeShipping' ? (body[key] ? 1 : 0) : body[key])
      }
    }
    updates.updated_at = new Date().toISOString()
    await repo.upsert('engagement_membership_tiers', updates)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/tiers/:id', async (req, res) => {
  try {
    await repo.softDelete('engagement_membership_tiers', req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Gift Cards ───
router.get('/gift-cards', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_gift_cards', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/gift-cards', async (req, res) => {
  try {
    const body = req.body
    const id = body.id || `GC${Date.now()}`
    const record = {
      id,
      code: body.code,
      pin: body.pin || null,
      customer_id: body.customerId || null,
      issuer_id: body.issuerId || null,
      initial_balance: body.initialBalance || 0,
      current_balance: body.initialBalance || 0,
      type: body.type || 'digital',
      expires_at: body.expiresAt || null,
      rechargeable: body.rechargeable ? 1 : 0,
      transferable: body.transferable ? 1 : 0,
      design_color: body.designColor || null,
      gift_message: body.giftMessage || null,
      purchased_with: body.purchasedWith || null,
    }
    await repo.upsert('engagement_gift_cards', record)
    res.status(201).json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/gift-cards/:id', async (req, res) => {
  try {
    const body = req.body
    const old = await repo.getById('engagement_gift_cards', req.params.id)
    if (!old) return res.status(404).json({ error: 'Not found' })
    const updates = { ...old, ...body }
    updates.updated_at = new Date().toISOString()
    await repo.upsert('engagement_gift_cards', updates)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Promotions ───
router.get('/promotions', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_promotions', [])
    res.json(rows.map(r => ({ ...r, bundleItems: parseJson(r.bundle_items_json), customerIds: parseJson(r.customer_ids_json), tierIds: parseJson(r.tier_ids_json) })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/promotions', async (req, res) => {
  try {
    const body = req.body
    const id = body.id || `PROMO${Date.now()}`
    const record = {
      id,
      name: body.name,
      description: body.description || null,
      type: body.type,
      value: body.value || 0,
      category_id: body.categoryId || null,
      brand: body.brand || null,
      bundle_items_json: body.bundleItems ? JSON.stringify(body.bundleItems) : null,
      buy_x_qty: body.buyXQty || 0,
      get_y_qty: body.getYQty || 0,
      get_y_discount: body.getYDiscount || 0,
      min_purchase: body.minPurchase || 0,
      max_discount: body.maxDiscount || 0,
      max_uses: body.maxUses || 0,
      customer_ids_json: body.customerIds ? JSON.stringify(body.customerIds) : null,
      tier_ids_json: body.tierIds ? JSON.stringify(body.tierIds) : null,
      campaign_id: body.campaignId || null,
      stacking_rule: body.stackingRule || 'best_only',
      priority: body.priority || 0,
      starts_at: body.startsAt || new Date().toISOString(),
      expires_at: body.expiresAt || null,
      status: body.status || 'active',
      created_by: body.createdBy || req.user?.id || 'system',
    }
    await repo.upsert('engagement_promotions', record)
    res.status(201).json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/promotions/:id', async (req, res) => {
  try {
    const body = req.body
    const old = await repo.getById('engagement_promotions', req.params.id)
    if (!old) return res.status(404).json({ error: 'Not found' })
    const updates = { ...old, ...body }
    updates.updated_at = new Date().toISOString()
    await repo.upsert('engagement_promotions', updates)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/promotions/:id', async (req, res) => {
  try {
    await repo.softDelete('engagement_promotions', req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Cashback ───
router.get('/cashback', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_cashback', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/cashback/:id/approve', async (req, res) => {
  try {
    const entry = await getOne('SELECT * FROM engagement_cashback WHERE id=?', [req.params.id])
    if (!entry) return res.status(404).json({ error: 'Cashback entry not found' })
    const old = await repo.getById('engagement_cashback', req.params.id)
    if (old) {
      await repo.upsert('engagement_cashback', { ...old, status: 'approved', approved_at: new Date().toISOString(), approved_by: req.user?.id || 'system', updated_at: new Date().toISOString() })
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/cashback/:id/pay', async (req, res) => {
  try {
    const body = req.body
    const old = await repo.getById('engagement_cashback', req.params.id)
    if (!old) return res.status(404).json({ error: 'Not found' })
    await repo.upsert('engagement_cashback', { ...old, status: 'paid', wallet_tx_id: body.walletTxId || null, updated_at: new Date().toISOString() })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Points ───
router.get('/points', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_points ORDER BY created_at DESC', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/points', async (req, res) => {
  try {
    const body = req.body
    const id = body.id || `PT-${Date.now()}`
    const record = {
      id,
      customer_id: body.customerId,
      points: body.points || 0,
      type: body.type || 'earned',
      description: body.description || null,
      reference_id: body.referenceId || null,
      reference_type: body.referenceType || null,
      expires_at: body.expiresAt || null,
    }
    await repo.upsert('engagement_points', record)
    res.status(201).json({ success: true, id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Point Balances ───
router.get('/point-balances', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_point_balances', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Customer Tiers ───
router.get('/customer-tiers', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_customer_tiers', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Affiliates ───
router.get('/affiliates', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_affiliates ORDER BY created_at DESC', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/affiliates', async (req, res) => {
  try {
    const body = req.body
    const id = body.id || `AFF-${Date.now()}`
    const record = { id, ...body }
    await repo.upsert('engagement_affiliates', record)
    res.status(201).json({ success: true, id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/affiliates/:id', async (req, res) => {
  try {
    const old = await repo.getById('engagement_affiliates', req.params.id)
    if (!old) return res.status(404).json({ error: 'Not found' })
    await repo.upsert('engagement_affiliates', { ...old, ...req.body, updated_at: new Date().toISOString() })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/affiliates/:id', async (req, res) => {
  try {
    await repo.softDelete('engagement_affiliates', req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Affiliate Commissions ───
router.get('/affiliate-commissions', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_affiliate_commissions ORDER BY created_at DESC', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Rewards ───
router.get('/rewards', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_rewards ORDER BY created_at DESC', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Timeline ───
router.get('/timeline', async (req, res) => {
  try {
    const { customerId } = req.query
    let rows = await withDb('SELECT * FROM engagement_timeline', [])
    if (customerId) rows = rows.filter(r => r.customer_id === customerId)
    rows.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Audit ───
router.get('/audit', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_audit ORDER BY created_at DESC', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Analytics ───
router.get('/analytics', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_analytics ORDER BY period DESC', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Settings ───
router.get('/settings', async (req, res) => {
  try {
    const rows = await withDb('SELECT * FROM engagement_settings', [])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/settings', async (req, res) => {
  try {
    const body = req.body
    const old = await withDb('SELECT * FROM engagement_settings WHERE id = ?', [body.id])
    const record = old.length > 0 ? { ...old[0], ...body } : { id: body.id, ...body }
    await repo.upsert('engagement_settings', record)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
