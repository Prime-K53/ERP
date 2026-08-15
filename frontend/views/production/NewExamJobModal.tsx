import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from '../../components/Dialog';
import { logger } from '@/services/logger';
import {
  School as SchoolIcon,
  Plus,
  Trash2,
  Calculator,
  CheckCircle,
  Clock,
  Search,
  FileText,
  AlertCircle,
  Printer,
  ArrowRight,
  RefreshCw,
  Filter,
  Calendar,
  Settings,
  User,
  Layers,
  History,
  FileSpreadsheet,
  Mail,
  Save,
  Edit3,
  Wallet,
  Eye,
  MoreVertical,
  Pause,
  Play,
  ArrowUp,
  ChevronUp,
  ChevronDown,
  Activity,
  DollarSign,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { useSales } from '../../context/SalesContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FinancialDoc } from '../shared/components/PDF/schemas';
import { MarketAdjustment, BOMTemplate, ExamPricingResult, SubjectJob, ProductionSettingsConfig,
  ExamSchoolLocal as School, ExamClassLocal as Class, ExamSubjectLocal as Subject, ExamPaper as Examination } from '../../types';
import { dbService } from '../../services/db';
import { SafeFormulaEngine } from '../../services/formulaEngine';
import { inventoryTransactionService } from '../../services/inventoryTransactionService';
import {
  buildExamHiddenBOMTemplate,
  EXAM_HIDDEN_BOM_TEMPLATE_ID,
  isSameExamHiddenTemplate,
  resolveExamMaterial,
} from '../../services/examHiddenBomService';


interface NewExamJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const NewExamJobModal: React.FC<NewExamJobModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const navigate = useNavigate();
  const { createWorkOrder, updateWorkOrderStatus, completeWorkOrder } = useProduction();
  const { addSale, customers } = useSales();
  const { notify, user } = useAuth();
  const { inventory, updateStock } = useInventory();
  const { postJournalEntry, addRecurringInvoice, recurringInvoices, deleteRecurringInvoice } = useFinance();
  const { companyConfig, updateCompanyConfig } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjectList, setSubjectList] = useState<Subject[]>([]);
  const [marketAdjustments, setMarketAdjustments] = useState<MarketAdjustment[]>([]);
  const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [subAccountName, setSubAccountName] = useState('Main');
  const [className, setClassName] = useState('');
  const [totalCandidature, setTotalCandidature] = useState<string>('');
  const [batchChargePerLearner, setBatchChargePerLearner] = useState<string>('');
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear().toString());
  const [term, setTerm] = useState('Term 1');
  const [examType, setExamType] = useState('Assessment');
  const [extraCopies, setExtraCopies] = useState<string>('');
  const [subjects, setSubjects] = useState<SubjectJob[]>([
    { subject: '', pages: 1, candidates: 1, extra_copies: 0, charge_per_learner: 0 }
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newClassName, setNewClassName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<FinancialDoc | null>(null);
  const [batchLaborCost, setBatchLaborCost] = useState<string>('0');

  const productionSettings = (companyConfig?.productionSettings || {}) as ProductionSettingsConfig;

  useEffect(() => {
    let cancelled = false;

    const ensureExamHiddenBOM = async () => {
      if (!companyConfig) return;

      const resolvedPaper = resolveExamMaterial(inventory || [], 'paper', productionSettings.paperId);
      const resolvedToner = resolveExamMaterial(inventory || [], 'toner', productionSettings.tonerId);

      const hiddenTemplate = buildExamHiddenBOMTemplate({
        paperItem: resolvedPaper,
        tonerItem: resolvedToner,
        laborCost: productionSettings.laborCostPerHour || 10,
        baseMargin: productionSettings.baseMargin || 20,
      });

      const existingHiddenTemplate = (bomTemplates || []).find(t => t.id === EXAM_HIDDEN_BOM_TEMPLATE_ID);
      const shouldSaveTemplate = !isSameExamHiddenTemplate(existingHiddenTemplate, hiddenTemplate);

      if (shouldSaveTemplate) {
        await dbService.put('bomTemplates', hiddenTemplate);

        if (!cancelled) {
          setBomTemplates(prev => {
            const withoutHidden = prev.filter(template => template.id !== EXAM_HIDDEN_BOM_TEMPLATE_ID);
            return [...withoutHidden, hiddenTemplate];
          });
        }
      }

      const nextPaperId = resolvedPaper?.id || '';
      const nextTonerId = resolvedToner?.id || '';
      const shouldUpdateSettings =
        productionSettings.defaultExamBomId !== EXAM_HIDDEN_BOM_TEMPLATE_ID ||
        productionSettings.paperId !== nextPaperId ||
        productionSettings.tonerId !== nextTonerId;

      if (shouldUpdateSettings) {
        updateCompanyConfig({
          ...companyConfig,
          productionSettings: {
            ...productionSettings,
            defaultExamBomId: EXAM_HIDDEN_BOM_TEMPLATE_ID,
            paperId: nextPaperId,
            tonerId: nextTonerId,
          }
        });
      }
    };

    if (isOpen) {
      ensureExamHiddenBOM().catch((err) => {
        logger.error('[NewExamJobModal] Failed to ensure hidden exam BOM template:', err);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [bomTemplates, companyConfig, inventory, isOpen, productionSettings, updateCompanyConfig]);

  const examBOM = useMemo(() => {
    const resolvedPaper = resolveExamMaterial(inventory || [], 'paper', productionSettings.paperId);
    const resolvedToner = resolveExamMaterial(inventory || [], 'toner', productionSettings.tonerId);
    const configuredBomId = productionSettings.defaultExamBomId || EXAM_HIDDEN_BOM_TEMPLATE_ID;
    const template =
      (bomTemplates || []).find(t => t.id === configuredBomId) ||
      (bomTemplates || []).find(t => t.id === EXAM_HIDDEN_BOM_TEMPLATE_ID);

    const sourceTemplate = template || buildExamHiddenBOMTemplate({
      paperItem: resolvedPaper,
      tonerItem: resolvedToner,
      laborCost: productionSettings.laborCostPerHour || 10,
      baseMargin: productionSettings.baseMargin || 20,
    });

    return {
      id: sourceTemplate.id,
      productId: 'EXAM-PRINT',
      productName: `Examination Printing (${sourceTemplate.name})`,
      templateId: sourceTemplate.id,
      components: sourceTemplate.components.map(component => ({
        materialId: component.itemId,
        itemId: component.itemId,
        name: component.name,
        quantity: 1,
        formula: component.quantityFormula,
        unit: component.unit,
        componentType: component.itemId === resolvedPaper?.id
          ? 'paper'
          : component.itemId === resolvedToner?.id
            ? 'toner'
            : undefined,
      })),
      laborCost: sourceTemplate.laborCost || productionSettings.laborCostPerHour || 10,
      totalCost: 0,
      lastCalculated: new Date().toISOString(),
      isParameterized: true
    };
  }, [bomTemplates, inventory, productionSettings]);

  useEffect(() => {
    if (isOpen) {
      dbService.getAll<MarketAdjustment>('marketAdjustments').then(adjustments => {
        setMarketAdjustments(adjustments.filter(a => a.isActive));
      });

      dbService.getAll<BOMTemplate>('bomTemplates').then(templates => {
        setBomTemplates(templates);
      }).catch(err => {
        logger.error('[NewExamJobModal] Failed to load BOM templates:', err);
        if (notify) notify('Failed to load BOM templates', 'error');
      });

      fetchSchools();
      fetchClasses();
      fetchSubjects();
    }
  }, [isOpen]);

  const fetchSchools = async () => {
    try {
      const data = await api.production.getSchools();
      setSchools(data as School[]);
    } catch (err) {
      setError('Failed to load schools');
    }
  };

  const fetchClasses = async () => {
    try {
      const data = await api.production.getClasses();
      setClasses(data);
    } catch (err) {
      logger.error('Failed to load classes', err);
    }
  };

  const fetchSubjects = async () => {
    try {
      const data = await api.production.getSubjects();
      setSubjectList(data);
    } catch (err) {
      logger.error('Failed to load subjects', err);
    }
  };

  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    try {
      await api.production.saveClass(newClassName);
      setNewClassName('');
      fetchClasses();
      setSuccess('Class added successfully');
    } catch (err) {
      setError('Failed to add class');
    }
  };

  const handleAddSubjectList = async () => {
    if (!newSubjectName.trim()) return;
    try {
      await api.production.saveSubject(newSubjectName, newSubjectCode);
      setNewSubjectName('');
      setNewSubjectCode('');
      fetchSubjects();
      setSuccess('Subject added successfully');
    } catch (err) {
      setError('Failed to add subject');
    }
  };

  const selectedSchoolObj = useMemo(() => {
    return (customers || []).find(c => c.id === schoolId) || null;
  }, [schoolId, customers]);

  const schoolSubAccounts = useMemo(() => {
    if (!selectedSchoolObj) return [];
    return selectedSchoolObj.subAccounts || [];
  }, [selectedSchoolObj]);

  const getMaterialUnitCost = (item: any) => {
    const rawCost = Number(
      item?.cost_price ??
      item?.cost_per_unit ??
      item?.cost ??
      0
    );
    return Number.isFinite(rawCost) ? rawCost : 0;
  };

  const normalizeAdjustmentType = (type: unknown) => {
    const value = String(type || '').toUpperCase();
    if (value === 'FIXED') return 'FIXED';
    return 'PERCENTAGE';
  };

  const extractAdjustmentValue = (adjustment: any, normalizedType: 'FIXED' | 'PERCENTAGE') => {
    if (normalizedType === 'FIXED') {
      const fixed = Number(adjustment?.value ?? 0);
      return Number.isFinite(fixed) ? fixed : 0;
    }
    const percentage = Number(adjustment?.percentage ?? adjustment?.value ?? 0);
    return Number.isFinite(percentage) ? percentage : 0;
  };

  const calculateSubjectCost = (subj: SubjectJob) => {
    const pages = parseInt(subj.pages.toString()) || 0;
    const candidates = parseInt(subj.candidates.toString()) || 0;
    const extra_copies = parseInt(subj.extra_copies.toString()) || 0;

    const sheets_per_copy = Math.ceil(pages / 2);
    const production_copies = candidates + extra_copies;
    const base_sheets = sheets_per_copy * production_copies;
    const waste_sheets = Math.ceil(base_sheets * ((productionSettings as ProductionSettingsConfig & Record<string, unknown>).examWastePercentage || 0.05));
    const total_sheets = base_sheets + waste_sheets;
    const total_pages = total_sheets * 2;

    let materialCost = 0;
    let toner_kgs = 0;

    // Calculate material costs from BOM components
    if (examBOM && examBOM.components) {
      examBOM.components.forEach((comp: any) => {
        const item = (inventory || []).find(i => i.id === comp.materialId);
        const unitCost = getMaterialUnitCost(item);
        let quantity = comp.quantity || 0;

        const formula = comp.formula ?? comp.quantityFormula;
        if (formula) {
          try {
            const formulaContext = {
              pages: pages,
              candidates: candidates,
              total_sheets: total_sheets,
              total_pages: total_pages,
              production_copies: production_copies
            };

            quantity = SafeFormulaEngine.evaluate(formula, formulaContext);
          } catch (e) {
            logger.error('Error evaluating BOM formula:', formula, e);
          }
        }

        materialCost += (quantity * unitCost);
        const isTonerComponent =
          comp.componentType === 'toner' ||
          comp.materialId === productionSettings.tonerId ||
          comp.itemId === productionSettings.tonerId ||
          comp.name?.toLowerCase()?.includes('toner') ||
          item?.name?.toLowerCase()?.includes('toner');

        if (isTonerComponent) {
          toner_kgs += quantity;
        }
      });
    }

    const base_internal_cost = materialCost;

    return {
      sheets_per_copy,
      production_copies,
      base_sheets,
      waste_sheets,
      total_sheets_used: total_sheets,
      internal_cost: base_internal_cost,
      material_cost: materialCost,
      base_cost: base_internal_cost,
      adjustmentTotal: 0,
      adjustmentBreakdown: [],
      adjustmentSnapshots: [],
      toner_kgs
    };
  };

  const getBatchSummary = () => {
    const total_learners = parseInt(totalCandidature) || 0;
    const price_per_learner = parseFloat(batchChargePerLearner) || 0;

    if (total_learners <= 0 || price_per_learner <= 0 || subjects.length === 0) {
      return {
        selling_price: 0,
        base_cost: 0,
        total_cost: 0,
        adjustmentTotal: 0,
        adjustmentBreakdown: [] as { category: string; amount: number }[],
        profit: 0,
        material_cost: 0,
        labor_cost: 0,
        cost_price: 0,
        total_sheets: 0,
        toner_kg: 0,
        profit_flag: 'PROFIT' as const,
        labor: 0
      };
    }

    try {
      const subjectResults = subjects.map(subject => calculateSubjectCost(subject));
      const batchTotalSheets = subjectResults.reduce((sum, result) => sum + (result.total_sheets_used || 0), 0);
      const materialCost = subjectResults.reduce((sum, result) => sum + ((result as Record<string, unknown>).material_cost || 0), 0);
      const totalTonerKg = subjectResults.reduce((sum, result) => sum + (result.toner_kgs || 0), 0);

      const laborCost = parseFloat(batchLaborCost) || 0;
      const base_cost = laborCost + materialCost;
      const adjustmentTotal = subjectResults.reduce((sum, result) => sum + (result.adjustmentTotal || 0), 0);
      const breakdownMap = new Map<string, number>();
      for (const result of subjectResults) {
        for (const row of (result.adjustmentBreakdown || [])) {
          const key = String(row.category || 'Adjustment');
          breakdownMap.set(key, (breakdownMap.get(key) || 0) + (Number(row.amount) || 0));
        }
      }
      const adjustmentBreakdown = Array.from(breakdownMap.entries()).map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100
      }));
      const allSnapshots = subjectResults.reduce((acc: Record<string, unknown>[], r) => [...acc, ...((r as Record<string, unknown>).adjustmentSnapshots || []) as Record<string, unknown>[]], []);
      const total_cost = base_cost + adjustmentTotal;
      const selling_price = total_learners * price_per_learner;

      // Profit extracted from adjustmentSnapshots (NOT recalculated)
      const profitMarginSnapshot = allSnapshots.find((s: any) => s.name === 'Profit Margin');
      const profit = profitMarginSnapshot 
        ? profitMarginSnapshot.calculatedAmount * total_learners 
        : selling_price - total_cost;

      return {
        selling_price,
        base_cost,
        total_cost,
        adjustmentTotal: Math.round(adjustmentTotal * 100) / 100,
        adjustmentBreakdown,
        profit,
        material_cost: materialCost,
        labor_cost: laborCost,
        cost_price: base_cost,
        total_sheets: batchTotalSheets,
        toner_kg: totalTonerKg,
        profit_flag: profit >= 0 ? 'PROFIT' : 'LOSS',
        labor: laborCost
      };
    } catch (e) {
      logger.error('Pricing engine error:', e);
      return {
        selling_price: 0,
        base_cost: 0,
        total_cost: 0,
        adjustmentTotal: 0,
        adjustmentBreakdown: [] as { category: string; amount: number }[],
        profit: 0,
        material_cost: 0,
        labor_cost: 0,
        cost_price: 0,
        total_sheets: 0,
        toner_kg: 0,
        profit_flag: 'PROFIT' as const,
        labor: 0
      };
    }
  };

  const batchSummary = useMemo(
    () => getBatchSummary(),
    [subjects, totalCandidature, batchChargePerLearner, inventory, batchLaborCost, examBOM, marketAdjustments, productionSettings]
  );

  const handleAddSubject = () => {
    setSubjects([...subjects, {
      subject: '',
      pages: 1,
      candidates: parseInt(totalCandidature) || 1,
      extra_copies: parseInt(extraCopies) || 0,
      charge_per_learner: 0
    }]);
  };

  const handleRemoveSubject = (index: number) => {
    setSubjects(subjects.filter((_, i) => i !== index));
  };

  const handleSubjectChange = (index: number, field: keyof SubjectJob, value: any) => {
    const newSubjects = [...subjects];
    newSubjects[index] = { ...newSubjects[index], [field]: value };
    setSubjects(newSubjects);
  };

  const handleCreateBatch = async () => {
    if (!schoolId || !className || subjects.some(s => !s.subject)) {
      setError('Please fill in school, class, and all subject names.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const selectedSchool = (schools || []).find(s => s.name?.toLowerCase() === selectedSchoolObj?.name?.toLowerCase());
      const effectiveSchoolId = selectedSchool?.id || schoolId || null;

      const parsedBatchCharge = parseFloat(batchChargePerLearner);
      const finalSubjects = subjects.map(s => ({
        ...s,
        charge_per_learner: !isNaN(parsedBatchCharge) ? parsedBatchCharge / subjects.length : s.charge_per_learner,
        school_name: selectedSchoolObj?.name || 'Unknown'
      }));

      const calculatedSubjects = finalSubjects.map(subj => ({
        subject: subj,
        costData: calculateSubjectCost(subj)
      }));
      const totalBatchSheets = calculatedSubjects.reduce((sum, row) => sum + (row.costData.total_sheets_used || 0), 0);
      const totalBatchLaborCost = parseFloat(batchLaborCost) || 0;

      const subjectsWithWorkOrders = calculatedSubjects.map(({ subject: subj, costData }) => {
        const laborShare =
          totalBatchSheets > 0
            ? totalBatchLaborCost * ((costData.total_sheets_used || 0) / totalBatchSheets)
            : (calculatedSubjects.length > 0 ? totalBatchLaborCost / calculatedSubjects.length : 0);

        return {
          ...subj,
          selling_price: (parsedBatchCharge / finalSubjects.length) * (subj.candidates || 1),
          internal_cost: costData.internal_cost + laborShare,
          labor_cost: laborShare,
          total_sheets_used: costData.total_sheets_used,
          toner_kgs: costData.toner_kgs,
          adjustmentTotal: costData.adjustmentTotal,
          adjustmentSnapshots: costData.adjustmentSnapshots,
          workOrderId: `WO-EXAM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
      });

      const confirmData = await api.production.confirmExamBatch({
        school_id: effectiveSchoolId,
        customer_id: schoolId,
        class_name: className,
        subjects: subjectsWithWorkOrders,
        academic_year: academicYear,
        term: term,
        exam_type: examType,
        sub_account_name: subAccountName
      });

      const returnedBatchId = confirmData?.batch_id;
      if (!returnedBatchId) {
        throw new Error('Batch creation did not return a batch reference.');
      }
      const formattedBatchId = String(returnedBatchId).replace('BATCH-', '').padStart(4, '0');
      const fullBatchId = `BATCH-${formattedBatchId}`;

      try {
        const configuredBomId = companyConfig?.productionSettings?.defaultExamBomId || EXAM_HIDDEN_BOM_TEMPLATE_ID;
        for (const subj of subjectsWithWorkOrders) {
          createWorkOrder({
            id: subj.workOrderId,
            productId: 'EXAM-PRINT',
            productName: `Exam: ${subj.subject} (${className}) - ${selectedSchoolObj?.name}`,
            quantityPlanned: subj.production_copies,
            quantityCompleted: 0,
            status: 'Scheduled',
            priority: 'Medium',
            dueDate: new Date().toISOString(),
            bomId: configuredBomId,
            notes: `Converted from Exam Batch [${fullBatchId}] on ${new Date().toLocaleDateString()} accepted by [${selectedSchoolObj?.name}]`,
            logs: [],
            customerId: schoolId,
            customerName: selectedSchoolObj?.name || 'Unknown School',
            tags: ['Examination', className],
            attributes: {
              batch_number: fullBatchId,
              pages: subj.pages,
              candidates: subj.candidates,
              base_sheets: subj.base_sheets,
              total_sheets: subj.total_sheets_used,
              total_pages: (subj.total_sheets_used || 0) * 2,
              production_copies: subj.production_copies
            }
          });
        }
      } catch (prodErr) {
        logger.error('Failed to create production work orders:', prodErr);
      }

      setSuccess(`Batch ${fullBatchId} created successfully!`);
      setSubjects([{ subject: '', pages: 1, candidates: 1, extra_copies: 0, charge_per_learner: 0 }]);
      setClassName('');
      setTotalCandidature('');
      setBatchChargePerLearner('');
      setBatchLaborCost('0');
      setExtraCopies('');
      setSchoolId('');

      // Close modal and trigger success callback
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      logger.error('Error in handleCreateBatch:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose} title="Create New Examination Job" className="max-w-6xl h-[90vh] flex flex-col">
      <div className="flex flex-1 overflow-hidden">
          <div className="w-2/3 p-6 overflow-y-auto border-r border-slate-200 space-y-8 custom-scrollbar bg-[#F8FAFC]">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              {/* Row 1: School, Class, Academic Year, Term, Exam Type */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">School / Customer</label>
                <select
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold finance-nums"
                  value={schoolId}
                  onChange={(e) => {
                    setSchoolId(e.target.value);
                    setSubAccountName('Main');
                  }}
                >
                  <option value="">Select Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {schoolId && schoolSubAccounts.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Branch / Sub-Account</label>
                  <select
                    className="w-full px-3.5 py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none shadow-sm transition-all text-[13px] finance-nums"
                    value={subAccountName}
                    onChange={(e) => setSubAccountName(e.target.value)}
                  >
                    <option value="Main">Main Account</option>
                    {schoolSubAccounts.map(sub => (
                      <option key={sub.name} value={sub.name}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Class</label>
                <select
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold finance-nums"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                >
                  <option value="">Select Class</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.name}>{cls.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Academic Year</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold finance-nums"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="e.g. 2026"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Term</label>
                <select
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Exam Type</label>
                <select
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold"
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                >
                  <option value="Assessment">Assessment</option>
                  <option value="Mid-Term">Mid-Term</option>
                  <option value="End of Term">End of Term</option>
                  <option value="Mock">Mock</option>
                  <option value="Final">Final</option>
                </select>
              </div>
            </div>

            {/* Row 2: Candidature, Price, Extra Copies */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Batch Candidature (Total Learners)</label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold finance-nums"
                  value={totalCandidature}
                  onChange={(e) => {
                    setTotalCandidature(e.target.value);
                    const rawVal = e.target.value;
                    const val = parseInt(rawVal);
                    if (!isNaN(val) && val > 0) {
                      setSubjects(subjects.map(s => ({ ...s, candidates: val })));
                    }
                  }}
                  placeholder="e.g. 100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Price per Learner</label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold finance-nums"
                  value={batchChargePerLearner}
                  onChange={(e) => setBatchChargePerLearner(e.target.value)}
                  placeholder="e.g. 500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Extra Copies (Per Subject)</label>
                <input
                  type="number"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-[13px] font-bold finance-nums"
                  value={extraCopies}
                  onChange={(e) => {
                    setExtraCopies(e.target.value);
                    const rawVal = e.target.value;
                    const val = parseInt(rawVal);
                    if (!isNaN(val)) {
                      setSubjects(subjects.map(s => ({ ...s, extra_copies: val })));
                    }
                  }}
                  placeholder="e.g. 5"
                />
              </div>
            </div>

            {/* Subjects Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Subjects in Batch</h3>
                <button
                  onClick={handleAddSubject}
                  className="text-blue-600 hover:text-blue-700 font-bold text-[13px] flex items-center gap-1.5 uppercase tracking-tight"
                >
                  <Plus size={16} />
                  Add Subject
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left">
                  <thead className="table-header border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 uppercase tracking-tight">Subject Name</th>
                      <th className="px-4 py-3 w-24 uppercase tracking-tight">Pages</th>
                      <th className="px-4 py-3 w-24 uppercase tracking-tight">Candidates</th>
                      <th className="px-4 py-3 w-32 uppercase tracking-tight">Extra Copies</th>
                      <th className="px-4 py-3 w-16 text-center uppercase tracking-tight">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subjects.map((subj, index) => {
                      return (
                        <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                          <td className="table-body-cell">
                            <input
                              type="text"
                              list="subject-options"
                              className="w-full bg-transparent border-none outline-none focus:ring-0 text-[13px] font-bold text-slate-900 placeholder:text-slate-300"
                              value={subj.subject}
                              onChange={(e) => handleSubjectChange(index, 'subject', e.target.value)}
                              placeholder="e.g. Mathematics"
                            />
                            <datalist id="subject-options">
                              {subjectList.map(s => (
                                <option key={s.id} value={s.name} />
                              ))}
                            </datalist>
                          </td>
                          <td className="table-body-cell">
                            <input
                              type="number"
                              className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[13px] font-bold text-slate-900 finance-nums focus:bg-white focus:border-blue-300 outline-none"
                              value={subj.pages || ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                handleSubjectChange(index, 'pages', isNaN(val) ? 0 : val);
                              }}
                            />
                          </td>
                          <td className="table-body-cell">
                            <input
                              type="number"
                              className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[13px] font-bold text-slate-900 finance-nums focus:bg-white focus:border-blue-300 outline-none"
                              value={subj.candidates || ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                handleSubjectChange(index, 'candidates', isNaN(val) ? 0 : val);
                              }}
                            />
                          </td>
                          <td className="table-body-cell">
                            <input
                              type="number"
                              className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[13px] font-bold text-slate-900 finance-nums focus:bg-white focus:border-blue-300 outline-none"
                              value={subj.extra_copies || 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                handleSubjectChange(index, 'extra_copies', isNaN(val) ? 0 : val);
                              }}
                            />
                          </td>
                          <td className="table-body-cell text-center">
                            {subjects.length > 1 && (
                              <button
                                onClick={() => handleRemoveSubject(index)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="w-1/3 bg-slate-50 p-8 flex flex-col border-l border-slate-200 overflow-y-auto custom-scrollbar">
            <div className="mb-auto space-y-6 pb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-slate-900 text-white rounded-lg shadow-xl">
                  <Calculator size={24} />
                </div>
                <h3 className="font-normal text-slate-800 text-xl leading-none">Fiscal Summary</h3>
              </div>

              <div className="bg-blue-100/50 p-6 rounded-xl text-blue-900 border border-blue-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform"><ShieldCheck size={80} /></div>
                <div className="relative z-10 flex items-start gap-4">
                  <Info size={24} className="text-blue-600 shrink-0 mt-1" />
                  <div className="space-y-1">
                    <p className="text-[11px] text-blue-700 font-normal uppercase tracking-wider">Compliance Protocol</p>
                    <p className="text-xs text-blue-800/80 leading-relaxed font-normal">
                      Batch will be cryptographically logged to the system audit trail. Security protocols ensure real-time integrity reporting.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 shrink-0">
              <button
                onClick={handleCreateBatch}
                disabled={loading || !schoolId || !className || subjects.some(s => !s.subject)}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-normal text-[12px] shadow-xl shadow-blue-900/20 hover:bg-blue-700 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-2 active:scale-95"
              >
                {loading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                Create Examination Batch
              </button>
              <button onClick={handleClose} className="w-full py-2 text-slate-400 font-normal text-[10px] hover:text-rose-500 transition-colors text-center">
                Cancel
              </button>
            </div>
          </div>
        </div>

      {/* Notifications */}
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <AlertCircle size={20} />
          <span className="font-semibold">{error}</span>
          <button onClick={() => setError(null)} className="ml-4 hover:opacity-70"><Trash2 size={16} /></button>
        </div>
      )}
      {success && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <CheckCircle size={20} />
          <span className="font-semibold">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-4 hover:opacity-70"><Trash2 size={16} /></button>
        </div>
      )}
    </Dialog>
  );
};
