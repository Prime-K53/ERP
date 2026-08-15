const { randomUUID } = require('crypto');
const repo = require('./supabaseRepository.cjs');
const ReferralNotificationService = require('./referralNotificationService.cjs');
const portalLifecycleService = require('./portalLifecycleService.cjs');

class ReferralService {
  constructor() {
    this.notificationService = new ReferralNotificationService();
  }

  _run(sql, params = []) {
    const trimmed = String(sql || '').trim();
    return new Promise((resolve, reject) => {
      try {
        if (/INSERT\s+INTO/i.test(trimmed)) {
          const insertMatch = trimmed.match(/INSERT\s+INTO\s+(\w+)/i);
          const id = String(params[0] || `gen_${Date.now()}`);
          const record = { id };
          const colMatch = trimmed.match(/\(([^)]+)\)\s*VALUES\s*\(/i);
          if (colMatch) {
            const cols = colMatch[1].split(',').map(c => c.trim());
            for (let i = 1; i < Math.min(cols.length, params.length); i++) {
              record[cols[i]] = params[i];
            }
          }
          repo.upsert(insertMatch[1], record).then(() => resolve({ lastID: id, changes: 1 })).catch(reject);
        } else if (/UPDATE/i.test(trimmed)) {
          const updateMatch = trimmed.match(/UPDATE\s+(\w+)\s+SET/i);
          const id = String(params[params.length - 1]);
          repo.getById(updateMatch[1], id).then(row => {
            if (!row) return resolve({ changes: 0 });
            const updates = { ...row };
            const setMatch = trimmed.match(/SET\s+(.+?)\s+WHERE/is);
            if (setMatch) {
              const pairs = setMatch[1].split(',');
              for (let i = 0; i < Math.min(pairs.length, params.length - 1); i++) {
                const colMatch = pairs[i].match(/(\w+)\s*=\s*\?/);
                if (colMatch) updates[colMatch[1]] = params[i];
              }
            }
            return repo.upsert(updateMatch[1], updates);
          }).then(() => resolve({ changes: 1 })).catch(reject);
        } else if (/DELETE\s+FROM/i.test(trimmed)) {
          const deleteMatch = trimmed.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+id\s*=\s*\?/i);
          if (deleteMatch) {
            repo.softDelete(deleteMatch[1], String(params[0])).then(() => resolve({ changes: 1 })).catch(reject);
          } else {
            resolve({ changes: 0 });
          }
        } else if (/BEGIN\s+TRANSACTION/i.test(trimmed)) {
          resolve({ changes: 0 });
        } else if (/COMMIT/i.test(trimmed)) {
          resolve({ changes: 0 });
        } else if (/ROLLBACK/i.test(trimmed)) {
          resolve({ changes: 0 });
        } else {
          resolve({ changes: 0 });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  _get(sql, params = []) {
    const trimmed = String(sql || '').trim();
    const countMatch = trimmed.match(/SELECT\s+COUNT\s*\(\*\)\s+as\s+(\w+)\s+FROM\s+(\w+)/i);
    if (countMatch) {
      return repo.getAll(countMatch[2]).then(rows => ({ [countMatch[1]]: rows.length }));
    }
    const byIdMatch = trimmed.match(/FROM\s+(\w+)\s+WHERE\s+.*\bid\s*=\s*\?/i);
    if (byIdMatch && params.length > 0) {
      return repo.getById(byIdMatch[1], String(params[0]));
    }
    const byFieldMatch = trimmed.match(/FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i);
    if (byFieldMatch && params.length > 0) {
      return repo.getAll(byFieldMatch[1], { [`data->>${byFieldMatch[2]}`]: `eq.${params[0]}` }).then(rows => rows[0] || null);
    }
    const fromMatch = trimmed.match(/FROM\s+(\w+)/i);
    if (fromMatch) {
      return repo.getAll(fromMatch[1]).then(rows => rows[0] || null);
    }
    return Promise.resolve(null);
  }

  _all(sql, params = []) {
    const trimmed = String(sql || '').trim();
    const byFieldMatch = trimmed.match(/FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i);
    if (byFieldMatch && params.length > 0) {
      return repo.getAll(byFieldMatch[1], { [`data->>${byFieldMatch[2]}`]: `eq.${params[0]}` });
    }
    const fromMatch = trimmed.match(/FROM\s+(\w+)/i);
    if (fromMatch) {
      return repo.getAll(fromMatch[1]);
    }
    return Promise.resolve([]);
  }

  getPaginationParams(params) {
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 20));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    const check = (c) => this._get(
      'SELECT 1 FROM customer_referrals WHERE referral_code = ?',
      [c]
    ).then(r => !!r);

    const generate = () => {
      let result = '';
      for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    const tryGenerate = async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        code = generate();
        if (!(await check(code))) return code;
      }
      return generate();
    };

    return tryGenerate();
  }

  // ── Referral CRUD ──────────────────────────────────────────────

  async getAll(params) {
    const { page, limit, offset } = this.getPaginationParams(params);

    const conditions = ['1=1', 'r.deleted_at IS NULL'];
    const queryParams = [];

    if (params.status) {
      conditions.push('r.status = ?');
      queryParams.push(params.status);
    }

    if (params.search) {
      conditions.push('(r.customer_id LIKE ? OR r.referred_by_name LIKE ?)');
      const like = `%${params.search}%`;
      queryParams.push(like, like);
    }

    if (params.customer_id) {
      conditions.push('r.customer_id = ?');
      queryParams.push(params.customer_id);
    }

    if (params.referred_by_id) {
      conditions.push('r.referred_by_id = ?');
      queryParams.push(params.referred_by_id);
    }

    if (params.referral_code) {
      conditions.push('r.referral_code = ?');
      queryParams.push(params.referral_code);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this._get(
      `SELECT COUNT(*) as total FROM customer_referrals r WHERE ${whereClause}`,
      queryParams
    );
    const total = countRow.total;
    const totalPages = Math.ceil(total / limit);

    const sortBy = params.sort_by || 'created_at';
    const sortDir = params.sort_dir === 'asc' ? 'ASC' : 'DESC';
    const allowedSorts = ['created_at', 'updated_at', 'status', 'customer_id', 'referred_by_name'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

    const referrals = await this._all(
      `SELECT r.* FROM customer_referrals r WHERE ${whereClause} ORDER BY r.${safeSort} ${sortDir} LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    return { referrals, total, page, limit, totalPages };
  }

  async getById(id) {
    return this._get(
      'SELECT * FROM customer_referrals WHERE id = ?deleted_at IS NULL',
      [id]
    );
  }

  async delete(id) {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Referral not found');
    if (existing.deleted_at) throw new Error('Referral already deleted');

    await this._run(
      `UPDATE customer_referrals SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    await this.addTimelineEntry({
      referralId: id,
      eventType: 'referral_cancelled',
      title: 'Referral Deleted',
      description: 'Referral was soft-deleted'});

    return this.getById(id);
  }

  async register(data) {
    if (data.customer_id === data.referred_by_id) {
      throw new Error('Self-referral is not allowed');
    }

    return this._transaction(async () => {
      const id = randomUUID();
      const referralCode = data.referral_code || await this.generateReferralCode();

      await this._run(
      `INSERT INTO customer_referrals (id, customer_id, referred_by_id, referred_by_name, referral_code, status, pending_invoice_id, pending_invoice_amount, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, data.customer_id, data.referred_by_id, data.referred_by_name || null,
       referralCode, data.pending_invoice_id || null, data.pending_invoice_amount || null,
       data.notes || null]
    );

    await this.addTimelineEntry({
      referralId: id,
      eventType: 'created',
      title: 'Referral Created',
      description: `Referral created for customer ${data.customer_id}`,
      actorId: data.referred_by_id,
      actorName: data.referred_by_name});

    await this.addAuditLog({
      entityType: 'referral',
      entityId: id,
      action: 'created',
      actorId: data.referred_by_id || 'system',
      actorName: data.referred_by_name || 'System'});

      return this._get('SELECT * FROM customer_referrals WHERE id = ?', [id]);
    });
  }

  async update(id, data) {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Referral not found');

    const fields = [];
    const params = [];
    const allowed = ['notes', 'status', 'pending_invoice_id', 'pending_invoice_amount', 'converted_invoice_id'];

    for (const field of allowed) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field] === null ? null : data[field]);
      }
    }

    if (fields.length > 0) {
      params.push(id);
      await this._run(
        `UPDATE customer_referrals SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params
      );
    }

    return this.getById(id);
  }

  async cancel(id, actorId, actorName, reason) {
    return this._transaction(async () => {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Referral not found');
      if (existing.status !== 'active') throw new Error('Referral is not active');

      await this._run(
        `UPDATE customer_referrals SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      await this.addTimelineEntry({
        referralId: id,
        eventType: 'referral_cancelled',
        title: 'Referral Cancelled',
        description: reason || 'Referral was cancelled',
        actorId,
        actorName});

      await this.addAuditLog({
        entityType: 'referral',
        entityId: id,
        action: 'cancelled',
        actorId,
        actorName,
        reason,
        fieldName: 'status',
        oldValue: existing.status,
        newValue: 'cancelled'});

      return this.getById(id);
    });
  }

  async expire(id) {
    return this._transaction(async () => {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Referral not found');
      if (existing.status !== 'active') throw new Error('Referral is not active');

      await this._run(
        `UPDATE customer_referrals SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      await this.addTimelineEntry({
        referralId: id,
        eventType: 'referral_expired',
        title: 'Referral Expired',
        description: 'Referral has expired'});

      return this.getById(id);
    });
  }

  // ── Reward Management ──────────────────────────────────────────

  async getAllRewards(params) {
    const { page, limit, offset } = this.getPaginationParams(params);
    const conditions = ['1=1'];
    const queryParams = [];

    if (params.status) {
      conditions.push('r.status = ?');
      queryParams.push(params.status);
    }

    if (params.referral_id) {
      conditions.push('r.referral_id = ?');
      queryParams.push(params.referral_id);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this._get(
      `SELECT COUNT(*) as total FROM referral_rewards r WHERE ${whereClause}`,
      queryParams
    );
    const total = countRow.total;
    const totalPages = Math.ceil(total / limit);

    const rewards = await this._all(
      `SELECT r.* FROM referral_rewards r WHERE ${whereClause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    return { rewards, total, page, limit, totalPages };
  }

  async getPendingRewards() {
    return this._all(
      "SELECT * FROM referral_rewards WHERE status = 'pending' ORDER BY created_at ASC",
      []
    );
  }

  async getRewardById(id) {
    return this._get(
      'SELECT * FROM referral_rewards WHERE id = ?',
      [id]
    );
  }

  async createReward(data) {
    return this._transaction(async () => {
      const referral = await this._get(
        "SELECT * FROM customer_referrals WHERE id = ? AND status = 'active'",
        [data.referral_id]
      );
      if (!referral) throw new Error('Referral not found or is not active');

      const settings = await this.getSettings();
      let amount = data.amount;
      if (amount === undefined || amount === null) {
        if (settings.rewardType === 'fixed') {
          amount = settings.rewardValue;
        } else {
          amount = (data.invoice_amount || 0) * (settings.rewardPercentage / 100);
        }
        if (settings.maxRewardAmount > 0 && amount > settings.maxRewardAmount) {
          amount = settings.maxRewardAmount;
        }
      }
      amount = Math.round(amount * 100) / 100;

      if (settings.minPurchaseAmount > 0 && (data.invoice_amount || 0) < settings.minPurchaseAmount) {
        throw new Error(`Invoice amount does not meet minimum purchase requirement of ${settings.minPurchaseAmount}`);
      }

      const id = randomUUID();
      await this._run(
        `INSERT INTO referral_rewards (id, referral_id, customer_id, invoice_id, invoice_amount, amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, data.referral_id, data.customer_id, data.invoice_id, data.invoice_amount || 0,
         amount]
      );

      await this.addTimelineEntry({
        referralId: data.referral_id,
        eventType: 'reward_earned',
        title: 'Reward Earned',
        description: `Reward of ${amount} earned for referral`,
        amount});

      await this.addAuditLog({
        entityType: 'reward',
        entityId: id,
        action: 'created',
        actorId: 'system',
        actorName: 'System'});

      return this._get('SELECT * FROM referral_rewards WHERE id = ?', [id]);
    });
  }

  async approveReward(id, approvedBy) {
    return this._transaction(async () => {
      const reward = await this.getRewardById(id);
      if (!reward) throw new Error('Reward not found');
      if (reward.status !== 'pending') throw new Error('Reward is not in pending status');

      const referral = await this._get(
        'SELECT * FROM customer_referrals WHERE id = ?',
        [reward.referral_id]
      );

      await this._run(
        `UPDATE referral_rewards SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [approvedBy, id]
      );

      await this._run(
        `UPDATE customer_referrals SET status = 'converted', converted_invoice_id = ?, converted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [reward.invoice_id, reward.referral_id]
      );

      if (referral) {
        await this.creditWalletForReward(reward, referral);
      }

      await this.notificationService.sendRewardApprovedNotification(reward, referral);
      await this._createPortalNotifications(
        reward.customer_id,
        'reward_approved',
        'Reward Approved',
        `Your referral reward of ${reward.amount} has been approved.`,
        reward.referral_id, reward.id
      );

      await this.addTimelineEntry({
        referralId: reward.referral_id,
        eventType: 'reward_approved',
        title: 'Reward Approved',
        description: `Reward of ${reward.amount} approved`,
        amount: reward.amount,
        actorId: approvedBy});

      await this.addAuditLog({
        entityType: 'reward',
        entityId: id,
        action: 'approved',
        actorId: approvedBy,
        fieldName: 'status',
        oldValue: 'pending',
        newValue: 'approved'});

      return this._get('SELECT * FROM referral_rewards WHERE id = ?', [id]);
    });
  }

  async rejectReward(id, reason, rejectedBy) {
    return this._transaction(async () => {
      const reward = await this.getRewardById(id);
      if (!reward) throw new Error('Reward not found');
      if (reward.status !== 'pending') throw new Error('Reward is not in pending status');

      const referral = await this._get(
        'SELECT * FROM customer_referrals WHERE id = ?',
        [reward.referral_id]
      );

      await this._run(
        `UPDATE referral_rewards SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ?, cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [rejectedBy, reason || null, id]
      );

      await this.notificationService.sendRewardRejectedNotification(reward, referral, reason);
      await this._createPortalNotifications(
        reward.customer_id,
        'reward_rejected',
        'Reward Rejected',
        `Your referral reward of ${reward.amount} was rejected. Reason: ${reason || 'No reason provided'}`,
        reward.referral_id, reward.id
      );

      await this.addTimelineEntry({
        referralId: reward.referral_id,
        eventType: 'reward_rejected',
        title: 'Reward Rejected',
        description: reason || 'Reward was rejected',
        actorId: rejectedBy});

      await this.addAuditLog({
        entityType: 'reward',
        entityId: id,
        action: 'rejected',
        actorId: rejectedBy,
        reason,
        fieldName: 'status',
        oldValue: 'pending',
        newValue: 'cancelled'});

      return this._get('SELECT * FROM referral_rewards WHERE id = ?', [id]);
    });
  }

  // ── Timeline ───────────────────────────────────────────────────

  async getTimeline(referralId) {
    return this._all(
      'SELECT * FROM referral_timeline WHERE referral_id = ? ORDER BY timestamp DESC',
      [referralId]
    );
  }

  async addTimelineEntry({ referralId, eventType, title, description, amount, actorId, actorName, metadata}) {
    const id = randomUUID();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    await this._run(
      `INSERT INTO referral_timeline (id, referral_id, event_type, title, description, amount, actor_id, actor_name, metadata_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, referralId, eventType, title, description || null,
       amount || null, actorId || null, actorName || null,
       metadataJson]
    );
    return id;
  }

  // ── Audit Log ──────────────────────────────────────────────────

  async getAuditLogs(params) {
    const { page, limit, offset } = this.getPaginationParams(params);
    const conditions = ['1 = 1'];
    const queryParams = [];

    if (params.entity_type) {
      conditions.push('a.entity_type = ?');
      queryParams.push(params.entity_type);
    }

    if (params.entity_id) {
      conditions.push('a.entity_id = ?');
      queryParams.push(params.entity_id);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this._get(
      `SELECT COUNT(*) as total FROM referral_audit_logs a WHERE ${whereClause}`,
      queryParams
    );
    const total = countRow.total;
    const totalPages = Math.ceil(total / limit);

    const logs = await this._all(
      `SELECT a.* FROM referral_audit_logs a WHERE ${whereClause} ORDER BY a.timestamp DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    return { auditLogs: logs, total, page, limit, totalPages };
  }

  async addAuditLog(data) {
    const id = randomUUID();
    await this._run(
      `INSERT INTO referral_audit_logs (id, entity_type, entity_id, action, actor_id, actor_name, field_name, old_value, new_value, reason, correlation_id, ip_address, user_agent, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, data.entityType, data.entityId, data.action,
       data.actorId || 'system', data.actorName || null,
       data.fieldName || null, data.oldValue != null ? String(data.oldValue) : null,
       data.newValue != null ? String(data.newValue) : null,
       data.reason || null, data.correlationId || null,
       data.ipAddress || null, data.userAgent || null]
    );
    return id;
  }

  // ── Campaigns ──────────────────────────────────────────────────

  async getAllCampaigns(params) {
    const conditions = ['1=1'];
    const queryParams = [];

    if (params.status && params.status !== 'all') {
      conditions.push('r.status = ?');
      queryParams.push(params.status);
    }

    return this._all(
      `SELECT c.* FROM referral_campaigns c WHERE ${conditions.join(' AND ')} ORDER BY c.created_at DESC`,
      queryParams
    );
  }

  async getActiveCampaign() {
    const now = new Date().toISOString();
    return this._get(
      "SELECT * FROM referral_campaignsstatus = 'active' AND start_date <= ? AND (end_date IS NULL OR end_date >= ?) ORDER BY created_at DESC LIMIT 1",
      [now, now]
    );
  }

  async createCampaign(data) {
    const id = randomUUID();
    await this._run(
      `INSERT INTO referral_campaigns (id, name, description, start_date, end_date, status, reward_type, reward_value, reward_percentage, min_purchase_amount, max_reward_amount, max_rewards_per_customer, max_total_rewards, total_rewards_given, target_segments_json, excluded_customers_json, bonus_multiplier, terms_json, created_by, approved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )`,
      [id, data.name, data.description || null, data.start_date, data.end_date || null, data.status || 'draft', data.reward_type || 'percentage', data.reward_value || 0, data.reward_percentage || 0, data.min_purchase_amount || 0, data.max_reward_amount || 0, data.max_rewards_per_customer || 0, data.max_total_rewards || 0, 0, data.target_segments_json || null, data.excluded_customers_json || null, data.bonus_multiplier || 1, data.terms_json || null, data.created_by || null, data.approved_by || null]
    );

    await this.addAuditLog({
      entityType: 'campaign',
      entityId: id,
      action: 'created',
      actorId: data.created_by || 'system',
      actorName: data.created_by || 'System'});

    return this._get('SELECT * FROM referral_campaigns WHERE id = ?', [id]);
  }

  async updateCampaign(id, data) {
    const existing = await this._get(
      'SELECT * FROM referral_campaigns WHERE id = ?',
      [id]
    );
    if (!existing) throw new Error('Campaign not found');

    const fields = [];
    const params = [];
    const allowed = ['name', 'description', 'start_date', 'end_date', 'reward_type',
      'reward_value', 'reward_percentage', 'min_purchase_amount', 'max_reward_amount',
      'max_rewards_per_customer', 'max_total_rewards', 'target_segments_json',
      'excluded_customers_json', 'bonus_multiplier', 'terms_json', 'created_by', 'approved_by'];

    for (const field of allowed) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field] === null ? null : data[field]);
      }
    }

    if (fields.length > 0) {
      params.push(id);
      await this._run(
        `UPDATE referral_campaigns SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params
      );
    }

    return this._get('SELECT * FROM referral_campaigns WHERE id = ?', [id]);
  }

  async updateCampaignStatus(id, status) {
    const existing = await this._get(
      'SELECT * FROM referral_campaigns WHERE id = ?',
      [id]
    );
    if (!existing) throw new Error('Campaign not found');

    await this._run(
      `UPDATE referral_campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id]
    );

    await this.addAuditLog({
      entityType: 'campaign',
      entityId: id,
      action: 'status_changed',
      actorId: 'system',
      actorName: 'System',
      fieldName: 'status',
      oldValue: existing.status,
      newValue: status});

    return this._get('SELECT * FROM referral_campaigns WHERE id = ?', [id]);
  }

  // ── Reversals ──────────────────────────────────────────────────

  async getAllReversals(params) {
    const { page, limit, offset } = this.getPaginationParams(params);
    const conditions = ['1=1'];
    const queryParams = [];

    if (params.status) {
      conditions.push('r.status = ?');
      queryParams.push(params.status);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this._get(
      `SELECT COUNT(*) as total FROM referral_reversals r WHERE ${whereClause}`,
      queryParams
    );
    const total = countRow.total;
    const totalPages = Math.ceil(total / limit);

    const reversals = await this._all(
      `SELECT r.* FROM referral_reversals r WHERE ${whereClause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    return { reversals, total, page, limit, totalPages };
  }

  async createReversal(data) {
    return this._transaction(async () => {
      const reward = await this._get(
        'SELECT * FROM referral_rewards WHERE id = ?',
        [data.reward_id]
      );
      if (!reward) throw new Error('Reward not found');

      const id = randomUUID();
      await this._run(
        `INSERT INTO referral_reversals (id, reward_id, reason, status, requested_by, notes, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, data.reward_id, data.reason, data.requested_by || 'system',
         data.notes || null]
      );

      await this.addAuditLog({
        entityType: 'reversal',
        entityId: id,
        action: 'created',
        actorId: data.requested_by || 'system',
        actorName: data.requested_by || 'System',
        reason: data.reason});

      return this._get('SELECT * FROM referral_reversals WHERE id = ?', [id]);
    });
  }

  async approveReversal(id, approvedBy, notes) {
    return this._transaction(async () => {
      const reversal = await this._get(
        'SELECT * FROM referral_reversals WHERE id = ?',
        [id]
      );
      if (!reversal) throw new Error('Reversal not found');
      if (reversal.status !== 'pending') throw new Error('Reversal is not in pending status');

      await this._run(
        `UPDATE referral_reversals SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [approvedBy, notes || null, id]
      );

      await this._run(
        `UPDATE referral_reversals SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      const reward = await this._get(
        'SELECT * FROM referral_rewards WHERE id = ?',
        [reversal.reward_id]
      );

      if (reward) {
        await this.notificationService.sendReversalProcessedNotification(reversal, reward);
        await this._createPortalNotifications(
          reward.customer_id,
          'reversal_processed',
          'Reversal Processed',
          `A reversal has been processed for your reward of ${reward.amount}.`,
          reward.referral_id, reward.id
        );

        await this.addTimelineEntry({
          referralId: reward.referral_id,
          eventType: 'reward_reversed',
          title: 'Reward Reversed',
          description: notes || 'Reward was reversed',
          actorId: approvedBy});
      }

      await this.addAuditLog({
        entityType: 'reversal',
        entityId: id,
        action: 'approved',
        actorId: approvedBy,
        notes,
        fieldName: 'status',
        oldValue: 'pending',
        newValue: 'completed'});

      return this._get('SELECT * FROM referral_reversals WHERE id = ?', [id]);
    });
  }

  async rejectReversal(id, reason, rejectedBy, notes) {
    const reversal = await this._get(
      'SELECT * FROM referral_reversals WHERE id = ?',
      [id]
    );
    if (!reversal) throw new Error('Reversal not found');
    if (reversal.status !== 'pending') throw new Error('Reversal is not in pending status');

    await this._run(
      `UPDATE referral_reversals SET status = 'rejected', rejected_by = ?, rejected_at = CURRENT_TIMESTAMP, reject_reason = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [rejectedBy, reason || null, notes || null, id]
    );

    const reward = await this._get(
      'SELECT * FROM referral_rewards WHERE id = ?',
      [reversal.reward_id]
    );
    if (reward) {
      await this._createPortalNotifications(
        reward.customer_id,
        'reversal_rejected',
        'Reversal Rejected',
        `Your reversal request for reward ${reward.amount} was rejected.`,
        reward.referral_id, reward.id
      );
    }

    await this.addAuditLog({
      entityType: 'reversal',
      entityId: id,
      action: 'rejected',
      actorId: rejectedBy,
      reason,
      fieldName: 'status',
      oldValue: 'pending',
      newValue: 'rejected'});

    return this._get('SELECT * FROM referral_reversals WHERE id = ?', [id]);
  }

  // ── Analytics ──────────────────────────────────────────────────

  async getAnalytics(params) {
    const period = params.period || 'monthly';
    const periodStart = params.period_start || new Date().toISOString().slice(0, 10);
    const periodEnd = params.period_end || periodStart;

    let analytics = await this._get(
      `SELECT * FROM referral_analytics WHERE period = ? AND period_start = ? AND period_end = ? ORDER BY generated_at DESC LIMIT 1`,
      [period, periodStart, periodEnd]
    );

    if (!analytics) {
      analytics = await this.generateAnalytics(period, periodStart, periodEnd);
    }

    return analytics;
  }

  async getAnalyticsHistory(params) {
    return this._all(
      'SELECT * FROM referral_analytics ORDER BY period_start DESC',
      []
    );
  }

  async generateAnalytics(period, periodStart, periodEnd) {
    const totalReferrals = await this._get(
      'SELECT COUNT(*) as count FROM customer_referrals WHERE created_at BETWEEN ? AND ?',
      [periodStart, periodEnd + 'T23:59:59.999Z']
    );

    const activeReferrals = await this._get(
      "SELECT COUNT(*) as count FROM customer_referrals WHERE status = 'active' AND created_at BETWEEN ? AND ?",
      [periodStart, periodEnd + 'T23:59:59.999Z']
    );

    const convertedReferrals = await this._get(
      "SELECT COUNT(*) as count FROM customer_referrals WHERE status = 'converted' AND created_at BETWEEN ? AND ?",
      [periodStart, periodEnd + 'T23:59:59.999Z']
    );

    const rewardStats = await this._get(
      `SELECT
        COALESCE(SUM(amount), 0) as total_rewards,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
        COALESCE(AVG(amount), 0) as avg_amount
       FROM referral_rewards WHERE created_at BETWEEN ? AND ?`,
      [periodStart, periodEnd + 'T23:59:59.999Z']
    );

    const totalRewardsAmount = rewardStats.total_rewards || 0;
    const approvedRewardsAmount = rewardStats.approved_amount || 0;
    const paidRewardsAmount = rewardStats.paid_amount || 0;
    const pendingRewardsAmount = rewardStats.pending_amount || 0;
    const averageRewardAmount = rewardStats.avg_amount || 0;

    const totalCount = totalReferrals.count || 0;
    const convertedCount = convertedReferrals.count || 0;
    const conversionRate = totalCount > 0 ? (convertedCount / totalCount) * 100 : 0;

    const revenueAttributed = await this._get(
      'SELECT COALESCE(SUM(invoice_amount), 0) as revenue FROM referral_rewardscreated_at BETWEEN ? AND ? AND status IN (\'approved\', \'paid\')',
      [periodStart, periodEnd + 'T23:59:59.999Z']
    );

    const revenue = revenueAttributed.revenue || 0;
    const roi = totalRewardsAmount > 0 ? (revenue - totalRewardsAmount) / totalRewardsAmount : 0;

    const id = randomUUID();
    await this._run(
      `INSERT INTO referral_analytics (id, period, period_start, period_end, total_referrals, active_referrals, converted_referrals, total_rewards_amount, approved_rewards_amount, paid_rewards_amount, pending_rewards_amount, average_reward_amount, conversion_rate, revenue_attributed, roi, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , CURRENT_TIMESTAMP)`,
      [id, period, periodStart, periodEnd, totalReferrals.count || 0, activeReferrals.count || 0, convertedReferrals.count || 0, totalRewardsAmount, approvedRewardsAmount, paidRewardsAmount, pendingRewardsAmount, averageRewardAmount, conversionRate, revenue, roi]
    );

    return this._get('SELECT * FROM referral_analytics WHERE id = ?', [id]);
  }

  // ── Settings ───────────────────────────────────────────────────

  async getSettings() {
    const row = await this._get(
      'SELECT settings_json FROM referral_settings',
      []
    );

    if (!row) {
      return {
        enabled: true,
        rewardType: 'percentage',
        rewardValue: 0,
        rewardPercentage: 5,
        minPurchaseAmount: 0,
        maxRewardAmount: 0,
        requireApproval: true,
        autoApproveThreshold: 100,
        selfReferralPrevention: true,
        expiryDays: 365,
        allowMultipleRewards: true
      };
    }

    try {
      return JSON.parse(row.settings_json);
    } catch {
      return {};
    }
  }

  async updateSettings( settings) {
    const existing = await this._get(
      'SELECT id FROM referral_settings',
      []
    );

    let settingsId = existing?.id;

    const settingsJson = JSON.stringify(settings);

    if (existing) {
      await this._run(
        `UPDATE referral_settings SET settings_json = ?, updated_at = CURRENT_TIMESTAMP`,
        [settingsJson]
      );
    } else {
      const id = randomUUID();
      settingsId = id;
      await this._run(
        `INSERT INTO referral_settings (id, settings_json) VALUES (? , ?)`,
        [id, settingsJson]
      );
    }

    await this.addAuditLog({
      entityType: 'setting',
      entityId: settingsId,
      action: 'updated',
      actorId: 'system',
      actorName: 'System',
      fieldName: 'settings_json'});

    return this.getSettings();
  }

  async cleanupAuditLogs(retentionDays = 90) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    
    let sql = 'DELETE FROM referral_audit_logs WHERE created_at < ?';
    const params = [cutoff];
    
    const result = await this._run(sql, params);
    return { deleted: result.changes };
  }

  // ── Internal Helpers ───────────────────────────────────────────

  async _getPortalUserIdsForCustomer(customerId) {
    if (!customerId) return [];
    const rows = await this._all(
      'SELECT id FROM portal_users WHERE customer_id = ? AND status = ?',
      [customerId, 'active']
    );
    return rows.map(r => r.id);
  }

  async _createPortalNotifications(recipientCustomerId, type, title, message, referralId, rewardId) {
    const portalUserIds = await this._getPortalUserIdsForCustomer(recipientCustomerId);
    if (portalUserIds.length === 0) return;
    const now = new Date().toISOString();
    for (const portalUserId of portalUserIds) {
      await this._run(
        `INSERT INTO portal_notifications (id, portal_user_id, type, title, body, link, created_at)
         VALUES (?, ?, ?, ?, ?, ? , ?)`,
        [randomUUID(), portalUserId, type, title, message, null, now]
      );
    }
  }

  async creditWalletForReward(reward, referral) {
    const walletTxId = randomUUID();

    const customer = await this._get(
      'SELECT * FROM customers WHERE id = ?',
      [reward.customer_id]
    );
    if (!customer) return;

    const account = await this._get(
      "SELECT id FROM chart_of_accounts WHERE type = 'liability' LIMIT 1",
      []
    );
    const accountId = account ? account.id : null;

    if (accountId) {
      await this._run(
        `INSERT INTO ledger_entries (id, account_id, account_code, account_name, entry_type, amount, currency, description, reference_type, reference_id, journal_id, entry_date, created_by)
         VALUES (?, ?, ?, ?, 'credit', ?, 'USD', ?, 'referral_reward', ?, ?, ?, ?, ?)`,
        [randomUUID(), accountId, null, null, reward.amount,
         `Referral reward credit for referral ${referral.referral_code}`,
         reward.id, walletTxId, new Date().toISOString(), 'system']
      );
    }

    const targetCustomerId = referral.referred_by_id || reward.customer_id;
    await this._run(
      'UPDATE customers SET walletBalance = COALESCE(walletBalance, 0) + ? WHERE id = ?',
      [reward.amount, targetCustomerId]
    );

    await this._run(
      `UPDATE referral_rewards SET wallet_transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [walletTxId, reward.id]
    );

    const balanceRow = await this._get('SELECT walletBalance FROM customers WHERE id = ?', [targetCustomerId]);
    const balance = balanceRow ? balanceRow.walletBalance || 0 : reward.amount;
    const walletPayload = {
      customerId: targetCustomerId,
      docType: 'wallet',
      event: 'balance_changed',
      delta: reward.amount,
      balance,
    };
    try {
      portalLifecycleService.emitEntityChange('portal', walletPayload);
      portalLifecycleService.emitEntityChange('admin', walletPayload);
      await portalLifecycleService.notifyCustomer({
        customerId: targetCustomerId,
        type: 'payment',
        title: 'Wallet credited',
        body: `You earned a referral reward of ${reward.amount.toFixed(2)} in your wallet.`,
        link: '/wallet',
      });
    } catch (err) {
      console.error('[Referral] Wallet SSE/notification failed:', err.message);
    }
  }
}

module.exports = ReferralService;
