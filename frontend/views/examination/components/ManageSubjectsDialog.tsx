import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { logger } from '@/services/logger';
import { Input } from '../../../components/Input';
import { ExaminationClass, ExaminationSubject, Item } from '../../../types';
import { Trash2, FileText, Copy, Layout, RotateCw, Calculator, Hash, Truck, ChevronDown, ChevronUp, Pencil, X as XIcon, AlertTriangle, Users, Plus, Minus, Loader2, TrendingUp, Info, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { currencyService } from '../../../services/currencyService';
import { useInventory } from '../../../context/InventoryContext';
import { examinationBatchService } from '../../../services/examinationBatchService';
import OverrideDialog from './OverrideDialog';
import { calculateLocalClassPreviewBase, calculateRoundedClassPreview } from '../../../utils/examinationClassPricing';
import { ConfirmDialog, ConfirmDialogType } from '../../../components/ConfirmDialog';

interface ManageSubjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examinationClass: ExaminationClass | null;
  onAddSubject: (data: Partial<ExaminationSubject>) => Promise<void>;
  onRemoveSubject: (subjectId: string) => Promise<void>;
  onUpdateSubject?: (subjectId: string, data: Partial<ExaminationSubject>) => Promise<void>;
  onUpdateClass?: (classId: string, data: Partial<ExaminationClass>) => Promise<void>;
  onSaveClassPricing: (
    classId: string,
    totals: {
      material_total_cost: number;
      adjustment_total_cost: number;
      market_adjustment_total?: number;
      rounding_adjustment?: number;
      calculated_total_cost: number;
      expected_fee_per_learner: number;
    }
  ) => Promise<void>;
  onApplyOverridePricing?: (classId: string, manualPrice: number, reason: string) => Promise<void>;
  currencySymbol?: string;
  isLocked?: boolean;
}

const PREDEFINED_SUBJECTS = [
  'Mathematics',
  'Chichewa',
  'Social and BK',
  'English',
  'Arts & Life Skills',
  'Primary Science',
  'Ulimi Sayansi',
  'Expressive Arts',
  'Life Skills',
  'Bible Knowledge'
];
// Default conversion rates - these could also come from inventory item metadata
const DEFAULT_PAPER_SHEETS_PER_REAM = 500;
const DEFAULT_TONER_PAGES_PER_KG = 20000;

const getMaterialUnitCost = (item: Item | undefined): number => (
  Number((item as any)?.cost_price ?? (item as any)?.cost_per_unit ?? item?.cost ?? 0)
);

const isHiddenBomMaterialCandidate = (item: Item): boolean => {
  const typeHint = String((item as any)?.type ?? '').trim().toLowerCase();
  if (typeHint === 'Raw Material') return true;
  const hint = `${String(item?.name || '')} ${String((item as any)?.material || '')} ${String(item?.category || '')} ${String((item as any)?.category_id || '')}`.toLowerCase();
  return hint.includes('paper') || hint.includes('toner');
};

const isPaperMaterialCandidate = (item: Item): boolean => {
  const hint = `${String(item?.name || '')} ${String((item as any)?.material || '')} ${String(item?.category || '')} ${String((item as any)?.category_id || '')}`.toLowerCase();
  return hint.includes('paper');
};

const isTonerMaterialCandidate = (item: Item): boolean => {
  const hint = `${String(item?.name || '')} ${String((item as any)?.material || '')} ${String(item?.category || '')} ${String((item as any)?.category_id || '')}`.toLowerCase();
  return hint.includes('toner');
};

export const ManageSubjectsDialog: React.FC<ManageSubjectsDialogProps> = ({
  open,
  onOpenChange,
  examinationClass,
  onAddSubject,
  onRemoveSubject,
  onUpdateSubject,
  onUpdateClass,
  onSaveClassPricing,
  onApplyOverridePricing,
  currencySymbol = 'MWK',
  isLocked = false
}) => {
  const { companyConfig } = useAuth();
  const { inventory, marketAdjustments } = useInventory();
  const [subjectName, setSubjectName] = useState('');
  const [pages, setPages] = useState('');
  const [extraCopies, setExtraCopies] = useState('0');
  const [paperSize, setPaperSize] = useState('A4');
  const [orientation, setOrientation] = useState('Portrait');
  const [loading, setLoading] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [pricingSettings, setPricingSettings] = useState<any | null>(null);
  const [localPaperId, setLocalPaperId] = useState<string>('');
  const [localTonerId, setLocalTonerId] = useState<string>('');
  const [isAdvancedPricingOpen, setIsAdvancedPricingOpen] = useState(false);
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [isPersistingSelections, setIsPersistingSelections] = useState(false);
  const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);
  const [isApplyingOverride, setIsApplyingOverride] = useState(false);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [subjectFormError, setSubjectFormError] = useState<string | null>(null);
  const [backendAdjustments, setBackendAdjustments] = useState<any[] | null>(null);
  const [adjustmentSourceWarning, setAdjustmentSourceWarning] = useState<string | null>(null);
  const [isMarginOpen, setIsMarginOpen] = useState(false);
  const [globalMargin, setGlobalMargin] = useState<any>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  useEffect(() => {
    import('../../../utils/getEffectiveMargin').then(({ getEffectiveMargin }) => {
      getEffectiveMargin(null, null, false).then(setGlobalMargin);
    });
  }, []);

  // Learner Count Management
  const [learnerCount, setLearnerCount] = useState<number>(0);
  const [isUpdatingLearners, setIsUpdatingLearners] = useState(false);
  const learnerUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (examinationClass) {
      setLearnerCount(Math.max(0, Math.floor(Number(examinationClass.number_of_learners) || 0)));
    }
  }, [examinationClass?.number_of_learners]);

  useEffect(() => {
    return () => {
      if (learnerUpdateTimeoutRef.current) clearTimeout(learnerUpdateTimeoutRef.current);
    };
  }, []);

  const handleLearnerCountChange = (newCount: number) => {
    setLearnerCount(newCount);
    
    if (learnerUpdateTimeoutRef.current) clearTimeout(learnerUpdateTimeoutRef.current);
    
    learnerUpdateTimeoutRef.current = setTimeout(async () => {
      if (!examinationClass || !onUpdateClass) return;
      
      const currentCount = Math.max(0, Math.floor(Number(examinationClass.number_of_learners) || 0));
      if (newCount === currentCount) return;

      // Only prompt for significant changes if not 0->something small
      const diff = Math.abs(newCount - currentCount);
      const isSignificant = diff > 50 || (currentCount > 20 && diff / currentCount > 0.25);

      if (isSignificant) {
        setConfirmState({
          open: true,
          title: 'Update Learner Count',
          message: `You are changing the learner count from ${currentCount} to ${newCount}. This will recalculate all costs. Continue?`,
          type: 'warning',
          confirmText: 'Update',
          onConfirm: () => {
            setIsUpdatingLearners(true);
            (async () => {
              try {
                await onUpdateClass(examinationClass.id, { number_of_learners: newCount });
              } catch (error) {
                logger.error('Failed to update learner count:', error);
                setLearnerCount(currentCount);
              } finally {
                setIsUpdatingLearners(false);
              }
            })();
          }
        });
        return;
      }

      setIsUpdatingLearners(true);
      try {
        await onUpdateClass(examinationClass.id, { number_of_learners: newCount });
      } catch (error) {
        logger.error('Failed to update learner count:', error);
        setLearnerCount(currentCount);
      } finally {
        setIsUpdatingLearners(false);
      }
    }, 800);
  };


  // API-driven preview state
  const [preview, setPreview] = useState<{
    totalSheets: number;
    totalPages: number;
    totalBomCost: number;
    totalAdjustments: number;
    totalCost: number;
    expectedFeePerLearner: number;
    materialTotalCost: number;
    adjustmentTotalCost: number;
    calculatedTotalCost: number;
    marginAmount?: number;
    marketAdjustmentTotal?: number;
    roundingAdjustment?: number;
  } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectionPersistError, setSelectionPersistError] = useState<string | null>(null);
  const autoSyncTimeoutRef = useRef<number | null>(null);
  const autoSyncSignatureRef = useRef<string>('');
  const autoSyncInFlightRef = useRef(false);

  useEffect(() => {
    if (open) {
      examinationBatchService.getPricingSettings().then(settings => {
        setPricingSettings(settings);
      }).catch(console.error);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void examinationBatchService.getAdjustmentMeta()
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload?.adjustments) ? payload.adjustments : [];
        const normalized = rows.map((adjustment: any) => ({
          ...adjustment,
          id: String(adjustment?.id || ''),
          name: String(adjustment?.displayName || adjustment?.display_name || adjustment?.name || 'Adjustment'),
          type: String(adjustment?.type || '').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
          value: Number(adjustment?.value ?? adjustment?.percentage ?? 0) || 0,
          active: adjustment?.active ?? adjustment?.isActive ?? adjustment?.is_active ?? true
        }));
        setBackendAdjustments(normalized);
        setAdjustmentSourceWarning(null);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error('Failed to load backend adjustment metadata for class preview:', error);
        setBackendAdjustments(null);
        setAdjustmentSourceWarning('Using local adjustment cache because backend adjustment metadata could not be loaded.');
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!inventory?.length) return;
    const materialItems = inventory.filter((item: Item) => isHiddenBomMaterialCandidate(item));
    const configuredPaperId = String(pricingSettings?.paper_item_id ?? '').trim();
    const configuredTonerId = String(pricingSettings?.toner_item_id ?? '').trim();

    if (!localPaperId) {
      const configuredPaperExists = configuredPaperId
        ? materialItems.some((item) => String(item.id) === configuredPaperId)
        : false;
      if (configuredPaperExists) {
        setLocalPaperId(configuredPaperId);
      } else {
        const preferredPaper = materialItems.find((item) => item.name === 'A4 Paper 80gsm (Ream 500)');
        if (preferredPaper) setLocalPaperId(String(preferredPaper.id));
      }
    }

    if (!localTonerId) {
      const configuredTonerExists = configuredTonerId
        ? materialItems.some((item) => String(item.id) === configuredTonerId)
        : false;
      if (configuredTonerExists) {
        setLocalTonerId(configuredTonerId);
      } else {
        const preferredToner = materialItems.find((item) => item.name.toLowerCase() === 'hp universal toner (1kg)');
        if (preferredToner) setLocalTonerId(String(preferredToner.id));
      }
    }
  }, [inventory, localPaperId, localTonerId, pricingSettings]);

  const materials = useMemo(
    () => (inventory || []).filter((item: Item) => isHiddenBomMaterialCandidate(item)),
    [inventory]
  );
  const selectedPaper = useMemo(() => materials.find((i: Item) => String(i.id) === String(localPaperId)), [materials, localPaperId]);
  const selectedToner = useMemo(() => materials.find((i: Item) => String(i.id) === String(localTonerId)), [materials, localTonerId]);
  const paperMaterials = useMemo(() => {
    const base = materials.filter((i: Item) => isPaperMaterialCandidate(i));
    if (selectedPaper && !base.some(item => String(item.id) === String(selectedPaper.id))) {
      return [selectedPaper, ...base];
    }
    return base;
  }, [materials, selectedPaper]);
  const tonerMaterials = useMemo(() => {
    const base = materials.filter((i: Item) => isTonerMaterialCandidate(i));
    if (selectedToner && !base.some(item => String(item.id) === String(selectedToner.id))) {
      return [selectedToner, ...base];
    }
    return base;
  }, [materials, selectedToner]);

  const effectiveAdjustments = useMemo(() => {
    const hasBackendAdjustments = Array.isArray(backendAdjustments) && backendAdjustments.length > 0;
    const source = hasBackendAdjustments ? backendAdjustments : marketAdjustments;
    return (source || []).filter((adjustment: any) => {
      const activeValue = adjustment?.active ?? adjustment?.isActive ?? adjustment?.is_active;
      return activeValue === true || activeValue === 1 || activeValue === '1';
    });
  }, [backendAdjustments, marketAdjustments]);

  const expectedFeePerLearner = useMemo(() => {
    if (preview?.expectedFeePerLearner !== undefined && preview?.expectedFeePerLearner !== null) {
      return Number(preview.expectedFeePerLearner) || 0;
    }
    return Number(
      examinationClass?.expected_fee_per_learner ??
      examinationClass?.suggested_cost_per_learner ??
      examinationClass?.price_per_learner ??
      0
    ) || 0;
  }, [examinationClass, preview?.expectedFeePerLearner]);

  const hasManualOverride = useMemo(() => {
    if (!examinationClass) return false;
    const manual = Number(examinationClass.manual_cost_per_learner ?? 0);
    return Boolean(Number(examinationClass.is_manual_override || 0)) && manual > 0;
  }, [examinationClass]);

  const finalFeePerLearner = useMemo(() => {
    if (!examinationClass) return expectedFeePerLearner;
    if (hasManualOverride) return Number(examinationClass.manual_cost_per_learner) || expectedFeePerLearner;
    return expectedFeePerLearner;
  }, [examinationClass, expectedFeePerLearner, hasManualOverride]);

  const liveTotalAmount = useMemo(() => {
    if (!examinationClass) return 0;
    const learners = Math.max(0, Math.floor(Number(examinationClass.number_of_learners) || 0));
    if (!hasManualOverride && preview) {
      return Number(preview.calculatedTotalCost ?? preview.totalCost ?? 0) || 0;
    }
    const persistedLive = Number(examinationClass.live_total_preview);
    if (Number.isFinite(persistedLive) && persistedLive >= 0) return persistedLive;
    return Number((finalFeePerLearner * learners).toFixed(2));
  }, [examinationClass, finalFeePerLearner, hasManualOverride, preview]);

  const persistHiddenBomSelections = useCallback(async () => {
    const localPaperValue = String(localPaperId || '').trim();
    const localTonerValue = String(localTonerId || '').trim();
    const currentPaperId = String(pricingSettings?.paper_item_id ?? '').trim();
    const currentTonerId = String(pricingSettings?.toner_item_id ?? '').trim();
    const nextPaperId = localPaperValue || currentPaperId;
    const nextTonerId = localTonerValue || currentTonerId;

    if (nextPaperId === currentPaperId && nextTonerId === currentTonerId) {
      return;
    }

    await examinationBatchService.updatePricingSettings({
      paper_item_id: nextPaperId || null,
      toner_item_id: nextTonerId || null,
      trigger_recalculate: false
    });

    setPricingSettings((prev: any) => ({
      ...(prev || {}),
      paper_item_id: nextPaperId || null,
      toner_item_id: nextTonerId || null
    }));
  }, [localPaperId, localTonerId, pricingSettings]);

  const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setSelectionPersistError(null);
      setSubjectFormError(null);
      onOpenChange(true);
      return;
    }

    if (autoSyncTimeoutRef.current) {
      window.clearTimeout(autoSyncTimeoutRef.current);
      autoSyncTimeoutRef.current = null;
    }

    if (isPersistingSelections) return;
    setIsPersistingSelections(true);
    setSelectionPersistError(null);
    void (async () => {
      try {
        await persistHiddenBomSelections();
        if (!isLocked && examinationClass?.id && preview) {
    await onSaveClassPricing(examinationClass.id, {
      material_total_cost: preview.materialTotalCost,
      adjustment_total_cost: preview.adjustmentTotalCost,
      market_adjustment_total: preview.marketAdjustmentTotal,
      rounding_adjustment: preview.roundingAdjustment,
      calculated_total_cost: preview.calculatedTotalCost,
      expected_fee_per_learner: preview.expectedFeePerLearner
    });
        }
        onOpenChange(false);
      } catch (error) {
        logger.error('Failed to persist Hidden BOM or class pricing selections:', error);
        setSelectionPersistError('Failed to save pricing changes. Please try again.');
      } finally {
        setIsPersistingSelections(false);
      }
    })();
  }, [isLocked, examinationClass?.id, isPersistingSelections, onOpenChange, onSaveClassPricing, persistHiddenBomSelections, preview]);

  // Fetch preview from backend API and automatically sync to persistent state
  const fetchAndSyncPreview = useCallback(async (isManualTrigger = false) => {
    if (!examinationClass?.id) {
      setPreview(null);
      return;
    }

    setIsPreviewLoading(true);
    setPreviewError(null);

    try {
      const paper = paperMaterials.find(m => String(m.id) === String(localPaperId));
      const toner = tonerMaterials.find(m => String(m.id) === String(localTonerId));
      const paperUnitCost = getMaterialUnitCost(paper);
      const tonerUnitCost = getMaterialUnitCost(toner);
      const paperConversionRate = Number(
        (paper as any)?.conversionRate ??
        (paper as any)?.conversion_rate ??
        (paper as any)?.sheetsPerReam ??
        DEFAULT_PAPER_SHEETS_PER_REAM
      );
      const tonerPagesPerUnit = Number(
        (toner as any)?.pagesPerKg ??
        (toner as any)?.pages_per_kg ??
        (toner as any)?.pagesPerUnit ??
        DEFAULT_TONER_PAGES_PER_KG
      );

      const localPreviewBase = calculateLocalClassPreviewBase(
        examinationClass.subjects || [],
        Number(examinationClass.number_of_learners) || 0,
        paperUnitCost > 0 ? paperUnitCost : 0,
        tonerUnitCost > 0 ? tonerUnitCost : 0,
        paperConversionRate > 0 ? paperConversionRate : DEFAULT_PAPER_SHEETS_PER_REAM,
        tonerPagesPerUnit > 0 ? tonerPagesPerUnit : DEFAULT_TONER_PAGES_PER_KG,
        effectiveAdjustments
      );
      const roundedPreview = calculateRoundedClassPreview({
        totalBomCost: localPreviewBase.totalBomCost,
        marketAdjustmentTotal: localPreviewBase.marketAdjustmentTotal,
        learners: Number(examinationClass.number_of_learners) || 0,
        margin: globalMargin,
        roundingStep: 50
      });

      const result = {
        totalSheets: localPreviewBase.totalSheets,
        totalPages: localPreviewBase.totalPages,
        totalBomCost: localPreviewBase.totalBomCost,
        marketAdjustmentTotal: roundedPreview.marketAdjustmentTotal,
        roundingAdjustment: roundedPreview.roundingAdjustment,
        totalAdjustments: roundedPreview.totalAdjustments,
        totalCost: roundedPreview.totalCost,
        expectedFeePerLearner: roundedPreview.expectedFeePerLearner,
        materialTotalCost: localPreviewBase.totalBomCost,
        adjustmentTotalCost: roundedPreview.marketAdjustmentTotal,
        market_adjustment_total: roundedPreview.marketAdjustmentTotal,
        rounding_adjustment: roundedPreview.roundingAdjustment,
        calculatedTotalCost: roundedPreview.calculatedTotalCost,
        marginAmount: roundedPreview.marginAmount
      };

      setPreview(result);
      setPreviewError(null);

      // Automatically sync only when values truly changed. This prevents repeated
      // writes while still preserving live propagation to batch/list totals.
      const expectedFeePersisted = Number(examinationClass.expected_fee_per_learner ?? 0);
      const materialPersisted = Number((examinationClass as any).material_total_cost ?? 0);
      const adjustmentPersisted = Number((examinationClass as any).adjustment_total_cost ?? 0);
      const calculatedPersisted = Number((examinationClass as any).calculated_total_cost ?? 0);
      const hasMetricDelta =
        Math.abs(result.expectedFeePerLearner - expectedFeePersisted) > 0.01
        || Math.abs(result.materialTotalCost - materialPersisted) > 0.01
        || Math.abs(result.adjustmentTotalCost - adjustmentPersisted) > 0.01
        || Math.abs(result.calculatedTotalCost - calculatedPersisted) > 0.01;

      if (!isLocked && (isManualTrigger || hasMetricDelta)) {
        const syncSignature = [
          examinationClass.id,
          result.expectedFeePerLearner.toFixed(2),
          result.materialTotalCost.toFixed(2),
          result.adjustmentTotalCost.toFixed(2),
          result.calculatedTotalCost.toFixed(2),
          String(localPaperId || ''),
          String(localTonerId || '')
        ].join('|');

        if (autoSyncSignatureRef.current !== syncSignature) {
          autoSyncSignatureRef.current = syncSignature;
          if (autoSyncTimeoutRef.current) {
            window.clearTimeout(autoSyncTimeoutRef.current);
          }
          autoSyncTimeoutRef.current = window.setTimeout(() => {
            if (autoSyncInFlightRef.current || !examinationClass?.id) return;
            autoSyncInFlightRef.current = true;
            void onSaveClassPricing(examinationClass.id, {
              material_total_cost: result.materialTotalCost,
              adjustment_total_cost: result.totalAdjustments,
              market_adjustment_total: result.marketAdjustmentTotal,
              rounding_adjustment: result.roundingAdjustment,
              calculated_total_cost: result.calculatedTotalCost,
              expected_fee_per_learner: result.expectedFeePerLearner
            })
              .catch((syncError) => {
                logger.error('Failed to auto-sync class pricing preview:', syncError);
              })
              .finally(() => {
                autoSyncInFlightRef.current = false;
              });
          }, 350);
        }
      }
    } catch (error) {
      logger.error('Failed to calculate class preview:', error);
      setPreviewError('Failed to calculate pricing preview.');
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [
    examinationClass?.id,
    examinationClass?.expected_fee_per_learner,
    (examinationClass as any)?.material_total_cost,
    (examinationClass as any)?.adjustment_total_cost,
    (examinationClass as any)?.calculated_total_cost,
    localPaperId,
    localTonerId,
    paperMaterials,
    tonerMaterials,
    onSaveClassPricing,
    isLocked,
    effectiveAdjustments,
    globalMargin
  ]);

  // Fetch and sync preview when class or materials change
  useEffect(() => {
    fetchAndSyncPreview();
  }, [fetchAndSyncPreview]);

  useEffect(() => {
    autoSyncSignatureRef.current = '';
  }, [examinationClass?.id, open]);

  useEffect(() => {
    return () => {
      if (autoSyncTimeoutRef.current) {
        window.clearTimeout(autoSyncTimeoutRef.current);
        autoSyncTimeoutRef.current = null;
      }
    };
  }, []);

  const handleApplyOverrideSubmit = useCallback(async (manualPrice: number, reason: string) => {
    if (!onApplyOverridePricing || !examinationClass?.id) return;
    setIsApplyingOverride(true);
    try {
      await onApplyOverridePricing(examinationClass.id, manualPrice, reason);
      setIsOverrideDialogOpen(false);
    } catch (error) {
      logger.error('Failed to apply class override pricing:', error);
      alert(error instanceof Error ? error.message : 'Failed to apply class override pricing');
    } finally {
      setIsApplyingOverride(false);
    }
  }, [examinationClass?.id, onApplyOverridePricing]);

  const handleSavePricing = async () => {
    if (!examinationClass || !preview) {
      onOpenChange(false);
      return;
    }
    if (autoSyncTimeoutRef.current) {
      window.clearTimeout(autoSyncTimeoutRef.current);
      autoSyncTimeoutRef.current = null;
    }
    setIsSavingPricing(true);
    setSelectionPersistError(null);
    try {
      await onSaveClassPricing(examinationClass.id, {
        material_total_cost: preview.materialTotalCost,
        adjustment_total_cost: preview.totalAdjustments,
        market_adjustment_total: preview.marketAdjustmentTotal,
        rounding_adjustment: preview.roundingAdjustment,
        calculated_total_cost: preview.calculatedTotalCost,
        expected_fee_per_learner: preview.expectedFeePerLearner
      });
      await persistHiddenBomSelections();
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to save class pricing:', error);
      setSelectionPersistError(error instanceof Error ? error.message : 'Failed to save class pricing.');
    } finally {
      setIsSavingPricing(false);
    }
  };

  // Reset form when dialog opens or class changes
  useEffect(() => {
    if (open) {
      setEditingSubjectId(null);
      setSubjectName('');
      setPages('');
      setExtraCopies('0');
      setPaperSize('A4');
      setOrientation('Portrait');
      setSubjectFormError(null);
      setSelectionPersistError(null);
    }
  }, [open, examinationClass?.id]);

  const handleEditSubject = (subject: ExaminationSubject) => {
    setEditingSubjectId(subject.id);
    setSubjectName(subject.subject_name);
    setPages(String(subject.pages));
    setExtraCopies(String(subject.extra_copies || 0));
    setPaperSize(subject.paper_size || 'A4');
    setOrientation(subject.orientation || 'Portrait');
  };

  const handleCancelEdit = () => {
    setEditingSubjectId(null);
    setSubjectName('');
    setPages('');
    setExtraCopies('0');
    setPaperSize('A4');
    setOrientation('Portrait');
    setSubjectFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedSubject = String(subjectName || '').trim();
    const parsedPages = Math.floor(Number(pages));
    const parsedExtraCopies = Math.floor(Number(extraCopies));

    if (!normalizedSubject) {
      setSubjectFormError('Subject name is required.');
      return;
    }
    if (!Number.isFinite(parsedPages) || parsedPages <= 0) {
      setSubjectFormError('Pages must be greater than zero.');
      return;
    }
    if (!Number.isFinite(parsedExtraCopies) || parsedExtraCopies < 0) {
      setSubjectFormError('Extra copies cannot be negative.');
      return;
    }
    if (editingSubjectId && !onUpdateSubject) {
      setSubjectFormError('Subject editing is not available right now.');
      return;
    }

    setSubjectFormError(null);
    setLoading(true);
    try {
      const payload = {
        subject_name: normalizedSubject,
        pages: parsedPages,
        extra_copies: parsedExtraCopies,
        paper_size: paperSize,
        orientation: orientation
      };

      if (editingSubjectId && onUpdateSubject) {
        await onUpdateSubject(editingSubjectId, payload);
        handleCancelEdit();
      } else {
        await onAddSubject(payload);
        setSubjectName('');
        setPages('');
        setExtraCopies('0');
        setPaperSize('A4');
        setOrientation('Portrait');
      }
    } catch (error) {
      logger.error('Failed to save subject:', error);
      setSubjectFormError(error instanceof Error ? error.message : 'Failed to save subject.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    setLoading(true);
    try {
      await onRemoveSubject(subjectId);
    } catch (error) {
      logger.error('Failed to remove subject:', error);
      setSubjectFormError(error instanceof Error ? error.message : 'Failed to remove subject.');
    } finally {
      setLoading(false);
    }
  };

  const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
  const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
  const paper = '#FEFDFB';
  const ink = '#23282A';
  const inkSoft = '#5c6567';
  const hairline = '#e4ddd1';
  const danger = '#b5493f';

  if (!examinationClass) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }} onClick={() => handleDialogOpenChange(false)}>
      <div style={{
        width: 820, maxWidth: '100%', maxHeight: '92vh',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: `1px solid ${hairline}`, background: paper
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
            }}>
              <FileText size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>
                Manage Subjects
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                {examinationClass.class_name}
              </p>
            </div>
          </div>
          <button onClick={() => handleDialogOpenChange(false)} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
          }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          >
            <XIcon size={15} />
          </button>
        </div>

        {/* Learner Count Adjustment Section */}
        <div className="bg-slate-50/50 border-b border-slate-200 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-blue-600">
              <Users size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Learner Count</h4>
              <p className="text-[11px] text-slate-500">Update total students for accurate costing</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => handleLearnerCountChange(Math.max(0, learnerCount - 1))}
              disabled={isLocked || isUpdatingLearners || learnerCount <= 0}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <Minus size={16} />
            </button>
            
            <div className="relative w-20 h-8 flex items-center justify-center">
              <input
                type="number"
                min="0"
                value={learnerCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 0) handleLearnerCountChange(val);
                  else if (e.target.value === '') setLearnerCount(0);
                }}
                disabled={isLocked || isUpdatingLearners}
                className="w-full h-full text-center font-bold text-slate-900 bg-transparent border-none focus:ring-0 p-0 text-lg finance-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {isUpdatingLearners && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleLearnerCountChange(learnerCount + 1)}
              disabled={isLocked || isUpdatingLearners}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Add Subject Form */}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-b border-slate-200 pb-4">
            <div className="col-span-1 md:col-span-4 space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Subject Name</label>
              <select
                value={subjectName}
                onChange={(e) => {
                  setSubjectName(e.target.value);
                  if (subjectFormError) setSubjectFormError(null);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                required
              >
                <option value="">Select Subject</option>
                {PREDEFINED_SUBJECTS.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Pages</label>
              <Input
                type="number"
                value={pages}
                onChange={(e) => {
                  setPages(e.target.value);
                  if (subjectFormError) setSubjectFormError(null);
                }}
                placeholder="0"
                required
                min="1"
                className="rounded-xl border-slate-200 focus:ring-blue-100"
              />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Extra Copies</label>
              <Input
                type="number"
                value={extraCopies}
                onChange={(e) => {
                  setExtraCopies(e.target.value);
                  if (subjectFormError) setSubjectFormError(null);
                }}
                placeholder="0"
                min="0"
                className="rounded-xl border-slate-200 focus:ring-blue-100"
              />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Paper</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="Legal">Legal</option>
              </select>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-2 flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className={`w-full inline-flex items-center justify-center gap-1.5 text-white px-4 py-2 rounded-xl font-medium text-sm shadow-sm transition-all disabled:opacity-60 ${editingSubjectId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {editingSubjectId ? 'Update' : 'Add'}
              </button>
              {editingSubjectId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={loading}
                  className="w-10 inline-flex items-center justify-center bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </form>

          {subjectFormError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {subjectFormError}
            </div>
          )}

          {/* Subjects List */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-slate-500">Current Subjects ({examinationClass.subjects?.length || 0})</h4>
            {(!examinationClass.subjects || examinationClass.subjects.length === 0) ? (
              <p className="text-slate-500 text-sm italic">No subjects added yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {examinationClass.subjects.map((subject) => (
                  <div key={subject.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200/70 hover:bg-slate-100/80 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded shadow-sm ${editingSubjectId === subject.id ? 'bg-amber-50' : 'bg-white'}`}>
                        <FileText className={`h-5 w-5 ${editingSubjectId === subject.id ? 'text-amber-600' : 'text-blue-600'}`} />
                      </div>
                      <div>
                        <div className="font-semibold">{subject.subject_name}</div>
                        <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center">
                            <Layout className="h-3 w-3 mr-1" />
                            {subject.pages} pages
                          </span>
                          <span className="flex items-center">
                            <Copy className="h-3 w-3 mr-1" />
                            {subject.extra_copies} extra
                          </span>
                          <span className="flex items-center">
                            <RotateCw className="h-3 w-3 mr-1" />
                            {subject.paper_size} ({subject.orientation})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditSubject(subject)}
                        disabled={loading}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSubject(subject.id)}
                        disabled={loading}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {previewError && !preview && (
            <div className="bg-red-100 border border-red-300 rounded-xl px-4 py-2 mt-4 text-[11px] font-bold text-red-800">
              {previewError}
            </div>
          )}

          {/* Live Cost Preview Inline Row */}
          {preview && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 mt-4 text-[11px] font-bold text-indigo-900 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 flex flex-col">
              <div className="flex flex-wrap items-center justify-center gap-2 text-center text-sm">
                <Calculator size={14} className={`text-indigo-600 inline-block ${isPreviewLoading ? 'animate-spin' : ''}`} />
                <span className="opacity-60 uppercase mr-2 tracking-widest text-[11px]">Financial Preview:</span>
                <span className="text-slate-900 inline-flex items-center">{preview.totalSheets.toLocaleString()} Sheets <span className="text-indigo-400 ml-1 font-normal">({preview.totalPages.toLocaleString()} pgs)</span></span>
                <span className="opacity-30 mx-1">•</span>
                <span className="text-slate-900 inline-flex items-center"><span className="text-indigo-400 mr-1 uppercase text-[11px]">BOM:</span> {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {preview.totalBomCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="opacity-30 mx-1">•</span>
                <span className="text-slate-900 inline-flex items-center"><span className="text-indigo-400 mr-1 uppercase text-[11px]">Mkt Adj:</span> {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {preview.marketAdjustmentTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="opacity-30 mx-1">•</span>
                <span className="text-slate-900 inline-flex items-center"><span className="text-blue-400 mr-1 uppercase text-[11px]">Rounding:</span> {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {preview.roundingAdjustment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="opacity-30 mx-1">•</span>
                <span className="text-slate-900 inline-flex items-center"><span className="text-emerald-500 mr-1 uppercase text-[11px]">Margin:</span> {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {(preview.marginAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="opacity-30 mx-1">•</span>
                <span className="text-slate-900 inline-flex items-center"><span className="text-indigo-400 mr-1 uppercase text-[11px]">Total:</span> {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {preview.totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="opacity-30 mx-1">•</span>
                <span className="text-blue-700 font-bold inline-flex items-center"><span className="text-blue-400 mr-1 uppercase text-[11px]">Fee/Learner:</span> {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {preview.expectedFeePerLearner.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>


              {/* Error Message */}
              {previewError && (
                <div className="mt-2 bg-red-100 border border-red-300 rounded-lg p-2 text-xs text-red-800">
                  {previewError}
                </div>
              )}

              {preview && (
                (() => {
                  const savedFee = Number(
                    examinationClass?.expected_fee_per_learner
                    ?? examinationClass?.suggested_cost_per_learner
                    ?? 0
                  );
                  if (!Number.isFinite(savedFee) || savedFee <= 0) return null;
                  if (Math.abs(preview.expectedFeePerLearner - savedFee) <= 0.01) return null;
                  return (
                    <div className="mt-2 bg-yellow-100 border border-yellow-300 rounded-lg p-2 text-xs text-yellow-900">
                      Preview differs from saved class fee. Save pricing or close this dialog to sync.
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Manual Override Pricing */}
          {onApplyOverridePricing && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Manual Override Pricing</div>
                  <div className="text-xs text-slate-700">
                    Auto Fee: <span className="font-semibold">{currencySymbol} {expectedFeePerLearner.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="mx-2 text-slate-400">|</span>
                    Final Fee: <span className="font-semibold">{currencySymbol} {finalFeePerLearner.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="mx-2 text-slate-400">|</span>
                    Total Amount: <span className="font-semibold">{currencySymbol} {liveTotalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    <span className="mx-2 text-slate-400">|</span>
                    Total Margin: <span className="font-semibold text-emerald-600">{currencySymbol} {(preview?.marginAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${hasManualOverride ? 'text-amber-700' : 'text-slate-500'}`}>
                    {hasManualOverride ? 'Status: Manual Override Active' : 'Status: Auto Pricing'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOverrideDialogOpen(true)}
                  disabled={isLocked || isApplyingOverride}
                  className="inline-flex items-center justify-center gap-1.5 bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-amber-700 disabled:opacity-60"
                >
                  {hasManualOverride ? 'Update Override' : 'Override Price'}
                </button>
              </div>
            </div>
          )}

          {/* Advanced Pricing Configuration Section */}
          <div className="border-t border-slate-200 pt-6 mt-6">
            <button
              type="button"
              onClick={() => setIsAdvancedPricingOpen(!isAdvancedPricingOpen)}
              className="w-full flex items-center justify-between text-left group"
            >
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Hash className="w-5 h-5 text-blue-600" /> Advanced Pricing Configuration
              </h3>
              <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-slate-200 transition-colors">
                {isAdvancedPricingOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {isAdvancedPricingOpen && (
              <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                  <h4 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Hidden BOM (Automatic Cost Calculation)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase">Paper Material</label>
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100"
                        value={String(localPaperId || '')}
                        onChange={(e) => setLocalPaperId(e.target.value)}
                      >
                        <option value="">Select Paper...</option>
                        {paperMaterials.map((m) => {
                          const cost = getMaterialUnitCost(m);
                          const sheetsPerReam = Number((m as any)?.conversionRate ?? (m as any)?.conversion_rate ?? DEFAULT_PAPER_SHEETS_PER_REAM);
                          return (
                            <option key={m.id} value={String(m.id)}>
                              {m.name} ({currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'}{cost > 0 ? cost.toLocaleString() : '0'}/ream, {sheetsPerReam} sheets)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase">Toner Material</label>
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-100"
                        value={String(localTonerId || '')}
                        onChange={(e) => setLocalTonerId(e.target.value)}
                      >
                        <option value="">Select Toner...</option>
                        {tonerMaterials.map((m) => {
                          const cost = getMaterialUnitCost(m);
                          const pagesPerKg = Number((m as any)?.pagesPerKg ?? (m as any)?.pages_per_kg ?? DEFAULT_TONER_PAGES_PER_KG);
                          return (
                            <option key={m.id} value={String(m.id)}>
                              {m.name} ({currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'}{cost > 0 ? cost.toLocaleString() : '0'}/kg, {pagesPerKg.toLocaleString()} pages)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">
                      <Info className="w-4 h-4" />
                      Fee per learner is automatically rounded up to the next 50.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Active Market Adjustments Section */}
            <div className="border-t border-slate-200 pt-4 mt-4">
              <button
                type="button"
                onClick={() => setIsAdjustmentsOpen(!isAdjustmentsOpen)}
                className="w-full flex items-center justify-between text-left group"
              >
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4 text-indigo-600" /> Active Market Adjustments
                  </h4>
                  <p className="text-[10px] text-indigo-600 uppercase font-medium">Automated system-wide pricing adjustments</p>
                </div>
                <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 transition-colors">
                  {isAdjustmentsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {isAdjustmentsOpen && (
                <div className="mt-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 animate-in slide-in-from-top-2 duration-200">
                  {adjustmentSourceWarning && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      <span>{adjustmentSourceWarning}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      if (effectiveAdjustments.length > 0) {
                        return effectiveAdjustments.map((rule: any) => (
                          <div key={rule.id} className="px-3 py-1.5 border border-indigo-200 rounded-lg text-[11px] bg-white text-indigo-900 font-bold flex items-center gap-2 shadow-sm">
                            <Truck className="w-3 h-3 text-indigo-500" />
                            {rule.displayName || rule.display_name || rule.name}
                            <span className="bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] text-indigo-700 whitespace-nowrap border border-indigo-100">
                              {rule.type === 'PERCENTAGE' || rule.type === 'PERCENT' || rule.type === 'percentage'
                                ? `+${Number(rule.value ?? rule.percentage ?? 0)}%`
                                : `+${currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'}${Number(rule.value ?? 0)}/pg`}
                            </span>
                          </div>
                        ));
                      }
                      return <p className="text-xs text-slate-400 italic">No active market adjustments found.</p>;
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Global Default Margin Section */}
            <div className="border-t border-slate-200 pt-4 mt-4">
              <button
                type="button"
                onClick={() => setIsMarginOpen(!isMarginOpen)}
                className="w-full flex items-center justify-between text-left group"
              >
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" /> Global Default Margin
                  </h4>
                  <p className="text-[10px] text-emerald-600 uppercase font-medium">Applied after material costs and adjustments</p>
                </div>
                <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                  {isMarginOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {isMarginOpen && (
                <div className="mt-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-emerald-900">Base Profit Margin</div>
                      <div className="text-lg font-bold text-emerald-700">
                        {globalMargin ? `${globalMargin.margin_value}%` : '0%'}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-emerald-700/80">
                    This margin is applied system-wide to calculate the final Total and Fee per Learner.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '16px 28px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
          {selectionPersistError && (
            <div style={{
              flex: 1, marginRight: 10, padding: '8px 12px', borderRadius: 8,
              background: `${danger}15`, border: `1px solid ${danger}30`, fontSize: 11, color: danger
            }}>
              {selectionPersistError}
            </div>
          )}
          <button type="button" onClick={() => handleDialogOpenChange(false)}
            disabled={isPersistingSelections || isApplyingOverride || isSavingPricing}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
              background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
            Close
          </button>
          {!isLocked && preview && (
            <button type="button" onClick={() => void handleSavePricing()}
              disabled={isPersistingSelections || isApplyingOverride || isSavingPricing || loading}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                transition: 'all .15s ease', opacity: (isPersistingSelections || isSavingPricing) ? 0.6 : 1
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
              {isSavingPricing ? 'Saving...' : 'Save Pricing'}
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
      <OverrideDialog
        isOpen={isOverrideDialogOpen}
        onClose={() => setIsOverrideDialogOpen(false)}
        onSubmit={(manualPrice, reason) => void handleApplyOverrideSubmit(manualPrice, reason)}
        currentPrice={finalFeePerLearner}
        expectedPrice={expectedFeePerLearner}
        currencySymbol={currencySymbol}
      />
    </div>
  );
};
