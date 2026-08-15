import { describe, expect, it, vi, beforeEach } from 'vitest';
import { jobTicketConversionService } from '../../services/jobTicketConversionService';

const executeAtomicOperation = vi.fn();
const initialize = vi.fn();
const getActiveDefinitions = vi.fn();
const startWorkflow = vi.fn();
const getBatch = vi.fn();

vi.mock('../../utils/helpers', () => ({
  generateNextId: (prefix: string, collection: any[] = []) => `${prefix}-${(collection?.length || 0) + 1}`
}));

vi.mock('../../services/db', () => ({
  dbService: {
    executeAtomicOperation: (...args: any[]) => executeAtomicOperation(...args)
  }
}));

vi.mock('../../services/workflowService', () => ({
  workflowService: {
    initialize: (...args: any[]) => initialize(...args),
    getActiveDefinitions: (...args: any[]) => getActiveDefinitions(...args),
    startWorkflow: (...args: any[]) => startWorkflow(...args)
  }
}));

vi.mock('../../services/examinationBatchService', () => ({
  examinationBatchService: {
    getBatch: (...args: any[]) => getBatch(...args)
  }
}));

const buildTx = (stores: Record<string, any>) => ({
  objectStore: (name: string) => stores[name]
});

describe('jobTicketConversionService', () => {
  beforeEach(() => {
    executeAtomicOperation.mockReset();
    initialize.mockReset();
    getActiveDefinitions.mockReset();
    startWorkflow.mockReset();
    getBatch.mockReset();
    getActiveDefinitions.mockReturnValue([{ id: 'WF-1', isActive: true }]);
    startWorkflow.mockResolvedValue({});
    getBatch.mockResolvedValue(null);
  });

  it('converts a general quotation into a job ticket', async () => {
    const quotation = {
      id: 'QTN-1',
      customerName: 'Prime School',
      quotationType: 'General',
      items: [{ id: 'ITM-1', name: 'Booklet', quantity: 10, price: 5 }]
    };

    const quotationStore = {
      get: vi.fn().mockResolvedValue(quotation),
      put: vi.fn()
    };
    const jobTicketStore = {
      getAll: vi.fn().mockResolvedValue([]),
      put: vi.fn()
    };
    const workOrderStore = {
      getAll: vi.fn().mockResolvedValue([]),
      put: vi.fn()
    };
    const auditLogStore = { put: vi.fn() };
    const idempotencyStore = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };

    executeAtomicOperation.mockImplementation(async (_stores: string[], op: any) =>
      op(buildTx({
        quotations: quotationStore,
        jobTickets: jobTicketStore,
        workOrders: workOrderStore,
        auditLogs: auditLogStore,
        idempotencyKeys: idempotencyStore
      }))
    );

    const result = await jobTicketConversionService.convertQuotationToJobTicket('QTN-1', {
      requestedBy: 'admin',
      requesterRole: 'Admin'
    });

    expect(result.success).toBe(true);
    expect(result.jobTicketId).toMatch(/^TKT/i);
    expect(quotationStore.put).toHaveBeenCalled();
    expect(jobTicketStore.put).toHaveBeenCalled();
    expect(workOrderStore.put).toHaveBeenCalled();
  });

  it('prevents duplicate conversion for quotations', async () => {
    const quotation = {
      id: 'QTN-2',
      customerName: 'Prime School',
      quotationType: 'General',
      items: [{ id: 'ITM-1', name: 'Booklet', quantity: 10, price: 5 }]
    };

    const quotationStore = { get: vi.fn().mockResolvedValue(quotation), put: vi.fn() };
    const jobTicketStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const workOrderStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const auditLogStore = { put: vi.fn() };
    const idempotencyStore = { get: vi.fn().mockResolvedValue({ id: 'lock' }), put: vi.fn() };

    executeAtomicOperation.mockImplementation(async (_stores: string[], op: any) =>
      op(buildTx({
        quotations: quotationStore,
        jobTickets: jobTicketStore,
        workOrders: workOrderStore,
        auditLogs: auditLogStore,
        idempotencyKeys: idempotencyStore
      }))
    );

    await expect(
      jobTicketConversionService.convertQuotationToJobTicket('QTN-2', {
        requestedBy: 'admin',
        requesterRole: 'Admin'
      })
    ).rejects.toThrow('Conversion already in progress');
  });

  it('rejects conversion when quotation data is incomplete', async () => {
    const quotation = { id: 'QTN-3', customerName: '', quotationType: 'General', items: [] };
    const quotationStore = { get: vi.fn().mockResolvedValue(quotation), put: vi.fn() };
    const jobTicketStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const workOrderStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const auditLogStore = { put: vi.fn() };
    const idempotencyStore = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };

    executeAtomicOperation.mockImplementation(async (_stores: string[], op: any) =>
      op(buildTx({
        quotations: quotationStore,
        jobTickets: jobTicketStore,
        workOrders: workOrderStore,
        auditLogs: auditLogStore,
        idempotencyKeys: idempotencyStore
      }))
    );

    await expect(
      jobTicketConversionService.convertQuotationToJobTicket('QTN-3')
    ).rejects.toThrow('Customer name is required');
  });

  it('converts examination batch to job ticket with class items', async () => {
    const batch = {
      id: 'BATCH-1',
      name: 'Exam Batch',
      classes: [
        { id: 'CLS-1', class_name: 'Form 1', learners: 20, fee_per_learner: 10 },
        { id: 'CLS-2', class_name: 'Form 2', learners: 25, fee_per_learner: 12 }
      ]
    };

    const batchStore = { get: vi.fn().mockResolvedValue(batch), put: vi.fn() };
    const jobTicketStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const workOrderStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const auditLogStore = { put: vi.fn() };
    const idempotencyStore = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };

    executeAtomicOperation.mockImplementation(async (_stores: string[], op: any) =>
      op(buildTx({
        examinationBatches: batchStore,
        jobTickets: jobTicketStore,
        workOrders: workOrderStore,
        auditLogs: auditLogStore,
        idempotencyKeys: idempotencyStore
      }))
    );

    const result = await jobTicketConversionService.convertExaminationBatchToJobTicket('BATCH-1');
    expect(result.success).toBe(true);
    expect(result.jobTicketId).toMatch(/^TKT/i);
    expect(jobTicketStore.put).toHaveBeenCalled();
    expect(workOrderStore.put).toHaveBeenCalled();
  });

  it('hydrates an incomplete examination batch snapshot before conversion', async () => {
    const storedBatch = {
      id: 'BATCH-2',
      name: 'Summary Batch',
      classes: []
    };
    const hydratedBatch = {
      ...storedBatch,
      school_name: 'Prime Academy',
      classes: [
        { id: 'CLS-1', class_name: 'Form 1', learners: 30, fee_per_learner: 12 }
      ]
    };

    getBatch.mockResolvedValue(hydratedBatch);

    const batchStore = { get: vi.fn().mockResolvedValue(storedBatch), put: vi.fn() };
    const jobTicketStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const workOrderStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const auditLogStore = { put: vi.fn() };
    const idempotencyStore = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };

    executeAtomicOperation.mockImplementation(async (_stores: string[], op: any) =>
      op(buildTx({
        examinationBatches: batchStore,
        jobTickets: jobTicketStore,
        workOrders: workOrderStore,
        auditLogs: auditLogStore,
        idempotencyKeys: idempotencyStore
      }))
    );

    const result = await jobTicketConversionService.convertExaminationBatchToJobTicket('BATCH-2');

    expect(result.success).toBe(true);
    expect(jobTicketStore.put).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Prime Academy',
      quantity: 30
    }));
    expect(batchStore.put).toHaveBeenCalledWith(expect.objectContaining({
      classes: hydratedBatch.classes,
      convertedJobTicketId: result.jobTicketId
    }));
  });

  it('rolls back conversion when work order save fails', async () => {
    const quotation = {
      id: 'QTN-4',
      customerName: 'Prime School',
      quotationType: 'General',
      items: [{ id: 'ITM-1', name: 'Booklet', quantity: 10, price: 5 }]
    };

    const quotationStore = { get: vi.fn().mockResolvedValue(quotation), put: vi.fn() };
    const jobTicketStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn() };
    const workOrderStore = { getAll: vi.fn().mockResolvedValue([]), put: vi.fn().mockRejectedValue(new Error('fail')) };
    const auditLogStore = { put: vi.fn() };
    const idempotencyStore = { get: vi.fn().mockResolvedValue(null), put: vi.fn() };

    executeAtomicOperation.mockImplementation(async (_stores: string[], op: any) =>
      op(buildTx({
        quotations: quotationStore,
        jobTickets: jobTicketStore,
        workOrders: workOrderStore,
        auditLogs: auditLogStore,
        idempotencyKeys: idempotencyStore
      }))
    );

    await expect(jobTicketConversionService.convertQuotationToJobTicket('QTN-4')).rejects.toThrow('fail');
  });
});
