/**
 * Examination-Production Integration Service
 * Connects examination batches to production work orders
 * When a batch is calculated, it creates work orders in the Production Queue
 */

import { logger } from './logger';
import { notificationService } from './notificationService';
import { dbService } from './db';
import { createWorkOrdersFromBatch, type WorkOrderPayload } from '../src/adapters/productionAdapter';

export interface ExaminationProductionJob {
  id: string;
  batchId: string;
  batchName: string;
  workOrderId: string;
  subject: string;
  className: string;
  schoolName: string;
  quantity: number;
  totalPages: number;
  totalSheets: number;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  createdAt: string;
  updatedAt: string;
  dueDate: string;
  attributes: {
    pages: number;
    candidates: number;
    base_sheets: number;
    total_sheets: number;
    total_pages: number;
    production_copies: number;
    extra_copies: number;
  };
}

export interface BatchToProductionPayload {
  batchId: string;
  batchName: string;
  schoolName: string;
  subjects: Array<{
    subject: string;
    className: string;
    pages: number;
    candidates: number;
    extraCopies: number;
    baseSheets: number;
    totalSheets: number;
    totalPages: number;
    productionCopies: number;
  }>;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate?: string;
}

const EXAM_PRODUCTION_JOBS_KEY = 'examination_production_jobs';

class ExaminationProductionService {
  private jobs: Map<string, ExaminationProductionJob> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadJobs();
      this.initialized = true;
      logger.info('Examination-Production service initialized', {
        jobs: this.jobs.size,
      });
    } catch (error) {
      logger.error('Failed to initialize examination-production service', error as Error);
      throw error;
    }
  }

  /**
   * Load jobs from storage
   */
  private async loadJobs(): Promise<void> {
    try {
      const saved = await dbService.getSetting<ExaminationProductionJob[]>(EXAM_PRODUCTION_JOBS_KEY);
      if (saved && saved.length > 0) {
        saved.forEach(job => this.jobs.set(job.id, job));
      } else {
        const local = localStorage.getItem(EXAM_PRODUCTION_JOBS_KEY);
        if (local) {
          const jobs: ExaminationProductionJob[] = JSON.parse(local);
          jobs.forEach(job => this.jobs.set(job.id, job));
        }
      }
    } catch (error) {
      logger.error('Failed to load examination production jobs', error as Error);
    }
  }

  /**
   * Save jobs to storage
   */
  private async saveJobs(): Promise<void> {
    try {
      const jobs = Array.from(this.jobs.values());
      await dbService.saveSetting(EXAM_PRODUCTION_JOBS_KEY, jobs);
    } catch (error) {
      logger.error('Failed to save examination production jobs', error as Error);
    }
  }

  /**
   * Convert a calculated batch to production work orders
   * This is called when a batch status changes to 'Calculated'
   */
  async sendBatchToProduction(
    payload: BatchToProductionPayload,
    createWorkOrderFn: (wo: any) => void
  ): Promise<ExaminationProductionJob[]> {
    try {
      await this.initialize();

      const createdJobs: ExaminationProductionJob[] = [];
      const records = createWorkOrdersFromBatch(payload);

      for (const record of records) {
        const job: ExaminationProductionJob = { ...record.job };
        this.jobs.set(job.id, job);
        createdJobs.push(job);

        try {
          createWorkOrderFn(record.workOrder as WorkOrderPayload);
          job.status = 'in_progress';
          job.updatedAt = new Date().toISOString();
        } catch (error) {
          logger.error('Failed to create work order for examination subject', error as Error, {
            batchId: payload.batchId,
            subject: job.subject,
          });
        }
      }

      await this.saveJobs();

      // Send notification
      notificationService.notify({
        type: 'success',
        title: 'Examination Batch Sent to Production',
        message: `${createdJobs.length} work order(s) created for batch "${payload.batchName}" (${payload.schoolName})`,
        entityType: 'ExaminationBatch',
        entityId: payload.batchId,
        actionUrl: '/industrial/work-orders',
      });

      logger.info('Batch sent to production', {
        batchId: payload.batchId,
        batchName: payload.batchName,
        jobsCreated: createdJobs.length,
      });

      return createdJobs;
    } catch (error) {
      logger.error('Failed to send batch to production', error as Error, {
        batchId: payload.batchId,
      });
      throw error;
    }
  }

  /**
   * Get all examination production jobs
   */
  getJobs(): ExaminationProductionJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs by batch ID
   */
  getJobsByBatch(batchId: string): ExaminationProductionJob[] {
    return Array.from(this.jobs.values()).filter(job => job.batchId === batchId);
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: ExaminationProductionJob['status']): ExaminationProductionJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  /**
   * Get pending jobs (ready for production)
   */
  getPendingJobs(): ExaminationProductionJob[] {
    return this.getJobsByStatus('pending');
  }

  /**
   * Get job by work order ID
   */
  getJobByWorkOrder(workOrderId: string): ExaminationProductionJob | undefined {
    return Array.from(this.jobs.values()).find(job => job.workOrderId === workOrderId);
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: ExaminationProductionJob['status']
  ): Promise<ExaminationProductionJob | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    job.status = status;
    job.updatedAt = new Date().toISOString();
    await this.saveJobs();

    return job;
  }

  /**
   * Update job by work order ID
   */
  async updateJobByWorkOrder(
    workOrderId: string,
    updates: Partial<ExaminationProductionJob>
  ): Promise<ExaminationProductionJob | null> {
    const job = this.getJobByWorkOrder(workOrderId);
    if (!job) return null;

    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    await this.saveJobs();

    return job;
  }

  /**
   * Get statistics for examination production jobs
   */
  getStatistics(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    totalQuantity: number;
    totalSheets: number;
  } {
    const jobs = Array.from(this.jobs.values());
    
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      inProgress: jobs.filter(j => j.status === 'in_progress').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
      totalQuantity: jobs.reduce((sum, j) => sum + j.quantity, 0),
      totalSheets: jobs.reduce((sum, j) => sum + j.totalSheets, 0),
    };
  }

  /**
   * Clear all jobs (for testing/reset)
   */
  async clearJobs(): Promise<void> {
    this.jobs.clear();
    await this.saveJobs();
  }
}

// Export singleton instance
export const examinationProductionService = new ExaminationProductionService();

// Export class for testing
export { ExaminationProductionService };
