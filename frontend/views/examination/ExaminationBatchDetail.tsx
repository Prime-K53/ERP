import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/services/logger';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamination } from '../../context/ExaminationContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { examinationBatchService } from '../../services/examinationBatchService';
import { ExaminationBatch, ExaminationClass, ExaminationSubject } from '../../types';
import { toast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ArrowLeft, Plus, Trash2, CheckCircle, BookOpen, Users, BookText, FileText, ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Repeat, Printer, DollarSign } from 'lucide-react';
import { AddClassDialog } from './components/AddClassDialog';
import { ManageSubjectsDialog } from './components/ManageSubjectsDialog';
import { buildRecurringDraftFromExaminationBatch } from '../../utils/recurringConversion';
import { currencyService } from '../../services/currencyService';

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};
const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};
const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
  padding: '9px 16px', borderRadius: 9, cursor: 'pointer',
  border: 'none', color: '#fff',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  transition: 'all .15s ease'
};
const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
  padding: '9px 16px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'inline-flex', alignItems: 'center', gap: 6,
  transition: 'all .15s ease'
};

const ExaminationBatchDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { calculateBatch, deleteBatch, approveBatch, generateInvoice, createBatch, schools, loadAllData, convertBatchToJobTicket } = useExamination();
  const { fetchFinanceData } = useFinance();
  const { notify, checkPermission } = useAuth();
  const [batch, setBatch] = useState<ExaminationBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [isManageSubjectsOpen, setIsManageSubjectsOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ExaminationClass | null>(null);
  const [hiddenClasses, setHiddenClasses] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('exam_batch_collapsed');
      if (raw) {
        const data = JSON.parse(raw);
        const ids = data[id || ''];
        if (Array.isArray(ids)) return new Set(ids);
      }
    } catch {}
    return new Set();
  });
  const canOverrideExamCost = checkPermission('examination.cost.override');

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: 'warning' | 'danger' | 'info' | 'question';
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    type: 'question',
    onConfirm: () => {}
  });

  const [classRemoveConfirm, setClassRemoveConfirm] = useState<{
    open: boolean;
    classId: string | null;
  }>({ open: false, classId: null });

  const [jobTicketConfirm, setJobTicketConfirm] = useState<{
    open: boolean;
  }>({ open: false });

  const fetchBatch = async () => {
    if (!id) return;
    try {
      const data = await examinationBatchService.getBatch(id);
      setBatch(data);
      if (selectedClass) {
        const updatedClass = data.classes?.find(c => c.id === selectedClass.id);
        if (updatedClass) {
          setSelectedClass(updatedClass);
        }
      }
    } catch (error) {
      logger.error('Error fetching batch:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatch();
    if (schools.length === 0) {
      loadAllData();
    }
  }, [id]);


  const handleApprove = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Approve Batch',
      message: 'Are you sure you want to approve this batch? This will deduct inventory and lock the batch.',
      type: 'warning',
      onConfirm: async () => {
        setIsApproving(true);
        try {
          const { batch: updatedBatch, warnings } = await approveBatch(batch.id);
          setBatch(updatedBatch);
          if (warnings && warnings.length > 0) {
            warnings.forEach(w => notify(w.message, 'warning'));
            notify('Batch approved with inventory warnings.', 'warning');
          } else {
            notify('Batch approved successfully!', 'success');
          }
        } catch (error) {
          logger.error('Error approving batch:', error);
          notify('Failed to approve batch. Please check inventory levels.', 'error');
        } finally {
          setIsApproving(false);
        }
      }
    });
  };

  const handleGenerateInvoice = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Generate Invoice',
      message: 'Generate invoice for this batch?',
      type: 'question',
      onConfirm: async () => {
        setIsGeneratingInvoice(true);
        try {
          const result = await generateInvoice(batch.id);
          await fetchBatch();
          await fetchFinanceData();

          const syncedInvoiceId = result?.sync?.invoiceId || result?.invoice?.id || null;
          const syncFailed = Boolean(result?.invoice) && Boolean(result?.sync) && !result.sync.synced;

          if (syncFailed) {
            notify(
              result.sync?.message || 'Invoice generated in backend, but local Sales Invoice sync failed.',
              'error'
            );
            return;
          }

          notify(
            result?.idempotent
              ? 'Invoice already existed. Opened Sales Invoices.'
              : 'Invoice generated successfully. Opened Sales Invoices.',
            'success'
          );

          if (syncedInvoiceId) {
            navigate('/sales-flow/invoices', {
              state: {
                action: 'view',
                type: 'Invoice',
                id: syncedInvoiceId,
                filterInvoiceId: syncedInvoiceId,
                source: 'examination'
              }
            });
          } else {
            navigate('/sales-flow/invoices');
          }
        } catch (error) {
          logger.error('Error generating invoice:', error);
          notify('Failed to generate invoice.', 'error');
        } finally {
          setIsGeneratingInvoice(false);
        }
      }
    });
  };

  const handleCreatePatch = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Create Patch',
      message: 'Create a patch for this batch? This will create a new batch linked to this one.',
      type: 'info',
      onConfirm: async () => {
        try {
          const newBatch = await createBatch({
            school_id: batch.school_id,
            name: `Patch for ${batch.name}`,
            academic_year: batch.academic_year,
            term: batch.term,
            exam_type: batch.exam_type,
            type: 'Patch',
            parent_batch_id: batch.id,
          });
          const batchRef = String(newBatch.batch_number || newBatch.batchNumber || newBatch.id || '').trim();
          navigate(`/examination/batches/${newBatch.id}`, { state: { name: batchRef } });
        } catch (error) {
          logger.error('Error creating patch:', error);
          notify('Failed to create patch.', 'error');
        }
      }
    });
  };

  const handleDelete = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Delete Batch',
      message: 'Are you sure you want to delete this batch?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteBatch(batch.id);
          navigate('/examination/batches');
        } catch (error) {
          logger.error('Error deleting batch:', error);
          notify('Failed to delete batch.', 'error');
        }
      }
    });
  };

  const handleRecalculate = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Recalculate Batch',
      message: 'Recalculate this batch with current material prices and adjustments?',
      type: 'question',
      onConfirm: async () => {
        try {
          const updatedBatch = await examinationBatchService.recalculateBatch(batch.id);
          setBatch(updatedBatch);
          notify('Batch recalculated successfully!', 'success');
        } catch (error) {
          logger.error('Error recalculating batch:', error);
          notify('Failed to recalculate batch.', 'error');
        }
      }
    });
  };

  const handleConvertToJobTicket = async () => {
    if (!batch) return;
    try {
      await convertBatchToJobTicket(batch.id);
      navigate('/sales-flow/job-tickets');
    } catch (err) {
    }
    setJobTicketConfirm({ open: false });
  };

  const handleConvertToRecurring = () => {
    if (!batch) return;
    const recurringDraft = buildRecurringDraftFromExaminationBatch(batch, schoolName);
    navigate('/sales-flow/subscriptions', {
      state: {
        action: 'create',
        recurringDraft
      }
    });
  };

  const handleAddClass = async (data: { class_name: string; number_of_learners: number }) => {
    if (!batch) {
      throw new Error('Batch not loaded');
    }
    try {
      if (!data.class_name || !data.class_name.trim()) {
        throw new Error('Class name is required');
      }
      if (!data.number_of_learners || data.number_of_learners <= 0) {
        throw new Error('Number of learners must be greater than 0');
      }

      const createdClass = await examinationBatchService.addClass(batch.id, {
        ...data,
        currency: batch.currency
      });

      setBatch((prev) => {
        if (!prev) return prev;
        const currentClasses = Array.isArray(prev.classes) ? prev.classes : [];
        const alreadyExists = currentClasses.some((cls) => cls.id === createdClass.id);
        return {
          ...prev,
          classes: alreadyExists
            ? currentClasses
            : [...currentClasses, { ...createdClass, subjects: createdClass.subjects || [] }]
        };
      });

      notify(`Class "${data.class_name}" added successfully`, 'success');

      void fetchBatch().catch((refreshError) => {
        console.warn('Class added, but batch refresh failed:', refreshError);
      });
    } catch (error: any) {
      let errorMessage = 'Failed to add class';
      let debugInfo = '';
      
      if (error instanceof Error) {
        errorMessage = error.message || 'Failed to add class';
        
        if (errorMessage.includes('not found') || errorMessage.includes('create the batch first')) {
          debugInfo = `
            
            ──────────────────────────────
            🔍 Debug Information:
            • Batch ID: ${batch.id}
            • Batch Number: ${batch.batch_number || batch.batchNumber || 'N/A'}
            • Batch Name: ${batch.name}
            • Batch Status: ${batch.status}
            • Is Local ID: ${String(batch.id).startsWith('local-') ? 'Yes' : 'No'}
            
            Possible causes:
            1. Backend server not running
            2. Network/CORS issue
            3. Batch not synced to backend yet
            4. Wrong batch ID in URL (manual navigation?)
          `;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      logger.error('Error adding class:', error);
      notify(errorMessage, 'error');
      throw new Error(errorMessage);
    }
  };

  const handleManageSubjects = (cls: ExaminationClass) => {
    setSelectedClass(cls);
    setIsManageSubjectsOpen(true);
  };

  const handleAddSubject = async (data: Partial<ExaminationSubject>) => {
    if (!selectedClass || !batch) return;
    try {
      await examinationBatchService.addSubject(selectedClass.id, data);
      try {
        const updatedBatch = await calculateBatch(batch.id);
        setBatch(updatedBatch);

        if (updatedBatch && updatedBatch.classes) {
          const updatedCls = updatedBatch.classes.find(c => c.id === selectedClass.id);
          if (updatedCls) setSelectedClass(updatedCls);
        }
      } catch (recalcError) {
        console.warn('Recalculation failed after adding subject; refreshing batch instead.', recalcError);
        await fetchBatch();
      }
    } catch (error) {
      logger.error('Error adding subject:', error);
      throw error;
    }
  };

  const handleUpdateSubject = async (subjectId: string, data: Partial<ExaminationSubject>) => {
    if (!selectedClass || !batch) return;
    try {
      await examinationBatchService.updateSubject(subjectId, data);
      try {
        const updatedBatch = await calculateBatch(batch.id);
        setBatch(updatedBatch);

        if (updatedBatch && updatedBatch.classes) {
          const updatedCls = updatedBatch.classes.find(c => c.id === selectedClass.id);
          if (updatedCls) setSelectedClass(updatedCls);
        }
      } catch (recalcError) {
        console.warn('Recalculation failed after updating subject; refreshing batch instead.', recalcError);
        await fetchBatch();
      }
    } catch (error) {
      logger.error('Error updating subject:', error);
      throw error;
    }
  };

  const handleRemoveSubject = async (subjectId: string) => {
    if (!selectedClass || !batch) return;
    try {
      await examinationBatchService.deleteSubject(subjectId);
      try {
        const updatedBatch = await calculateBatch(batch.id);
        setBatch(updatedBatch);

        if (updatedBatch && updatedBatch.classes) {
          const updatedCls = updatedBatch.classes.find(c => c.id === selectedClass.id);
          if (updatedCls) setSelectedClass(updatedCls);
        }
      } catch (recalcError) {
        console.warn('Recalculation failed after removing subject; refreshing batch instead.', recalcError);
        await fetchBatch();
      }
    } catch (error) {
      logger.error('Error removing subject:', error);
      throw error;
    }
  };

  const sanitizeNumeric = (value: number | undefined | null): number => {
    if (value === undefined || value === null) return 0;
    if (!Number.isFinite(value)) return 0;
    return value;
  };

  const handleSaveClassPricing = async (
    classId: string,
    totals: {
      material_total_cost: number;
      adjustment_total_cost: number;
      market_adjustment_total?: number;
      rounding_adjustment?: number;
      calculated_total_cost: number;
      expected_fee_per_learner: number;
    }
  ) => {
    if (!batch) return;
    try {
      const classRef = batch.classes?.find(cls => cls.id === classId);
      const learnerCount = Math.max(0, Math.floor(Number(classRef?.number_of_learners) || 0));

      const sanitizedMaterialTotalCost = sanitizeNumeric(totals.material_total_cost);
      const sanitizedAdjustmentTotalCost = sanitizeNumeric(totals.adjustment_total_cost);
      const sanitizedMarketAdjustmentTotal = sanitizeNumeric(totals.market_adjustment_total ?? totals.adjustment_total_cost);
      const sanitizedRoundingAdjustment = sanitizeNumeric(totals.rounding_adjustment ?? 0);
      const sanitizedCalculatedTotalCost = sanitizeNumeric(totals.calculated_total_cost);
      const sanitizedExpectedFeePerLearner = sanitizeNumeric(totals.expected_fee_per_learner);

      const expectedFee = Number(sanitizedExpectedFeePerLearner ?? 0) || 0;
      const hasManualOverride = Boolean(Number(classRef?.is_manual_override || 0))
        && Number(classRef?.manual_cost_per_learner ?? 0) > 0;
      const manualFee = Number(classRef?.manual_cost_per_learner ?? 0);
      const finalFee = hasManualOverride ? manualFee : expectedFee;
      const liveTotalPreview = hasManualOverride
        ? Math.round(finalFee * learnerCount * 100) / 100
        : (sanitizedCalculatedTotalCost ?? Math.round(expectedFee * learnerCount * 100) / 100);

      const updatedClass = await examinationBatchService.updateClassFinancialMetrics(classId, {
        expected_fee_per_learner: expectedFee,
        final_fee_per_learner: finalFee,
        live_total_preview: liveTotalPreview,
        financial_metrics_source: hasManualOverride ? 'MANUAL_OVERRIDE' : 'SYSTEM_CALCULATION',
        material_total_cost: sanitizedMaterialTotalCost,
        adjustment_total_cost: sanitizedAdjustmentTotalCost,
        market_adjustment_total: sanitizedMarketAdjustmentTotal,
        rounding_adjustment: sanitizedRoundingAdjustment,
        calculated_total_cost: sanitizedCalculatedTotalCost
      });

      setBatch(prev => {
        if (!prev?.classes) return prev;
        return {
          ...prev,
          classes: prev.classes.map(cls => (
            cls.id === classId
              ? { ...cls, ...updatedClass, subjects: cls.subjects }
              : cls
          ))
        };
      });

      if (selectedClass?.id === classId) {
        setSelectedClass(prev => prev ? { ...prev, ...updatedClass, subjects: prev.subjects } : prev);
      }
    } catch (error) {
      logger.error('Error saving class pricing:', error);
      throw error;
    }
  };

  const handleRemoveClass = async (classId: string) => {
    setClassRemoveConfirm({ open: true, classId });
  };

  const confirmHandleRemoveClass = async () => {
    if (!classRemoveConfirm.classId) return;
    try {
      await examinationBatchService.deleteClass(classRemoveConfirm.classId);
      await fetchBatch();
      notify('Class removed successfully.', 'success');
    } catch (error) {
      logger.error('Error removing class:', error);
      notify('Failed to remove class.', 'error');
    } finally {
      setClassRemoveConfirm({ open: false, classId: null });
    }
  };

  const toggleClassVisibility = (classId: string) => {
    setHiddenClasses(prev => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      try {
        const raw = localStorage.getItem('exam_batch_collapsed');
        const data = raw ? JSON.parse(raw) : {};
        data[id || ''] = Array.from(next);
        localStorage.setItem('exam_batch_collapsed', JSON.stringify(data));
      } catch {}
      return next;
    });
  };

  const handleApplyClassOverridePricing = async (classId: string, manualPrice: number, reason: string) => {
    try {
      const updatedBatch = await examinationBatchService.updateClassPricing(classId, {
        cost_per_learner: manualPrice,
        is_manual_override: true,
        override_reason: reason
      }, canOverrideExamCost);
      if (updatedBatch) {
        setBatch(updatedBatch);
        if (selectedClass) {
          const refreshedClass = updatedBatch.classes?.find(cls => cls.id === selectedClass.id);
          if (refreshedClass) {
            setSelectedClass(refreshedClass);
          }
        }
      } else {
        await fetchBatch();
      }
    } catch (error) {
      logger.error('Error applying override:', error);
      throw error;
    }
  };

  const handleUpdateClass = async (classId: string, data: Partial<ExaminationClass>) => {
    try {
      await examinationBatchService.updateClass(classId, data);
      await fetchBatch();
      
      if (selectedClass && selectedClass.id === classId) {
         setSelectedClass(prev => prev ? { ...prev, ...data } : null);
      }
    } catch (error) {
      logger.error('Error updating class:', error);
      throw error;
    }
  };

  const isLocked = batch?.status === 'Approved' || batch?.status === 'Invoiced';
  const { customers } = useExamination();
  const schoolName = schools.find((school) => String(school.id) === String(batch?.school_id))?.name 
    || customers.find(c => String(c.id) === String(batch?.school_id))?.name 
    || 'Unknown School';
  const totalSubjects = batch?.classes?.reduce((count, cls) => count + (cls.subjects?.length || 0), 0) || 0;
  const statusBadgeStyle = batch?.status === 'Invoiced'
    ? { background: teal[500], color: '#fff', border: `1px solid ${teal[500]}` }
    : batch?.status === 'Approved'
      ? { background: amber[100], color: '#92400e', border: `1px solid ${amber[300]}` }
      : batch?.status === 'Calculated'
        ? { background: teal[50], color: teal[700], border: `1px solid ${teal[200]}` }
        : { background: teal[50], color: teal[800], border: `1px solid ${teal[200]}` };
  const isCalculationStale = useMemo(() => {
    if (!batch?.classes || batch.classes.length === 0) return false;
    const batchCalculatedAtMs = batch.last_calculated_at
      ? new Date(batch.last_calculated_at).getTime()
      : 0;
    if (!Number.isFinite(batchCalculatedAtMs) || batchCalculatedAtMs <= 0) return true;

    return batch.classes.some(cls => {
      const classCalculatedAtMs = cls.cost_last_calculated_at
        ? new Date(cls.cost_last_calculated_at).getTime()
        : batchCalculatedAtMs;
      const freshnessBoundary = Math.max(
        batchCalculatedAtMs,
        Number.isFinite(classCalculatedAtMs) ? classCalculatedAtMs : 0
      );

      const classUpdatedAtMs = cls.updated_at ? new Date(cls.updated_at).getTime() : 0;
      if (Number.isFinite(classUpdatedAtMs) && classUpdatedAtMs > freshnessBoundary) {
        return true;
      }

      return (cls.subjects || []).some(subject => {
        const subjectUpdatedAtMs = subject.updated_at ? new Date(subject.updated_at).getTime() : 0;
        return Number.isFinite(subjectUpdatedAtMs) && subjectUpdatedAtMs > freshnessBoundary;
      });
    });
  }, [batch?.classes, batch?.last_calculated_at]);

  const resolveClassTotalAmount = (cls: ExaminationClass) => {
    const learners = Math.max(0, Math.floor(Number(cls.number_of_learners) || 0));
    const liveTotal = Number(cls.live_total_preview);
    if (Number.isFinite(liveTotal) && liveTotal >= 0) return liveTotal;

    const manualOverride = Boolean(Number(cls.is_manual_override || 0));
    const manualPrice = Number(cls.manual_cost_per_learner ?? 0);
    if (manualOverride && manualPrice > 0 && learners > 0) {
      return Math.round(manualPrice * learners * 100) / 100;
    }

    const finalFee = Number(cls.final_fee_per_learner ?? cls.price_per_learner ?? cls.expected_fee_per_learner ?? 0);
    if (finalFee > 0 && learners > 0) {
      return Math.round(finalFee * learners * 100) / 100;
    }

    return Number(cls.calculated_total_cost ?? cls.total_price ?? cls.total_amount ?? 0) || 0;
  };

  const batchTotals = useMemo(() => {
    if (!batch || !batch.classes) {
      return {
        production: 0,
        adjustment: 0,
        marketAdjustment: 0,
        roundingAdjustment: 0,
        manualOverride: 0,
        total: 0,
        totalPages: 0,
        totalSheets: 0,
        totalCopies: 0,
        totalLearners: 0
      };
    }

    return batch.classes.reduce((acc, cls) => {
      const learners = Math.max(0, Math.floor(Number(cls.number_of_learners) || 0));
      let classTotalCopies = 0;
      let classTotalPages = 0;
      let classTotalSheets = 0;

      (cls.subjects || []).forEach((subject) => {
        const pagesPerPaper = Math.max(0, Math.floor(Number(subject.pages) || 0));
        const extraCopies = Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
        const totalCopies = learners + extraCopies;
        const totalPages = Number(subject.total_pages ?? (pagesPerPaper * totalCopies)) || 0;
        const totalSheets = Number(subject.total_sheets ?? Math.ceil(totalPages / 2)) || 0;

        classTotalCopies += totalCopies;
        classTotalPages += totalPages;
        classTotalSheets += totalSheets;
      });

      return {
        production: acc.production + (Number(cls.material_total_cost) || 0),
        adjustment: acc.adjustment + (Number(cls.adjustment_total_cost) || 0),
        marketAdjustment: acc.marketAdjustment + (Number(cls.market_adjustment_total ?? cls.adjustment_total_cost) || 0),
        roundingAdjustment: acc.roundingAdjustment + (Number(cls.rounding_adjustment) || 0),
        manualOverride: acc.manualOverride + (Number(cls.manual_override_amount) || 0),
        total: acc.total + resolveClassTotalAmount(cls),
        totalPages: acc.totalPages + classTotalPages,
        totalSheets: acc.totalSheets + classTotalSheets,
        totalCopies: acc.totalCopies + classTotalCopies,
        totalLearners: acc.totalLearners + learners
      };
    }, {
      production: 0,
      adjustment: 0,
      marketAdjustment: 0,
      roundingAdjustment: 0,
      manualOverride: 0,
      total: 0,
      totalPages: 0,
      totalSheets: 0,
      totalCopies: 0,
      totalLearners: 0
    });
  }, [batch]);

  const batchAdjustmentTracking = useMemo(() => {
    const snapshots = Array.isArray(batch?.adjustment_snapshots) ? batch.adjustment_snapshots : [];
    if (snapshots.length > 0) {
      const total = snapshots.reduce((sum, snap) => sum + (Number(snap.total_amount) || 0), 0);
      const rounding = snapshots
        .filter(snap => snap.is_rounding)
        .reduce((sum, snap) => sum + (Number(snap.total_amount) || 0), 0);
      return {
        totalAdjustment: total,
        marketAdjustment: total - rounding,
        roundingUplift: rounding,
        adjustmentCount: snapshots.length
      };
    }
    const totalAdjustment = Number(batch?.calculated_adjustment_total ?? batchTotals.adjustment ?? 0) || 0;
    const roundingUplift = Number(batch?.rounding_adjustment_total ?? 0) || 0;
    return {
      totalAdjustment,
      marketAdjustment: Math.max(0, totalAdjustment - roundingUplift),
      roundingUplift,
      adjustmentCount: 0
    };
  }, [batch, batchTotals.adjustment]);

  const batchFinancialKpis = useMemo(() => {
    const materialTotal = Number(batch?.calculated_material_total ?? batchTotals.production ?? 0) || 0;
    const preRoundingTotal = Number(
      batch?.pre_rounding_total_amount ?? Math.max(0, batchTotals.total - batchAdjustmentTracking.roundingUplift)
    ) || 0;
    const classCount = batch?.classes?.length || 0;
    let adjustedSubjects = 0;
    let adjustedClasses = 0;

    (batch?.classes || []).forEach((cls) => {
      const classAdjustment = Number(cls.adjustment_total_cost ?? 0) || 0;
      if (classAdjustment > 0) adjustedClasses += 1;

      (cls.subjects || []).forEach((subject: any) => {
        const subjectAdjustment = Number(
          subject.allocated_adjustment_cost
          ?? subject.allocated_market_adjustment_cost
          ?? 0
        ) || 0;
        if (subjectAdjustment > 0) adjustedSubjects += 1;
      });
    });

    return {
      materialTotal,
      preRoundingTotal,
      adjustedClasses,
      adjustedSubjects,
      averageAdjustmentPerClass: classCount > 0 ? batchAdjustmentTracking.totalAdjustment / classCount : 0,
      averageAdjustmentPerSubject: totalSubjects > 0 ? batchAdjustmentTracking.totalAdjustment / totalSubjects : 0
    };
  }, [batch, batchAdjustmentTracking, batchTotals.production, batchTotals.total, totalSubjects]);

  if (loading) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink
      }}>
        <div style={{
          background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`,
          padding: '24px 32px', fontSize: 13, color: inkSoft
        }}>
          Loading batch details...
        </div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5
      }}>
        <div style={{
          background: `${danger}10`, borderRadius: 12, border: `1px solid ${danger}20`,
          padding: '24px 32px', fontSize: 13, color: danger
        }}>
          Batch not found
        </div>
      </div>
    );
  }

  const batchReference = String(batch.batch_number || batch.batchNumber || batch.id || '').trim();

  const currency = batch.currency || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK';

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      padding: '16px 24px', maxWidth: 1600, margin: '0 auto',
      width: '100%', fontFamily: "'Inter','DM Sans',sans-serif",
      fontWeight: 400, overflowY: 'auto', color: ink, fontSize: 13.5
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
        <div>
          <button type="button" onClick={() => navigate('/examination/batches')}
            style={btnGhostStyle}>
            <ArrowLeft size={14} />
            Back to Batches
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: teal[800], letterSpacing: 0.2, margin: 0 }}>
              {batch.name}
            </h1>
            {batchReference && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', borderRadius: 8,
                padding: '3px 10px', fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                background: teal[50], color: teal[800], border: `1px solid ${teal[200]}`
              }}>
                {batchReference}
              </span>
            )}
            {batch.type === 'Patch' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', borderRadius: 8,
                padding: '3px 10px', fontSize: 11, fontWeight: 600,
                background: amber[100], color: '#92400e', border: `1px solid ${amber[300]}`
              }}>
                Patch
              </span>
            )}
            <span style={{
              display: 'inline-flex', alignItems: 'center', borderRadius: 8,
              padding: '3px 10px', fontSize: 11, fontWeight: 600,
              ...statusBadgeStyle
            }}>
              {batch.status}
            </span>
            {isCalculationStale && !isLocked && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', borderRadius: 8,
                padding: '3px 10px', fontSize: 11, fontWeight: 600,
                background: amber[100], color: '#92400e', border: `1px solid ${amber[300]}`
              }}>
                Calculation Stale - Recalculate Needed
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>
            {schoolName}
            {batch.sub_account_name && <span style={{ color: inkSoft, marginLeft: 4 }}>({batch.sub_account_name})</span>} |{' '}
            {batch.academic_year} Term {batch.term}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isLocked && (
            <button type="button" onClick={handleDelete}
              style={{ ...btnGhostStyle, color: danger, borderColor: `${danger}30` }}>
              <Trash2 size={14} />
              Delete
            </button>
          )}

          {!isLocked && isCalculationStale && (
            <button type="button" onClick={handleRecalculate}
              style={{ ...btnGhostStyle, color: '#92400e', borderColor: amber[300], background: amber[100] }}>
              <RefreshCw size={14} />
              Recalculate
            </button>
          )}

          {(batch.status === 'Approved' || batch.status === 'Invoiced') && (
            <button type="button" onClick={handleCreatePatch}
              style={{ ...btnGhostStyle, color: '#92400e', borderColor: amber[300], background: amber[100] }}>
              <Plus size={14} />
              Create Patch
            </button>
          )}

          <button type="button" onClick={handleConvertToRecurring}
            style={{ ...btnGhostStyle, color: teal[800], borderColor: teal[200], background: teal[50] }}>
            <Repeat size={14} />
            Convert to Recurring
          </button>

          {!isLocked && batch.status !== 'Approved' && (
            <button type="button" onClick={handleApprove} disabled={isApproving}
              style={{ ...btnPrimaryStyle, background: teal[500], opacity: isApproving ? 0.6 : 1 }}>
              <CheckCircle size={14} />
              {isApproving ? 'Approving...' : 'Approve'}
            </button>
          )}

          {batch.status === 'Approved' && (
            <button type="button" onClick={handleGenerateInvoice} disabled={isGeneratingInvoice}
              style={{ ...btnPrimaryStyle, background: teal[600], opacity: isGeneratingInvoice ? 0.6 : 1 }}>
              <CheckCircle size={14} />
              {isGeneratingInvoice ? 'Generating...' : 'Generate Invoice'}
            </button>
          )}

          {(batch.status === 'Approved' || batch.status === 'Invoiced') && (
            <button type="button" onClick={() => setJobTicketConfirm({ open: true })}
              style={{ ...btnPrimaryStyle, background: danger }}>
              <Printer size={14} />
              Convert to Job Ticket
            </button>
          )}

          <button type="button" onClick={() => setIsAddClassOpen(true)} disabled={isLocked}
            style={{ ...btnPrimaryStyle, background: teal[500], opacity: isLocked ? 0.6 : 1 }}>
            <Plus size={14} />
            Add Class
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12, marginBottom: 24
      }}>
        {[
          { label: 'Total Amount', value: `${currency} ${batchTotals.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, sub: `Rounding: ${currency} ${batchTotals.roundingAdjustment.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, borderColor: teal[500] },
          { label: 'Academic Info', value: batch.exam_type, sub: `${batch.academic_year} | Term ${batch.term}`, borderColor: teal[300] },
          { label: 'Structure', value: `${batch.classes?.length || 0} Classes`, sub: `Total Subjects: ${totalSubjects}`, borderColor: amber[500] },
          { label: 'Total Learners', value: batchTotals.totalLearners.toLocaleString(), sub: `Across ${batch.classes?.length || 0} classes`, borderColor: teal[200] },
          { label: 'Production', value: `${currency} ${batchTotals.production.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, sub: `Adjustments: ${currency} ${batchTotals.marketAdjustment.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, borderColor: ink }
        ].map((kpi, i) => (
          <div key={i} style={{
            background: paper, borderRadius: 12, padding: '14px 16px',
            border: `1.4px solid ${hairline}`, borderLeft: `3px solid ${kpi.borderColor}`,
            boxShadow: '0 1px 3px rgba(0,0,0,.04)'
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.02 }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: ink, marginTop: 2 }}>{kpi.value}</div>
            <div style={{ fontSize: 9.5, color: inkSoft, marginTop: 1 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div style={{
        background: paper, borderRadius: 12,
        border: `1.4px solid ${hairline}`, padding: '16px 20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <BookOpen size={16} color={teal[500]} />
            Classes and Subjects
          </h2>
        </div>

        {!batch.classes || batch.classes.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 48,
            background: teal[50], borderRadius: 12,
            border: `2px dashed ${teal[200]}`
          }}>
            <BookOpen size={40} style={{ margin: '0 auto 12', color: teal[200] }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: teal[800], margin: 0 }}>No classes added yet</h3>
            <p style={{ fontSize: 12, color: inkSoft, marginBottom: 16 }}>Add a class to start adding subjects and calculating costs.</p>
            <button type="button" onClick={() => setIsAddClassOpen(true)} disabled={isLocked}
              style={{ ...btnPrimaryStyle, background: teal[500], opacity: isLocked ? 0.6 : 1 }}>
              <Plus size={14} />
              Add First Class
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {batch.classes.map((cls) => {
              const subjectCount = cls.subjects?.length || 0;
              const learners = Math.max(0, Math.floor(Number(cls.number_of_learners) || 0));
              const expectedFeePerLearner = Number(cls.expected_fee_per_learner ?? cls.suggested_cost_per_learner ?? cls.price_per_learner ?? 0);
              const hasManualOverride = Boolean(Number(cls.is_manual_override || 0)) && Number(cls.manual_cost_per_learner ?? 0) > 0;
              const displayedFeePerLearner = hasManualOverride
                ? Number(cls.manual_cost_per_learner ?? expectedFeePerLearner)
                : Number(cls.final_fee_per_learner ?? expectedFeePerLearner);
              const isHidden = hiddenClasses.has(cls.id);

              return (
                <div key={cls.id} style={{
                  background: paper, borderRadius: 12, overflow: 'hidden',
                  border: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column'
                }}>
                  <div style={{
                    background: teal[50], borderBottom: `1px solid ${hairline}`,
                    padding: '14px 20px', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <button onClick={() => toggleClassVisibility(cls.id)}
                        style={{
                          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, background: paper, border: `1px solid ${hairline}`,
                          color: inkSoft, cursor: 'pointer'
                        }}>
                        {isHidden ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                      </button>
                      <div>
                        <div style={{ fontWeight: 700, color: ink, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {cls.class_name}
                          {isHidden ? <EyeOff size={14} color={inkSoft} /> : <Eye size={14} color={inkSoft} />}
                          {isHidden && <span style={{
                            fontSize: 10, background: teal[200], color: teal[800],
                            padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase'
                          }}>Hidden</span>}
                        </div>
                        <div style={{
                          fontSize: 11, color: inkSoft, fontWeight: 700,
                          display: 'flex', alignItems: 'center', gap: 16, marginTop: 4,
                          textTransform: 'uppercase', letterSpacing: 0.04
                        }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Users size={14} color={inkSoft} /> {cls.number_of_learners} Learners
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <BookOpen size={14} color={inkSoft} /> {subjectCount} Subjects
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: teal[500], fontWeight: 900, fontSize: 18, lineHeight: 1, marginBottom: 2 }}>
                          {currency} {displayedFeePerLearner.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 10, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.08 }}>
                          {hasManualOverride ? 'Final Fee / Learner (Override)' : 'Expected Fee / Learner'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: `1px solid ${hairline}`, paddingLeft: 24 }}>
                        <button onClick={() => handleManageSubjects(cls)} disabled={isLocked}
                          style={{
                            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 9, background: paper, border: `1px solid ${hairline}`,
                            color: inkSoft, cursor: 'pointer', opacity: isLocked ? 0.6 : 1
                          }}>
                          <BookText size={18} />
                        </button>
                        {!isLocked && (
                          <button onClick={() => handleRemoveClass(cls.id)}
                            style={{
                              width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: 9, background: paper, border: `1px solid ${danger}30`,
                              color: danger, cursor: 'pointer'
                            }}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isHidden && (
                    <>
                      {cls.subjects && cls.subjects.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead style={{ background: paper, borderBottom: `1px solid ${hairline}` }}>
                              <tr>
                                <th style={{ padding: '12px 20px', color: inkSoft, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08 }}>Subject Name</th>
                                <th style={{ padding: '12px 20px', textAlign: 'center', color: inkSoft, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, width: 96 }}>Pages</th>
                                <th style={{ padding: '12px 20px', textAlign: 'center', color: inkSoft, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, width: 96 }}>Extra Copies</th>
                                <th style={{ padding: '12px 20px', textAlign: 'center', color: inkSoft, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, width: 112 }}>Total Copies</th>
                                <th style={{ padding: '12px 20px', textAlign: 'center', color: inkSoft, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, width: 112 }}>Total Pages</th>
                                <th style={{ padding: '12px 20px', textAlign: 'center', color: inkSoft, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, width: 112 }}>Total Sheets</th>
                                <th style={{ padding: '12px 20px', textAlign: 'right', color: inkSoft, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, width: 160 }}>Paper</th>
                              </tr>
                            </thead>
                            <tbody style={{ borderCollapse: 'collapse' }}>
                              {cls.subjects.map((subject: any) => {
                                const pagesPerPaper = Math.max(0, Math.floor(Number(subject.pages) || 0));
                                const extraCopies = Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
                                const totalCopies = learners + extraCopies;
                                const totalPages = Number(subject.total_pages ?? (pagesPerPaper * totalCopies)) || 0;
                                const totalSheets = Number(subject.total_sheets ?? Math.ceil(totalPages / 2)) || 0;
                                return (
                                  <tr key={subject.id}
                                    style={{ borderBottom: `1px solid ${hairline}` }}
                                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ background: teal[50], padding: 6, borderRadius: 8, color: teal[600] }}>
                                        <FileText size={16} />
                                      </div>
                                      <span style={{ fontWeight: 600, color: ink }}>{subject.subject_name}</span>
                                    </td>
                                    <td style={{ padding: '12px 20px', textAlign: 'center', color: ink }}>{pagesPerPaper}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'center', color: ink }}>{extraCopies}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'center', color: ink }}>{totalCopies}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'center', color: ink }}>{totalPages.toLocaleString()}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'center', color: ink }}>{totalSheets.toLocaleString()}</td>
                                    <td style={{ padding: '12px 20px', textAlign: 'right', color: inkSoft }}>
                                      {subject.paper_size} <span style={{ color: inkSoft, fontSize: 12, marginLeft: 4 }}>({subject.orientation})</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot style={{ background: teal[50], borderTop: `1px solid ${hairline}` }}>
                              <tr>
                                <td colSpan={7} style={{ padding: '16px 20px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 32 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                                      <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: inkSoft, letterSpacing: 0.06 }}>Production</span>
                                      <span style={{ fontWeight: 700, color: ink, marginTop: 4, fontSize: 13 }}>
                                        {currency} {(Number(cls.material_total_cost) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                                      <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: inkSoft, letterSpacing: 0.06 }}>Margin</span>
                                      <span style={{ fontWeight: 700, color: amber[500], marginTop: 4, fontSize: 13 }}>
                                        {currency} {(Number(cls.margin_amount) || Math.max(0, (Number(cls.calculated_total_cost) || 0) - (Number(cls.material_total_cost) || 0) - (Number(cls.adjustment_total_cost) || 0))).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                                      <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: inkSoft, letterSpacing: 0.06 }}>Adjustments</span>
                                      <span style={{ fontWeight: 700, color: teal[600], marginTop: 4, fontSize: 13 }}>
                                        {currency} {(Number(cls.market_adjustment_total ?? cls.adjustment_total_cost) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                                      <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: inkSoft, letterSpacing: 0.06 }}>Rounding</span>
                                      <span style={{ fontWeight: 700, color: teal[500], marginTop: 4, fontSize: 13 }}>
                                        {currency} {(Number(cls.rounding_adjustment) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    {Number(cls.manual_override_amount) !== 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                                        <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: inkSoft, letterSpacing: 0.06 }}>Manual Override</span>
                                        <span style={{ fontWeight: 700, color: '#7c3aed', marginTop: 4, fontSize: 13 }}>
                                          {currency} {(Number(cls.manual_override_amount) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
                                      <span style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, color: inkSoft, letterSpacing: 0.08 }}>Class Total</span>
                                      <span style={{ fontWeight: 900, color: teal[800], marginTop: 6, fontSize: 15 }}>
                                        {currency} {resolveClassTotalAmount(cls).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div style={{ padding: '24px 20px', textAlign: 'center', background: paper }}>
                          <BookOpen size={32} style={{ margin: '0 auto 8', color: teal[200] }} />
                          <p style={{ fontSize: 13, color: inkSoft, margin: 0 }}>No subjects added to this class.</p>
                          <button onClick={() => handleManageSubjects(cls)}
                            style={{
                              marginTop: 12, fontSize: 11, fontWeight: 700, color: teal[500],
                              background: 'none', border: 'none', cursor: 'pointer',
                              textTransform: 'uppercase', letterSpacing: 0.08
                            }}>
                            Add Subjects
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddClassDialog
        open={isAddClassOpen}
        onOpenChange={setIsAddClassOpen}
        onAdd={handleAddClass}
      />

      <ManageSubjectsDialog
        open={isManageSubjectsOpen}
        onOpenChange={setIsManageSubjectsOpen}
        examinationClass={selectedClass}
        onAddSubject={handleAddSubject}
        onRemoveSubject={handleRemoveSubject}
        onUpdateSubject={handleUpdateSubject}
        onUpdateClass={handleUpdateClass}
        onSaveClassPricing={handleSaveClassPricing}
        onApplyOverridePricing={canOverrideExamCost ? handleApplyClassOverridePricing : undefined}
        currencySymbol={currency}
        isLocked={isLocked}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />

      <ConfirmDialog
        open={classRemoveConfirm.open}
        onOpenChange={(open) => setClassRemoveConfirm(prev => ({ ...prev, open }))}
        onConfirm={confirmHandleRemoveClass}
        title="Remove Class"
        message="Are you sure you want to remove this class and all its subjects?"
        type="danger"
      />

      <ConfirmDialog
        open={jobTicketConfirm.open}
        onOpenChange={(open) => setJobTicketConfirm(prev => ({ ...prev, open }))}
        onConfirm={handleConvertToJobTicket}
        title="Convert to Job Ticket"
        message="Convert this batch to a Job Ticket for production?"
        type="info"
      />
    </div>
  );
};

export default ExaminationBatchDetail;