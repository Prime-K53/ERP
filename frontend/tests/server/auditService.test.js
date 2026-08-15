const { auditService, AuditEvent } = require('../../server/auditService.cjs');
const { db } = require('../../server/db.cjs');
const { randomUUID } = require('crypto');

// Mock database setup for testing
beforeEach(async () => {
  // Clear the audit_logs table before each test
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM audit_logs', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

describe('Audit Service - Compliance-Grade Audit Trail', () => {
  describe('AuditEvent Class', () => {
    test('creates event with all required fields', () => {
      const event = new AuditEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'CREATE',
        entityType: 'document',
        entityId: 'doc-001',
        details: 'Created new document',
        oldValue: null,
        newValue: { title: 'Test Doc', status: 'draft' }
      });

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.correlationId).toBeDefined();
      expect(event.userId).toBe('user123');
      expect(event.userRole).toBe('admin');
      expect(event.action).toBe('CREATE');
      expect(event.entityType).toBe('document');
      expect(event.entityId).toBe('doc-001');
      expect(event.details).toBe('Created new document');
      expect(event.oldValue).toBeNull();
      expect(event.newValue).toEqual({ title: 'Test Doc', status: 'draft' });
      expect(event.delta).toEqual({
        type: 'CREATION',
        fields: ['title', 'status']
      });
      expect(event.integrityHash).toBeDefined();
    });

    test('computes delta correctly for updates', () => {
      const event = new AuditEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'UPDATE',
        entityType: 'document',
        entityId: 'doc-001',
        oldValue: { title: 'Old Title', status: 'draft' },
        newValue: { title: 'New Title', status: 'draft', tags: ['test'] }
      });

      expect(event.delta).toEqual({
        type: 'UPDATE',
        fields: {
          title: { old: 'Old Title', new: 'New Title', changed: true },
          tags: { old: undefined, new: ['test'], changed: true }
        }
      });
    });

    test('computes delta correctly for deletions', () => {
      const event = new AuditEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'DELETE',
        entityType: 'document',
        entityId: 'doc-001',
        oldValue: { title: 'Test Doc', status: 'draft' }
      });

      expect(event.delta).toEqual({
        type: 'DELETION',
        fields: ['title', 'status']
      });
    });

    test('generates valid integrity hash', () => {
      const event = new AuditEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'CREATE',
        entityType: 'document',
        entityId: 'doc-001',
        newValue: { title: 'Test Doc' }
      });

      const computedHash = event.computeHash();
      expect(computedHash).toBe(event.integrityHash);
      expect(computedHash.length).toBe(64); // SHA-256 hex string
    });
  });

  describe('AuditService Class', () => {
    beforeEach(async () => {
      await auditService.initialize();
    });

    test('initializes with compliance-grade schema', async () => {
      const tables = await new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.name));
        });
      });

      expect(tables).toContain('audit_logs');

      const columns = await new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(audit_logs)", (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.name));
        });
      });

      const requiredColumns = [
        'id', 'timestamp', 'correlation_id', 'user_id', 'user_role',
        'session_id', 'action', 'entity_type', 'entity_id', 'details',
        'old_value', 'new_value', 'delta', 'integrity_hash',
        'ip_address', 'user_agent', 'http_method', 'http_path',
        'reason', 'approval_chain', 'created_at'
      ];

      requiredColumns.forEach(col => {
        expect(columns).toContain(col);
      });
    });

    test('logs event with all fields', async () => {
      const eventId = await auditService.logEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'CREATE',
        entityType: 'document',
        entityId: 'doc-001',
        details: 'Created new document',
        newValue: { title: 'Test Doc', status: 'draft' },
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        httpMethod: 'POST',
        httpPath: '/api/documents',
        reason: 'Initial creation'
      });

      const event = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM audit_logs WHERE id = ?', [eventId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      expect(event).toBeDefined();
      expect(event.user_id).toBe('user123');
      expect(event.user_role).toBe('admin');
      expect(event.action).toBe('CREATE');
      expect(event.entity_type).toBe('document');
      expect(event.entity_id).toBe('doc-001');
      expect(event.details).toBe('Created new document');
      expect(JSON.parse(event.new_value)).toEqual({ title: 'Test Doc', status: 'draft' });
      expect(event.ip_address).toBe('127.0.0.1');
      expect(event.user_agent).toBe('TestAgent/1.0');
      expect(event.http_method).toBe('POST');
      expect(event.http_path).toBe('/api/documents');
      expect(event.reason).toBe('Initial creation');
    });

    test('verifies event integrity', async () => {
      const eventId = await auditService.logEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'CREATE',
        entityType: 'document',
        entityId: 'doc-001',
        newValue: { title: 'Test Doc' }
      });

      const result = await auditService.verifyIntegrity(eventId);
      expect(result.valid).toBe(true);
    });

    test('retrieves entity history', async () => {
      await auditService.logEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'CREATE',
        entityType: 'document',
        entityId: 'doc-001',
        newValue: { title: 'Test Doc' }
      });

      await auditService.logEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'UPDATE',
        entityType: 'document',
        entityId: 'doc-001',
        oldValue: { title: 'Test Doc' },
        newValue: { title: 'Updated Doc' }
      });

      const history = await auditService.getEntityHistory('document', 'doc-001');
      expect(history).toHaveLength(2);
      expect(history[0].action).toBe('UPDATE');
      expect(history[1].action).toBe('CREATE');
    });

    test('retrieves correlation trail', async () => {
      const correlationId = randomUUID();
      
      await auditService.logEvent({
        userId: 'user123',
        userRole: 'admin',
        correlationId,
        action: 'CREATE',
        entityType: 'document',
        entityId: 'doc-001'
      });

      await auditService.logEvent({
        userId: 'user123',
        userRole: 'admin',
        correlationId,
        action: 'UPDATE',
        entityType: 'document',
        entityId: 'doc-001'
      });

      const trail = await auditService.getCorrelationTrail(correlationId);
      expect(trail).toHaveLength(2);
      expect(trail[0].action).toBe('UPDATE');
      expect(trail[1].action).toBe('CREATE');
    });

    test('provides audit statistics', async () => {
      await auditService.logEvent({
        userId: 'user123',
        userRole: 'admin',
        action: 'CREATE',
        entityType: 'document',
        entityId: 'doc-001'
      });

      await auditService.logEvent({
        userId: 'user456',
        userRole: 'user',
        action: 'UPDATE',
        entityType: 'document',
        entityId: 'doc-001'
      });

      const stats = await auditService.getStats();
      expect(stats.total_events).toBe(2);
      expect(stats.unique_users).toBe(2);
      expect(stats.entity_types).toBe(1);
      expect(stats.earliest_event).toBeDefined();
      expect(stats.latest_event).toBeDefined();
    });
  });
});