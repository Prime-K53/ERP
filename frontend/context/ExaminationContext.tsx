import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { logger } from '@/services/logger';
import {
  ExaminationJob,
  ExaminationJobSubject,
  ExaminationInvoiceGroup,
  ExaminationRecurringProfile,
  ExaminationJobPayload,
  ExaminationGroupPayload,
  ExaminationRecurringPayload,
  School,
  Customer,
  MarketAdjustment,
  ExaminationBatch,
  ExaminationClass,
  ExaminationSubject
} from '../types';
import { ExaminationJobState } from '../services/examinationJobService';
import { examinationJobService } from '../services/examinationJobService';
import { examinationBatchService, ExaminationGeneratedInvoicePayload } from '../services/examinationBatchService';
import { dbService } from '../services/db';
import { useSalesStore } from '../stores/salesStore';
import { generateNextId } from '../utils/helpers';
import { ExaminationInvoiceSyncResult, persistExaminationInvoiceToFinance } from '../services/examinationInvoiceSyncService';
import { examinationNotificationService } from '../services/examinationNotificationService';
import { examinationSyncService } from '../services/examinationSyncService';
import { jobTicketConversionService } from '../services/jobTicketConversionService';
import {
  sendBatchApprovedNotification,
  sendBatchCalculatedNotification,
  sendBatchCreatedNotification
} from '../src/adapters/notificationAdapter';
import { customerNotificationService } from '../services/customerNotificationService';
import { examinationProductionService, BatchToProductionPayload } from '../services/examinationProductionService';
import { MARKET_ADJUSTMENTS_CHANGED_EVENT } from '../utils/marketAdjustmentUtils';
import { useAuth } from './AuthContext';
import { useProduction } from './ProductionContext';

interface ExaminationContextType {
  // State
  jobs: ExaminationJob[];
  subjects: ExaminationJobSubject[];
  groups: ExaminationInvoiceGroup[];
  recurringProfiles: ExaminationRecurringProfile[];
  schools: School[];
  customers: Customer[];
  marketAdjustments: MarketAdjustment[];

  // New Batches
  batches: ExaminationBatch[];
  batchLoadError: string | null;
  loadBatches: () => Promise<void>;
  createBatch: (payload: Partial<ExaminationBatch>) => Promise<ExaminationBatch>;
  deleteBatch: (id: string) => Promise<void>;
  deleteBatches: (ids: string[]) => Promise<{ success: string[]; failed: { id: string; error: string }[] }>;
  calculateBatch: (id: string) => Promise<ExaminationBatch>;
  approveBatch: (id: string) => Promise<{ batch: ExaminationBatch; warnings: Array<{ item_id: string; item_name: string; available: number; required: number; message: string }> }>;
  generateInvoice: (id: string) => Promise<{
    success: boolean;
    invoiceId: number;
    created?: boolean;
    idempotent?: boolean;
    invoice?: ExaminationGeneratedInvoicePayload;
    sync?: ExaminationInvoiceSyncResult;
  }>;
  convertBatchToJobTicket: (id: string) => Promise<string>;

  // Loading states
  loading: boolean;
  jobLoading: boolean;
  groupLoading: boolean;

  // Actions
  loadAllData: () => Promise<void>;
  createJob: (payload: ExaminationJobPayload) => Promise<ExaminationJob>;
  updateJob: (examId: string, updates: Partial<ExaminationJobPayload>) => Promise<ExaminationJob>;
  deleteJob: (examId: string) => Promise<void>;
  recalculateJob: (examId: string) => Promise<ExaminationJob>;
  approveJob: (examId: string) => Promise<ExaminationJob>;
  createInvoiceForJobs: (jobIds: string[]) => Promise<{ invoice_id: string; total_amount: number; job_ids: string[] }>;

  // Groups
  createGroup: (payload: ExaminationGroupPayload) => Promise<ExaminationInvoiceGroup>;
  addJobsToGroup: (groupId: string, jobIds: string[]) => Promise<ExaminationInvoiceGroup>;
  removeJobFromGroup: (groupId: string, jobId: string) => Promise<ExaminationInvoiceGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  generateInvoiceForGroup: (groupId: string) => Promise<{ invoice_id: string; total_amount: number; job_ids: string[] }>;

  // Recurring
  createRecurringProfile: (sourceType: 'job' | 'group', sourceId: string, payload: ExaminationRecurringPayload) => Promise<ExaminationRecurringProfile>;
  pauseRecurringProfile: (profileId: string) => Promise<ExaminationRecurringProfile>;
  resumeRecurringProfile: (profileId: string) => Promise<ExaminationRecurringProfile>;
  deleteRecurringProfile: (profileId: string) => Promise<void>;
  runRecurringBilling: (asOfDate?: string) => Promise<{ processed_profiles: number; generated_invoices: number; errors: Array<{ profile_id: string; error: string }> }>;

  // Utilities
  getJobWithSubjects: (examId: string) => Promise<{ job: ExaminationJob; subjects: ExaminationJobSubject[] }>;
  getJobsBySchool: (schoolId: string) => ExaminationJob[];
  getJobsByStatus: (status: ExaminationJob['status']) => ExaminationJob[];
  getAvailableJobsForGroup: (schoolId: string) => ExaminationJob[];

  // Pricing Lock
  lockPricing: (examId: string, userId?: string) => Promise<ExaminationJobState>;
  unlockPricing: (examId: string) => Promise<ExaminationJobState>;
}

const ExaminationContext = createContext<ExaminationContextType | undefined>(undefined);

export const useExamination = () => {
  const context = useContext(ExaminationContext);
  if (!context) {
    throw new Error('useExamination must be used within an ExaminationProvider');
  }
  return context;
};

interface ExaminationProviderProps {
  children: ReactNode;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error(`${label} request timed out after ${ms}ms`)), ms);
    })
  ]).finally(() => clearTimeout(timerId));
};

const EXAMINATION_REFRESH_TTL_MS = 60000;

export const ExaminationProvider: React.FC<ExaminationProviderProps> = ({ children }) => {
  const { companyConfig, user, notify } = useAuth();
  const [jobs, setJobs] = useState<ExaminationJob[]>([]);
  const [subjects, setSubjects] = useState<ExaminationJobSubject[]>([]);
  const [groups, setGroups] = useState<ExaminationInvoiceGroup[]>([]);
  const [recurringProfiles, setRecurringProfiles] = useState<ExaminationRecurringProfile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [marketAdjustments, setMarketAdjustments] = useState<MarketAdjustment[]>([]);
  const [batches, setBatches] = useState<ExaminationBatch[]>([]);
  const [batchLoadError, setBatchLoadError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const loadAllDataInFlightRef = useRef<Promise<void> | null>(null);
  const loadBatchesInFlightRef = useRef<Promise<void> | null>(null);
  const lastLoadAllAtRef = useRef(0);
  const lastLoadBatchesAtRef = useRef(0);

  const refreshMarketAdjustments = useCallback(async () => {
    try {
      const marketAdjustmentsData = await dbService.getAll<MarketAdjustment>('marketAdjustments');
      setMarketAdjustments(marketAdjustmentsData || []);
    } catch (error) {
      logger.error('[Examination] Failed to refresh market adjustments:', error);
    }
  }, [user?.id]);

  const loadAllData = useCallback(async () => {
    if (loadAllDataInFlightRef.current) {
      return loadAllDataInFlightRef.current;
    }

    if (
      lastLoadAllAtRef.current > 0
      && Date.now() - lastLoadAllAtRef.current < EXAMINATION_REFRESH_TTL_MS
    ) {
      return;
    }

    const request = (async () => {
      setLoading(true);
      const DEFAULT_TIMEOUT = 15000; // 15 seconds for UI responsiveness

      try {
        const [
          jobsResult,
          groupsResult,
          recurringResult,
          schoolsResult,
          customersResult,
          marketAdjustmentsResult,
          batchesResult
        ] = await Promise.allSettled([
          withTimeout(examinationJobService.listJobs(), DEFAULT_TIMEOUT, 'jobs'),
          withTimeout(examinationJobService.listInvoiceGroups(), DEFAULT_TIMEOUT, 'invoice groups'),
          withTimeout(examinationJobService.listRecurringProfiles(), DEFAULT_TIMEOUT, 'recurring profiles'),
          withTimeout(dbService.getAll<School>('schools'), DEFAULT_TIMEOUT * 2, 'schools'),
          withTimeout(dbService.getAll<Customer>('customers'), DEFAULT_TIMEOUT * 2, 'customers'),
          withTimeout(dbService.getAll<MarketAdjustment>('marketAdjustments'), DEFAULT_TIMEOUT * 2, 'market adjustments'),
          withTimeout(examinationBatchService.listBatches(), DEFAULT_TIMEOUT * 2, 'batches')
        ]);

        const pick = <T,>(result: PromiseSettledResult<T>, fallback: T, label: string): T => {
          if (result.status === 'fulfilled') {
            return result.value;
          }
          logger.error(`[Examination] Failed to load ${label}:`, result.reason);
          return fallback;
        };

        const jobsData = pick(jobsResult, [] as ExaminationJob[], 'jobs');
        const groupsData = pick(groupsResult, [] as ExaminationInvoiceGroup[], 'invoice groups');
        const recurringData = pick(recurringResult, [] as ExaminationRecurringProfile[], 'recurring profiles');
        const schoolsData = pick(schoolsResult, [] as School[], 'schools');
        const customersData = pick(customersResult, [] as Customer[], 'customers');
        const marketAdjustmentsData = pick(marketAdjustmentsResult, [] as MarketAdjustment[], 'market adjustments');

        let batchesData: ExaminationBatch[] | null = null;
        if (batchesResult.status === 'fulfilled') {
          batchesData = batchesResult.value || [];
          setBatchLoadError(null);
        } else {
          logger.error('[Examination] Failed to load batches:', batchesResult.reason);
          const reasonMessage = batchesResult.reason instanceof Error
            ? batchesResult.reason.message
            : String(batchesResult.reason || 'Unknown error');
          setBatchLoadError(`Failed to load batches: ${reasonMessage}`);
        }

        const customerSchools: School[] = (customersData || []).map(customer => ({
          id: customer.id,
          name: customer.name,
          address: customer.address || customer.billingAddress || customer.shippingAddress || '',
          contactPerson: customer.name,
          phone: customer.phone || '',
          email: customer.email || '',
          source: 'customer' as const
        }));

        const mergedSchools = [
          ...schoolsData,
          ...customerSchools
        ].filter((school, index, self) => index === self.findIndex(entry => entry.id === school.id));

        setJobs(jobsData);
        setGroups(groupsData);
        setRecurringProfiles(recurringData);
        setSchools(mergedSchools);
        setCustomers(customersData || []);
        setMarketAdjustments(marketAdjustmentsData);
        if (batchesData) {
          setBatches(batchesData);
        }

        // Extract subjects from jobs
        const allSubjects = jobsData.flatMap(job => job.subjects || []);
        setSubjects(allSubjects);
        lastLoadAllAtRef.current = Date.now();
      } catch (error) {
        logger.error('Error loading examination data:', error);
      } finally {
        setLoading(false);
      }
    })();

    loadAllDataInFlightRef.current = request;
    try {
      await request;
    } finally {
      loadAllDataInFlightRef.current = null;
    }
  }, []);

  const loadBatches = useCallback(async () => {
    if (loadBatchesInFlightRef.current) {
      return loadBatchesInFlightRef.current;
    }

    if (
      lastLoadBatchesAtRef.current > 0
      && Date.now() - lastLoadBatchesAtRef.current < EXAMINATION_REFRESH_TTL_MS
    ) {
      return;
    }

    const request = (async () => {
      try {
        const data = await examinationBatchService.listBatches();
        setBatches(data);
        setBatchLoadError(null);
        lastLoadBatchesAtRef.current = Date.now();
      } catch (error) {
        logger.error('Error loading batches:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setBatchLoadError(`Failed to load batches: ${message}`);
      }
    })();

    loadBatchesInFlightRef.current = request;
    try {
      await request;
    } finally {
      loadBatchesInFlightRef.current = null;
    }
  }, []);

  const createBatch = useCallback(async (payload: Partial<ExaminationBatch>) => {
    setLoading(true);
    try {
      const result = await examinationBatchService.createBatch(payload);
      setBatchLoadError(null);
      lastLoadBatchesAtRef.current = Date.now();
      lastLoadAllAtRef.current = Date.now();
      setBatches(prev => {
        const withoutCurrent = prev.filter((batch) => String(batch.id) !== String(result.id));
        const next = [...withoutCurrent, result];
        next.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        return next;
      });
      try {
        await sendBatchCreatedNotification(result, user?.id);
      } catch (notificationError) {
        logger.error('[Examination] Failed to create batch created notification:', notificationError);
      }
      return result;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBatch = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await examinationBatchService.deleteBatch(id);
      setBatches(prev => prev.filter(b => b.id !== id));
      lastLoadBatchesAtRef.current = Date.now();
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBatches = useCallback(async (ids: string[]) => {
    setLoading(true);
    try {
      const results = await examinationBatchService.deleteBatches(ids);
      // Remove successfully deleted batches from state
      setBatches(prev => prev.filter(b => !results.success.includes(b.id)));
      lastLoadBatchesAtRef.current = Date.now();
      return results;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Send a calculated batch to the production queue
   * Creates work orders for each subject in the batch
   */
  const sendBatchToProduction = useCallback(async (batch: ExaminationBatch) => {
    try {
      // Get school name - try schools list, then customers list, then batch fields directly
      let school = schools.find(s => String(s.id) === String(batch.school_id));
      let schoolName = school?.name;

      // If no school found in schools list, try customers list
      if (!schoolName) {
        const customer = customers.find(c => String(c.id) === String(batch.school_id));
        schoolName = customer?.name;
      }

      // Fallback: read name directly off the batch object (API often includes it)
      if (!schoolName) {
        const extBatch = batch as ExaminationBatch & { school_name?: string; customer_name?: string; schoolName?: string; customerName?: string };
        schoolName = extBatch.school_name
          || extBatch.customer_name
          || extBatch.schoolName
          || extBatch.customerName
          || null;
      }

      // Final fallback
      if (!schoolName) {
        schoolName = 'Unknown Customer';
      }

      // Extract subjects from batch classes
      const subjects: BatchToProductionPayload['subjects'] = [];

      if (batch.classes && batch.classes.length > 0) {
        for (const cls of batch.classes) {
          if (cls.subjects && cls.subjects.length > 0) {
            for (const subj of cls.subjects) {
              subjects.push({
                subject: subj.subject_name || subj.name || 'Unknown Subject',
                className: cls.class_name || cls.name || 'Unknown Class',
                pages: subj.pages || 0,
                candidates: cls.number_of_learners || cls.candidates || 0,
                extraCopies: subj.extra_copies || 0,
                baseSheets: subj.base_sheets || 0,
                totalSheets: subj.total_sheets || 0,
                totalPages: subj.total_pages || 0,
                productionCopies: subj.production_copies || subj.total_sheets || 0,
              });
            }
          }
        }
      }

      if (subjects.length === 0) {
        console.warn('[Examination] No subjects found in batch to send to production');
        return;
      }

      // Create work orders using the production context
      const payload: BatchToProductionPayload = {
        batchId: batch.id,
        batchName: batch.name,
        schoolName,
        subjects,
        priority: 'Medium',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      };

      // Use the examination production service to create work orders
      await examinationProductionService.sendBatchToProduction(payload, (workOrder) => {
        // This callback will be called for each work order
        // We need to use the production context's createWorkOrder function
        // But since we're in ExaminationContext, we'll dispatch a custom event
        // that ProductionContext can listen to
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('examination-batch-to-production', {
            detail: { workOrder: { ...workOrder, source: 'examination' }, batch }
          }));
        }
      });

      console.log(`[Examination] Batch ${batch.id} sent to production with ${subjects.length} subject(s)`);
    } catch (error) {
      logger.error('[Examination] Failed to send batch to production:', error);
      throw error;
    }
  }, [schools, customers]);

  const calculateBatch = useCallback(async (id: string) => {
    setLoading(true);
    try {
      try {
        await examinationSyncService.syncMarketAdjustmentsToBackend({
          triggerRecalculate: false
        });
        await examinationSyncService.syncBomRelevantInventoryToBackend({
          triggerRecalculate: false
        });
      } catch (syncError) {
        // Non-blocking: subject/class operations must still proceed even when sync is temporarily unavailable.
        console.warn('[Examination] Pre-calculation sync skipped due to error:', syncError);
      }
      const result = await examinationBatchService.calculateBatch(id, {
        roundingMethod: companyConfig?.pricingSettings?.defaultMethod,
        roundingValue: Number(companyConfig?.pricingSettings?.customStep || 50)
      });
      
      // Enrich the calculated result with the full batch details safely
      // Calculation endpoints often drop joined relation IDs or fields natively, leading to "Unknown" fields downstream.
      let enrichedResult = result;
      try {
          const freshBatchDetails = await examinationBatchService.getBatch(id);
          enrichedResult = { 
              ...freshBatchDetails, 
              ...result, 
              school_id: result.school_id || freshBatchDetails.school_id 
          };
      } catch (err) {
          console.warn('[Examination] Failed to load full batch details for calculated result enrichment.');
      }

      setBatches(prev => prev.map(b => b.id === id ? enrichedResult : b));

      // Create notification for batch calculation
      try {
        await sendBatchCalculatedNotification(enrichedResult, user?.id);
      } catch (notificationError) {
        logger.error('[Examination] Failed to create batch notification:', notificationError);
        // Non-blocking: continue even if notification fails
      }

      // Send batch to production queue
      try {
        await sendBatchToProduction(enrichedResult);
      } catch (productionError) {
        logger.error('[Examination] Failed to send batch to production:', productionError);
        // Non-blocking: continue even if production sync fails
      }

      return enrichedResult;
    } finally {
      setLoading(false);
    }
  }, [companyConfig?.pricingSettings?.customStep, companyConfig?.pricingSettings?.defaultMethod, user?.id, sendBatchToProduction]);

  const approveBatch = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { batch, warnings } = await examinationBatchService.approveBatch(id);
      setBatches(prev => prev.map(b => b.id === id ? batch : b));

      // Create notification for batch approval
      try {
        await sendBatchApprovedNotification(batch, user?.id);

        // Trigger Customer Notification (External messaging app)
        const school = schools.find(s => String(s.id) === String(batch.school_id));
        if (school?.phone) {
          customerNotificationService.triggerNotification('EXAM_BATCH', {
            id: batch.id,
            customerName: school.name,
            phoneNumber: school.phone,
            count: batch.expected_candidature || batch.total_students || 0
          });
        }
      } catch (notificationError) {
        logger.error('[Examination] Failed to create approval notification:', notificationError);
        // Non-blocking: continue even if notification fails
      }

      return { batch, warnings };
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const generateInvoice = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const sales = useSalesStore.getState().sales;
      const invoiceNumber = generateNextId('examination_invoice', sales, companyConfig);
      
      const result = await examinationBatchService.generateInvoice(id, {
        idempotencyKey: `EXAM-BATCH-${id}`,
        invoiceNumber
      });
      let sync: ExaminationInvoiceSyncResult | undefined;
      let syncedInvoicePayload: ExaminationGeneratedInvoicePayload | undefined;

      if (result.success && result.invoice) {
        const sourceBatch = batches.find(batch => batch.id === id);
        const sourceSchoolId = String(sourceBatch?.school_id ?? result.invoice.customerId ?? '').trim();
        const resolvedSchoolName = sourceSchoolId
          ? schools.find((school) => String(school.id) === sourceSchoolId)?.name
          : undefined;

        const normalizedInvoicePayload: ExaminationGeneratedInvoicePayload = resolvedSchoolName
          ? {
              ...result.invoice,
              customerName: resolvedSchoolName,
              schoolName: resolvedSchoolName,
              origin_batch_id: sourceBatch?.batch_number || sourceBatch?.batchNumber || id,
              batchId: sourceBatch?.batch_number || sourceBatch?.batchNumber || id
            }
          : {
              ...result.invoice,
              origin_batch_id: sourceBatch?.batch_number || sourceBatch?.batchNumber || id,
              batchId: sourceBatch?.batch_number || sourceBatch?.batchNumber || id
            };

        syncedInvoicePayload = normalizedInvoicePayload;
        sync = await persistExaminationInvoiceToFinance(normalizedInvoicePayload);
      }

      if (result.success) {
        // Refresh the batch to show updated status/invoice info
        const updatedBatch = await examinationBatchService.getBatch(id);
        setBatches(prev => prev.map(b => b.id === id ? updatedBatch : b));

        // Create notification for invoice generation
        try {
          await examinationNotificationService.createBatchNotification(
            id,
            'BATCH_INVOICED',
            updatedBatch,
            user?.id
          );

          const sourceSchoolId = String(updatedBatch?.school_id ?? syncedInvoicePayload?.customerId ?? '').trim();
          const schoolRecord = schools.find((school) => String(school.id) === sourceSchoolId);
          const customerRecord = customers.find((customer) =>
            String(customer.id) === sourceSchoolId
            || String(customer.name || '').trim().toLowerCase() === String(syncedInvoicePayload?.customerName || schoolRecord?.name || '').trim().toLowerCase()
          );
          const contactPhone = schoolRecord?.phone || customerRecord?.phone;
          const customerName = syncedInvoicePayload?.customerName || schoolRecord?.name || customerRecord?.name;

          if (syncedInvoicePayload && contactPhone && customerName) {
            await customerNotificationService.triggerNotification('EXAMINATION_INVOICE', {
              id: syncedInvoicePayload.invoiceNumber || syncedInvoicePayload.id,
              customerName,
              phoneNumber: contactPhone,
              amount: `${companyConfig?.currencySymbol || syncedInvoicePayload.currency || ''}${Number(syncedInvoicePayload.totalAmount || 0).toLocaleString()}`,
              dueDate: new Date(syncedInvoicePayload.dueDate || Date.now()).toLocaleDateString()
            });
          }
        } catch (notificationError) {
          logger.error('[Examination] Failed to create invoice notification:', notificationError);
          // Non-blocking: continue even if notification fails
        }
      }
      return { ...result, sync };
    } finally {
      setLoading(false);
    }
  }, [batches, companyConfig?.currencySymbol, customers, schools, user?.id]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMarketAdjustmentsChanged = () => {
      void refreshMarketAdjustments();
    };

    window.addEventListener(MARKET_ADJUSTMENTS_CHANGED_EVENT, handleMarketAdjustmentsChanged);
    return () => {
      window.removeEventListener(MARKET_ADJUSTMENTS_CHANGED_EVENT, handleMarketAdjustmentsChanged);
    };
  }, [refreshMarketAdjustments]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      examinationBatchService.syncPendingBatches();
      lastLoadBatchesAtRef.current = 0;
      loadBatches();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadBatches]);

  const createJob = useCallback(async (payload: ExaminationJobPayload) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.createJob(payload);
      setJobs(prev => [...prev, result.job]);
      setSubjects(prev => [...prev, ...result.subjects]);
      return result.job;
    } finally {
      setJobLoading(false);
    }
  }, []);

  const updateJob = useCallback(async (examId: string, updates: Partial<ExaminationJobPayload>) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.updateJob(examId, updates);
      setJobs(prev => prev.map(job => job.id === examId ? result.job : job));
      setSubjects(prev => {
        const otherSubjects = prev.filter(s => s.examination_job_id !== examId);
        return [...otherSubjects, ...result.subjects];
      });
      return result.job;
    } finally {
      setJobLoading(false);
    }
  }, []);

  const deleteJob = useCallback(async (examId: string) => {
    setJobLoading(true);
    try {
      await examinationJobService.deleteJob(examId);
      setJobs(prev => prev.filter(job => job.id !== examId));
      setSubjects(prev => prev.filter(s => s.examination_job_id !== examId));
    } finally {
      setJobLoading(false);
    }
  }, []);

  const recalculateJob = useCallback(async (examId: string) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.recalculateExam(examId);
      setJobs(prev => prev.map(job => job.id === examId ? result.job : job));
      setSubjects(prev => {
        const otherSubjects = prev.filter(s => s.examination_job_id !== examId);
        return [...otherSubjects, ...result.subjects];
      });
      return result.job;
    } finally {
      setJobLoading(false);
    }
  }, []);

  const approveJob = useCallback(async (examId: string) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.approveJob(examId);
      setJobs(prev => prev.map(job => job.id === examId ? result.job : job));
      return result.job;
    } finally {
      setJobLoading(false);
    }
  }, []);

  const createInvoiceForJobs = useCallback(async (jobIds: string[]) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.createInvoiceForJobs(jobIds);
      // Update job statuses
      setJobs(prev => prev.map(job =>
        jobIds.includes(job.id)
          ? { ...job, status: 'Invoiced' as const, invoice_id: result.invoice_id }
          : job
      ));
      return result;
    } finally {
      setJobLoading(false);
    }
  }, []);

  // Groups
  const createGroup = useCallback(async (payload: ExaminationGroupPayload) => {
    setGroupLoading(true);
    try {
      const result = await examinationJobService.createInvoiceGroup(payload);
      setGroups(prev => [...prev, result]);
      return result;
    } finally {
      setGroupLoading(false);
    }
  }, []);

  const addJobsToGroup = useCallback(async (groupId: string, jobIds: string[]) => {
    setGroupLoading(true);
    try {
      const result = await examinationJobService.addJobsToGroup(groupId, jobIds);
      setGroups(prev => prev.map(group => group.id === groupId ? result : group));
      return result;
    } finally {
      setGroupLoading(false);
    }
  }, []);

  const removeJobFromGroup = useCallback(async (groupId: string, jobId: string) => {
    setGroupLoading(true);
    try {
      const result = await examinationJobService.removeJobFromGroup(groupId, jobId);
      setGroups(prev => prev.map(group => group.id === groupId ? result : group));
      return result;
    } finally {
      setGroupLoading(false);
    }
  }, []);

  const deleteGroup = useCallback(async (groupId: string) => {
    setGroupLoading(true);
    try {
      await examinationJobService.deleteInvoiceGroup(groupId);
      setGroups(prev => prev.filter(group => group.id !== groupId));
      // Remove group assignment from jobs
      setJobs(prev => prev.map(job =>
        job.invoice_group_id === groupId
          ? { ...job, invoice_group_id: undefined }
          : job
      ));
    } finally {
      setGroupLoading(false);
    }
  }, []);

  const generateInvoiceForGroup = useCallback(async (groupId: string) => {
    setGroupLoading(true);
    try {
      const result = await examinationJobService.generateInvoiceForGroup(groupId);
      setGroups(prev => prev.map(group =>
        group.id === groupId
          ? { ...group, status: 'Invoiced' as const, invoice_id: result.invoice_id }
          : group
      ));
      // Update job statuses
      setJobs(prev => prev.map(job =>
        job.invoice_group_id === groupId
          ? { ...job, status: 'Invoiced' as const, invoice_id: result.invoice_id }
          : job
      ));
      return result;
    } finally {
      setGroupLoading(false);
    }
  }, []);

  // Recurring
  const createRecurringProfile = useCallback(async (sourceType: 'job' | 'group', sourceId: string, payload: ExaminationRecurringPayload) => {
    setJobLoading(true);
    try {
      const result = sourceType === 'job'
        ? await examinationJobService.convertJobToRecurring(sourceId, payload)
        : await examinationJobService.convertGroupToRecurring(sourceId, payload);
      setRecurringProfiles(prev => [...prev, result]);
      return result;
    } finally {
      setJobLoading(false);
    }
  }, []);

  const pauseRecurringProfile = useCallback(async (profileId: string) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.pauseRecurringProfile(profileId);
      setRecurringProfiles(prev => prev.map(profile => profile.id === profileId ? result : profile));
      return result;
    } finally {
      setJobLoading(false);
    }
  }, []);

  const resumeRecurringProfile = useCallback(async (profileId: string) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.resumeRecurringProfile(profileId);
      setRecurringProfiles(prev => prev.map(profile => profile.id === profileId ? result : profile));
      return result;
    } finally {
      setJobLoading(false);
    }
  }, []);

  const deleteRecurringProfile = useCallback(async (profileId: string) => {
    setJobLoading(true);
    try {
      await examinationJobService.deleteRecurringProfile(profileId);
      setRecurringProfiles(prev => prev.filter(profile => profile.id !== profileId));
    } finally {
      setJobLoading(false);
    }
  }, []);

  const runRecurringBilling = useCallback(async (asOfDate?: string) => {
    setJobLoading(true);
    try {
      const result = await examinationJobService.runRecurringBilling(asOfDate);
      // Reload data to reflect changes
      await loadAllData();
      return result;
    } finally {
      setJobLoading(false);
    }
  }, [loadAllData]);

  // Utilities
  const getJobWithSubjects = useCallback(async (examId: string) => {
    return examinationJobService.getJob(examId);
  }, []);

  const getJobsBySchool = useCallback((schoolId: string) => {
    return jobs.filter(job => job.school_id === schoolId);
  }, [jobs]);

  const getJobsByStatus = useCallback((status: ExaminationJob['status']) => {
    return jobs.filter(job => job.status === status);
  }, [jobs]);

  const getAvailableJobsForGroup = useCallback((schoolId: string) => {
    return jobs.filter(job =>
      job.school_id === schoolId &&
      job.status !== 'Invoiced' &&
      !job.invoice_group_id
    );
  }, [jobs]);

  const value: ExaminationContextType = {
    // State
    jobs,
    subjects,
    groups,
    recurringProfiles,
    schools,
    customers,
    marketAdjustments,
    batches,
    batchLoadError,

    // Loading states
    loading,
    jobLoading,
    groupLoading,

    // Actions
    loadAllData,
    loadBatches,
    createBatch,
    deleteBatch,
    deleteBatches,
    calculateBatch,
    approveBatch,
    generateInvoice,
    convertBatchToJobTicket: async (id: string) => {
      if (!user) {
        notify('You must be logged in to convert batches to job tickets.', 'error');
        throw new Error('User not authenticated');
      }

      setLoading(true);
      try {
        // Verify batch exists locally first
        const localBatch = await examinationBatchService.getBatch(id);
        if (!localBatch) {
          throw new Error('Examination batch data not found locally.');
        }
        const batchReference = String(localBatch.batch_number || localBatch.batchNumber || localBatch.name || id).trim() || id;

        const result = await jobTicketConversionService.convertExaminationBatchToJobTicket(id, {
          requestedBy: user.username || user.id,
          requesterRole: user.role || 'User'
        });

        await Promise.all([loadBatches(), loadAllData()]);
        notify(`Batch ${batchReference} converted to Job Ticket ${result.jobTicketId}`, 'success');
        return result.jobTicketId;
      } catch (error: any) {
        notify(`Conversion Failed: ${error.message}`, 'error');
        throw error;
      } finally {
        setLoading(false);
      }
    },

    createJob,
    updateJob,
    deleteJob,
    recalculateJob,
    approveJob,
    createInvoiceForJobs,

    // Groups
    createGroup,
    addJobsToGroup,
    removeJobFromGroup,
    deleteGroup,
    generateInvoiceForGroup,

    // Recurring
    createRecurringProfile,
    pauseRecurringProfile,
    resumeRecurringProfile,
    deleteRecurringProfile,
    runRecurringBilling,

    // Utilities
    getJobWithSubjects,
    getJobsBySchool,
    getJobsByStatus,
    getAvailableJobsForGroup,

    // Pricing Lock
    lockPricing: async (examId: string, userId?: string) => {
      setJobLoading(true);
      try {
        const result = await examinationJobService.lockPricing(examId, userId);
        setJobs(prev => prev.map(job => job.id === examId ? result.job : job));
        return result;
      } finally {
        setJobLoading(false);
      }
    },
    unlockPricing: async (examId: string) => {
      setJobLoading(true);
      try {
        const result = await examinationJobService.unlockPricing(examId);
        setJobs(prev => prev.map(job => job.id === examId ? result.job : job));
        return result;
      } finally {
        setJobLoading(false);
      }
    },
  };

  return (
    <ExaminationContext.Provider value={value}>
      {children}
    </ExaminationContext.Provider>
  );
};
