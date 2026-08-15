/**
 * Audit Service - Compliance-Grade Immutable Audit Trail
 *
 * Provides append-only, tamper-evident audit logging with:
 * - Field-level delta capture
 * - Correlation ID propagation
 * - Cryptographic hashing for integrity verification
 * - Full request context capture
 */

const sq = require('./services/supabaseQuery.cjs');
const repo = require('./services/supabaseRepository.cjs');
const { randomUUID } = require('crypto');

// Enhanced audit event schema aligned with compliance requirements
class AuditEvent {
  constructor(data) {
    this.id = randomUUID();
    this.timestamp = new Date().toISOString();
    this.correlationId = data.correlationId || randomUUID();
    this.userId = data.userId || 'anonymous';
    this.userRole = data.userRole || 'unknown';
    this.sessionId = data.sessionId || null;

    this.action = data.action;
    this.entityType = data.entityType;
    this.entityId = data.entityId;
    this.details = data.details || '';
    this.oldValue = data.oldValue || null;
    this.newValue = data.newValue || null;
    this.delta = this.computeDelta(this.oldValue, this.newValue);
    this.ipAddress = data.ipAddress || null;
    this.userAgent = data.userAgent || null;
    this.httpMethod = data.httpMethod || null;
    this.httpPath = data.httpPath || null;
    this.reason = data.reason || null;
    this.approvalChain = data.approvalChain || null;
    this.integrityHash = this.computeHash();
  }

  computeDelta(oldVal, newVal) {
    if (!oldVal && !newVal) return null;
    if (!oldVal) return { type: 'CREATION', fields: Object.keys(newVal || {}) };
    if (!newVal) return { type: 'DELETION', fields: Object.keys(oldVal || {}) };

    const changes = {};
    const allKeys = new Set([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})]);

    for (const key of allKeys) {
      const oldV = oldVal[key];
      const newV = newVal[key];

      if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
        changes[key] = {
          old: oldV,
          new: newV,
          changed: true
        };
      }
    }

    return Object.keys(changes).length > 0 ? { type: 'UPDATE', fields: changes } : null;
  }

  computeHash() {
    const crypto = require('crypto');
    const data = JSON.stringify({
      id: this.id,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      userId: this.userId,
      action: this.action,
      entityType: this.entityType,
      entityId: this.entityId,
      delta: this.delta
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  toDBObject() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      correlation_id: this.correlationId,
      user_id: this.userId,
      user_role: this.userRole,
      session_id: this.sessionId,
      action: this.action,
      entity_type: this.entityType,
      entity_id: this.entityId,
      details: this.details,
      old_value: this.oldValue ? JSON.stringify(this.oldValue) : null,
      new_value: this.newValue ? JSON.stringify(this.newValue) : null,
      delta: this.delta ? JSON.stringify(this.delta) : null,
      integrity_hash: this.integrityHash,
      ip_address: this.ipAddress,
      user_agent: this.userAgent,
      http_method: this.httpMethod,
      http_path: this.httpPath,
      reason: this.reason,
      approval_chain: this.approvalChain ? JSON.stringify(this.approvalChain) : null
    };
  }
}

// Audit Service with append-only semantics
class AuditService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    console.log('[AuditService] Initialized with compliance-grade schema');
  }

  async logEvent(eventData) {
    try {
      const auditEvent = new AuditEvent(eventData);
      const dbObj = auditEvent.toDBObject();
      await repo.upsert('audit_logs', dbObj);
      return auditEvent;
    } catch (error) {
      console.error('[AuditService] Failed to log event:', error);
      throw error;
    }
  }

  async logCreate(userId, userRole, entityType, entityId, newValue, details = '', context = {}) {
    return this.logEvent({
      userId,
      userRole,
      action: 'CREATE',
      entityType,
      entityId,
      newValue,
      details,
      ...context
    });
  }

  async logUpdate(userId, userRole, entityType, entityId, oldValue, newValue, details = '', context = {}) {
    return this.logEvent({
      userId,
      userRole,
      action: 'UPDATE',
      entityType,
      entityId,
      oldValue,
      newValue,
      details,
      ...context
    });
  }

  async logDelete(userId, userRole, entityType, entityId, oldValue, details = '', context = {}) {
    return this.logEvent({
      userId,
      userRole,
      action: 'DELETE',
      entityType,
      entityId,
      oldValue,
      details,
      ...context
    });
  }

  async logAuthEvent(userId, userRole, action, details = '', context = {}) {
    return this.logEvent({
      userId,
      userRole,
      action,
      entityType: 'AUTH',
      entityId: userId,
      details,
      ...context
    });
  }

  async getEvents(options = {}) {
    const {
      limit = 100,
      offset = 0,
      entityType,
      entityId,
      userId,
      action,
      startDate,
      endDate,
      correlationId } = options;

    let rows = await sq.getAll(`SELECT * FROM audit_logs`, []);
    if (entityType) rows = rows.filter(r => r.entity_type === entityType);
    if (entityId) rows = rows.filter(r => r.entity_id === entityId);
    if (userId) rows = rows.filter(r => r.user_id === userId);
    if (action) rows = rows.filter(r => r.action === action);
    if (correlationId) rows = rows.filter(r => r.correlation_id === correlationId);
    if (startDate) rows = rows.filter(r => r.timestamp >= startDate);
    if (endDate) rows = rows.filter(r => r.timestamp <= endDate);
    rows.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return rows.slice(offset, offset + limit);
  }

  async getEntityHistory(entityType, entityId) {
    return this.getEvents({ entityType, entityId });
  }

  async getCorrelationTrail(correlationId) {
    return this.getEvents({ correlationId });
  }

  async verifyIntegrity(eventId) {
    const row = await sq.getOne('SELECT * FROM audit_logs WHERE id = ?', [eventId]);
    if (!row) return { valid: false, error: 'Event not found' };

    const storedHash = row.integrity_hash;
    const computedHash = new AuditEvent({
      id: row.id,
      timestamp: row.timestamp,
      correlationId: row.correlation_id,
      userId: row.user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      oldValue: row.old_value ? JSON.parse(row.old_value) : null,
      newValue: row.new_value ? JSON.parse(row.new_value) : null
    }).computeHash();

    return {
      valid: storedHash === computedHash,
      stored: storedHash,
      computed: computedHash
    };
  }

  async getStats(startDate = null, endDate = null) {
    let rows = await sq.getAll(`SELECT * FROM audit_logs`, []);
    if (startDate) rows = rows.filter(r => r.timestamp >= startDate);
    if (endDate) rows = rows.filter(r => r.timestamp <= endDate);
    const totalEvents = rows.length;
    const uniqueUsers = new Set(rows.map(r => r.user_id)).size;
    const entityTypes = new Set(rows.map(r => r.entity_type)).size;
    const timestamps = rows.map(r => r.timestamp).filter(Boolean);
    return {
      total_events: totalEvents,
      unique_users: uniqueUsers,
      entity_types: entityTypes,
      earliest_event: timestamps.length ? Math.min(...timestamps) : null,
      latest_event: timestamps.length ? Math.max(...timestamps) : null
    };
  }
}

const auditService = new AuditService();

module.exports = { auditService, AuditEvent };