/**
 * Audit Middleware - Automatic Event Capture & Correlation ID Propagation
 *
 * Features:
 * - Correlation ID generation and propagation
 * - Request context capture (IP, user agent, method, path)
 * - Automatic audit logging for CRUD operations
 * - Integration with auditService
 */

const { auditService } = require('./auditService.cjs');
const sq = require('./services/supabaseQuery.cjs');

// Generate a new correlation ID
const generateCorrelationId = () => {
  const { randomUUID } = require('crypto');
  return randomUUID();
};

// Middleware to inject correlation ID into every request
const correlationIdMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
};

// Middleware to capture audit context for a user action
const auditContextMiddleware = (req, res, next) => {
  req.auditContext = {
    correlationId: req.correlationId,
    userId: req.user?.id || 'anonymous',
    userRole: req.user?.role || 'unknown',
    sessionId: req.session?.id || null,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    httpMethod: req.method,
    httpPath: req.path
  };
  next();
};

// Middleware to automatically log CRUD operations
// Usage: app.use('/api/invoices', auditCrudMiddleware('invoice'));
const auditCrudMiddleware = (entityType) => {
  return async (req, res, next) => {
    let oldValue = null;
    const entityId = req.params.id || (req.body && req.body.id);

    if (entityId && (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
      try {
        const TABLE_WHITELIST = {
          'invoice': 'documents',
          'examination_batch': 'examination_batches',
          'customer': 'customers',
          'inventory_item': 'inventory',
          'document': 'documents',
          'sale': 'sales',
          'exchange': 'sales_exchanges',
          'payment': 'customer_payments',
          'supplier': 'suppliers',
          'purchase': 'purchases',
        };
        const tableName = TABLE_WHITELIST[entityType] || null;
        if (!tableName) return next();

        oldValue = await sq.getOne(`SELECT * FROM ${tableName} WHERE id = ? OR logical_number = ?`, [entityId, entityId]);
      } catch (error) {
        console.warn(`[AuditMiddleware] Could not fetch old state for ${entityType}:${entityId}`, error.message);
      }
    }

    const originalSend = res.send;
    res.send = function(body) {
      if (req.auditContext && entityId) {
        const actionMap = {
          'POST': 'CREATE',
          'PUT': 'UPDATE',
          'PATCH': 'UPDATE',
          'DELETE': 'DELETE'
        };
        const action = actionMap[req.method];

        if (action) {
          const newValue = (req.method === 'DELETE') ? null : (req.body || {});

          auditService.logEvent({
            ...req.auditContext,
            action,
            entityType,
            entityId,
            details: `${action} operation on ${entityType} ${entityId}`,
            oldValue,
            newValue,
            reason: req.body?.reason || null,
            httpPath: req.originalUrl || req.path
          }).catch(err => {
            console.error('[AuditMiddleware] Failed to log audit event:', err);
          });
        }
      }

      res.send = originalSend;
      return originalSend.call(res, body);
    };

    next();
  };
};

// Middleware to log authentication events
const auditAuthMiddleware = (req, res, next) => {
  const originalStatus = res.statusCode;

  res.on('finish', async () => {
    if (req.auditContext) {
      const isAuthRoute = req.path.startsWith('/api/auth/');
      const isLogin = req.path.endsWith('/login') || req.path.endsWith('/signin');

      if (isAuthRoute) {
        const action = (originalStatus === 200 || originalStatus === 201) ? 'LOGIN' : 'LOGIN_FAILED';
        const details = isLogin ? `Auth attempt: ${originalStatus === 200 ? 'Success' : 'Failed'}` : `Auth operation: ${req.method}`;

        try {
          await auditService.logEvent({
            ...req.auditContext,
            action,
            entityType: 'AUTH',
            entityId: req.auditContext.userId || req.body?.email || 'unknown',
            details,
            reason: req.body?.reason || null
          });
        } catch (err) {
          console.error('[AuditMiddleware] Failed to log auth event:', err);
        }
      }
    }
  });

  next();
};

// Utility to manually log an audit event from anywhere in the codebase
const logAuditEvent = async (eventData) => {
  try {
    return await auditService.logEvent(eventData);
  } catch (error) {
    console.error('[AuditMiddleware] Manual audit log failed:', error);
    throw error;
  }
};

module.exports = {
  correlationIdMiddleware,
  auditContextMiddleware,
  auditCrudMiddleware,
  auditAuthMiddleware,
  logAuditEvent,
  generateCorrelationId
};