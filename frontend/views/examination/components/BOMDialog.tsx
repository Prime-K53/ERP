import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/services/logger';

import { ChevronRight } from 'lucide-react';
import { examinationBatchService } from '../../../services/examinationBatchService';
import { dbService } from '../../../services/db';
import { examFeatureFlags } from '../../../services/featureFlags';
import { useAuth } from '../../../context/AuthContext';
import { downloadBlob } from '../../../utils/helpers';
import { ExaminationBatch, Item, MarketAdjustment } from '../../../types';
import {
  AlertTriangle,
  X as XIcon,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  Info,
  Printer,
  RefreshCw,
  Settings2,
  TrendingUp,
  Truck
} from 'lucide-react';
import { examinationSyncService } from '../../../services/examinationSyncService';
import { currencyService } from '../../../services/currencyService';

interface BOMItem {
  id: string;
  batch_id: string;
  class_id: string;
  item_id: string;
  item_name: string;
  component_type?: 'MATERIAL' | 'ADJUSTMENT';
  adjustment_id?: string;
  adjustment_name?: string;
  adjustment_type?: string;
  adjustment_value?: number;
  quantity_required: number;
  unit_cost: number;
  total_cost: number;
  cost_source?: string;
  source_unit_cost?: number;
  source_timestamp?: string;
  source_item_id?: string;
}

interface InventoryMeta {
  unit?: string;
  material?: string;
  category?: string;
  description?: string;
}

interface MaterialGroup {
  key: string;
  itemName: string;
  materialType: string;
  specification: string;
  unit: string;
  totalQuantity: number;
  totalCost: number;
  costSource: string;
  sourceUnitCost: number;
  sourceTimestamp: string;
  sourceItemId: string;
  hasMixedSource: boolean;
  rows: Array<{
    id: string;
    className: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    expectedTotal: number;
    hasMismatch: boolean;
    costSource: string;
    sourceUnitCost: number;
    sourceTimestamp: string;
    sourceItemId: string;
  }>;
}

interface AdjustmentGroup {
  key: string;
  chargeName: string;
  rateType: string;
  rateValue: number;
  totalCost: number;
  explanation: string;
  sortOrder: number;
  verificationStatus: 'active' | 'inactive' | 'unknown';
  rows: Array<{
    id: string;
    className: string;
    rateType: string;
    rateValue: number;
    calculatedAmount: number;
  }>;
}

interface BOMDialogProps {
  isOpen: boolean;
  onClose: () => void;
  batch: ExaminationBatch;
}

const ADJUSTMENT_COMPONENT = 'ADJUSTMENT';
const MARKET_ADJUSTMENTS_CHANGED_EVENT = 'market-adjustments:changed';

const n = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const key = (v: unknown) => String(v || '').trim().toLowerCase();
const normAdjType = (t?: string) => (String(t || '').toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENTAGE');
const isPct = (t?: string) => normAdjType(t) === 'PERCENTAGE';
const inferUnit = (name: string, unit?: string) => unit || (name.toLowerCase().includes('toner') ? 'kg' : name.toLowerCase().includes('paper') ? 'reams' : 'units');
const inferMaterial = (name: string, cat?: string) => (name.toLowerCase().includes('paper') ? 'Paper' : name.toLowerCase().includes('toner') ? 'Toner' : cat || 'Material');
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const moneyFile = (v: string) => String(v || 'cost-breakdown').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const formatCostSource = (source?: string) => {
  const value = String(source || '').trim();
  if (!value) return 'Unspecified';
  const labels: Record<string, string> = {
    'inventory.master': 'Inventory Master',
    'material_batches.weighted_active': 'Weighted Active Batches',
    'inventory_transactions.latest_in': 'Latest Inbound Transaction',
    'fallback.default': 'Fallback Default',
    'none': 'Unavailable',
    'adjustment.derived': 'Derived Adjustment'
  };
  return labels[value] || value;
};
const isProvenanceMaterial = (materialType: string) => {
  const type = String(materialType || '').toLowerCase();
  return type.includes('paper') || type.includes('toner');
};
const groupUnitCost = (g: MaterialGroup) => {
  // Use the actual unit cost from the first row (all rows for same material should have same unit cost)
  // Fall back to calculated average only if no row has a valid unit cost
  const firstValidUnitCost = g.rows.find((r) => r.unitCost > 0)?.unitCost;
  if (firstValidUnitCost !== undefined && firstValidUnitCost > 0) {
    return firstValidUnitCost;
  }
  // Fallback to average if no valid unit cost found
  return g.totalQuantity > 0 ? g.totalCost / g.totalQuantity : 0;
};

const adjHint = (name: string) => {
  const t = name.toLowerCase();
  if (t.includes('profit') || t.includes('margin')) return 'Configured profit margin charge.';
  if (t.includes('transport') || t.includes('delivery') || t.includes('logistics')) return 'Transport and logistics charge.';
  if (t.includes('waste')) return 'Expected wastage adjustment.';
  return 'Active market adjustment charge.';
};

const adjIcon = (name: string) => {
  const t = name.toLowerCase();
  if (t.includes('profit') || t.includes('margin')) return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (t.includes('transport') || t.includes('delivery') || t.includes('logistics')) return <Truck className="h-3.5 w-3.5 text-blue-600" />;
  return <Settings2 className="h-3.5 w-3.5 text-amber-600" />;
};

const errMsg = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export const BOMDialog: React.FC<BOMDialogProps> = ({ isOpen, onClose, batch }) => {
  const { companyConfig } = useAuth();
  const [bomItems, setBomItems] = useState<BOMItem[]>([]);
  const [inventoryMeta, setInventoryMeta] = useState<Record<string, InventoryMeta>>({});
  const [marketAdjustments, setMarketAdjustments] = useState<MarketAdjustment[]>([]);
  const [adjustmentsLoaded, setAdjustmentsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [metadataWarning, setMetadataWarning] = useState<string | null>(null);
  const [recalcWarning, setRecalcWarning] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [sectionsOpen, setSectionsOpen] = useState({ materials: true, adjustments: true });
  const [expandedMaterialGroups, setExpandedMaterialGroups] = useState<Record<string, boolean>>({});
  const [expandedAdjustmentGroups, setExpandedAdjustmentGroups] = useState<Record<string, boolean>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAt, setPreviewAt] = useState('');
  const inFlight = useRef(false);
  const recalcInFlight = useRef(false);

  const currency = batch.currency || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const isLocked = batch.status === 'Approved' || batch.status === 'Invoiced';
  const useCostBreakdownV2Ui = examFeatureFlags.exam_cost_breakdown_v2_ui();
  const useBackendMetaSource = examFeatureFlags.exam_backend_meta_source();
  const fmtMoney = useCallback((a: number) => `${currency} ${n(a).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [currency]);
  const fmtQty = useCallback((q: number) => n(q).toLocaleString(undefined, { maximumFractionDigits: Math.abs(n(q)) < 1 ? 6 : (Math.abs(n(q)) < 100 ? 4 : 2) }), []);
  const fmtRate = useCallback((t: string, v: number) => (isPct(t) ? `${n(v).toLocaleString(undefined, { maximumFractionDigits: 4 })}%` : fmtMoney(v)), [fmtMoney]);
  const classNameById = useMemo(() => Object.fromEntries((batch.classes || []).map((c) => [c.id, c.class_name])), [batch.classes]);

  const loadMeta = useCallback(async () => {
    const adjustmentPromise = useBackendMetaSource
      ? examinationBatchService.getAdjustmentMeta()
      : dbService.getAll<MarketAdjustment>('marketAdjustments');

    const [inventoryResult, adjustmentMetaResult] = await Promise.allSettled([
      dbService.getAll<Item>('inventory'),
      adjustmentPromise
    ]);

    const inv = inventoryResult.status === 'fulfilled' ? (inventoryResult.value || []) : [];
    if (inventoryResult.status === 'rejected') {
      logger.error('Failed to load inventory metadata for BOM:', inventoryResult.reason);
    }

    const m: Record<string, InventoryMeta> = {};
    (inv || []).forEach((i) => { m[String(i.id)] = { unit: i.unit || '', material: String((i as Record<string, unknown>).material || ''), category: String(i.category || ''), description: String(i.description || '') }; });
    setInventoryMeta(m);

    try {
      if (adjustmentMetaResult.status === 'rejected') {
        throw adjustmentMetaResult.reason;
      }
      const adjustmentSource = adjustmentMetaResult.value;
      const rawAdjustments = useBackendMetaSource
        ? (Array.isArray(adjustmentSource?.adjustments) ? adjustmentSource.adjustments : [])
        : (Array.isArray(adjustmentSource) ? adjustmentSource : []);
      const normalized = rawAdjustments.map((a: Record<string, unknown>) => {
        const active = Boolean(a?.active ?? a?.isActive ?? a?.is_active ?? true);
        const deleted = Boolean(a?.deleted ?? a?.isDeleted ?? a?.is_deleted ?? a?.deletedAt ?? a?.deleted_at);
        return {
          ...a,
          name: String(a?.name || a?.displayName || a?.display_name || 'Adjustment'),
          displayName: String(a?.displayName || a?.display_name || a?.name || 'Adjustment'),
          type: normAdjType(String(a?.type || 'PERCENTAGE')),
          value: n(a?.value, n(a?.percentage, 0)),
          sortOrder: n(a?.sortOrder, n(a?.sort_order, 9999)),
          description: String(a?.description || ''),
          active,
          isActive: active,
          deleted,
          isDeleted: deleted,
          deletedAt: a?.deletedAt || a?.deleted_at || null
        } as MarketAdjustment;
      });
      setMarketAdjustments(normalized);
      setMetadataWarning(null);
    } catch (error) {
      setMarketAdjustments([]);
      setMetadataWarning(
        errMsg(
          error,
          useBackendMetaSource
            ? 'Failed to load backend adjustment metadata. Showing BOM rows without active/inactive verification.'
            : 'Failed to load local adjustment metadata. Showing BOM rows without active/inactive verification.'
        )
      );
      logger.error('Failed to load adjustment metadata for BOM:', error);
    } finally {
      setAdjustmentsLoaded(true);
    }
  }, [useBackendMetaSource]);

  const loadBOM = useCallback(async (silent = false) => {
    if (!isOpen || !batch?.id || inFlight.current) return;
    inFlight.current = true;
    silent ? setRefreshing(true) : setLoading(true);
    try {
      // @ts-ignore
      const data = await examinationBatchService.getBOM(batch.id);
      setBomItems(Array.isArray(data) ? data : []);
      setLastSyncedAt(new Date().toISOString());
    } catch (e) {
      logger.error('Failed to load BOM:', e);
    } finally {
      inFlight.current = false;
      silent ? setRefreshing(false) : setLoading(false);
    }
  }, [batch?.id, isOpen]);

  const syncBreakdown = useCallback(async (silent = false, recalc = false) => {
    if (!isOpen || !batch?.id) return;
    await loadMeta();
    if (recalc && !isLocked && !recalcInFlight.current) {
      recalcInFlight.current = true;
      try {
        await examinationBatchService.calculateBatch(batch.id, {
          roundingMethod: companyConfig?.pricingSettings?.defaultMethod,
          roundingValue: Number(companyConfig?.pricingSettings?.customStep || 50)
        });
        setRecalcWarning(null);
      } catch (error) {
        const warning = errMsg(error, 'Unable to recalculate this batch with current backend adjustments.');
        setRecalcWarning(warning);
        logger.error('Auto recalculation failed:', error);
      } finally {
        recalcInFlight.current = false;
      }
    }
    await loadBOM(silent);
  }, [batch?.id, isLocked, isOpen, loadBOM, loadMeta]);

  const reconcileWithBackendAdjustments = useCallback(async () => {
    if (!isOpen || !batch?.id || isLocked || recalcInFlight.current) return;
    recalcInFlight.current = true;
    setReconciling(true);
    setRecalcWarning(null);
    try {
      await examinationBatchService.calculateBatch(batch.id, {
        roundingMethod: companyConfig?.pricingSettings?.defaultMethod,
        roundingValue: Number(companyConfig?.pricingSettings?.customStep || 50)
      });
      await syncBreakdown(true, false);
    } catch (error) {
      const warning = errMsg(error, 'Unable to recalculate this batch with current backend adjustments.');
      setRecalcWarning(warning);
      logger.error('Manual reconciliation recalculation failed:', error);
    } finally {
      recalcInFlight.current = false;
      setReconciling(false);
    }
  }, [batch?.id, isLocked, isOpen, syncBreakdown]);

  useEffect(() => {
    if (!isOpen || !batch?.id) return;
    setSectionsOpen({ materials: true, adjustments: true });
    setExpandedMaterialGroups({});
    setExpandedAdjustmentGroups({});
    void syncBreakdown(false, false);
    const id = window.setInterval(() => void syncBreakdown(true, false), 12000);
    return () => window.clearInterval(id);
  }, [batch?.id, batch?.updated_at, isOpen, syncBreakdown]);

  useEffect(() => {
    if (!isOpen || !batch?.id) return;
    const handler = () => void syncBreakdown(true, false);
    window.addEventListener(MARKET_ADJUSTMENTS_CHANGED_EVENT, handler as EventListener);
    return () => window.removeEventListener(MARKET_ADJUSTMENTS_CHANGED_EVENT, handler as EventListener);
  }, [batch?.id, isOpen, syncBreakdown]);

  const { materialGroups, adjustmentGroups, materialSubtotal, adjustmentSubtotal, total, mismatchCount, inactiveAdjustmentCount } = useMemo(() => {
    const materials = new Map<string, MaterialGroup>();
    const adjustments = new Map<string, AdjustmentGroup>();
    let mTotal = 0; let aTotal = 0; let mismatches = 0;
    const byId = new Map<string, MarketAdjustment>(); const byName = new Map<string, MarketAdjustment>();

    marketAdjustments.forEach((a) => {
      const a_ = a as MarketAdjustment & Record<string, unknown>;
      const id = key(a.id); const n1 = key(String(a_.displayName ?? a_.display_name ?? a.name)); const n2 = key(a.name);
      if (id) byId.set(id, a); if (n1) byName.set(n1, a); if (n2) byName.set(n2, a);
    });

    bomItems.forEach((i) => {
      const qty = n(i.quantity_required); const unitCost = n(i.unit_cost); const expected = qty * unitCost; const totalCost = n(i.total_cost, expected); const mismatch = Math.abs(totalCost - expected) > 0.05;
      if (mismatch) mismatches += 1;
      const cls = classNameById[i.class_id] || 'Unassigned Class';
      if (String(i.component_type || 'MATERIAL').toUpperCase() === ADJUSTMENT_COMPONENT) {
        const fallbackName = i.adjustment_name || i.item_name || 'Adjustment';
        const meta = byId.get(key(i.adjustment_id)) || byName.get(key(fallbackName));
        const m = meta as MarketAdjustment & Record<string, unknown> | undefined;
        const chargeName = String(m?.displayName ?? m?.display_name ?? meta?.name ?? fallbackName);
        const adjKey = key(i.adjustment_id || chargeName);
        const rateType = normAdjType(i.adjustment_type || String(m?.type ?? ''));
        const rateValue = n(i.adjustment_value, n(m?.value as number ?? m?.percentage as number, 0));
        const sortOrder = n(m?.sortOrder as number, n(m?.sort_order as number, 9999));
        let verificationStatus: 'active' | 'inactive' | 'unknown' = adjustmentsLoaded ? 'unknown' : 'active';
        if (meta) {
          const active = Boolean(m?.active ?? m?.isActive ?? m?.is_active ?? true);
          const deleted = Boolean(m?.deleted ?? m?.isDeleted ?? m?.is_deleted ?? m?.deletedAt ?? m?.deleted_at);
          verificationStatus = (!active || deleted) ? 'inactive' : 'active';
        }
        const existing = adjustments.get(adjKey);
        if (existing) {
          existing.totalCost += totalCost;
          if (existing.rateValue === 0 && rateValue > 0) { existing.rateValue = rateValue; existing.rateType = rateType; }
          if (verificationStatus === 'inactive') {
            existing.verificationStatus = 'inactive';
          } else if (existing.verificationStatus === 'unknown' && verificationStatus === 'active') {
            existing.verificationStatus = 'active';
          }
          existing.rows.push({ id: i.id, className: cls, rateType, rateValue, calculatedAmount: totalCost });
        } else {
          adjustments.set(adjKey, { key: adjKey, chargeName, rateType, rateValue, totalCost, explanation: String(m?.description ?? adjHint(chargeName)), sortOrder, verificationStatus, rows: [{ id: i.id, className: cls, rateType, rateValue, calculatedAmount: totalCost }] });
        }
        aTotal += totalCost;
      } else {
        const meta = inventoryMeta[i.item_id] || {};
        const name = i.item_name || meta.material || 'Unnamed Material';
        const gKey = key(i.item_id || name);
        const existing = materials.get(gKey);
        const row = {
          id: i.id,
          className: cls,
          quantity: qty,
          unitCost,
          totalCost,
          expectedTotal: expected,
          hasMismatch: mismatch,
          costSource: String(i.cost_source || ''),
          sourceUnitCost: n(i.source_unit_cost, unitCost),
          sourceTimestamp: String(i.source_timestamp || ''),
          sourceItemId: String(i.source_item_id || i.item_id || '')
        };
        if (existing) {
          existing.totalQuantity += qty;
          existing.totalCost += totalCost;
          existing.hasMixedSource = existing.hasMixedSource
            || (existing.costSource !== row.costSource)
            || (Math.abs(existing.sourceUnitCost - row.sourceUnitCost) > 0.00001)
            || (existing.sourceItemId !== row.sourceItemId);
          existing.rows.push(row);
        } else {
          materials.set(gKey, {
            key: gKey,
            itemName: name,
            materialType: inferMaterial(name, meta.category),
            specification: meta.material && meta.material !== name ? meta.material : (meta.description || ''),
            unit: inferUnit(name, meta.unit),
            totalQuantity: qty,
            totalCost,
            costSource: row.costSource,
            sourceUnitCost: row.sourceUnitCost,
            sourceTimestamp: row.sourceTimestamp,
            sourceItemId: row.sourceItemId,
            hasMixedSource: false,
            rows: [row]
          });
        }
        mTotal += totalCost;
      }
    });

    const adjustmentGroups = Array.from(adjustments.values()).sort((a, b) => (a.sortOrder - b.sortOrder) || a.chargeName.localeCompare(b.chargeName));

    return {
      materialGroups: Array.from(materials.values()).sort((a, b) => a.itemName.localeCompare(b.itemName)),
      adjustmentGroups,
      materialSubtotal: mTotal,
      adjustmentSubtotal: aTotal,
      total: mTotal + aTotal,
      mismatchCount: mismatches,
      inactiveAdjustmentCount: adjustmentGroups.filter((group) => group.verificationStatus === 'inactive').length
    };
  }, [adjustmentsLoaded, bomItems, classNameById, inventoryMeta, marketAdjustments]);

  const exportCsv = useCallback(() => {
    const lines: string[] = [];
    lines.push([csv('Batch Name'), csv(batch.name)].join(','));
    lines.push([csv('Batch ID'), csv(batch.id)].join(','));
    lines.push([csv('Currency'), csv(currency)].join(','));
    lines.push([csv('Last Synced'), csv(lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : '')].join(','));
    lines.push('');
    lines.push('Material Section');
    lines.push([csv('Material Name/Type'), csv('Quantity'), csv('Unit'), csv('Unit Cost'), csv('Total Cost'), csv('Cost Source')].join(','));
    materialGroups.forEach((g) => lines.push([csv(`${g.itemName} (${g.materialType}${g.specification ? ` - ${g.specification}` : ''})`), csv(fmtQty(g.totalQuantity)), csv(g.unit), csv(groupUnitCost(g).toFixed(2)), csv(g.totalCost.toFixed(2)), csv(formatCostSource(g.costSource))].join(',')));
    lines.push([csv('Material Subtotal'), csv(''), csv(''), csv(''), csv(materialSubtotal.toFixed(2)), csv('')].join(','));
    lines.push('');
    lines.push('Adjustment Charges Section');
    lines.push([csv('Charge Name'), csv('Rate'), csv('Calculated Value')].join(','));
    adjustmentGroups.forEach((g) => {
      lines.push([csv(g.chargeName), csv(fmtRate(g.rateType, g.rateValue)), csv(g.totalCost.toFixed(2))].join(','));
      g.rows.forEach((r) => lines.push([csv(`  - ${r.className}`), csv(fmtRate(r.rateType, r.rateValue)), csv(r.calculatedAmount.toFixed(2))].join(',')));
    });
    lines.push([csv('Adjustment Subtotal'), csv(''), csv(adjustmentSubtotal.toFixed(2))].join(','));
    lines.push('');
    lines.push([csv('Summary Total'), csv(''), csv(total.toFixed(2))].join(','));
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${moneyFile(batch.name)}-cost-breakdown-${new Date().toISOString().split('T')[0]}.csv`);
  }, [adjustmentGroups, adjustmentSubtotal, batch.id, batch.name, currency, fmtQty, fmtRate, lastSyncedAt, materialGroups, materialSubtotal, total]);

  const buildJobCardHtml = useCallback((generatedAt?: string) => {
    const company = companyConfig?.companyName || 'Prime ERP';
    const tagline = companyConfig?.tagline || 'Examination Job Card';
    const logo = companyConfig?.showCompanyLogo ? (companyConfig?.logoBase64 || companyConfig?.logo || '') : '';
    const generated = generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString();
    const materialRows = materialGroups.map((g, i) => `<tr><td>${i + 1}</td><td><strong>${esc(g.itemName)}</strong><div style=\"font-size:11px;color:#64748b;\">${esc(g.materialType)}${g.specification ? ` - ${esc(g.specification)}` : ''}</div></td><td style=\"text-align:right;\">${esc(fmtQty(g.totalQuantity))}</td><td>${esc(g.unit)}</td><td style=\"text-align:right;\">${esc(fmtMoney(groupUnitCost(g)))}</td><td style=\"text-align:right;\">${esc(fmtMoney(g.totalCost))}</td></tr>`).join('');
    const adjustmentRows = adjustmentGroups.map((g, i) => `<tr><td>${i + 1}</td><td><strong>${esc(g.chargeName)}</strong></td><td style=\"text-align:right;\">${esc(fmtRate(g.rateType, g.rateValue))}</td><td style=\"text-align:right;\">${esc(fmtMoney(g.totalCost))}</td></tr>${g.rows.map((r) => `<tr><td></td><td style=\"padding-left:18px;color:#64748b;\">- ${esc(r.className)}</td><td style=\"text-align:right;color:#64748b;\">${esc(fmtRate(r.rateType, r.rateValue))}</td><td style=\"text-align:right;color:#64748b;\">${esc(fmtMoney(r.calculatedAmount))}</td></tr>`).join('')}`).join('');
    const logoHtml = logo ? `<img src=\"${esc(logo)}\" alt=\"logo\" style=\"width:46px;height:46px;object-fit:contain;background:#fff;border-radius:8px;padding:4px;\"/>` : `<div style=\"width:46px;height:46px;border-radius:8px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-weight:700;color:#0f172a;\">${esc(company.slice(0, 2).toUpperCase())}</div>`;
    return `<!doctype html><html><head><meta charset=\"utf-8\"/><title>Examination Job Card - ${esc(batch.name)}</title><style>@page{size:A4;margin:14mm}body{margin:0;background:#f8fafc;font-family:Segoe UI,Tahoma,sans-serif;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e2e8f0;padding:8px 10px;vertical-align:top}th{text-align:left;background:#f8fafc}.sheet{max-width:980px;margin:18px auto;background:#fff;border:1px solid #dbe1ea;border-radius:12px;overflow:hidden}.hero{padding:18px 22px;background:linear-gradient(135deg,#0f172a,#334155);color:#f8fafc}.section{margin:16px 22px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}.section h3{margin:0;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:12px;text-transform:uppercase;letter-spacing:.4px}.summary{margin:0 22px 22px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden}.summary .hd{padding:10px 12px;background:#0f172a;color:#fff;font-size:12px;text-transform:uppercase}.summary .bd{padding:10px 12px;background:#f8fafc}.row{display:flex;justify-content:space-between;margin:5px 0}.total{padding-top:8px;border-top:1px solid #cbd5e1;font-weight:700;font-size:16px}</style></head><body><div class=\"sheet\"><div class=\"hero\"><div style=\"display:flex;justify-content:space-between;gap:12px;align-items:flex-start;\"><div style=\"display:flex;gap:12px;align-items:center;\">${logoHtml}<div><div style=\"font-size:22px;font-weight:700;line-height:1.1;\">${esc(company)}</div><div style=\"font-size:12px;color:#cbd5e1;\">${esc(tagline)}</div></div></div><div style=\"font-size:11px;border:1px solid rgba(203,213,225,.3);padding:6px 10px;border-radius:999px;text-transform:uppercase;\">Examination Job Card</div></div><div style=\"margin-top:10px;font-size:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;\"><div><strong>Batch:</strong> ${esc(batch.name)}</div><div><strong>Batch ID:</strong> ${esc(batch.id)}</div><div><strong>Status:</strong> ${esc(batch.status || 'Draft')}</div><div><strong>Currency:</strong> ${esc(currency)}</div><div><strong>Generated:</strong> ${esc(generated)}</div><div><strong>School ID:</strong> ${esc(String(batch.school_id || 'N/A'))}</div></div></div><div class=\"section\"><h3>Material Breakdown</h3><table><thead><tr><th>#</th><th>Material</th><th style=\"text-align:right\">Quantity</th><th>Unit</th><th style=\"text-align:right\">Unit Cost</th><th style=\"text-align:right\">Total Cost</th></tr></thead><tbody>${materialRows || '<tr><td colspan=\"6\">No material rows found.</td></tr>'}</tbody></table><div style=\"padding:10px 12px;background:#f8fafc;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0;\"><strong>Material Subtotal</strong><strong>${esc(fmtMoney(materialSubtotal))}</strong></div></div><div class=\"section\"><h3>Adjustment Charges</h3><table><thead><tr><th>#</th><th>Charge Name</th><th style=\"text-align:right\">Rate</th><th style=\"text-align:right\">Calculated Value</th></tr></thead><tbody>${adjustmentRows || '<tr><td colspan=\"4\">No adjustment rows found.</td></tr>'}</tbody></table><div style=\"padding:10px 12px;background:#f8fafc;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0;\"><strong>Adjustment Subtotal</strong><strong>${esc(fmtMoney(adjustmentSubtotal))}</strong></div></div><div class=\"summary\"><div class=\"hd\">Cost Summary</div><div class=\"bd\"><div class=\"row\"><span>Material Subtotal</span><strong>${esc(fmtMoney(materialSubtotal))}</strong></div><div class=\"row\"><span>Adjustment Subtotal</span><strong>${esc(fmtMoney(adjustmentSubtotal))}</strong></div><div class=\"row total\"><span>Total Cost</span><strong>${esc(fmtMoney(total))}</strong></div></div></div></div></body></html>`;
  }, [adjustmentGroups, adjustmentSubtotal, batch.id, batch.name, batch.school_id, batch.status, companyConfig, currency, fmtMoney, fmtQty, fmtRate, materialGroups, materialSubtotal, total]);

  const previewHtml = useMemo(() => buildJobCardHtml(previewAt), [buildJobCardHtml, previewAt]);
  const openPreview = () => { setPreviewAt(new Date().toISOString()); setPreviewOpen(true); };
  const exportJobCardHtml = useCallback(() => {
    const generatedAt = previewAt || new Date().toISOString();
    const html = buildJobCardHtml(generatedAt);
    const datePart = generatedAt.split('T')[0] || new Date().toISOString().split('T')[0];
    downloadBlob(
      new Blob([html], { type: 'text/html;charset=utf-8;' }),
      `${moneyFile(batch.name)}-job-card-${datePart}.html`
    );
  }, [batch.name, buildJobCardHtml, previewAt]);

  const printJobCard = useCallback(() => {
    const w = window.open('', '_blank', 'noopener,noreferrer,width=1180,height=900');
    if (!w) return;
    w.document.open(); w.document.write(previewHtml); w.document.close();
    setTimeout(() => { w.focus(); w.print(); w.close(); }, 250);
  }, [previewHtml]);

  const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
  const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
  const paper = '#FEFDFB';

  const btnStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 500,
    padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
    transition: 'all .15s ease', display: 'inline-flex', alignItems: 'center', gap: 6
  };

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: '#23282A',
      }} onClick={onClose}>
        <div style={{
          width: 980, maxWidth: '100%', maxHeight: '92vh',
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
            padding: '20px 24px 16px',
            borderBottom: `1px solid #e4ddd1`, background: paper
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
              }}>
                <TrendingUp size={19} color="#fff" />
              </div>
              <div>
                <h1 style={{
                  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                  fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                }}>
                  Cost Breakdown
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>
                  {batch.name} &mdash; Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Not synced yet'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" onClick={() => void syncBreakdown(true, false)} disabled={refreshing || reconciling}
                style={{ ...btnStyle, background: paper, border: '1.4px solid #e4ddd1', color: '#5c6567' }}>
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </button>
              {!isLocked && (
                <button type="button" onClick={() => void reconcileWithBackendAdjustments()} disabled={reconciling || refreshing}
                  style={{ ...btnStyle, background: teal[500], border: '1.4px solid transparent', color: '#fff' }}>
                  <RefreshCw size={13} className={reconciling ? 'animate-spin' : ''} /> Recalculate
                </button>
              )}
              <button type="button" onClick={exportCsv}
                style={{ ...btnStyle, background: paper, border: '1.4px solid #e4ddd1', color: '#5c6567' }}>
                <FileSpreadsheet size={13} /> Export CSV
              </button>
              <button type="button" onClick={openPreview}
                style={{ ...btnStyle, background: paper, border: '1.4px solid #e4ddd1', color: '#5c6567' }}>
                <Eye size={13} /> Preview
              </button>
              <button onClick={onClose} aria-label="Close" style={{
                width: 28, height: 28, borderRadius: 8,
                border: '1.4px solid #e4ddd1', background: paper, color: '#5c6567',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all .15s ease', fontSize: 16, marginLeft: 6
              }}>
                <XIcon size={14} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin"></div>
                <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-transparent border-t-blue-400 animate-spin"></div>
              </div>
              <div className="text-sm font-medium text-slate-600">Loading cost breakdown...</div>
              <div className="text-xs text-slate-400">Please wait while we calculate your costs</div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 font-sans text-sm leading-[1.45] text-slate-800 md:px-6 md:pb-6">
              <div className="space-y-6">

                {/* Premium Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="group relative overflow-hidden rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-blue-100/40 p-6 shadow-lg shadow-blue-500/10 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/15 hover:-translate-y-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center">
                            <div className="h-4 w-4 rounded-full bg-white"></div>
                          </div>
                          <span className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Materials</span>
                        </div>
                        <div className="text-xs text-blue-600 font-medium">{materialGroups.length} items</div>
                      </div>
                      <div className="mb-1 text-2xl font-semibold text-blue-950 tabular-nums">{fmtMoney(materialSubtotal)}</div>
                      <div className="text-[13px] leading-[1.45] text-blue-700/80">Direct material costs</div>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-amber-100/40 p-6 shadow-lg shadow-amber-500/10 transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/15 hover:-translate-y-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center">
                            <Settings2 className="h-4 w-4 text-white" />
                          </div>
                          <span className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Adjustments</span>
                        </div>
                        <div className="text-xs text-amber-600 font-medium">{adjustmentGroups.length} items</div>
                      </div>
                      <div className="mb-1 text-2xl font-semibold text-amber-950 tabular-nums">{fmtMoney(adjustmentSubtotal)}</div>
                      <div className="text-[13px] leading-[1.45] text-amber-700/80">Cost adjustments & fees</div>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 p-6 shadow-lg shadow-emerald-500/10 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/15 hover:-translate-y-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-white" />
                          </div>
                          <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Total Cost</span>
                        </div>
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      </div>
                      <div className="mb-1 text-3xl font-semibold text-emerald-950 tabular-nums">{fmtMoney(total)}</div>
                      <div className="text-[13px] leading-[1.45] text-emerald-700/80">Final project cost</div>
                    </div>
                  </div>
                </div>

                {/* Alert Messages */}
                {mismatchCount > 0 && (
                  <div className="rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50/80 to-amber-100/40 p-4 shadow-lg shadow-amber-500/5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500">
                        <AlertTriangle className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-amber-900 mb-1">Validation Notice</div>
                        <div className="text-sm text-amber-700">{mismatchCount} row(s) had a variance between quantity × unit cost and stored BOM totals.</div>
                      </div>
                    </div>
                  </div>
                )}

                {recalcWarning && (
                  <div className="rounded-xl border border-rose-200/60 bg-gradient-to-r from-rose-50/80 to-rose-100/40 p-4 shadow-lg shadow-rose-500/5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-rose-500">
                        <AlertTriangle className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-rose-900 mb-1">Recalculation Failed</div>
                        <div className="text-sm text-rose-700">{recalcWarning}</div>
                      </div>
                    </div>
                  </div>
                )}

                {metadataWarning && (
                  <div className="rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50/80 to-amber-100/40 p-4 shadow-lg shadow-amber-500/5">
                    <div className="flex items-start gap-3">
                      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                      <div className="flex-1 text-sm text-amber-700">{metadataWarning}</div>
                    </div>
                  </div>
                )}

                {inactiveAdjustmentCount > 0 && (
                  <div className="rounded-xl border border-slate-200/60 bg-gradient-to-r from-slate-50/80 to-slate-100/40 p-4 shadow-lg shadow-slate-500/5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-500">
                        <Info className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 text-sm text-slate-700">
                        Showing {inactiveAdjustmentCount} BOM adjustment charge(s) that are currently inactive in backend metadata.
                      </div>
                    </div>
                  </div>
                )}

                {/* Materials Section */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSectionsOpen((p) => ({ ...p, materials: !p.materials }))}
                    aria-label="Toggle material section"
                    aria-expanded={sectionsOpen.materials}
                    className="flex w-full items-center justify-between bg-gradient-to-r from-slate-50/80 to-white/80 px-4 py-3 text-left hover:from-slate-100/80 hover:to-white/80 transition-all duration-200 md:px-5 md:py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 shadow-lg shadow-blue-500/20">
                        {sectionsOpen.materials ? <ChevronDown className="h-4 w-4 text-white" /> : <ChevronRight className="h-4 w-4 text-white" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Material Section</div>
                        <div className="text-xs text-slate-500">Raw materials</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
                      <span className="text-sm font-medium text-blue-600">{materialGroups.length} items</span>
                    </div>
                  </button>
                {sectionsOpen.materials && (
                  <>
                  <div className="overflow-x-auto">
                    <div className="min-w-full">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50/80 to-slate-100/40">
                            <th className="px-3 py-2 text-left text-[13px] font-semibold leading-[1.45] text-slate-700">Material Name / Type</th>
                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-700">Qty</th>
                            <th className="px-3 py-2 text-left text-[13px] font-semibold leading-[1.45] text-slate-700">Unit</th>
                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-700">Unit Cost</th>
                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-700">Total Cost</th>
                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-700 w-24">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/40">
                          {materialGroups.map((g) => (
                            <React.Fragment key={g.key}>
                              <tr className="text-[13px] leading-[1.45] hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-transparent transition-colors duration-150">
                                <td className="px-3 py-2">
                                  <div className="space-y-1">
                                    <div className="font-medium text-slate-900">{g.itemName}</div>
                                    <div className="text-xs text-slate-500">({g.materialType}{g.specification ? ` - ${g.specification}` : ''})</div>

                                    {isProvenanceMaterial(g.materialType) && g.costSource && (
                                      <div className="text-xs text-slate-400">
                                        <span className="inline-flex items-center gap-1">
                                          <div className="h-1.5 w-1.5 rounded-full bg-blue-400"></div>
                                          Cost source: {formatCostSource(g.costSource)}
                                          {g.hasMixedSource && ' (mixed)'}
                                        </span>
                                        <br />
                                        <span className="text-xs text-slate-400">
                                          Source unit cost: {fmtMoney(g.sourceUnitCost || groupUnitCost(g))}
                                          {g.sourceTimestamp && ` • ${new Date(g.sourceTimestamp).toLocaleString()}`}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">{fmtQty(g.totalQuantity)}</td>
                                <td className="px-3 py-2 text-slate-600">{g.unit}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">{fmtMoney(groupUnitCost(g))}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(g.totalCost)}</td>
                                <td className="px-3 py-2 text-right">
                                  {g.rows.length > 1 ? (
                                    <button
                                      type="button"
                                      aria-label={`Toggle ${g.itemName} material class details`}
                                      aria-expanded={Boolean(expandedMaterialGroups[g.key])}
                                      onClick={() => setExpandedMaterialGroups((p) => ({ ...p, [g.key]: !p[g.key] }))}
                                      className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors duration-150"
                                    >
                                      {expandedMaterialGroups[g.key] ? (
                                        <><ChevronDown className="h-3 w-3" /> Hide</>
                                      ) : (
                                        <><ChevronRight className="h-3 w-3" /> Show</>
                                      )}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                              {expandedMaterialGroups[g.key] && (
                                <tr className="bg-gradient-to-r from-slate-50/50 to-transparent">
                                  <td className="px-3 py-2" colSpan={6}>
                                    <div className="rounded-lg border border-slate-200/40 bg-white/60 p-4">
                                      <table className="w-full">
                                        <thead>
                                          <tr className="border-b border-slate-200/40">
                                            <th className="px-3 py-2 text-left text-[13px] font-semibold leading-[1.45] text-slate-600">Class</th>
                                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-600">Qty</th>
                                            <th className="px-3 py-2 text-left text-[13px] font-semibold leading-[1.45] text-slate-600">Unit</th>
                                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-600">Unit Cost</th>
                                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-600">Calculated Cost</th>
                                          </tr>
                                        </thead>

                                        <tbody className="divide-y divide-slate-200/30">
                                          {g.rows.map((r) => (
                                            <tr key={r.id} className="text-[13px] leading-[1.45] hover:bg-slate-50/50 transition-colors duration-150">
                                              <td className="px-3 py-2 text-slate-700">{r.className}</td>
                                              <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">{fmtQty(r.quantity)}</td>
                                              <td className="px-3 py-2 text-slate-600">{g.unit}</td>
                                              <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">{fmtMoney(r.unitCost)}</td>
                                              <td className="px-3 py-2 text-right">
                                                <div className="space-y-1">
                                                  <div className="font-semibold text-slate-900 tabular-nums">{fmtMoney(r.totalCost)}</div>

                                                  {r.hasMismatch && (
                                                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700" title={`Expected ${fmtMoney(r.expectedTotal)}`}>
                                                      <AlertTriangle className="h-3 w-3" />
                                                      adj
                                                    </span>
                                                  )}
                                                  {isProvenanceMaterial(g.materialType) && r.costSource && (
                                                    <div className="text-xs text-slate-500">
                                                      {formatCostSource(r.costSource)} @ {fmtMoney(r.sourceUnitCost || r.unitCost)}
                                                    </div>
                                                  )}
                                                </div>
                                              </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {materialGroups.length === 0 && <tr><td className="px-2 py-4 text-center text-slate-500" colSpan={6}>No material rows available.</td></tr>}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200/80 bg-gradient-to-r from-slate-50/80 to-slate-100/40">
                          <td className="px-3 py-2 text-[13.5px] font-semibold leading-[1.45] text-slate-700" colSpan={4}>Material Subtotal</td>
                          <td className="px-3 py-2 text-right text-[15px] font-bold leading-[1.45] text-slate-900 tabular-nums">{fmtMoney(materialSubtotal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  </div>
                  {useCostBreakdownV2Ui && (
                    <div className="space-y-2 p-2 md:hidden">
                      {materialGroups.map((g) => (
                        <div key={`material-card-${g.key}`} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{g.itemName}</p>
                              <p className="text-[11px] text-slate-500">
                                {g.materialType}{g.specification ? ` - ${g.specification}` : ''}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{fmtMoney(g.totalCost)}</p>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                              <p className="text-slate-500">Qty</p>
                              <p className="font-medium text-slate-700">{fmtQty(g.totalQuantity)} {g.unit}</p>
                            </div>
                            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                              <p className="text-slate-500">Unit Cost</p>
                              <p className="font-medium text-slate-700">{fmtMoney(groupUnitCost(g))}</p>
                            </div>
                          </div>
                          {isProvenanceMaterial(g.materialType) && g.costSource && (
                            <p className="mt-2 text-[11px] text-slate-600">
                              Source: {formatCostSource(g.costSource)}
                              {g.sourceTimestamp ? ` • ${new Date(g.sourceTimestamp).toLocaleString()}` : ''}
                            </p>
                          )}
                          {g.rows.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Toggle ${g.itemName} class details`}
                              aria-expanded={Boolean(expandedMaterialGroups[g.key])}
                              onClick={() => setExpandedMaterialGroups((p) => ({ ...p, [g.key]: !p[g.key] }))}
                              className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-blue-700"
                            >
                              {expandedMaterialGroups[g.key] ? 'Hide class rows' : 'Show class rows'}
                              {expandedMaterialGroups[g.key] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {expandedMaterialGroups[g.key] && (
                            <div className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50 p-2">
                              {g.rows.map((r) => (
                                <div key={`material-row-${r.id}`} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px]">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">{r.className}</span>
                                    <span className="font-semibold text-slate-900">{fmtMoney(r.totalCost)}</span>
                                  </div>
                                  <p className="text-slate-500">{fmtQty(r.quantity)} {g.unit} @ {fmtMoney(r.unitCost)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {materialGroups.length === 0 && (
                        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                          No material rows available.
                        </div>
                      )}
                      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">Material Subtotal</span>
                          <span className="font-semibold text-slate-900">{fmtMoney(materialSubtotal)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  </>
                )}
              </div>

                {/* Adjustments Section */}
                <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-lg overflow-hidden mt-6">
                  <button
                    type="button"
                    onClick={() => setSectionsOpen((p) => ({ ...p, adjustments: !p.adjustments }))}
                    aria-label="Toggle adjustment section"
                    aria-expanded={sectionsOpen.adjustments}
                    className="flex w-full items-center justify-between bg-gradient-to-r from-amber-50/80 to-white/80 px-4 py-3 text-left hover:from-amber-100/80 hover:to-white/80 transition-all duration-200 md:px-5 md:py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 shadow-lg shadow-amber-500/20">
                        {sectionsOpen.adjustments ? <ChevronDown className="h-4 w-4 text-white" /> : <ChevronRight className="h-4 w-4 text-white" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Adjustment Charges</div>
                        <div className="text-xs text-slate-500">Additional fees and adjustments</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></div>
                      <span className="text-sm font-medium text-amber-600">{adjustmentGroups.length} charges</span>
                    </div>
                  </button>
                {sectionsOpen.adjustments && (
                  <>
                  <div className="overflow-x-auto">
                    <div className="min-w-full">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200/60 bg-gradient-to-r from-amber-50/80 to-amber-100/40">
                            <th className="px-3 py-2 text-left text-[13px] font-semibold leading-[1.45] text-slate-700">Charge Name</th>
                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-700">Rate</th>
                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-700">Calculated Value</th>
                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-700 w-24">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/40">
                          {adjustmentGroups.map((g) => (
                            <React.Fragment key={g.key}>
                              <tr className="text-[13px] leading-[1.45] hover:bg-gradient-to-r hover:from-amber-50/30 hover:to-transparent transition-colors duration-150">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100">
                                      {adjIcon(g.chargeName)}
                                    </div>
                                    <div className="space-y-1">
                                      <div className="font-medium text-slate-900">{g.chargeName}</div>
                                      <div className="flex items-center gap-2">
                                        {g.verificationStatus === 'inactive' && (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                            <div className="h-1.5 w-1.5 rounded-full bg-amber-500"></div>
                                            Currently inactive
                                          </span>
                                        )}
                                        <button 
                                          type="button" 
                                          className="text-slate-400 hover:text-slate-600 transition-colors duration-150" 
                                          title={g.explanation}
                                        >
                                          <Info className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">{fmtRate(g.rateType, g.rateValue)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(g.totalCost)}</td>
                                <td className="px-3 py-2 text-right">
                                  {g.rows.length > 1 ? (
                                    <button
                                      type="button"
                                      aria-label={`Toggle ${g.chargeName} adjustment class details`}
                                      aria-expanded={Boolean(expandedAdjustmentGroups[g.key])}
                                      onClick={() => setExpandedAdjustmentGroups((p) => ({ ...p, [g.key]: !p[g.key] }))}
                                      className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors duration-150"
                                    >
                                      {expandedAdjustmentGroups[g.key] ? (
                                        <><ChevronDown className="h-3 w-3" /> Hide</>
                                      ) : (
                                        <><ChevronRight className="h-3 w-3" /> Show</>
                                      )}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                              </tr>
                              {expandedAdjustmentGroups[g.key] && (
                                <tr className="bg-gradient-to-r from-amber-50/30 to-transparent">
                                  <td className="px-3 py-2" colSpan={4}>
                                    <div className="rounded-lg border border-amber-200/40 bg-white/60 p-4">
                                      <table className="w-full">
                                        <thead>
                                          <tr className="border-b border-amber-200/40">
                                            <th className="px-3 py-2 text-left text-[13px] font-semibold leading-[1.45] text-slate-600">Class</th>
                                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-600">Rate</th>
                                            <th className="px-3 py-2 text-right text-[13px] font-semibold leading-[1.45] text-slate-600">Calculated Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-amber-200/30">
                                          {g.rows.map((r) => (
                                            <tr key={r.id} className="text-[13px] leading-[1.45] hover:bg-amber-50/50 transition-colors duration-150">
                                              <td className="px-3 py-2 text-slate-700">{r.className}</td>
                                              <td className="px-3 py-2 text-right font-medium text-slate-900 tabular-nums">{fmtRate(r.rateType, r.rateValue)}</td>
                                              <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums">{fmtMoney(r.calculatedAmount)}</td>
                                            </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {adjustmentGroups.length === 0 && <tr><td className="px-2 py-4 text-center text-slate-500" colSpan={4}>No adjustment charges found in BOM.</td></tr>}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200/80 bg-gradient-to-r from-amber-50/80 to-amber-100/40">
                          <td className="px-3 py-2 text-[13.5px] font-semibold leading-[1.45] text-slate-700" colSpan={2}>Adjustment Subtotal</td>
                          <td className="px-3 py-2 text-right text-[15px] font-bold leading-[1.45] text-slate-900 tabular-nums">{fmtMoney(adjustmentSubtotal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  </div>
                  {useCostBreakdownV2Ui && (
                    <div className="space-y-2 p-2 md:hidden">
                      {adjustmentGroups.map((g) => (
                        <div key={`adjustment-card-${g.key}`} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {adjIcon(g.chargeName)}
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{g.chargeName}</p>
                                <p className="text-[11px] text-slate-500">{fmtRate(g.rateType, g.rateValue)}</p>
                              </div>
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{fmtMoney(g.totalCost)}</p>
                          </div>
                          {g.verificationStatus === 'inactive' && (
                            <p className="mt-2 text-[11px] font-medium text-amber-700">Currently inactive in backend metadata</p>
                          )}
                          {g.rows.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Toggle ${g.chargeName} class details`}
                              aria-expanded={Boolean(expandedAdjustmentGroups[g.key])}
                              onClick={() => setExpandedAdjustmentGroups((p) => ({ ...p, [g.key]: !p[g.key] }))}
                              className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-blue-700"
                            >
                              {expandedAdjustmentGroups[g.key] ? 'Hide class rows' : 'Show class rows'}
                              {expandedAdjustmentGroups[g.key] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {expandedAdjustmentGroups[g.key] && (
                            <div className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50 p-2">
                              {g.rows.map((r) => (
                                <div key={`adjustment-row-${r.id}`} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px]">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">{r.className}</span>
                                    <span className="font-semibold text-slate-900">{fmtMoney(r.calculatedAmount)}</span>
                                  </div>
                                  <p className="text-slate-500">{fmtRate(r.rateType, r.rateValue)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {adjustmentGroups.length === 0 && (
                        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                          No adjustment charges found in BOM.
                        </div>
                      )}
                      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">Adjustment Subtotal</span>
                          <span className="font-semibold text-slate-900">{fmtMoney(adjustmentSubtotal)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  </>
                )}
              </div>

              {/* Premium Summary Footer */}
              <div className="mt-8 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50/80 to-white/80 p-6 shadow-lg">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center">
                        <div className="h-4 w-4 rounded-full bg-white"></div>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">Material Subtotal</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900 tabular-nums">{fmtMoney(materialSubtotal)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center">
                        <Settings2 className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">Adjustment Subtotal</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900 tabular-nums">{fmtMoney(adjustmentSubtotal)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t-2 border-slate-200/60">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                        <TrendingUp className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <span className="text-base font-bold text-slate-900">Summary Total</span>
                        <div className="text-xs text-slate-500">Final project cost</div>
                      </div>
                    </div>
                    <span className="text-2xl font-bold text-emerald-900 tabular-nums">{fmtMoney(total)}</span>
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 10, padding: '14px 24px',
            borderTop: '1px solid #e4ddd1', background: paper
          }}>
            <button type="button" onClick={onClose}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                background: paper, border: '1.4px solid #e4ddd1', color: '#5c6567',
                display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
              }}>
              Close
            </button>
          </div>
        </div>
      </div>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5,
      }} onClick={() => setPreviewOpen(false)}>
        <div style={{
          width: 1100, maxWidth: '100%', maxHeight: '92vh',
          background: '#FEFDFB', borderRadius: 14,
          boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 4,
            background: 'linear-gradient(90deg, #146b60, #3fa294 40%, #d99a3f 100%)'
          }} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid #e4ddd1', background: '#FEFDFB'
          }}>
            <div>
              <h2 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: '#0b3e39', letterSpacing: 0.2
              }}>
                Examination Job Card Preview
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567' }}>
                Generated: {previewAt ? new Date(previewAt).toLocaleString() : new Date().toLocaleString()}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={exportJobCardHtml}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
                  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567',
                  display: 'inline-flex', alignItems: 'center', gap: 5
                }}>
                <Download size={13} /> Export HTML
              </button>
              <button type="button" onClick={printJobCard}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
                  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  background: '#146b60', border: '1.4px solid transparent', color: '#fff',
                  display: 'inline-flex', alignItems: 'center', gap: 5
                }}>
                <Printer size={13} /> Print Job Card
              </button>
              <button onClick={() => setPreviewOpen(false)} aria-label="Close" style={{
                width: 28, height: 28, borderRadius: 8,
                border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 14
              }}>
                <XIcon size={13} />
              </button>
            </div>
          </div>
          <div style={{ padding: 12, background: '#eef7f6', flex: 1 }}>
            <iframe title="Exam Job Card Preview" srcDoc={previewHtml}
              style={{ height: '100%', width: '100%', borderRadius: 8, border: '1px solid #d3ece9', background: '#fff' }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 10, padding: '12px 24px',
            borderTop: '1px solid #e4ddd1', background: '#FEFDFB'
          }}>
            <button type="button" onClick={() => setPreviewOpen(false)}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '8px 16px', borderRadius: 9, cursor: 'pointer',
                background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567'
              }}>
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
