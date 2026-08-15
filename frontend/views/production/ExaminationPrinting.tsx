import React, { useState, useEffect, useMemo } from 'react';
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
  TrendingUp,
  Filter,
  Calendar,
  Settings,
  User,
  Layers,
  History,
  FileSpreadsheet,
  Mail,
  Save,
  X,
  Edit3,
  Wallet,
  Eye,
  MoreVertical,
  Pause,
  Play,
  ArrowUp,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DollarSign,
} from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { useSales } from '../../context/SalesContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import type { Item } from '../../types';

import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PreviewModal } from '../shared/components/PDF/PreviewModal';
import { FinancialDoc } from '../shared/components/PDF/schemas';
import { MarketAdjustment, BOMTemplate, ExamPricingResult, SubjectJob, ProductionSettingsConfig,
  ExamSchoolLocal as School, ExamClassLocal as Class, ExamSubjectLocal as Subject, ExamPaper as Examination } from '../../types';
import { dbService } from '../../services/db';
import { SafeFormulaEngine } from '../../services/formulaEngine';
import { inventoryTransactionService } from '../../services/inventoryTransactionService';
import { currencyService } from '../../services/currencyService';
import { NewExamJobModal } from './NewExamJobModal';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';
import {
  buildExamHiddenBOMTemplate,
  EXAM_HIDDEN_BOM_FORMULAS,
  EXAM_HIDDEN_BOM_TEMPLATE_ID,
  EXAM_HIDDEN_BOM_TEMPLATE_NAME,
  isSameExamHiddenTemplate,
  resolveExamMaterial,
} from '../../services/examHiddenBomService';


const ExaminationPrinting: React.FC = () => {
  const navigate = useNavigate();
  const { createWorkOrder, updateWorkOrderStatus, completeWorkOrder } = useProduction();
  const { addSale, customers } = useSales();
  const { notify, user } = useAuth();
  const { inventory, updateStock, addItem } = useInventory();
  const { postJournalEntry, addRecurringInvoice, recurringInvoices, deleteRecurringInvoice } = useFinance();
  const { companyConfig, updateCompanyConfig } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjectList, setSubjectList] = useState<Subject[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new' | 'queue' | 'invoices' | 'history' | 'recurring' | 'settings'>('dashboard');
  const [settingsTab, setSettingsTab] = useState<'general' | 'bom'>('general');
  const [marketAdjustments, setMarketAdjustments] = useState<MarketAdjustment[]>([]);
  const [bomTemplates, setBomTemplates] = useState<BOMTemplate[]>([]);
  const [schoolId, setSchoolId] = useState('');

  useEffect(() => {
    dbService.getAll<MarketAdjustment>('marketAdjustments').then(adjustments => {
      setMarketAdjustments(adjustments.filter(a => a.isActive));
    });

    dbService.getAll<BOMTemplate>('bomTemplates').then(templates => {
      setBomTemplates(templates);
    }).catch(err => {
      logger.error('[ExaminationPrinting] Failed to load BOM templates:', err);
      if (notify) notify('Failed to load BOM templates', 'error');
    });
  }, []);
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

  const [queue, setQueue] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null); // For print view
  const [invoiceDetails, setInvoiceDetails] = useState<any[]>([]); // Breakdown of classes for invoice
  const [selectedJobDetails, setSelectedJobDetails] = useState<any | null>(null);

  // --- Recurring Invoice State ---
  const [selectedBatchForRecurring, setSelectedBatchForRecurring] = useState<any | null>(null);
  const [recurringFrequency, setRecurringFrequency] = useState<'Weekly' | 'Monthly' | 'Quarterly' | 'Annually'>('Monthly');
  const [autoDeductWallet, setAutoDeductWallet] = useState(false);
  const [manualDates, setManualDates] = useState<string[]>([]);
  const [currentManualDate, setCurrentManualDate] = useState('');
  const [showRecurringModal, setShowRecurringModal] = useState(false);

  const [activeBatches, setActiveBatches] = useState<any[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [completingSubject, setCompletingSubject] = useState<Examination | null>(null);
  const [editingSubject, setEditingSubject] = useState<Examination | null>(null);
  const [actualWaste, setActualWaste] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<FinancialDoc | null>(null);

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  // --- Configuration State ---
  const [newClassName, setNewClassName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');

  // --- Exam BOM State ---
  const productionSettings = (companyConfig?.productionSettings || {}) as ProductionSettingsConfig;

  const paperMaterialOptions = useMemo(() => {
    return (inventory || []).filter(item => {
      const name = (item.name || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      return name.includes('paper') || category.includes('paper');
    });
  }, [inventory]);

  const tonerMaterialOptions = useMemo(() => {
    return (inventory || []).filter(item => {
      const name = (item.name || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      return name.includes('toner') || category.includes('toner');
    });
  }, [inventory]);

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

    ensureExamHiddenBOM().catch((err) => {
      logger.error('[ExaminationPrinting] Failed to ensure hidden exam BOM template:', err);
    });

    return () => {
      cancelled = true;
    };
  }, [bomTemplates, companyConfig, inventory, productionSettings, updateCompanyConfig]);

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
    } as Record<string, unknown>;
  }, [bomTemplates, inventory, productionSettings]);

  useEffect(() => {
    fetchSchools();
    fetchClasses();
    fetchSubjects();
    fetchQueue();
    fetchStats();
  }, []);

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

  const handleDeleteClass = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Class',
      message: 'Are you sure you want to delete this class?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await api.production.deleteClass(id);
          fetchClasses();
          setSuccess('Class deleted successfully');
        } catch (err) {
          setError('Failed to delete class');
        }
      }
    });
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

  const handleDeleteSubjectList = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Subject',
      message: 'Are you sure you want to delete this subject?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await api.production.deleteSubject(id);
          fetchSubjects();
          setSuccess('Subject deleted successfully');
        } catch (err) {
          setError('Failed to delete subject');
        }
      }
    });
  };

  const fetchQueue = async () => {
    try {
      const data = await api.production.getExaminations();
      setQueue(data as Examination[]);
    } catch (err) {
      logger.error('Failed to fetch queue:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await api.stats.getExaminationStats();
      setStats(data);
    } catch (err) {
      logger.error('Failed to fetch stats:', err);
    }
  };

  const selectedSchoolObj = useMemo(() => {
    return (customers || []).find(c => c.id === schoolId) || null;
  }, [schoolId, customers]);

  const schoolSubAccounts = useMemo(() => {
    if (!selectedSchoolObj) return [];
    return selectedSchoolObj.subAccounts || [];
  }, [selectedSchoolObj]);

  const calculateSubjectCost = (subj: SubjectJob) => {
    const pages = parseInt(subj.pages.toString()) || 0;
    const candidates = parseInt(subj.candidates.toString()) || 0;
    const extra_copies = parseInt(subj.extra_copies.toString()) || 0;

    const sheets_per_copy = Math.ceil(pages / 2);
    const production_copies = candidates + extra_copies;
    const base_sheets = sheets_per_copy * production_copies;
    const waste_sheets = Math.ceil(base_sheets * ((productionSettings as Record<string, unknown>).examWastePercentage as number || 0.05));
    const total_sheets = base_sheets + waste_sheets;
    const total_pages = total_sheets * 2;

    let materialCost = 0;
    let toner_kgs = 0;

    if (examBOM && examBOM.components) {
      examBOM.components.forEach((comp: any) => {
        const item = (inventory || []).find(i => i.id === comp.materialId);
        const unitCost = Number((item as any)?.cost_price ?? (item as any)?.cost_per_unit ?? item?.cost ?? 0);
        let quantity = comp.quantity || 0;

        const formula = comp.formula ?? comp.quantityFormula;
        if (formula) {
          try {
            // Use SafeFormulaEngine instead of eval()
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

        let conversion = item?.conversionRate || 1;
        const unitLower = (item?.unit || '').toLowerCase();
        if (!item?.conversionRate || (item?.conversionRate || 0) <= 0) {
          if (unitLower.includes('ream')) conversion = 500;
          else if (unitLower.includes('kg')) conversion = 1000;
        }
        const costPerUsageUnit = conversion > 0 ? unitCost / conversion : unitCost;
        materialCost += (quantity * costPerUsageUnit);
        const isTonerComponent =
          comp.componentType === 'toner' ||
          comp.materialId === productionSettings.tonerId ||
          comp.itemId === productionSettings.tonerId ||
          comp.name?.toLowerCase()?.includes('toner') ||
          item?.name?.toLowerCase()?.includes('toner');

        if (isTonerComponent) {
          toner_kgs += quantity / 1000;
        }
      });
    }

    const laborCost = (examBOM.laborCost || 10);

    const base_internal_cost = laborCost + materialCost;
    let adjustmentTotal = 0;
    let adjustmentBreakdown: { category: string; amount: number }[] = [];
    let adjustmentSnapshots: any[] = [];

    const internal_cost = base_internal_cost;

    return {
      sheets_per_copy,
      production_copies,
      base_sheets,
      waste_sheets,
      total_sheets_used: total_sheets,
      internal_cost,
      adjustmentTotal,
      adjustmentBreakdown,
      adjustmentSnapshots,
      toner_kgs
    };
  };

  const getBatchSummary = () => {
    const total_learners = parseInt(totalCandidature) || 0;
    const price_per_learner = parseFloat(batchChargePerLearner) || 0;

    // Hard fail guards for summary
    if (total_learners <= 0 || price_per_learner <= 0 || subjects.length === 0) {
      return {
        selling_price: 0,
        total_cost: 0,
        profit: 0,
        total_sheets: 0,
        toner_kg: 0,
        profit_flag: 'PROFIT' as const
      };
    }

    try {
      const subjectResults = subjects.map(subject => calculateSubjectCost(subject));
      const total_sheets = subjectResults.reduce((sum, result) => sum + (result.total_sheets_used || 0), 0);
      const toner_kg = subjectResults.reduce((sum, result) => sum + (result.toner_kgs || 0), 0);
      const total_cost = subjectResults.reduce((sum, result) => sum + (result.internal_cost || 0), 0);
      const selling_price = total_learners * price_per_learner;
      // Profit = selling price - total internal cost (this is production cost calculation)
      const profit = selling_price - total_cost;

      return {
        selling_price,
        total_cost,
        profit,
        total_sheets,
        toner_kg,
        profit_flag: profit >= 0 ? 'PROFIT' : 'LOSS'
      };
    } catch (e) {
      logger.error('Pricing engine error:', e);
      return {
        selling_price: 0,
        total_cost: 0,
        profit: 0,
        total_sheets: 0,
        toner_kg: 0,
        profit_flag: 'PROFIT' as const
      };
    }
  };

  const batchSummary = useMemo(
    () => getBatchSummary(),
    [subjects, totalCandidature, batchChargePerLearner, inventory, examBOM, productionSettings.tonerId]
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

      const subjectsWithWorkOrders = finalSubjects.map(subj => {
        // Use the selected BOM for calculation if available, otherwise fallback to pricing service
        const costData = calculateSubjectCost(subj);

        return {
          ...subj,
          selling_price: (parsedBatchCharge / finalSubjects.length) * (subj.candidates || 1), // Proportionate price
          internal_cost: costData.internal_cost,
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

      const returnedBatchId = confirmData?.batch_id || (confirmData as Record<string, unknown>)?.batchId as string;
      if (!returnedBatchId) {
        throw new Error('Batch creation did not return a batch reference.');
      }
      const formattedBatchId = String(returnedBatchId).replace('BATCH-', '').padStart(4, '0');
      const fullBatchId = `BATCH-${formattedBatchId}`;

      // Create Work Orders with BOM attributes for correct formula resolution during completion
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
            source: 'examination',
            priority: 'Medium',
            dueDate: new Date().toISOString(),
            bomId: configuredBomId,
            notes: `Converted from [Exam Batch] #[${fullBatchId}] on [${new Date().toLocaleDateString()}] as accepted by [${selectedSchoolObj?.name || 'Unknown School'}]`,
            logs: [],
            customerName: selectedSchoolObj?.name || 'Unknown School',
            tags: ['Examination', className],
            attributes: {
              pages: subj.pages,
              candidates: subj.candidates,
              base_sheets: subj.base_sheets,
              total_sheets: subj.total_sheets_used,
              total_pages: (subj.total_sheets_used || 0) * 2,
              production_copies: subj.production_copies
            }
          } as Record<string, unknown>);
        }
      } catch (prodErr) {
        logger.error('Failed to create production work orders:', prodErr);
      }

      setSuccess(`Batch ${fullBatchId} created successfully!`);
      setSubjects([{ subject: '', pages: 1, candidates: 1, extra_copies: 0, charge_per_learner: 0 }]);
      setClassName('');
      setTotalCandidature('');
      setBatchChargePerLearner('');
      setExtraCopies('');
      setSchoolId('');
      fetchQueue();
      setActiveTab('queue');
    } catch (err: any) {
      logger.error('Error in handleCreateBatch:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSubject = async () => {
    if (!completingSubject || actualWaste === '') return;
    setLoading(true);
    try {
      const wasteVal = parseFloat(actualWaste) || 0;

      if (completingSubject.workOrderId) {
        // Use the centralized completeWorkOrder which handles:
        // 1. Exam status update (api.production.completeExamSubject)
        // 2. Inventory consumption (BOM-based)
        // 3. Ledger postings (COGS, WIP, etc.)
        // 4. Work order status update
        await completeWorkOrder(completingSubject.workOrderId, wasteVal);
      } else {
        // Legacy path: exams created before work-order integration
        logger.warn('[ExaminationPrinting] Using legacy completion path — no workOrderId linked. Upgrade recommended.');
        await api.production.completeExamSubject(
          completingSubject.id.toString(),
          wasteVal
        );

        const paperItem = (inventory || []).find(i =>
          i.type === 'Raw Material' && /paper|bond/i.test(i.name)
        );
        if (paperItem) {
          const total_sheets = completingSubject.base_sheets + wasteVal;
          const defaultWarehouse = (companyConfig as any)?.productionSettings?.defaultWarehouseId;
          await inventoryTransactionService.deductInventory({
            itemId: paperItem.id,
            warehouseId: defaultWarehouse || '',
            quantity: total_sheets,
            reason: 'Production Consumption (legacy exam)',
            reference: `Exam: ${completingSubject.subject}`,
            referenceId: completingSubject.id?.toString(),
            performedBy: user?.id || user?.username || 'system'
          });
        } else {
          logger.warn('[ExaminationPrinting] Legacy completion: no paper raw material found for inventory deduction.');
        }
      }

      setSuccess(`Subject ${completingSubject.subject} completed!`);
      setCompletingSubject(null);
      setActualWaste('');

      // Refresh queue
      fetchQueue();
      fetchStats();
    } catch (err: any) {
      logger.error('Error in handleCompleteSubject:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSubject = async (examId: string) => {
    setLoading(true);
    try {
      await api.production.markExamSubject(examId);
      setSuccess(`Subject marked successfully!`);
      const updatedExams = await api.production.getExaminations();
      setQueue(updatedExams);
      fetchStats();
    } catch (err: any) {
      logger.error('Error in handleMarkSubject:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubject = async (examId: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Subject',
      message: 'Are you sure you want to delete this subject from the queue?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        setLoading(true);
        try {
          await (api.production as { deleteExamPaper: (id: string) => Promise<unknown> }).deleteExamPaper(examId);
          setSuccess('Subject removed from queue');
          fetchQueue();
          fetchStats();
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleUpdateSubject = async (examId: string, updates: any) => {
    setLoading(true);
    try {
      await (api.production as { updateExamPaper: (id: string, updates: unknown) => Promise<unknown> }).updateExamPaper(examId, updates);
      setSuccess('Subject updated successfully');
      setEditingSubject(null);
      fetchQueue();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRecurring = async () => {
    if (!selectedBatchForRecurring) return;
    setLoading(true);
    try {
      const batchExams = queue.filter(e => e.batch_id === selectedBatchForRecurring.batch_id);
      const totalAmount = batchExams.reduce((sum, e) => sum + (e.selling_price || 0), 0);
      const first = batchExams[0];

      // 1. Ensure EXAM-PRINT product exists
      const existingProduct = (inventory || []).find(i => i.id === 'EXAM-PRINT');
      if (!existingProduct) {
        addItem({
          id: 'EXAM-PRINT',
          name: 'Examination Printing Service',
          category: 'Examination',
          type: 'Product',
          unit: 'Learner',
          price: 0,
          cost: 0,
          stock: 0,
          minStock: 0,
          sku: 'EXAM-PRINT-GEN',
          status: 'Active'
        } as unknown as Item);
      }

      // 2. Group subjects by class and calculate costs
      const groupedItems = batchExams.reduce((acc, e) => {
        const costData = calculateSubjectCost(e);
        if (!acc[e.class]) {
          acc[e.class] = { total: 0, candidates: e.candidates, totalCost: 0 };
        }
        acc[e.class].total += (e.selling_price || 0);
        acc[e.class].totalCost += (costData.internal_cost || 0);
        return acc;
      }, {} as Record<string, { total: number, candidates: number, totalCost: number }>);

      const items = Object.keys(groupedItems).map(className => ({
        id: 'EXAM-PRINT', // Link to the product ID for BOM processing
        name: `${className}`,
        sku: `EXAM-${selectedBatchForRecurring.batch_id}`,
        quantity: groupedItems[className].candidates,
        price: groupedItems[className].candidates > 0 ? groupedItems[className].total / groupedItems[className].candidates : 0,
        cost: groupedItems[className].candidates > 0 ? groupedItems[className].totalCost / groupedItems[className].candidates : 0,
        stock: 0,
        type: 'Product',
        unit: 'Learner',
        category: 'Examination'
      }));

      // Calculate next run date based on frequency
      const now = new Date();
      let nextRunDate = new Date();
      if (recurringFrequency === 'Weekly') nextRunDate.setDate(now.getDate() + 7);
      else if (recurringFrequency === 'Monthly') nextRunDate.setMonth(now.getMonth() + 1);
      else if (recurringFrequency === 'Quarterly') nextRunDate.setMonth(now.getMonth() + 3);
      else if (recurringFrequency === 'Annually') nextRunDate.setFullYear(now.getFullYear() + 1);

      await addRecurringInvoice({
        customerId: first.customer_id,
        customerName: first.school_name,
        frequency: recurringFrequency,
        nextRunDate: nextRunDate.toISOString(),
        items,
        total: totalAmount,
        status: 'Active',
        autoDeductWallet,
        subAccountName: first.sub_account_name,
        scheduledDates: manualDates.length > 0 ? manualDates : undefined
      } as Record<string, unknown>);

      setSuccess(`Recurring subscription created for ${first.school_name}!`);
      setShowRecurringModal(false);
      setSelectedBatchForRecurring(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateInvoice = async (specificBatchIds?: string[]) => {
    const batchesToInvoice = specificBatchIds || selectedBatches;
    if (batchesToInvoice.length === 0) return;
    setLoading(true);
    try {
      const data = await api.production.generateExamInvoice(batchesToInvoice);

      setSuccess(`Invoice ${data.invoice_id} generated successfully!`);
      if (!specificBatchIds) setSelectedBatches([]);
      fetchQueue();
      setActiveTab('invoices');
    } catch (err: any) {
      logger.error('Error in handleGenerateInvoice:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBatches = async () => {
    if (selectedBatches.length === 0) return;
    setConfirmState({
      open: true,
      title: 'Delete Batches',
      message: `Are you sure you want to delete ${selectedBatches.length} batch(es)? This action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        setLoading(true);
        try {
          for (const batchId of selectedBatches) {
            await api.production.deleteExamBatch(batchId);
          }
          setSuccess(`${selectedBatches.length} batch(es) deleted successfully!`);
          setSelectedBatches([]);
          fetchQueue();
          fetchStats();
        } catch (err: any) {
          logger.error('Error in handleDeleteBatches:', err);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handlePreviewInvoice = (batchId: string) => {
    const batchExams = queue.filter(e => e.batch_id === batchId || e.invoiceId === batchId);
    if (batchExams.length === 0) return;

    const first = batchExams[0];

    // Group by class for items
    const groupedItems = batchExams.reduce((acc, e) => {
      const key = `${e.class} - ${e.subject}`;
      if (!acc[key]) {
        acc[key] = { qty: 0, price: e.charge_per_learner, total: 0 };
      }
      acc[key].qty += e.candidates;
      acc[key].total += (e.selling_price || 0);
      return acc;
    }, {} as Record<string, { qty: number, price: number, total: number }>);

    const items = Object.keys(groupedItems).map(key => ({
      desc: key,
      qty: groupedItems[key].qty,
      price: groupedItems[key].price,
      total: groupedItems[key].total
    }));

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);

    // Get customer address from customers list or use company config as fallback
    const customerObj = (customers || []).find(c => c.name === first.school_name);
    const customerAddress = customerObj?.address || customerObj?.billingAddress || companyConfig?.addressLine1 || '';
    const customerPhone = customerObj?.phone || '';

    const data: FinancialDoc = {
      number: first.invoiceId || first.batch_id,
      date: new Date(first.created_at || Date.now()).toLocaleDateString(),
      clientName: first.school_name,
      address: customerAddress,
      phone: customerPhone,
      isConverted: true,
      conversionDetails: {
        sourceType: 'Exam Batch',
        sourceNumber: first.batch_id,
        date: new Date(first.created_at || Date.now()).toLocaleDateString(),
        acceptedBy: first.school_name
      },
      items: items,
      subtotal: subtotal,
      amountPaid: 0,
      totalAmount: subtotal
    };

    setPreviewData(data);
    setIsPreviewOpen(true);
  };

  const toggleBatchSelection = (batchId: string) => {
    if (selectedBatches.includes(batchId)) {
      setSelectedBatches(selectedBatches.filter(id => id !== batchId));
    } else {
      setSelectedBatches([...selectedBatches, batchId]);
    }
  };

  return (
    <div className="h-screen overflow-y-auto custom-scrollbar bg-slate-50">
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-title flex items-center gap-3">
              <SchoolIcon className="text-blue-600" size={28} />
              Examination Printing Module
            </h1>
            <p className="text-[13px] text-slate-500 font-medium">Manage school exam batches, costing, and billing.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${activeTab === 'new' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              <Plus size={18} />
              New Job
            </button>
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${activeTab === 'queue' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              <Layers size={18} />
              Queue
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              <History size={18} />
              History
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
            >
              <Settings size={18} />
              Settings
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Cards (QBO Style) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-amber-500 hover:bg-slate-50 transition-all duration-200">
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg shrink-0"><Clock size={20} /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Pending Jobs</p>
                    <p className="text-lg md:text-xl font-semibold text-slate-900">{stats?.pending_jobs || 0}</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">In Queue</p>
                  </div>
                </div>
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-emerald-500 hover:bg-slate-50 transition-all duration-200">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0"><DollarSign size={20} /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Total Revenue</p>
                    <p className="text-lg md:text-xl font-semibold text-emerald-600">{companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'} {(stats?.total_revenue || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Lifetime Revenue</p>
                  </div>
                </div>
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-rose-500 hover:bg-slate-50 transition-all duration-200">
                  <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg shrink-0"><Trash2 size={20} /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Total Waste</p>
                    <p className="text-lg md:text-xl font-semibold text-slate-900">{(stats?.total_waste || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-rose-600 mt-0.5">Sheets Wasted</p>
                  </div>
                </div>
                <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-blue-500 hover:bg-slate-50 transition-all duration-200">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0"><Layers size={20} /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Total Sheets</p>
                    <p className="text-lg md:text-xl font-semibold text-slate-900">{(stats?.total_sheets || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Printed Total</p>
                  </div>
                </div>
              </div>

              {/* Quick Actions & Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight">Recent Jobs</h3>
                    <button onClick={() => setActiveTab('queue')} className="text-blue-600 text-[13px] font-bold hover:underline uppercase tracking-tight">View All</button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {queue.slice(0, 5).map(job => (
                      <div key={job.id} className="p-4 hover:bg-slate-50/50 transition-colors flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${job.status === 'pending' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                          <div>
                            <p className="text-[13px] font-bold text-slate-900">{job.school_name}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{job.class} - {job.subject}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-bold text-slate-900 finance-nums">{job.candidates} <span className="text-[10px] text-slate-400 uppercase tracking-tight">Candidates</span></p>
                          <p className="text-[10px] text-slate-400 font-bold finance-nums uppercase tracking-tight">{job.created_at ? new Date(job.created_at).toLocaleDateString() : 'N/A'}</p>
                        </div>
                      </div>
                    ))}
                    {queue.length === 0 && (
                      <div className="p-12 text-center text-slate-400">
                        <p className="text-[13px] font-medium">No recent jobs found.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-200">
                    <h3 className="text-[18px] font-bold mb-2">New Examination</h3>
                    <p className="text-blue-100 text-[13px] mb-6">Create a new batch for a school and calculate costs instantly.</p>
                    <button
                      onClick={() => setActiveTab('new')}
                      className="w-full py-3 bg-white text-blue-600 text-[13px] font-bold rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 uppercase tracking-tight"
                    >
                      <Plus size={18} />
                      Start New Batch
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                      <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight">Quick Actions</h3>
                    </div>
                    <div className="p-4 flex flex-col gap-3">
                      <button onClick={() => setActiveTab('new')} className="w-full flex items-center justify-between p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                            <Plus size={18} />
                          </div>
                          <span className="text-[13px] font-bold uppercase tracking-tight">New Exam Job</span>
                        </div>
                        <ArrowRight size={16} className="text-blue-400 group-hover:translate-x-1 transition-transform" />
                      </button>
                      <button onClick={() => setActiveTab('queue')} className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors group">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                            <Layers size={18} />
                          </div>
                          <span className="text-[13px] font-bold uppercase tracking-tight">View Queue</span>
                        </div>
                        <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'new' && (
            <NewExamJobModal
              isOpen={true}
              onClose={() => setActiveTab('dashboard')}
              onSuccess={() => {
                setActiveTab('queue');
                fetchQueue();
                fetchStats();
              }}
            />
          )}

          {activeTab === 'queue' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Layers size={20} className="text-blue-600" />
                  <h2 className="text-[18px] font-bold text-slate-900">Pending Examinations</h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search schools or subjects..."
                      className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={() => {
                      fetchQueue();
                      fetchStats();
                    }}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title="Refresh Queue"
                  >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                  </button>

                  {selectedBatches.length > 0 && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                      <button
                        onClick={handleDeleteBatches}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[13px] font-bold hover:bg-red-100 transition-all border border-red-100 uppercase tracking-tight"
                      >
                        <Trash2 size={18} />
                        Delete ({selectedBatches.length})
                      </button>
                      <button
                        onClick={() => handleGenerateInvoice()}
                        disabled={loading || !queue.filter(e => selectedBatches.includes(e.batch_id)).every(e => e.status === 'marked')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[13px] font-bold hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-100 uppercase tracking-tight"
                      >
                        <FileText size={18} />
                        Invoice ({selectedBatches.length})
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="table-header border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={selectedBatches.length > 0 && Array.from(new Set(queue.filter(e => e.status !== 'invoiced').map(e => e.batch_id))).every(id => selectedBatches.includes(id))}
                          onChange={(e) => {
                            const availableBatchIds = Array.from(new Set(queue.filter(e => e.status !== 'invoiced').map(e => e.batch_id)));
                            if (e.target.checked) setSelectedBatches(availableBatchIds);
                            else setSelectedBatches([]);
                          }}
                        />
                      </th>
                      <th className="px-4 py-3 uppercase tracking-tight">School / Branch</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Class & Subject</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Details</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Costing</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Status</th>
                      <th className="px-4 py-3 text-center uppercase tracking-tight">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.values(queue
                      .filter(e => e.status !== 'invoiced' && (
                        (e.school_name?.toLowerCase() || '').includes(searchQuery?.toLowerCase() || '') ||
                        (e.subject?.toLowerCase() || '').includes(searchQuery?.toLowerCase() || '')
                      ))
                      .reduce((acc: Record<string, any[]>, curr) => {
                        if (!acc[curr.batch_id]) acc[curr.batch_id] = [];
                        acc[curr.batch_id].push(curr);
                        return acc;
                      }, {}))
                      .map((batchSubjects: any[]) => {
                        const first = batchSubjects[0];
                        const isFullyCompleted = batchSubjects.every(s => s.status === 'completed' || s.status === 'marked');
                        const isFullyMarked = batchSubjects.every(s => s.status === 'marked');

                        return (
                          <React.Fragment key={first.batch_id}>
                            <tr className="bg-slate-50/50 border-t border-slate-200">
                              <td className="table-body-cell">
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300"
                                  checked={selectedBatches.includes(first.batch_id)}
                                  onChange={() => toggleBatchSelection(first.batch_id)}
                                />
                              </td>
                              <td className="table-body-cell">
                                <p className="font-bold text-slate-900 text-[13px]">{first.school_name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <p className="text-[10px] text-blue-600 font-bold uppercase tracking-tight">{first.sub_account_name || 'Main Account'}</p>
                                  {first.exam_type && (
                                    <span className="text-[9px] bg-white text-slate-500 px-1.5 py-0.25 rounded font-bold uppercase tracking-tight border border-slate-200">
                                      {first.exam_type}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="table-body-cell">
                                <p className="font-bold text-slate-700 text-[13px]">{first.class}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                  {first.academic_year} {first.term} â€¢ {batchSubjects.length} Subjects
                                </p>
                              </td>
                              <td className="table-body-cell">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight flex items-center gap-1.5 finance-nums">
                                    <User size={12} className="text-slate-400" /> {first.candidates} Candidates
                                  </span>
                                </div>
                              </td>
                              <td className="table-body-cell">
                                <p className="font-bold text-slate-900 text-[13px] finance-nums">
                                  {companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'}{batchSubjects.reduce((sum, s) => sum + (s.selling_price || 0), 0).toLocaleString()}
                                </p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight finance-nums">
                                  Total Class Charge
                                </p>
                              </td>
                              <td className="table-body-cell">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight border ${isFullyMarked ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                  isFullyCompleted ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                    'bg-amber-50 text-amber-700 border-amber-100'
                                  }`}>
                                  {isFullyMarked ? 'READY FOR INVOICE' : isFullyCompleted ? 'WAITING FOR MARKING' : 'IN PRODUCTION'}
                                </span>
                              </td>
                              <td className="table-body-cell text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {isFullyMarked && (
                                    <>
                                      <button
                                        onClick={() => handleGenerateInvoice([first.batch_id])}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white rounded-lg text-[11px] font-bold hover:bg-blue-700 transition-all shadow-sm"
                                        title="Generate One-time Invoice"
                                      >
                                        <FileText size={14} /> Invoice
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectedBatchForRecurring({ batch_id: first.batch_id, school_name: first.school_name, class: first.class });
                                          setShowRecurringModal(true);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                                        title="Convert to Recurring Subscription"
                                      >
                                        <RefreshCw size={14} /> Recurring
                                      </button>
                                      <button
                                        onClick={() => handlePreviewInvoice(first.batch_id)}
                                        className="p-1 px-3 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-200 transition-all border border-slate-200"
                                        title="Preview Batch"
                                      >
                                        <Eye size={14} /> Preview
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {batchSubjects.map((job) => (
                              <tr key={job.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                                <td className="table-body-cell"></td>
                                <td className="table-body-cell pl-8" colSpan={2}>
                                  <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${job.status === 'marked' ? 'bg-emerald-500' :
                                      job.status === 'completed' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' :
                                        'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                                      }`} />
                                    <div>
                                      <p className="text-[12px] font-bold text-slate-700">{job.subject}</p>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">ID: {job.id.toString().split('-').pop()}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="table-body-cell">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight flex items-center gap-1.5 finance-nums">
                                      <Layers size={12} className="text-slate-400" /> {job.pages} Pages â€¢ {job.candidates} Cand.
                                    </span>
                                    {job.extra_copies > 0 && (
                                      <span className="text-[9px] text-blue-500 font-bold uppercase tracking-tight">
                                        +{job.extra_copies} Extra Copies
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="table-body-cell">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between gap-4">
                                      <p className="text-[11px] font-bold text-slate-900 finance-nums">{companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'}{(job.selling_price || 0).toLocaleString()}</p>
                                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Selling Price</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <p className="text-[11px] font-bold text-blue-600 finance-nums">{companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'}{(job.internal_cost || 0).toLocaleString()}</p>
                                      <span className="text-[9px] text-blue-500 font-bold uppercase tracking-tight">Est. Cost Price</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-0.5 mt-0.5">
                                      <p className={`text-[11px] font-bold finance-nums ${((job.selling_price || 0) - (job.internal_cost || 0)) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'}{((job.selling_price || 0) - (job.internal_cost || 0)).toLocaleString()}
                                      </p>
                                      <span className={`text-[9px] font-bold uppercase tracking-tight ${((job.selling_price || 0) - (job.internal_cost || 0)) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Est. Profit</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-0.5">
                                      <p className="text-[11px] font-bold text-slate-700 finance-nums">
                                        {(job.total_sheets_used * 0.00004).toFixed(4)} Kg
                                      </p>
                                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Est. Toner</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="table-body-cell">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-widest border shadow-sm ${job.status === 'marked' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                    job.status === 'completed' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                      'bg-amber-50 text-amber-700 border-amber-100'
                                    }`}>
                                    {job.status === 'marked' ? 'READY' :
                                      job.status === 'completed' ? 'DONE' :
                                        job.status === 'pending' ? 'QUEUE' : job.status}
                                  </span>
                                </td>
                                <td className="table-body-cell">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => handlePreviewInvoice(job.batch_id)}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                      title="Preview Job"
                                    >
                                      <Eye size={14} />
                                    </button>

                                    {job.status === 'pending' ? (
                                      <>
                                        <button
                                          onClick={() => setCompletingSubject(job)}
                                          className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition-all border border-blue-100"
                                          title="Complete Subject"
                                        >
                                          <CheckCircle size={14} /> Complete
                                        </button>
                                        <button
                                          onClick={() => setEditingSubject(job)}
                                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                          title="Edit Details"
                                        >
                                          <Edit3 size={14} />
                                        </button>
                                      </>
                                    ) : job.status === 'completed' ? (
                                      <button
                                        onClick={() => handleMarkSubject(job.id.toString())}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                                        title="Mark as Verified"
                                      >
                                        <Edit3 size={14} /> Mark
                                      </button>
                                    ) : null}

                                    {job.status !== 'invoiced' && (
                                      <button
                                        onClick={() => handleDeleteSubject(job.id.toString())}
                                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        title="Delete Subject"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeTab === 'invoices' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-blue-600" />
                  <h2 className="text-[18px] font-semibold text-slate-900">Examination Invoices</h2>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="table-header">Invoice ID</th>
                      <th className="table-header">School</th>
                      <th className="table-header">Date</th>
                      <th className="table-header">Amount</th>
                      <th className="table-header">Status</th>
                      <th className="table-header text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queue
                      .filter(e => e.status === 'invoiced' || e.status === 'paid')
                      .reduce((acc: any[], curr) => {
                        if (!acc.find(i => i.invoiceId === curr.invoiceId)) {
                          acc.push(curr);
                        }
                        return acc;
                      }, [])
                      .map((inv) => (
                        <tr key={inv.invoiceId} className="hover:bg-slate-50 transition-colors group">
                          <td className="table-body-cell font-mono font-bold text-blue-600 finance-nums">{inv.invoiceId}</td>
                          <td className="table-body-cell">
                            <p className="font-bold text-slate-900 text-[13px]">{inv.school_name}</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">{inv.sub_account_name || 'Main Account'}</p>
                          </td>
                          <td className="table-body-cell text-slate-500 text-[13px] finance-nums">
                            {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="table-body-cell">
                            <p className="font-bold text-slate-900 text-[13px] finance-nums">
                              {companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'}
                              {(queue.filter(e => e.invoiceId === inv.invoiceId).reduce((sum, e) => sum + (e.selling_price || 0), 0)).toLocaleString()}
                            </p>
                          </td>
                          <td className="table-body-cell">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight border ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                              {inv.status === 'paid' ? 'PAID' : 'UNPAID'}
                            </span>
                          </td>
                          <td className="table-body-cell text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handlePreviewInvoice(inv.invoiceId || inv.batch_id)}
                                className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100"
                                title="View Examination Invoice"
                              >
                                <Eye size={12} /> Preview
                              </button>
                              <button
                                onClick={() => {
                                  const totalAmount = queue.filter(e => e.invoiceId === inv.invoiceId).reduce((sum, e) => sum + (e.selling_price || 0), 0);
                                  navigate('/sales-flow/payments', {
                                    state: {
                                      action: 'create',
                                      customer: inv.school_name,
                                      subAccount: inv.sub_account_name,
                                      amount: totalAmount,
                                      invoiceId: inv.invoiceId,
                                      isExamInvoice: true,
                                      sqliteInvoiceId: inv.invoiceId
                                    }
                                  });
                                }}
                                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-bold hover:bg-emerald-100 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Wallet size={14} /> Pay
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {queue.filter(e => e.status === 'invoiced' || e.status === 'paid').length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                          No invoices generated yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <History size={20} className="text-blue-600" />
                  <h2 className="text-[18px] font-bold text-slate-900">Job History</h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search history..."
                      className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[13px] focus:ring-2 focus:ring-blue-500/20 outline-none"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="table-header border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 uppercase tracking-tight">Date</th>
                      <th className="px-4 py-3 uppercase tracking-tight">School / Branch</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Class & Subject</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Details</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Costing</th>
                      <th className="px-4 py-3 uppercase tracking-tight">Status</th>
                      <th className="px-4 py-3 text-center uppercase tracking-tight">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queue
                      .filter(e => (e.status === 'invoiced' || e.status === 'paid' || e.is_recurring === 1) && (
                        (e.school_name?.toLowerCase() || '').includes(searchQuery?.toLowerCase() || '') ||
                        (e.subject?.toLowerCase() || '').includes(searchQuery?.toLowerCase() || '')
                      ))
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((job) => (
                        <tr key={job.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="table-body-cell text-slate-500 text-[12px] font-medium finance-nums">
                            {new Date(job.created_at).toLocaleDateString()}
                          </td>
                          <td className="table-body-cell">
                            <p className="font-bold text-slate-900 text-[13px]">{job.school_name}</p>
                            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-tight">{job.sub_account_name || 'Main Account'}</p>
                          </td>
                          <td className="table-body-cell">
                            <p className="font-bold text-slate-700 text-[13px]">{job.class}</p>
                            <p className="text-[12px] text-slate-500">{job.subject}</p>
                          </td>
                          <td className="table-body-cell">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight flex items-center gap-1.5 finance-nums">
                                <User size={12} className="text-slate-400" /> {job.candidates} Candidates
                              </span>
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight flex items-center gap-1.5 finance-nums">
                                <Layers size={12} className="text-slate-400" /> {job.pages} Pages
                              </span>
                            </div>
                          </td>
                          <td className="table-body-cell">
                            <p className="font-bold text-slate-900 text-[13px] finance-nums">{companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'}{(job.selling_price || 0).toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight finance-nums">Cost: {companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$'}{(job.internal_cost || 0).toLocaleString()}</p>
                          </td>
                          <td className="table-body-cell">
                            <div className="flex flex-col gap-1">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight border w-fit ${job.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                job.status === 'invoiced' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                  'bg-slate-50 text-slate-700 border-slate-100'
                                }`}>
                                {job.status}
                              </span>
                              {job.is_recurring === 1 && (
                                <span className="flex items-center gap-1 text-[9px] text-indigo-600 font-bold uppercase tracking-tight">
                                  <RefreshCw size={10} /> Recurring
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="table-body-cell text-center">
                            <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                              {job.invoiceId && (
                                <>
                                  <button
                                    onClick={() => handlePreviewInvoice(job.invoiceId || job.batch_id)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Preview Invoice"
                                  >
                                    <Eye size={16} />
                                  </button>
                                </>
                              )}
                                <button
                                  onClick={() => {
                                    setConfirmState({
                                      open: true,
                                      title: 'Delete Record',
                                      message: 'Are you sure you want to delete this job record?',
                                      type: 'danger',
                                      confirmText: 'Delete',
                                      onConfirm: () => {
                                        api.production.deleteExamBatch(job.batch_id).then(() => fetchQueue());
                                      }
                                    });
                                  }}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Delete Record"
                                >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {queue.filter(e => e.status === 'invoiced' || e.status === 'paid' || e.is_recurring === 1).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                          No job history found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Settings Tabs */}
              <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 w-fit">
                <button
                  onClick={() => setSettingsTab('general')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[13px] font-bold transition-all ${settingsTab === 'general'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                    : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                  <Settings size={18} />
                  General Settings
                </button>
                <button
                  onClick={() => setSettingsTab('bom')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[13px] font-bold transition-all ${settingsTab === 'bom'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                    : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                  <Layers size={18} />
                  BOM Settings
                </button>
              </div>

              {settingsTab === 'general' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Classes Management */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <h2 className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
                        <Layers size={18} className="text-blue-600" />
                        Manage Classes
                      </h2>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter class name (e.g. Standard 1)"
                          className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-[13px] font-medium"
                          value={newClassName}
                          onChange={(e) => setNewClassName(e.target.value)}
                        />
                        <button
                          onClick={handleAddClass}
                          className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-[13px]"
                        >
                          Add
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                        {classes.map(cls => (
                          <div key={cls.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all group">
                            <span className="text-[13px] font-bold text-slate-700">{cls.name}</span>
                            <button
                              onClick={() => handleDeleteClass(cls.id.toString())}
                              className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Subjects Management */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <h2 className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
                        <FileText size={18} className="text-blue-600" />
                        Manage Subjects
                      </h2>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Subject Name"
                            className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-[13px] font-medium"
                            value={newSubjectName}
                            onChange={(e) => setNewSubjectName(e.target.value)}
                          />
                          <input
                            type="text"
                            placeholder="Code (Opt)"
                            className="w-24 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-[13px] font-medium"
                            value={newSubjectCode}
                            onChange={(e) => setNewSubjectCode(e.target.value)}
                          />
                        </div>
                        <button
                          onClick={handleAddSubjectList}
                          className="w-full py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all text-[13px]"
                        >
                          Add Subject
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                        {subjectList.map(subj => (
                          <div key={subj.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all group">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-bold text-slate-700">{subj.name}</span>
                              {subj.code && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">{subj.code}</span>}
                            </div>
                            <button
                              onClick={() => handleDeleteSubjectList(subj.id.toString())}
                              className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
                      <Calculator size={18} className="text-blue-600" />
                      BOM Selection & Pricing
                    </h2>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">Select the Bill of Materials recipe to be used for all examination calculations and inventory deductions.</p>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Active BOM Recipe</label>
                      <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-700">
                        {EXAM_HIDDEN_BOM_TEMPLATE_NAME}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        System-managed hidden BOM linked to all examination pricing and inventory deductions.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Paper Material</label>
                        <select
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-[13px] font-bold text-slate-700"
                          value={productionSettings.paperId || ''}
                          onChange={(e) => {
                            updateCompanyConfig({
                              ...companyConfig,
                              productionSettings: {
                                ...productionSettings,
                                paperId: e.target.value,
                                defaultExamBomId: EXAM_HIDDEN_BOM_TEMPLATE_ID,
                              }
                            });
                            if (notify) notify('Paper material updated', 'success');
                          }}
                        >
                          <option value="">Auto-detect Paper</option>
                          {paperMaterialOptions.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Toner Material</label>
                        <select
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-[13px] font-bold text-slate-700"
                          value={productionSettings.tonerId || ''}
                          onChange={(e) => {
                            updateCompanyConfig({
                              ...companyConfig,
                              productionSettings: {
                                ...productionSettings,
                                tonerId: e.target.value,
                                defaultExamBomId: EXAM_HIDDEN_BOM_TEMPLATE_ID,
                              }
                            });
                            if (notify) notify('Toner material updated', 'success');
                          }}
                        >
                          <option value="">Auto-detect Toner</option>
                          {tonerMaterialOptions.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {examBOM?.components?.length > 0 && (
                      <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100 space-y-4">
                        <div className="flex items-center gap-3 text-blue-700">
                          <AlertCircle size={20} />
                          <span className="text-[13px] font-bold">Currently Active BOM Details</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="bg-white/60 p-3 rounded-xl border border-blue-200/50">
                            <p className="text-[10px] font-bold text-blue-400 uppercase">Components</p>
                            <p className="text-[15px] font-black text-blue-900">{examBOM.components?.length || 0} Items</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-blue-400 uppercase">Recipe Components</p>
                          <div className="space-y-1">
                            {examBOM.components?.map((c: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-[11px] font-bold text-blue-700/70">
                                <span>* {c.name}</span>
                                <span>{c.formula}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="pt-2 border-t border-blue-200/60 space-y-1">
                          <p className="text-[10px] font-bold text-blue-400 uppercase">System Formula Rules</p>
                          <p className="text-[11px] font-bold text-blue-700/80">Paper: {EXAM_HIDDEN_BOM_FORMULAS.paper} (1 ream = 500 sheets)</p>
                          <p className="text-[11px] font-bold text-blue-700/80">Toner: {EXAM_HIDDEN_BOM_FORMULAS.toner} (1kg = 20000 pages)</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recurring Invoice Modal */}
        {showRecurringModal && selectedBatchForRecurring && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                      <RefreshCw size={28} />
                    </div>
                    <div>
                      <h3 className="text-[20px] font-black text-slate-900 tracking-tight">Setup Recurring Subscription</h3>
                      <p className="text-[13px] text-slate-500 font-medium">Automatic billing for <b>{selectedBatchForRecurring.school_name}</b></p>
                    </div>
                  </div>
                  <button onClick={() => setShowRecurringModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {/* Frequency Selection */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Billing Frequency</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['Weekly', 'Monthly', 'Quarterly', 'Annually'] as const).map((freq) => (
                        <button
                          key={freq}
                          onClick={() => setRecurringFrequency(freq)}
                          className={`py-3 px-4 rounded-xl text-[13px] font-bold border-2 transition-all ${recurringFrequency === freq
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                            }`}
                        >
                          {freq}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Wallet Toggle */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm border border-slate-100">
                        <Wallet size={18} />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-slate-700">Auto-deduct from Wallet</p>
                        <p className="text-[11px] text-slate-500 font-medium">Charge school's credit balance automatically</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoDeductWallet(!autoDeductWallet)}
                      className={`w-12 h-6 rounded-full transition-all relative ${autoDeductWallet ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoDeductWallet ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  {/* Manual Dates (Optional) */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Scheduled Run Dates (Optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
                        value={currentManualDate}
                        onChange={(e) => setCurrentManualDate(e.target.value)}
                      />
                      <button
                        onClick={() => {
                          if (currentManualDate && !manualDates.includes(currentManualDate)) {
                            setManualDates([...manualDates, currentManualDate]);
                            setCurrentManualDate('');
                          }
                        }}
                        className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    {manualDates.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {manualDates.map((date) => (
                          <span key={date} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold flex items-center gap-2 border border-indigo-100">
                            {new Date(date).toLocaleDateString()}
                            <button onClick={() => setManualDates(manualDates.filter(d => d !== date))}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    onClick={() => setShowRecurringModal(false)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateRecurring}
                    disabled={loading}
                    className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 text-[15px] uppercase tracking-wide"
                  >
                    {loading ? 'Creating...' : 'Activate Subscription'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completion Modal */}
        {completingSubject && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                    <Printer size={28} />
                  </div>
                  <div>
                    <h3 className="text-[20px] font-black text-slate-900 tracking-tight">Record Actual Waste</h3>
                    <p className="text-[13px] text-slate-500 font-medium">Record waste sheets for <b>{completingSubject.subject}</b></p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Estimated Waste</label>
                    <div className="text-[18px] font-bold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100 finance-nums">
                      {completingSubject.waste_sheets} Sheets
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Actual Waste (Sheets)</label>
                    <input
                      type="number"
                      autoFocus
                      className="w-full text-[24px] font-black text-slate-900 p-6 bg-blue-50/30 border-2 border-blue-200 rounded-3xl focus:border-blue-500 finance-nums outline-none transition-all placeholder:text-slate-300"
                      placeholder="0"
                      value={actualWaste}
                      onChange={(e) => setActualWaste(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setCompletingSubject(null)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompleteSubject}
                    disabled={loading || actualWaste === ''}
                    className="flex-3 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50 text-[15px] uppercase tracking-wide cursor-pointer"
                  >
                    Complete Job
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Editing Modal */}
        {editingSubject && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Edit Subject Details</h3>
                <button onClick={() => setEditingSubject(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[13px] font-semibold text-slate-500 uppercase mb-1.5">Subject Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none font-bold"
                    value={editingSubject.subject}
                    onChange={(e) => setEditingSubject({ ...editingSubject, subject: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[13px] font-semibold text-slate-500 uppercase mb-1.5">Pages</label>
                    <input
                      type="number"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none font-bold"
                      value={editingSubject.pages}
                      onChange={(e) => setEditingSubject({ ...editingSubject, pages: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-semibold text-slate-500 uppercase mb-1.5">Candidates</label>
                    <input
                      type="number"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none font-bold"
                      value={editingSubject.candidates}
                      onChange={(e) => setEditingSubject({ ...editingSubject, candidates: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-500 uppercase mb-1.5">Extra Copies</label>
                  <input
                    type="number"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none font-bold"
                    value={editingSubject.extra_copies}
                    onChange={(e) => setEditingSubject({ ...editingSubject, extra_copies: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setEditingSubject(null)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateSubject(editingSubject.id.toString(), {
                    subject: editingSubject.subject,
                    pages: editingSubject.pages,
                    candidates: editingSubject.candidates,
                    extra_copies: editingSubject.extra_copies
                  })}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {isPreviewOpen && previewData && (
          <PreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            type="EXAMINATION_INVOICE"
            data={previewData}
          />
        )}

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

        <ConfirmDialog
          open={confirmState.open}
          onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
          onConfirm={() => {
            confirmState.onConfirm?.();
            setConfirmState(c => ({ ...c, open: false }));
          }}
          onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText}
          type={confirmState.type || 'question'}
        />
      </div>
    </div>
  );
};

export default ExaminationPrinting;

