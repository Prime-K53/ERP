import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/services/logger';
import { useNavigate, useParams } from 'react-router-dom';
import { useExamination } from '../../context/ExaminationContext';
import { useInventory } from '../../context/InventoryContext';
import { PricingRoundingMethod } from '../../types';
import { useAuth } from '../../context/AuthContext';
import SubjectTable from './SubjectTable';
import PricingSummaryPanel from './PricingSummaryPanel';
import OverrideDialog from './components/OverrideDialog';
import StatusBadge from './components/StatusBadge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/Dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { toast } from '../../components/Toast';
import { ROUNDING_METHOD_OPTIONS } from '../../services/pricingRoundingService';
import {
  getExamRoundingFromEngineMethod,
  getEngineMethodFromExamRounding
} from '../../services/examinationJobService';
import { isMarketAdjustmentActive } from '../../utils/marketAdjustmentUtils';
import { 
  Save, Calculator, DollarSign, Users, FileText, Plus, 
  CheckCircle, AlertTriangle, Loader2, ArrowLeft, Lock, Unlock, Info, Settings, X, ShieldCheck 
} from 'lucide-react';

export const calculateExaminationPricing = (
  bom: number,
  adjustmentRate: number,
  profitMargin: number,
  learners: number
) => {
  const adjustedCost = bom + (bom * adjustmentRate);
  const total = adjustedCost * (1 + profitMargin);
  const rawFeePerLearner = learners > 0 ? total / learners : 0;
  
  const precisionFee = Number(rawFeePerLearner.toFixed(2));
  const roundedFeePerLearner = Math.ceil(precisionFee / 50) * 50;
  const roundedTotal = learners > 0 ? roundedFeePerLearner * learners : total;
  
  return {
    Total: Number(roundedTotal.toFixed(2)),
    FeePerLearner: roundedFeePerLearner
  };
};

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

interface ExaminationJobFormProps {
  isModal?: boolean;
  onClose?: () => void;
  initialData?: any;
}

const ExaminationJobForm: React.FC<ExaminationJobFormProps> = ({ isModal: propIsModal, onClose: propOnClose, initialData: propInitialData }) => {
  const params = useParams();
  const navigate = useNavigate();
  const isModal = propIsModal || false;
  const id = params.id || propInitialData?.id;
  const { companyConfig } = useAuth();
  const { inventory } = useInventory();
  const examinationContext = useExamination();
  const { 
    jobs, schools, customers, marketAdjustments, loading, jobLoading,
    createJob, updateJob, recalculateJob, approveJob, deleteJob,
    getJobWithSubjects
  } = examinationContext;

  const [isEditing, setIsEditing] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const defaultEngineMethod = ((companyConfig?.pricingSettings?.defaultMethod || 'ALWAYS_UP_50') as PricingRoundingMethod);
  const defaultEngineCustomStep = Number(companyConfig?.pricingSettings?.customStep || 50);
  const defaultRoundingFromEngine = getExamRoundingFromEngineMethod(defaultEngineMethod, defaultEngineCustomStep);

  const [formData, setFormData] = useState({
    exam_name: '',
    school_id: '',
    sub_account_name: '',
    class_name: '',
    number_of_learners: 0,
    bom_id: '',
    adjustment_id: '',
    adjustment_type: 'fixed' as 'fixed' | 'percentage',
    adjustment_value: 0,
    rounding_method: defaultEngineMethod,
    rounding_rule_type: defaultRoundingFromEngine.roundingRuleType as 'none' | 'nearest_10' | 'nearest_50' | 'nearest_100' | 'custom',
    rounding_value: defaultRoundingFromEngine.roundingValue,
    override_enabled: false,
    manual_price_per_learner: 0,
    override_reason: '',
    pricing_locked: false,
    subjects: [] as Array<{
      id?: string;
      subject_name: string;
      pages_per_paper: number;
      extra_copies: number;
    }>
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [pricingConfig, setPricingConfig] = useState({
    paperId: '',
    tonerId: '',
    paperName: '',
    tonerName: '',
    marketAdjustment: 0,
    marketAdjustmentId: '',
    finishingOptions: []
  });

  const paperMaterials = useMemo(() => {
    const base = (inventory || []).filter(
      (i: any) =>
        i.type === 'Raw Material' &&
        (String(i.category || '').toLowerCase() === 'paper' || i.name?.toLowerCase().includes('paper'))
    );
    const selected = (inventory || []).find((i: any) => String(i.id) === String(pricingConfig.paperId));
    if (selected && !base.some((item: any) => String(item.id) === String(selected.id))) {
      return [selected, ...base];
    }
    return base;
  }, [inventory, pricingConfig.paperId]);

  const tonerMaterials = useMemo(() => {
    const base = (inventory || []).filter(
      (i: any) =>
        i.type === 'Raw Material' &&
        (String(i.category || '').toLowerCase() === 'toner' || i.name?.toLowerCase().includes('toner'))
    );
    const selected = (inventory || []).find((i: any) => String(i.id) === String(pricingConfig.tonerId));
    if (selected && !base.some((item: any) => String(item.id) === String(selected.id))) {
      return [selected, ...base];
    }
    return base;
  }, [inventory, pricingConfig.tonerId]);

  const autoPaper = useMemo(() => {
    return (inventory || []).find(
      (i: any) =>
        i.type === 'Raw Material' &&
        (i.name?.toLowerCase().includes('paper') || String(i.category || '').toLowerCase() === 'paper')
    );
  }, [inventory]);

  const autoToner = useMemo(() => {
    return (inventory || []).find(
      (i: any) =>
        i.type === 'Raw Material' &&
        (i.name?.toLowerCase().includes('toner') || String(i.category || '').toLowerCase() === 'toner')
    );
  }, [inventory]);

  const [globalMargin, setGlobalMargin] = useState<any>(null);

  useEffect(() => {
    import('../../utils/getEffectiveMargin').then(({ getEffectiveMargin }) => {
      getEffectiveMargin(null, null, false).then(setGlobalMargin);
    });
  }, []);

  useEffect(() => {
    if (!inventory || inventory.length === 0) return;
    setPricingConfig(prev => {
      const nextPaperId = prev.paperId || autoPaper?.id || '';
      const nextTonerId = prev.tonerId || autoToner?.id || '';
      if (nextPaperId === prev.paperId && nextTonerId === prev.tonerId) {
        return prev;
      }
      return {
        ...prev,
        paperId: nextPaperId,
        tonerId: nextTonerId
      };
    });
  }, [inventory, autoPaper, autoToner]);

  const { totalSheets, totalPages } = useMemo(() => {
    if (!formData.subjects || formData.subjects.length === 0 || formData.number_of_learners <= 0) {
      return { totalSheets: 0, totalPages: 0 };
    }
    
    let sheets = 0;
    let pages = 0;
    
    formData.subjects.forEach(subject => {
      if (!subject.subject_name.trim()) return;
      const totalCopies = Math.max(0, Math.floor(Number(formData.number_of_learners) || 0))
        + Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
      const subjectPages = subject.pages_per_paper * totalCopies;
      const subjectSheets = Math.ceil(subjectPages / 2);

      pages += subjectPages;
      sheets += subjectSheets;
    });
    
    return { totalSheets: sheets, totalPages: pages };
  }, [formData.subjects, formData.number_of_learners]);

  const { totalBOMCost, selectedPaper, selectedToner } = useMemo(() => {
    const paper = (inventory || []).find(i => i.id === pricingConfig.paperId);
    const toner = (inventory || []).find(i => i.id === pricingConfig.tonerId);
    
    const paperCost = paper ? (totalSheets / 500) * paper.cost : 0;
    
    const tonerKg = totalPages / 20000;
    const tonerCost = toner ? tonerKg * toner.cost : 0;
    
    return {
      totalBOMCost: paperCost + tonerCost,
      selectedPaper: paper,
      selectedToner: toner
    };
  }, [pricingConfig.paperId, pricingConfig.tonerId, totalSheets, totalPages, inventory]);

  const totalAdjustments = useMemo(() => {
    if (!pricingConfig.marketAdjustmentId || !pricingConfig.marketAdjustment) return 0;
    return pricingConfig.marketAdjustment;
  }, [pricingConfig.marketAdjustmentId, pricingConfig.marketAdjustment]);

  const [feeOverrideEnabled, setFeeOverrideEnabled] = useState(false);
  const [manualFeePerLearner, setManualFeePerLearner] = useState(0);
  


  const adjustmentOptions = useMemo(() => {
    return marketAdjustments
      .filter(isMarketAdjustmentActive)
      .sort((a, b) => {
      const sortA = Number(a.sortOrder || 0);
      const sortB = Number(b.sortOrder || 0);
      if (sortA !== sortB) return sortA - sortB;
      return String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''));
    });
  }, [marketAdjustments]);

  const customerOptions = useMemo(() => {
    const unique = new Map<string, { id: string; name: string; isCustomer: boolean }>();

    customers.forEach(customer => {
      if (!customer?.id) return;
      unique.set(customer.id, {
        id: customer.id,
        name: customer.name || customer.id,
        isCustomer: true
      });
    });

    schools.forEach((school) => {
      if (!school?.id) return;
      if (!unique.has(school.id)) {
        unique.set(school.id, {
          id: school.id,
          name: school.name || school.id,
          isCustomer: false
        });
      }
    });

    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, schools]);

  const currentRoundingMethodInfo = useMemo(() => {
    const method = formData.rounding_method || defaultEngineMethod;
    const option = ROUNDING_METHOD_OPTIONS.find(o => o.value === method);
    return {
      label: option?.label || method,
      method: method,
      step: formData.rounding_value || defaultRoundingFromEngine.roundingValue
    };
  }, [formData.rounding_method, formData.rounding_value, defaultEngineMethod, defaultRoundingFromEngine]);

  const adjustmentInfo = useMemo(() => {
    if (adjustmentOptions.length === 0) {
      return { hasAdjustments: false, display: 'No active adjustments', total: 0 };
    }
    
    const totalPercentage = adjustmentOptions
      .filter(adj => adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage')
      .reduce((sum, adj) => sum + (adj.percentage ?? adj.value ?? 0), 0);
    
    const totalFixed = adjustmentOptions
      .filter(adj => adj.type === 'FIXED' || adj.type === 'fixed')
      .reduce((sum, adj) => sum + (adj.value ?? 0), 0);
    
    const names = adjustmentOptions.map(adj => adj.displayName || adj.name).join(', ');
    
    return {
      hasAdjustments: true,
      display: names,
      totalPercentage,
      totalFixed,
      count: adjustmentOptions.length,
      adjustments: adjustmentOptions
    };
  }, [adjustmentOptions]);

  const { totalCost, feePerLearner } = useMemo(() => {
    const bom = totalBOMCost;
    const adjustmentRate = (adjustmentInfo.totalPercentage || 0) / 100;
    const profitMargin = globalMargin ? (globalMargin.margin_value / 100) : 0;
    const learners = formData.number_of_learners;

    const result = calculateExaminationPricing(bom, adjustmentRate, profitMargin, learners);

    return {
      totalCost: result.Total,
      feePerLearner: result.FeePerLearner
    };
  }, [totalBOMCost, adjustmentInfo.totalPercentage, globalMargin, formData.number_of_learners]);

  const finalFeePerLearner = feeOverrideEnabled ? manualFeePerLearner : feePerLearner;
  const finalTotalAmount = finalFeePerLearner * formData.number_of_learners;

  const selectedCustomer = useMemo(() => {
    return customers.find(customer => customer.id === formData.school_id) || null;
  }, [customers, formData.school_id]);

  const selectedCustomerSubAccounts = useMemo(() => {
    return selectedCustomer?.subAccounts || [];
  }, [selectedCustomer]);

  useEffect(() => {
    if (id) {
      setIsEditing(true);
      loadJob(id);
    }
  }, [id]);

  useEffect(() => {
    if (isEditing) return;
    if (formData.adjustment_id) return;

    const preferred = adjustmentOptions.find(isMarketAdjustmentActive);
    if (preferred?.id) {
      setFormData(prev => ({ ...prev, adjustment_id: preferred.id }));
    }
  }, [isEditing, adjustmentOptions, formData.adjustment_id]);

  useEffect(() => {
    if (isEditing) return;
    const mapped = getExamRoundingFromEngineMethod(defaultEngineMethod, defaultEngineCustomStep);

    setFormData(prev => {
      if (prev.rounding_method === defaultEngineMethod && prev.rounding_rule_type === mapped.roundingRuleType) {
        return prev;
      }
      return {
        ...prev,
        rounding_method: defaultEngineMethod,
        rounding_rule_type: mapped.roundingRuleType,
        rounding_value: mapped.roundingValue
      };
    });
  }, [isEditing, defaultEngineMethod, defaultEngineCustomStep]);

  useEffect(() => {
    if (!formData.school_id) {
      if (formData.sub_account_name) {
        setFormData(prev => ({ ...prev, sub_account_name: '' }));
      }
      return;
    }

    if (selectedCustomerSubAccounts.length === 0) return;
    const hasSelectedSubAccount = selectedCustomerSubAccounts.some(sub => sub.name === formData.sub_account_name);
    if (!hasSelectedSubAccount) {
      setFormData(prev => ({
        ...prev,
        sub_account_name: selectedCustomerSubAccounts[0]?.name || ''
      }));
    }
  }, [formData.school_id, formData.sub_account_name, selectedCustomerSubAccounts]);

  const loadJob = async (jobId: string) => {
    try {
      const result = await getJobWithSubjects(jobId);
      const job = result.job;
      const subjects = result.subjects;
      const persistedRuleType = job.rounding_rule_type || 'none';
      const resolvedRoundingMethod = (
        persistedRuleType === 'none'
          ? (job.rounding_method || defaultEngineMethod)
          : (job.rounding_method || getEngineMethodFromExamRounding(job.rounding_rule_type, job.rounding_value))
      ) as PricingRoundingMethod;
      const resolvedRounding = persistedRuleType === 'none'
        ? { roundingRuleType: 'none' as const, roundingValue: 0 }
        : getExamRoundingFromEngineMethod(resolvedRoundingMethod, job.rounding_value);

      setFormData({
        exam_name: String(job.exam_name ?? ''),
        school_id: String(job.school_id ?? ''),
        sub_account_name: String(job.sub_account_name ?? ''),
        class_name: String(job.class_name ?? ''),
        number_of_learners: Number(job.number_of_learners ?? 0),
        bom_id: String(job.bom_id ?? ''),
        adjustment_id: String(job.adjustment_id ?? ''),
        adjustment_type: String(job.adjustment_type ?? 'fixed') as 'fixed' | 'percentage',
        adjustment_value: Number(job.adjustment_value ?? 0),
        rounding_method: resolvedRoundingMethod,
        rounding_rule_type: resolvedRounding.roundingRuleType,
        rounding_value: resolvedRounding.roundingValue,
        override_enabled: Boolean(job.override_enabled),
        manual_price_per_learner: Number(job.manual_price_per_learner ?? 0),
        override_reason: String(job.override_reason ?? ''),
        pricing_locked: Boolean(job.pricing_locked ?? false),
        subjects: subjects.map(s => ({
          id: s.id,
          subject_name: s.subject_name,
          pages_per_paper: s.pages_per_paper,
          extra_copies: s.extra_copies
        }))
      });
    } catch (error) {
      logger.error('Error loading job:', error);
      toast.error('Failed to load examination job');
      navigate('/examination');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.exam_name.trim()) newErrors.exam_name = 'Exam name is required';
    if (!formData.school_id) newErrors.school_id = 'School is required';
    if (selectedCustomerSubAccounts.length > 0 && !formData.sub_account_name) {
      newErrors.sub_account_name = 'Sub-account is required for this customer';
    }
    if (!formData.class_name.trim()) newErrors.class_name = 'Class name is required';
    if (formData.number_of_learners <= 0) newErrors.number_of_learners = 'Number of learners must be greater than 0';
    if (adjustmentOptions.length === 0) {
      newErrors.adjustment_id = 'No active market adjustments found. Configure one in Market Adjustments.';
    } else if (!formData.adjustment_id) {
      newErrors.adjustment_id = 'Adjustment is required';
    }
    if (!formData.rounding_method) newErrors.rounding_method = 'Rounding rule is required';
    if (formData.subjects.length === 0) newErrors.subjects = 'At least one subject is required';

    formData.subjects.forEach((subject, index) => {
      if (!subject.subject_name.trim()) newErrors[`subject_${index}_name`] = 'Subject name is required';
      if (subject.pages_per_paper <= 0) newErrors[`subject_${index}_pages`] = 'Pages must be greater than 0';
    });

    if (formData.rounding_rule_type === 'custom' && formData.rounding_value <= 0) {
      newErrors.rounding_value = 'Custom rounding value must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value } as typeof prev;

      if (field === 'school_id') {
        next.sub_account_name = '';
      }

      if (field === 'adjustment_id') {
        const selectedAdjustment = adjustmentOptions.find(adjustment => adjustment.id === value);
        if (selectedAdjustment) {
          const isPercentage =
            selectedAdjustment.type === 'PERCENTAGE' ||
            selectedAdjustment.type === 'PERCENT' ||
            selectedAdjustment.type === 'percentage';
          next.adjustment_type = isPercentage ? 'percentage' : 'fixed';
          next.adjustment_value = Number(selectedAdjustment.percentage ?? selectedAdjustment.value ?? 0);
        }
      }

      if (field === 'rounding_method') {
        const mapped = getExamRoundingFromEngineMethod(
          value as PricingRoundingMethod,
          Number(companyConfig?.pricingSettings?.customStep || 50)
        );
        next.rounding_method = value as PricingRoundingMethod;
        next.rounding_rule_type = mapped.roundingRuleType;
        next.rounding_value = mapped.roundingValue;
      }

      return next;
    });
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubjectChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.map((subject, i) => 
        i === index ? { ...subject, [field]: value } : subject
      )
    }));
    
    const errorKey = `subject_${index}_${field}`;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  const addSubject = () => {
    setFormData(prev => ({
      ...prev,
      subjects: [...prev.subjects, {
        subject_name: '',
        pages_per_paper: 0,
        extra_copies: 0
      }]
    }));
  };

  const removeSubject = (index: number) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.error('Please fix the errors below');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        sub_account_name: formData.sub_account_name || undefined,
        number_of_learners: Number(formData.number_of_learners),
        adjustment_id: String(formData.adjustment_id || '').trim(),
        adjustment_value: Number(formData.adjustment_value),
        rounding_method: formData.rounding_method as PricingRoundingMethod,
        rounding_value: Number(formData.rounding_value),
        manual_price_per_learner: Number(formData.manual_price_per_learner),
      };

      if (isEditing && id) {
        await updateJob(id, payload);
        toast.success('Examination job updated successfully');
      } else {
        await createJob(payload);
        toast.success('Examination job created successfully');
        navigate('/examination');
      }
    } catch (error) {
      logger.error('Error saving job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save examination job');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (!isEditing || !id) return;

    try {
      await recalculateJob(id);
      toast.success('Job recalculated successfully');
    } catch (error) {
      logger.error('Error recalculating job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to recalculate job');
    }
  };

  const handleApprove = async () => {
    if (!isEditing || !id) return;

    try {
      await approveJob(id);
      toast.success('Job approved successfully');
      await loadJob(id);
    } catch (error) {
      logger.error('Error approving job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to approve job');
    }
  };

  const handleDelete = async () => {
    if (!isEditing || !id) return;

    if (!confirm('Are you sure you want to delete this examination job? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteJob(id);
      toast.success('Examination job deleted successfully');
      navigate('/examination');
    } catch (error) {
      logger.error('Error deleting job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete examination job');
    }
  };

  const handleOverridePrice = () => {
    setShowOverrideDialog(true);
  };

  const handleOverrideSubmit = async (manualPrice: number, reason: string) => {
    if (!isEditing || !id) return;

    try {
      await updateJob(id, {
        override_enabled: true,
        manual_price_per_learner: manualPrice,
        override_reason: reason
      });
      setShowOverrideDialog(false);
      toast.success('Manual price override applied');
      await loadJob(id);
    } catch (error) {
      logger.error('Error applying override:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to apply manual price override');
    }
  };

  const currentJob = jobs.find(j => j.id === id);

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      fontFamily: "'Inter','DM Sans',sans-serif", color: ink, fontSize: 13.5
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button variant="ghost" onClick={() => navigate('/examination')}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowLeft size={16} />
            <span>Back to Jobs</span>
          </Button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: ink, margin: 0 }}>
              {isEditing ? 'Edit Examination Job' : 'Create Examination Job'}
            </h1>
            {isEditing && currentJob && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <StatusBadge status={currentJob.status} />
                <span style={{ fontSize: 13, color: inkSoft }}>
                  {currentJob.exam_name} - {currentJob.class_name}
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="outline" onClick={() => setShowSettings(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={16} />
            <span>Settings</span>
          </Button>
          
          {isEditing && currentJob && (
            <>
              <Button variant="outline" onClick={handleRecalculate} disabled={jobLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={16} />
                <span>Recalculate</span>
              </Button>
              
              {!currentJob.override_enabled && (
                <Button variant="outline" onClick={handleOverridePrice}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <DollarSign size={16} />
                  <span>Override Price</span>
                </Button>
              )}

              {currentJob.status === 'Draft' && (
                <Button onClick={handleApprove} disabled={jobLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: teal[500], color: '#fff',
                    border: 'none', borderRadius: 9, padding: '8px 16px',
                    fontWeight: 600, cursor: 'pointer'
                  }}>
                  <CheckCircle size={16} />
                  <span>Approve</span>
                </Button>
              )}

              {currentJob.status !== 'Invoiced' && (
                <Button variant="destructive" onClick={handleDelete} disabled={jobLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: danger }}>
                  <AlertTriangle size={16} />
                  <span>Delete</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card>
            <CardHeader>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={20} color={teal[500]} />
                <span>Basic Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <Input
                    label="Exam Name"
                    value={formData.exam_name}
                    onChange={(e) => handleInputChange('exam_name', e.target.value)}
                    error={errors.exam_name}
                    placeholder="e.g., Mid-Term Exams"
                  />
                </div>
                <div>
                  <Select
                    label="School / Customer"
                    value={formData.school_id}
                    onChange={(e) => handleInputChange('school_id', e.target.value)}
                    error={errors.school_id}
                    disabled={loading}
                  >
                    <option value="">
                      {loading ? 'Loading customers...' : customerOptions.length === 0 ? 'No customers available' : 'Select a customer...'}
                    </option>
                    {customerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </Select>
                  {customerOptions.length === 0 && !loading && (
                    <p style={{ fontSize: 12, color: amber[500], marginTop: 4 }}>
                      No customers found. Add customers in the Customers module.
                    </p>
                  )}
                </div>
              </div>

              {formData.school_id && selectedCustomerSubAccounts.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Select
                    label="Sub Account"
                    value={formData.sub_account_name}
                    onChange={(e) => handleInputChange('sub_account_name', e.target.value)}
                    error={errors.sub_account_name}
                  >
                    <option value="">Select a sub-account...</option>
                    {selectedCustomerSubAccounts.map((subAccount) => (
                      <option key={subAccount.id} value={subAccount.name}>
                        {subAccount.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div>
                  <Input
                    label="Class Name"
                    value={formData.class_name}
                    onChange={(e) => handleInputChange('class_name', e.target.value)}
                    error={errors.class_name}
                    placeholder="e.g., Form 1A"
                  />
                </div>
                <div>
                  <Input
                    label="Number of Learners"
                    type="number"
                    min="1"
                    value={formData.number_of_learners}
                    onChange={(e) => handleInputChange('number_of_learners', parseInt(e.target.value) || 0)}
                    error={errors.number_of_learners}
                  />
                </div>
              </div>

              <div style={{
                marginTop: 16, padding: 12, borderRadius: 9,
                background: teal[50], border: `1px solid ${teal[100]}`,
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: teal[800], margin: 0 }}>Pricing Materials</p>
                <p style={{ fontSize: 12, color: teal[600], marginTop: 4 }}>
                  Paper and toner defaults are configured globally in batch-level Pricing Settings.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={20} color={teal[500]} />
                <span>Pricing Configuration</span>
              </CardTitle>
              {isEditing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Button
                    variant={formData.pricing_locked ? "outline" : "default"}
                    onClick={() => setFormData(prev => ({ ...prev, pricing_locked: !prev.pricing_locked }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {formData.pricing_locked ? (
                      <>
                        <Unlock size={16} />
                        <span>Unlock Pricing</span>
                      </>
                    ) : (
                      <>
                        <Lock size={16} />
                        <span>Lock Pricing</span>
                      </>
                    )}
                  </Button>
                  {formData.pricing_locked && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 12, color: teal[600],
                      background: teal[50], border: `1px solid ${teal[100]}`,
                      padding: '4px 8px', borderRadius: 8
                    }}>
                      <ShieldCheck size={12} />
                      <span>Pricing locked</span>
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: amber[100], border: `1px solid ${amber[300]}`,
                borderRadius: 9, padding: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Lock size={16} />
                    Market Adjustments (System Applied)
                  </label>
                  <span style={{
                    fontSize: 12, background: amber[300], color: '#92400e',
                    padding: '2px 8px', borderRadius: 8
                  }}>
                    {adjustmentInfo.count || 0} active
                  </span>
                </div>
                {adjustmentInfo.hasAdjustments ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {adjustmentInfo.adjustments?.map((adj) => (
                      <div key={adj.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: ink }}>{adj.displayName || adj.name}</span>
                        <span style={{ fontWeight: 600, color: ink }}>
                          {adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage'
                            ? `${adj.percentage ?? adj.value}%`
                            : `$${adj.value}`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: danger, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} />
                    No active market adjustments found. Please configure in Market Adjustments module.
                  </div>
                )}
                <p style={{ fontSize: 12, color: '#92400e', marginTop: 8 }}>
                  All active adjustments from Market Adjustments module are automatically applied
                </p>
              </div>

              <div style={{
                background: teal[50], border: `1px solid ${teal[100]}`,
                borderRadius: 9, padding: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: teal[800], display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Lock size={16} />
                    Rounding Rule (Engine Config)
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, color: teal[600] }}>Method</label>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ink }}>
                      {currentRoundingMethodInfo.label}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: teal[600] }}>Step Value</label>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ink }}>
                      {currentRoundingMethodInfo.step}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: teal[600], marginTop: 8 }}>
                  Rounding is sourced from Engine Configuration and cannot be modified
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <Input
                    label="Total Adjustment Applied"
                    value={adjustmentInfo.hasAdjustments 
                      ? (adjustmentInfo.totalPercentage > 0 
                          ? `${adjustmentInfo.totalPercentage}%`
                          : `$${adjustmentInfo.totalFixed}`)
                      : 'N/A'}
                    readOnly
                    disabled
                  />
                </div>
                <div>
                  <Input
                    label="Rounding Method Applied"
                    value={currentRoundingMethodInfo.label}
                    readOnly
                    disabled
                  />
                </div>
              </div>
              
              {errors.adjustment_id && (
                <div style={{ padding: 12, background: `${danger}10`, border: `1px solid ${danger}20`, borderRadius: 8 }}>
                  <p style={{ color: danger, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <AlertTriangle size={16} />
                    {errors.adjustment_id}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={20} color={teal[500]} />
                <span>Subjects</span>
              </CardTitle>
              <Button onClick={addSubject}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: teal[500], color: '#fff',
                  border: 'none', borderRadius: 9, padding: '8px 16px',
                  fontWeight: 600, cursor: 'pointer'
                }}>
                <Plus size={16} />
                <span>Add Subject</span>
              </Button>
            </CardHeader>
            <CardContent>
              {errors.subjects && (
                <div style={{ marginBottom: 16, padding: 12, background: `${danger}10`, border: `1px solid ${danger}20`, borderRadius: 8 }}>
                  <p style={{ color: danger, fontSize: 13, margin: 0 }}>{errors.subjects}</p>
                </div>
              )}
              
              <SubjectTable
                subjects={formData.subjects}
                onSubjectChange={handleSubjectChange}
                onRemoveSubject={removeSubject}
                errors={errors}
                learners={formData.number_of_learners}
              />
            </CardContent>
          </Card>
        </div>

        <div style={{ gridColumn: 'span 1' }}>
          <PricingSummaryPanel
            job={currentJob}
            subjects={formData.subjects}
            learners={formData.number_of_learners}
            isLoading={loading || jobLoading}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isEditing && currentJob && (
            <span style={{ fontSize: 13, color: inkSoft }}>
              Last updated: {new Date(currentJob.updated_at || currentJob.created_at).toLocaleString()}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="outline" onClick={() => navigate('/examination')}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>{isEditing ? 'Update Job' : 'Create Job'}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={20} />
              Pricing Settings
            </DialogTitle>
          </DialogHeader>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 0' }}>
            <div style={{ background: teal[50], padding: 16, borderRadius: 9, border: `1px solid ${teal[100]}` }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: teal[800], marginBottom: 12 }}>
                Hidden BOM (Automatic Cost Calculation)
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{
                    fontSize: 12, fontWeight: 600, color: inkSoft,
                    marginBottom: 6, display: 'block'
                  }}>
                    Paper Material
                  </label>
                  <select
                    style={{
                      width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`,
                      borderRadius: 9, fontSize: 13, color: ink, background: paper
                    }}
                    value={pricingConfig.paperId}
                    onChange={(e) => setPricingConfig(prev => ({ ...prev, paperId: e.target.value }))}
                  >
                    <option value="">Select Paper...</option>
                    {paperMaterials.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (${Number(m.cost_price ?? m.cost_per_unit ?? m.cost ?? 0).toLocaleString()}/unit)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{
                    fontSize: 12, fontWeight: 600, color: inkSoft,
                    marginBottom: 6, display: 'block'
                  }}>
                    Toner Material
                  </label>
                  <select
                    style={{
                      width: '100%', padding: '8px 12px', border: `1.4px solid ${hairline}`,
                      borderRadius: 9, fontSize: 13, color: ink, background: paper
                    }}
                    value={pricingConfig.tonerId}
                    onChange={(e) => setPricingConfig(prev => ({ ...prev, tonerId: e.target.value }))}
                  >
                    <option value="">Select Toner...</option>
                    {tonerMaterials.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (${Number(m.cost_price ?? m.cost_per_unit ?? m.cost ?? 0).toLocaleString()}/unit)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ background: teal[50], padding: 16, borderRadius: 9, border: `1px solid ${teal[100]}` }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: teal[800], marginBottom: 8 }}>
                Active Market Adjustments
              </h4>
              <p style={{ fontSize: 12, color: teal[600], marginBottom: 12 }}>
                Automated system-wide pricing adjustments
              </p>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {marketAdjustments.filter(isMarketAdjustmentActive).map(rule => (
                  <div key={rule.id}
                    style={{
                      padding: '6px 12px', border: `1px solid ${pricingConfig.marketAdjustmentId === rule.id ? teal[200] : teal[100]}`,
                      borderRadius: 9, fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      background: pricingConfig.marketAdjustmentId === rule.id ? teal[100] : 'transparent',
                      color: teal[800]
                    }}
                    onClick={() => setPricingConfig(prev => ({ 
                      ...prev, 
                      marketAdjustmentId: rule.id,
                      marketAdjustment: rule.type === 'PERCENTAGE' || rule.type === 'PERCENT' 
                        ? Number(rule.percentage ?? rule.value) 
                        : Number(rule.value)
                    }))}>
                    {rule.name}
                    <span style={{ background: paper, padding: '2px 6px', borderRadius: 6, fontSize: 10 }}>
                      {rule.type === 'PERCENTAGE' || rule.type === 'PERCENT' || rule.type === 'percentage'
                        ? `+${rule.value}%`
                        : `+${rule.value}`}
                    </span>
                  </div>
                ))}
                {marketAdjustments.filter(isMarketAdjustmentActive).length === 0 && (
                  <span style={{ color: inkSoft, fontStyle: 'italic', fontSize: 13 }}>No active market adjustments found</span>
                )}
              </div>
              
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderTop: `1px solid ${teal[100]}`, paddingTop: 16
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: teal[800] }}>Total Adjustment Value</span>
                <div style={{ position: 'relative', width: 128 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: teal[500] }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={pricingConfig.marketAdjustment?.toFixed(2) || 0}
                    readOnly
                    style={{
                      width: '100%', padding: '8px 12px 8px 28px',
                      border: `1px solid ${teal[100]}`,
                      borderRadius: 9, fontSize: 13,
                      background: teal[50], color: teal[800],
                      fontWeight: 700
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: 16, background: teal[800], borderRadius: 9, color: '#fff' }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Cost Summary</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Total Sheets</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{totalSheets.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Total Pages</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{totalPages.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Total BOM Cost</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>${totalBOMCost.toFixed(2)}</div>
                </div>
              </div>
              <div style={{
                marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.2)',
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Adjustments</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>${totalAdjustments.toFixed(2)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)' }}>+</div>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Total Cost</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: amber[300] }}>${totalCost.toFixed(2)}</div>
                </div>
              </div>
              <div style={{
                marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.2)',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Fee Per Learner</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: amber[300] }}>${feePerLearner.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>Total Amount</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: teal[200] }}>${(feePerLearner * formData.number_of_learners).toFixed(2)}</div>
                </div>
              </div>
              {(() => {
                const revenue = feePerLearner * formData.number_of_learners;
                const profit = revenue - totalCost;
                if (profit > 0) {
                  return (
                    <div style={{
                      marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.2)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div style={{ fontSize: 12, color: amber[300], fontWeight: 600 }}>Profit Margin</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: amber[300] }}>${profit.toFixed(2)}</div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OverrideDialog
        isOpen={showOverrideDialog}
        onClose={() => setShowOverrideDialog(false)}
        onSubmit={handleOverrideSubmit}
        currentPrice={currentJob?.auto_price_per_learner || 0}
      />
      </div>
    </div>
  );
};

export default ExaminationJobForm;