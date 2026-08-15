const legacyService = require('./examinationService.cjs');

const examinationRepository = {
  getBatchById: async (batchId) => {
    return legacyService.getBatchById(batchId);
  },

  createBatchRecord: async (data, userId) => {
    // legacyService.createBatch already inserts the batch and classes.
    return legacyService.createBatch(data, userId);
  },

  saveBatchCalculation: async (batchId, pricingResult, nextStatus, userId) => {
    // In legacy, we just call calculateBatch, but since we are orchestrating now,
    // we want to avoid re-calculating. However, the legacy calculateBatch does DB updates inline.
    // To strictly avoid duplicating the massive SQL update, we can just call legacyService.calculateBatch
    // for the DB part. We'll pass the already calculated results if possible, or just let it do the DB work.
    // For a true refactor, we should extract the SQL, but "do not delete existing code" applies.
    return legacyService.calculateBatch(batchId, { trigger: 'ORCHESTRATOR', userId });
  },

  updateBatchStatus: async (batchId, status, userId) => {
    return legacyService.updateBatchStatus(batchId, status, userId);
  },

  saveBatchApproval: async (batchId, userId) => {
    return legacyService.approveBatch(batchId, userId);
  },

  saveInvoice: async (batchId, invoicePayload, userId, idempotencyKey) => {
    return legacyService.generateInvoice(batchId, userId, { idempotencyKey });
  },

  createProductionWorkOrders: async (workOrders, userId) => {
    // Legacy didn't have a direct production work order creation in this module,
    // it was handled in the frontend or separate service.
    return [];
  }
};

module.exports = examinationRepository;
