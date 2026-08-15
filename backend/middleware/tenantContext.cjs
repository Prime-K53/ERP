// ============================================================================
// Tenant context middleware (single-organization mode)
// ============================================================================
// The multi-tenant architecture was removed; this middleware now passes
// requests through unchanged.
// ============================================================================

function tenantContext(req, res, next) {
  return next();
}

module.exports = { tenantContext };
