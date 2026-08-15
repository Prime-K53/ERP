import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ExaminationProductionService, examinationProductionService, BatchToProductionPayload } from '../../../services/examinationProductionService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Mock logger
vi.mock('../../../services/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock notification service
vi.mock('../../../services/notificationService', () => ({
  notificationService: {
    notify: vi.fn(),
  },
}));

describe('ExaminationProductionService', () => {
  let service: ExaminationProductionService;
  let mockCreateWorkOrder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    service = new ExaminationProductionService();
    mockCreateWorkOrder = vi.fn();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should not initialize twice', async () => {
      await service.initialize();
      await service.initialize();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('sendBatchToProduction', () => {
    it('should create work orders for batch subjects', async () => {
      await service.initialize();

      const payload: BatchToProductionPayload = {
        batchId: 'BATCH-001',
        batchName: 'Term 1 2026',
        schoolName: 'Test School',
        subjects: [
          {
            subject: 'Mathematics',
            className: 'Form 1',
            pages: 20,
            candidates: 50,
            extraCopies: 5,
            baseSheets: 10,
            totalSheets: 15,
            totalPages: 30,
            productionCopies: 55,
          },
          {
            subject: 'English',
            className: 'Form 1',
            pages: 15,
            candidates: 50,
            extraCopies: 3,
            baseSheets: 8,
            totalSheets: 12,
            totalPages: 24,
            productionCopies: 53,
          },
        ],
        priority: 'High',
      };

      const jobs = await service.sendBatchToProduction(payload, mockCreateWorkOrder);

      expect(jobs).toHaveLength(2);
      expect(mockCreateWorkOrder).toHaveBeenCalledTimes(2);
      expect(jobs[0].subject).toBe('Mathematics');
      expect(jobs[1].subject).toBe('English');
      expect(jobs[0].batchId).toBe('BATCH-001');
      expect(jobs[0].schoolName).toBe('Test School');
    });

    it('should set correct attributes on work orders', async () => {
      await service.initialize();

      const payload: BatchToProductionPayload = {
        batchId: 'BATCH-002',
        batchName: 'Term 2 2026',
        schoolName: 'Another School',
        subjects: [
          {
            subject: 'Science',
            className: 'Form 2',
            pages: 25,
            candidates: 40,
            extraCopies: 4,
            baseSheets: 12,
            totalSheets: 18,
            totalPages: 36,
            productionCopies: 44,
          },
        ],
      };

      await service.sendBatchToProduction(payload, mockCreateWorkOrder);

      expect(mockCreateWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'EXAM-PRINT',
          productName: expect.stringContaining('Science'),
          quantityPlanned: 44,
          status: 'Scheduled',
          customerName: 'Another School',
          tags: expect.arrayContaining(['Examination', 'Form 2', 'BATCH-002']),
          attributes: expect.objectContaining({
            pages: 25,
            candidates: 40,
            total_sheets: 18,
            total_pages: 36,
          }),
        })
      );
    });

    it('should return empty array if no subjects', async () => {
      await service.initialize();

      const payload: BatchToProductionPayload = {
        batchId: 'BATCH-003',
        batchName: 'Empty Batch',
        schoolName: 'Test School',
        subjects: [],
      };

      const jobs = await service.sendBatchToProduction(payload, mockCreateWorkOrder);

      expect(jobs).toHaveLength(0);
      expect(mockCreateWorkOrder).not.toHaveBeenCalled();
    });
  });

  describe('getJobs', () => {
    it('should return all jobs', async () => {
      await service.initialize();

      const payload: BatchToProductionPayload = {
        batchId: 'BATCH-004',
        batchName: 'Test Batch',
        schoolName: 'Test School',
        subjects: [
          { subject: 'Math', className: 'Form 1', pages: 10, candidates: 20, extraCopies: 2, baseSheets: 5, totalSheets: 7, totalPages: 14, productionCopies: 22 },
          { subject: 'English', className: 'Form 1', pages: 8, candidates: 20, extraCopies: 2, baseSheets: 4, totalSheets: 6, totalPages: 12, productionCopies: 22 },
        ],
      };

      await service.sendBatchToProduction(payload, mockCreateWorkOrder);

      const jobs = service.getJobs();
      expect(jobs).toHaveLength(2);
    });
  });

  describe('getJobsByBatch', () => {
    it('should return jobs for a specific batch', async () => {
      await service.initialize();

      // Create jobs for batch 1
      await service.sendBatchToProduction({
        batchId: 'BATCH-005',
        batchName: 'Batch 1',
        schoolName: 'School A',
        subjects: [
          { subject: 'Math', className: 'Form 1', pages: 10, candidates: 20, extraCopies: 2, baseSheets: 5, totalSheets: 7, totalPages: 14, productionCopies: 22 },
        ],
      }, mockCreateWorkOrder);

      // Create jobs for batch 2
      await service.sendBatchToProduction({
        batchId: 'BATCH-006',
        batchName: 'Batch 2',
        schoolName: 'School B',
        subjects: [
          { subject: 'Science', className: 'Form 2', pages: 15, candidates: 30, extraCopies: 3, baseSheets: 8, totalSheets: 11, totalPages: 22, productionCopies: 33 },
        ],
      }, mockCreateWorkOrder);

      const batch1Jobs = service.getJobsByBatch('BATCH-005');
      expect(batch1Jobs).toHaveLength(1);
      expect(batch1Jobs[0].batchName).toBe('Batch 1');
    });
  });

  describe('getJobsByStatus', () => {
    it('should return jobs by status', async () => {
      await service.initialize();

      await service.sendBatchToProduction({
        batchId: 'BATCH-007',
        batchName: 'Test Batch',
        schoolName: 'Test School',
        subjects: [
          { subject: 'Math', className: 'Form 1', pages: 10, candidates: 20, extraCopies: 2, baseSheets: 5, totalSheets: 7, totalPages: 14, productionCopies: 22 },
        ],
      }, mockCreateWorkOrder);

      const pendingJobs = service.getJobsByStatus('pending');
      const inProgressJobs = service.getJobsByStatus('in_progress');

      // Jobs should be in_progress after creation (work order created)
      expect(inProgressJobs.length).toBeGreaterThan(0);
    });
  });

  describe('getPendingJobs', () => {
    it('should return pending jobs', async () => {
      await service.initialize();

      const pendingJobs = service.getPendingJobs();
      expect(Array.isArray(pendingJobs)).toBe(true);
    });
  });

  describe('getJobByWorkOrder', () => {
    it('should find job by work order ID', async () => {
      await service.initialize();

      await service.sendBatchToProduction({
        batchId: 'BATCH-008',
        batchName: 'Test Batch',
        schoolName: 'Test School',
        subjects: [
          { subject: 'Math', className: 'Form 1', pages: 10, candidates: 20, extraCopies: 2, baseSheets: 5, totalSheets: 7, totalPages: 14, productionCopies: 22 },
        ],
      }, mockCreateWorkOrder);

      // Get the work order ID from the mock call
      const workOrderId = mockCreateWorkOrder.mock.calls[0][0].id;
      const job = service.getJobByWorkOrder(workOrderId);

      expect(job).toBeDefined();
      expect(job?.workOrderId).toBe(workOrderId);
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status', async () => {
      await service.initialize();

      await service.sendBatchToProduction({
        batchId: 'BATCH-009',
        batchName: 'Test Batch',
        schoolName: 'Test School',
        subjects: [
          { subject: 'Math', className: 'Form 1', pages: 10, candidates: 20, extraCopies: 2, baseSheets: 5, totalSheets: 7, totalPages: 14, productionCopies: 22 },
        ],
      }, mockCreateWorkOrder);

      const jobs = service.getJobs();
      const jobId = jobs[0].id;

      const updated = await service.updateJobStatus(jobId, 'completed');
      expect(updated?.status).toBe('completed');
    });

    it('should return null for non-existent job', async () => {
      await service.initialize();

      const result = await service.updateJobStatus('non-existent-id', 'completed');
      expect(result).toBeNull();
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', async () => {
      await service.initialize();

      await service.sendBatchToProduction({
        batchId: 'BATCH-010',
        batchName: 'Test Batch',
        schoolName: 'Test School',
        subjects: [
          { subject: 'Math', className: 'Form 1', pages: 10, candidates: 20, extraCopies: 2, baseSheets: 5, totalSheets: 7, totalPages: 14, productionCopies: 22 },
          { subject: 'English', className: 'Form 1', pages: 8, candidates: 20, extraCopies: 2, baseSheets: 4, totalSheets: 6, totalPages: 12, productionCopies: 22 },
        ],
      }, mockCreateWorkOrder);

      const stats = service.getStatistics();

      expect(stats.total).toBe(2);
      expect(stats.inProgress).toBe(2); // Jobs are in_progress after creation
      expect(stats.totalQuantity).toBe(44); // 22 + 22
      expect(stats.totalSheets).toBe(13); // 7 + 6
    });
  });

  describe('clearJobs', () => {
    it('should clear all jobs', async () => {
      await service.initialize();

      await service.sendBatchToProduction({
        batchId: 'BATCH-011',
        batchName: 'Test Batch',
        schoolName: 'Test School',
        subjects: [
          { subject: 'Math', className: 'Form 1', pages: 10, candidates: 20, extraCopies: 2, baseSheets: 5, totalSheets: 7, totalPages: 14, productionCopies: 22 },
        ],
      }, mockCreateWorkOrder);

      expect(service.getJobs().length).toBeGreaterThan(0);

      await service.clearJobs();
      expect(service.getJobs()).toHaveLength(0);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(examinationProductionService).toBeDefined();
      expect(examinationProductionService).toBeInstanceOf(ExaminationProductionService);
    });
  });
});
