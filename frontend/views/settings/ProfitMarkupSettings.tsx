import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp, Plus, Edit2, Trash2, ToggleLeft, ToggleRight,
  Download, Upload, Search, Filter, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, X, Save, RefreshCw, History,
  DollarSign, Percent, Globe, Tag, Package, Shield,
  Clock, User, Info, ChevronRight, Zap
} from 'lucide-react';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';

import { dbService } from '../../services/db';
import { logger } from '../../services/logger';
import {
  bulkUploadOfflineMarginSettings,
  createOfflineMarginSetting,
  deleteOfflineMarginSetting,
  listOfflineMarginAuditLogs,
  listOfflineMarginSettingsAsync,
  updateOfflineMarginSetting
} from '../../services/offlineProfitMargins';
import { getSavedVolumeDiscountTiers, saveVolumeDiscountTiers, DEFAULT_VOLUME_DISCOUNT_TIERS } from '../../utils/pricingEngineShared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarginSetting {
  id: string;
  scope: 'global' | 'category' | 'line_item';
  scope_ref_id: string | null;
  margin_type: 'percentage' | 'fixed_amount';
  margin_value: number;
  is_active: boolean | number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  apply_volume_margins?: number | boolean;
}

interface AuditEntry {
  id: string;
  setting_id: string;
  action: string;
  scope: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  performed_by: string | null;
  timestamp: string;
}

interface ModalState {
  open: boolean;
  mode: 'create' | 'edit';
  scope: 'category' | 'line_item';
  existing?: MarginSetting;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const OFFLINE_MARGIN_KEY = 'nexus_profit_margin_settings';

const parseBody = (body?: BodyInit | null) => {
  if (typeof body !== 'string') return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

async function apiFetchOffline(path: string, opts: RequestInit = {}) {
  const method = String(opts.method || 'GET').toUpperCase();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const payload = parseBody(opts.body);

  if (cleanPath === '/profit-margins' && method === 'GET') {
    return listOfflineMarginSettingsAsync();
  }

  if (cleanPath.startsWith('/profit-margins/audit-log') && method === 'GET') {
    const url = new URL(`https://offline.local${cleanPath}`);
    return listOfflineMarginAuditLogs({
      scope: url.searchParams.get('scope') || '',
      user: url.searchParams.get('user') || '',
      startDate: url.searchParams.get('startDate') || '',
      endDate: url.searchParams.get('endDate') || '',
    });
  }

  if (cleanPath === '/profit-margins' && method === 'POST') {
    return createOfflineMarginSetting(payload as Partial<MarginSetting>);
  }

  if (cleanPath === '/profit-margins/bulk-upload' && method === 'POST') {
    const body = payload as { rows?: unknown[] };
    return bulkUploadOfflineMarginSettings(Array.isArray(body?.rows) ? body.rows : []);
  }

  const match = cleanPath.match(/^\/profit-margins\/([^/?]+)/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (method === 'PATCH') {
      return updateOfflineMarginSetting(id, payload as Partial<MarginSetting>);
    }
    if (method === 'DELETE') {
      const body = payload as { reason?: string };
      return deleteOfflineMarginSetting(id, body?.reason ?? null);
    }
  }

  throw new Error(`Unsupported offline request: ${method} ${cleanPath}`);
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  return apiFetchOffline(path, opts);
}

/** Persist a margin record array to the cloud-first setting store for offline access. */
async function cacheMarginSettings(records: MarginSetting[]) {
  try {
    await dbService.saveSetting(OFFLINE_MARGIN_KEY, records);
  } catch { /* non-fatal */ }
}

/** Read cached margin records from the cloud-first setting store. */
async function readCachedMarginSettings(): Promise<MarginSetting[]> {
  try {
    const saved = await dbService.getSetting<MarginSetting[]>(OFFLINE_MARGIN_KEY);
    if (!saved) return [];
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtMargin(value: number, type: string) {
  return type === 'percentage' ? `${value.toFixed(2)}%` : `MWK ${value.toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// ─── Toast component ─────────────────────────────────────────────────────────

interface Toast { id: string; msg: string; type: 'success' | 'error' | 'info'; }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, push };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold transition-all animate-in slide-in-from-right duration-300 ${
          t.type === 'success' ? 'bg-blue-600 text-white' :
          t.type === 'error' ? 'bg-red-600 text-white' :
          'bg-slate-800 text-white'
        }`}>
          {t.type === 'success' && <CheckCircle2 size={16} />}
          {t.type === 'error' && <AlertTriangle size={16} />}
          {t.type === 'info' && <Info size={16} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Override Modal ───────────────────────────────────────────────────────────

interface OverrideModalProps {
  state: ModalState;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  toast: (msg: string, type?: Toast['type']) => void;
}

function OverrideModal({ state, categories, onClose, onSaved, toast }: OverrideModalProps) {
  const [scopeRefId, setScopeRefId] = useState(state.existing?.scope_ref_id || '');
  const [marginType, setMarginType] = useState<'percentage' | 'fixed_amount'>(state.existing?.margin_type || 'percentage');
  const [marginValue, setMarginValue] = useState(String(state.existing?.margin_value ?? ''));
  const [reason, setReason] = useState(state.existing?.reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const validateAndSave = async () => {
    setError('');
    const val = parseFloat(marginValue);
    if (isNaN(val)) { setError('Margin value must be a valid number'); return; }
    if (marginType === 'percentage' && (val < 0 || val > 100)) { setError('Percentage must be between 0 and 100'); return; }
    if (marginType === 'fixed_amount' && val < 0) { setError('Fixed amount must be ≥ 0'); return; }
    if ((state.scope as string) !== 'global' && !scopeRefId.trim()) { setError(`Please enter a ${state.scope === 'category' ? 'category' : 'SKU / product ID'}`); return; }

    setSaving(true);
    try {
      const body = {
        scope: state.scope,
        scope_ref_id: scopeRefId || null,
        margin_type: marginType,
        margin_value: val,
        reason,
      };

      if (state.mode === 'edit' && state.existing) {
        await apiFetch(`/profit-margins/${state.existing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('Override updated successfully', 'success');
      } else {
        await apiFetch('/profit-margins', { method: 'POST', body: JSON.stringify(body) });
        toast('Override created successfully', 'success');
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const title = `${state.mode === 'create' ? 'Add' : 'Edit'} ${state.scope === 'category' ? 'Category' : 'Line-Item'} Override`;

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 p-6 flex justify-between items-start">
          <div>
            <h2 className="text-white font-bold text-lg">{title}</h2>
            <p className="text-indigo-200 text-xs mt-1">
              {state.scope === 'category' ? 'Applies to all products in this category' : 'Applies to a specific product or SKU'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Scope Ref */}
          {state.scope === 'category' ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
              {categories.length > 0 ? (
                <select
                  id="override-category-select"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={scopeRefId}
                  onChange={e => setScopeRefId(e.target.value)}
                >
                  <option value="">Select a category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <input
                  id="override-category-input"
                  type="text"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Category ID or name…"
                  value={scopeRefId}
                  onChange={e => setScopeRefId(e.target.value)}
                />
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">SKU / Product ID</label>
              <input
                id="override-sku-input"
                type="text"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="e.g. PROD-001 or item SKU…"
                value={scopeRefId}
                onChange={e => setScopeRefId(e.target.value)}
              />
            </div>
          )}

          {/* Margin type + value */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Margin Type & Value</label>
            <div className="flex gap-2">
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                <button
                  id="margin-type-percentage"
                  onClick={() => setMarginType('percentage')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${marginType === 'percentage' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <Percent size={14} /> %
                </button>
                <button
                  id="margin-type-fixed"
                  onClick={() => setMarginType('fixed_amount')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${marginType === 'fixed_amount' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <DollarSign size={14} /> Fixed
                </button>
              </div>
              <input
                id="override-margin-value"
                type="number"
                min="0"
                max={marginType === 'percentage' ? 100 : undefined}
                step="0.01"
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder={marginType === 'percentage' ? '0.00 – 100.00' : '0.00'}
                value={marginValue}
                onChange={e => setMarginValue(e.target.value)}
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Reason / Audit Note</label>
            <textarea
              id="override-reason"
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              placeholder="Explain why this override is being set…"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
              <AlertTriangle size={15} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
          <button
            id="override-save-btn"
            onClick={validateAndSave}
            disabled={saving}
            className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
          >
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving…' : state.mode === 'edit' ? 'Update Override' : 'Create Override'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ProfitMarkupSettings Component ─────────────────────────────────────

const ProfitMarkupSettings: React.FC = () => {
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const { toasts, push: toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overrides' | 'audit'>('overrides');
  const [settings, setSettings] = useState<MarginSetting[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'create', scope: 'category' });
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; confirmLabel?: string; type?: ConfirmDialogType; action: () => void }>({ open: false, title: '', message: '', action: () => {} });
  const [searchLine, setSearchLine] = useState('');
  const [csvUploading, setCsvUploading] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  // Global edit state
  const globalSetting = settings.find(s => s.scope === 'global' && !s.deleted_at);
  const [globalValue, setGlobalValue] = useState('');
  const [globalType, setGlobalType] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [globalReason, setGlobalReason] = useState('');
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Volume discount tiers state
  const [volumeTiers, setVolumeTiers] = useState<Array<{ minPages: number; discountPercent: number }>>([]);
  const [savingTiers, setSavingTiers] = useState(false);

  // Audit filters
  const [auditFilter, setAuditFilter] = useState({ scope: '', user: '', startDate: '', endDate: '' });
  const [auditLoading, setAuditLoading] = useState(false);

  const categorySettings = settings.filter(s => s.scope === 'category' && !s.deleted_at);
  const lineSettings = settings.filter(s => s.scope === 'line_item' && !s.deleted_at)
    .filter(s => !searchLine || (s.scope_ref_id || '').toLowerCase().includes(searchLine.toLowerCase()));

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/profit-margins');
      setSettings(data);
      // Cache for offline access
      await cacheMarginSettings(data);
      const global = data.find((s: MarginSetting) => s.scope === 'global' && !s.deleted_at);
      if (global) {
        setGlobalValue(String(global.margin_value));
        setGlobalType(global.margin_type);
      }
    } catch (err: any) {
      // Offline fallback: use cached data so the page still shows current values
      const cached = await readCachedMarginSettings();
      if (cached.length > 0) {
        setSettings(cached);
        const global = cached.find((s) => s.scope === 'global' && !s.deleted_at);
        if (global) {
          setGlobalValue(String(global.margin_value));
          setGlobalType(global.margin_type);
        }
        toast('Loaded from local cache (backend offline)', 'info');
      } else {
        toast(err.message || 'Failed to load settings', 'error');
      }
    } finally {
      setLoading(false);
    }
    // Load volume discount tiers from localStorage
    const saved = getSavedVolumeDiscountTiers();
    setVolumeTiers(saved.length > 0 ? saved : [...DEFAULT_VOLUME_DISCOUNT_TIERS]);
  }, [toast]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (auditFilter.scope) params.set('scope', auditFilter.scope);
      if (auditFilter.user) params.set('user', auditFilter.user);
      if (auditFilter.startDate) params.set('startDate', auditFilter.startDate);
      if (auditFilter.endDate) params.set('endDate', auditFilter.endDate);
      const data = await apiFetch(`/profit-margins/audit-log?${params.toString()}`);
      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast(err.message || 'Failed to load audit log', 'error');
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilter, toast]);

  useEffect(() => {
    load();
    // Re-load when cloud sync pushes profit margin data (cross-device sync)
    const onDataChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.stores) return;
      if (detail.stores.includes('profitMarginSettings') || detail.stores.includes('*')) {
        load();
      }
    };
    window.addEventListener('primeerp:data-changed', onDataChanged);
    return () => window.removeEventListener('primeerp:data-changed', onDataChanged);
  }, []); // eslint-disable-line
  useEffect(() => { if (activeTab === 'audit') loadAudit(); }, [activeTab]); // eslint-disable-line

  // ── Global save ───────────────────────────────────────────────────────────

  const handleSaveGlobal = async () => {
    const val = parseFloat(globalValue);
    if (isNaN(val) || (globalType === 'percentage' && (val < 0 || val > 100))) {
      toast('Percentage must be between 0 and 100', 'error'); return;
    }
    setConfirm({
      open: true,
      title: 'Update Global Margin',
      message: 'This will affect all products and orders that do not have a category or line-item override. Are you sure?',
      confirmLabel: 'Update Global Margin',
      type: 'warning',
      action: async () => {
        setSavingGlobal(true);

        const now = new Date().toISOString();
        const offlineRecord: MarginSetting = {
          id: globalSetting?.id || `local-global-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          scope: 'global',
          scope_ref_id: null,
          margin_type: globalType,
          margin_value: val,
          is_active: true,
          reason: globalReason || 'Global margin update',
          created_by: localStorage.getItem('prime_user_id') || 'system',
          created_at: globalSetting?.created_at || now,
          updated_at: now,
          deleted_at: null,
          apply_volume_margins: globalSetting?.apply_volume_margins ?? false,
        };

        try {
          if (globalSetting) {
            await apiFetch(`/profit-margins/${globalSetting.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ margin_value: val, margin_type: globalType, is_active: true, reason: globalReason || 'Global margin update' }),
            });
          } else {
            await apiFetch('/profit-margins', {
              method: 'POST',
              body: JSON.stringify({ scope: 'global', scope_ref_id: null, margin_type: globalType, margin_value: val, is_active: true, reason: globalReason || 'Initial global margin' }),
            });
          }
          toast('Global margin saved', 'success');
          await load();
        } catch (err: any) {
          const cached = await readCachedMarginSettings();
          const idx = cached.findIndex(s => s.scope === 'global');
          if (idx >= 0) {
            cached[idx] = { ...cached[idx], ...offlineRecord };
          } else {
            cached.push(offlineRecord);
          }
          await cacheMarginSettings(cached);
          try {
            await dbService.put('profitMarginSettings', offlineRecord);
          } catch { /* best-effort */ }
          setSettings(cached);
          toast('Saved locally (backend offline — will sync when reconnected)', 'info');
        } finally {
          setSavingGlobal(false);
        }
      }
    });
  };

  // ── Toggle active ──────────────────────────────────────────────────────────

  const toggleActive = async (s: MarginSetting) => {
    try {
      await apiFetch(`/profit-margins/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: s.is_active ? 0 : 1 }),
      });
      toast(`Override ${s.is_active ? 'deactivated' : 'activated'}`, 'success');
      await load();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = (s: MarginSetting) => {
    setConfirm({
      open: true,
      danger: true,
      title: 'Delete Override',
      message: `This will soft-delete the override for "${s.scope_ref_id || 'global'}". The next applicable level will take effect. This action is logged.`,
      confirmLabel: 'Delete',
      type: 'danger',
      action: async () => {
        setConfirm(c => ({ ...c, open: false }));
        try {
          await apiFetch(`/profit-margins/${s.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason: 'User requested deletion' }),
          });
          toast('Override deleted (soft)', 'success');
          await load();
        } catch (err: any) {
          toast(err.message, 'error');
        }
      }
    });
  };

  // ── CSV bulk upload ────────────────────────────────────────────────────────

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim()]));
      });
      const result = await apiFetch('/profit-margins/bulk-upload', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      toast(`Bulk upload: ${result.success} added, ${result.failed} failed`, result.failed > 0 ? 'info' : 'success');
      await load();
    } catch (err: any) {
      toast(err.message || 'CSV upload failed', 'error');
    } finally {
      setCsvUploading(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  };

  // ── Export audit CSV ───────────────────────────────────────────────────────

  const exportAuditCsv = () => {
    const headers = ['timestamp', 'performed_by', 'action', 'scope', 'old_value', 'new_value', 'reason'];
    const rows = auditLogs.map(l => headers.map(h => JSON.stringify((l as Record<string, unknown>)[h] ?? '')));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `profit_margin_audit_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('Audit log exported', 'success');
  };

  // ── CSV template download ──────────────────────────────────────────────────

  const downloadCsvTemplate = () => {
    const template = 'sku,margin_type,margin_value,reason\nPROD-001,percentage,25.00,Seasonal adjustment\nPROD-002,fixed_amount,150.00,Custom pricing';
    const blob = new Blob([template], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'margin_bulk_upload_template.csv';
    a.click();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 relative">
      <ToastContainer toasts={toasts} />

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) => !open && setConfirm(c => ({ ...c, open: false }))}
        onConfirm={confirm.action}
        onCancel={() => setConfirm(c => ({ ...c, open: false }))}
        title={confirm.title}
        message={confirm.message}
        confirmText={confirm.confirmLabel}
        type={confirm.type || 'warning'}
      />

      {/* Override Modal */}
      {modal.open && (
        <OverrideModal
          state={modal}
          categories={[]}
          onClose={() => setModal(m => ({ ...m, open: false }))}
          onSaved={async () => { setModal(m => ({ ...m, open: false })); await load(); }}
          toast={toast}
        />
      )}

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
        {(['overrides', 'audit'] as const).map(tab => (
          <button
            key={tab}
            id={`pm-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-semibold transition-all ${
              activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'overrides' ? <><TrendingUp size={16} /> Overrides</> : <><History size={16} /> Audit Log</>}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          OVERRIDES TAB
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overrides' && (
        <div className="space-y-6">

          {/* ── GLOBAL SECTION ────────────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Globe size={18} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-slate-800">Global Default Markup</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Applies to all products unless overridden at category or line-item level</p>
                </div>
              </div>
              {globalSetting && (
                <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-bold border border-blue-200">
                  <CheckCircle2 size={12} /> Active: {fmtMargin(globalSetting.margin_value, globalSetting.margin_type)}
                </div>
              )}
            </div>

            <div className="p-6">
              <div className="flex flex-wrap items-end gap-4">
                {/* Type toggle */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Type</label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      id="global-type-percentage"
                      onClick={() => setGlobalType('percentage')}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${globalType === 'percentage' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      <Percent size={14} /> Percentage
                    </button>
                    <button
                      id="global-type-fixed"
                      onClick={() => setGlobalType('fixed_amount')}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${globalType === 'fixed_amount' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      <DollarSign size={14} /> Fixed
                    </button>
                  </div>
                </div>

                {/* Value input */}
                <div className="w-40">
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Value</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                      {globalType === 'percentage' ? '%' : currency}
                    </span>
                    <input
                      id="global-margin-value"
                      type="number"
                      min="0"
                      max={globalType === 'percentage' ? 100 : undefined}
                      step="0.01"
                      className="w-full border border-slate-200 rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      value={globalValue}
                      onChange={e => setGlobalValue(e.target.value)}
                    />
                  </div>
                </div>

                {/* Reason */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Reason (optional)</label>
                  <input
                    id="global-reason"
                    type="text"
                    placeholder="Audit note for this change…"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={globalReason}
                    onChange={e => setGlobalReason(e.target.value)}
                  />
                </div>

                {/* Save */}
                <button
                  id="global-save-btn"
                  onClick={handleSaveGlobal}
                  disabled={savingGlobal}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60 shadow-lg shadow-indigo-500/20"
                >
                  {savingGlobal ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                  {savingGlobal ? 'Saving…' : 'Save Global'}
                </button>
              </div>

              {globalSetting && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><Clock size={11}/> Last updated {fmtDate(globalSetting.updated_at)}</span>
                  {globalSetting.created_by && <span className="flex items-center gap-1.5"><User size={11}/> By {globalSetting.created_by}</span>}
                  {globalSetting.reason && <span className="flex items-center gap-1.5"><Info size={11}/> "{globalSetting.reason}"</span>}
                </div>
              )}
            </div>
          </section>

          {/* ── VOLUME DISCOUNT SECTION ───────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                  <TrendingUp size={18} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-slate-800">Volume Margins (Discounts)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Automatically apply tiered margins based on the total page count (Products & Services only)</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
                <div className="flex items-center gap-4">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${globalSetting?.apply_volume_margins ? 'bg-blue-600 shadow-lg shadow-blue-200' : 'bg-slate-200'}`}>
                      <Zap size={20} className={globalSetting?.apply_volume_margins ? 'text-white' : 'text-slate-400'} />
                   </div>
                   <div>
                      <h4 className="font-bold text-slate-800 text-sm">Enable Volume Margins</h4>
                      <p className="text-xs text-slate-500">Apply the 10%, 15%, and 25% tiers automatically based on page volume.</p>
                   </div>
                </div>
                <button 
                  id="toggle-volume-margins"
                  onClick={async () => {
                    if (!globalSetting) {
                      toast('Please save a Global Default Margin first', 'info');
                      return;
                    }
                    
                    const originalValue = globalSetting.apply_volume_margins;
                    const newValue = originalValue ? 0 : 1;

                    // Optimistic update
                    setSettings(prev => prev.map(s => 
                      s.id === globalSetting.id ? { ...s, apply_volume_margins: newValue } : s
                    ));

                    try {
                      await apiFetch(`/profit-margins/${globalSetting.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ apply_volume_margins: newValue }),
                      });
                      toast(`Volume margins ${newValue ? 'enabled' : 'disabled'}`, 'success');
                    } catch (err: any) {
                      // Revert on error
                      setSettings(prev => prev.map(s => 
                        s.id === globalSetting.id ? { ...s, apply_volume_margins: originalValue } : s
                      ));
                      toast(err.message, 'error');
                    }
                  }}
                  className="transition-transform active:scale-90"
                >
                  {globalSetting?.apply_volume_margins ? <ToggleRight size={40} className="text-indigo-600" /> : <ToggleLeft size={40} className="text-slate-300" />}
                </button>
              </div>

              <div className="space-y-3">
                {volumeTiers.map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 w-12 shrink-0">Tier {idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">≥</span>
                      <input
                        type="number"
                        min={0}
                        className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                        value={tier.minPages}
                        onChange={e => {
                          const updated = [...volumeTiers];
                          updated[idx] = { ...updated[idx], minPages: Math.max(0, parseInt(e.target.value) || 0) };
                          setVolumeTiers(updated);
                        }}
                      />
                      <span className="text-xs text-slate-500">pages</span>
                    </div>
                    <span className="text-slate-300">→</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                        value={tier.discountPercent}
                        onChange={e => {
                          const updated = [...volumeTiers];
                          updated[idx] = { ...updated[idx], discountPercent: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) };
                          setVolumeTiers(updated);
                        }}
                      />
                      <span className="text-xs text-slate-500">% off</span>
                    </div>
                    <button
                      onClick={() => setVolumeTiers(prev => prev.filter((_, i) => i !== idx))}
                      className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove tier"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => setVolumeTiers(prev => [...prev, { minPages: 0, discountPercent: 0 }])}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-amber-700 border border-amber-200 hover:bg-amber-50 transition-colors"
                >
                  <Plus size={14} /> Add Tier
                </button>
                <button
                  onClick={async () => {
                    const valid = volumeTiers.filter(t => t.minPages >= 0 && t.discountPercent >= 0);
                    if (valid.length === 0) { toast('At least one valid tier is required', 'error'); return; }
                    setSavingTiers(true);
                    try {
                      await saveVolumeDiscountTiers(valid);
                      toast('Volume discount tiers saved', 'success');
                    } catch (err: any) {
                      toast(err.message || 'Failed to save tiers', 'error');
                    } finally {
                      setSavingTiers(false);
                    }
                  }}
                  disabled={savingTiers}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-all active:scale-95 disabled:opacity-60"
                >
                  {savingTiers ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {savingTiers ? 'Saving…' : 'Save Tiers'}
                </button>
              </div>

              <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
                <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-800 leading-relaxed">
                  <p className="font-bold mb-1 uppercase tracking-wider">How it works:</p>
                  <p>When enabled, the profit margin is applied first (cost + markup), then the matching volume discount is subtracted from that price. Both work together — not one instead of the other. Tiers are evaluated from highest page count to lowest — the first match applies. This logic is strictly excluded from Examination batches.</p>
                </div>
              </div>
            </div>
          </section>


          {/* ── CATEGORY OVERRIDES ────────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Tag size={18} className="text-violet-600" />
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-slate-800">Category Overrides</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Override the global margin for an entire product category</p>
                </div>
              </div>
              <button
                id="add-category-override-btn"
                onClick={() => setModal({ open: true, mode: 'create', scope: 'category' })}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition-all active:scale-95 shadow-lg shadow-violet-500/20"
              >
                <Plus size={16} /> Add Override
              </button>
            </div>

            {categorySettings.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Tag size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No category overrides yet</p>
                <p className="text-xs mt-1">Click "Add Override" to create your first category override.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Category', 'Override Value', 'Type', 'Active', 'Last Updated', 'Reason', 'Actions'].map(h => (
                        <th key={h} className="text-left text-[11px] font-black text-slate-400 uppercase tracking-wider px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {categorySettings.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">{s.scope_ref_id || '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-sm font-bold ${s.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {fmtMargin(s.margin_value, s.margin_type)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.margin_type === 'percentage' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {s.margin_type === 'percentage' ? 'Percentage' : 'Fixed'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <button id={`cat-toggle-${s.id}`} onClick={() => toggleActive(s)} className="transition-transform active:scale-90">
                            {s.is_active ? <ToggleRight size={22} className="text-emerald-500" /> : <ToggleLeft size={22} className="text-slate-300" />}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-400">{fmtDate(s.updated_at)}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[150px] truncate">{s.reason || '—'}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              id={`cat-edit-${s.id}`}
                              onClick={() => setModal({ open: true, mode: 'edit', scope: 'category', existing: s })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              id={`cat-delete-${s.id}`}
                              onClick={() => handleDelete(s)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── LINE-ITEM OVERRIDES ───────────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
                  <Package size={18} className="text-rose-600" />
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-slate-800">Line-Item Overrides</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Highest priority — overrides global and category margins for a specific product</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Bulk CSV upload */}
                <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                <button
                  id="download-csv-template-btn"
                  onClick={downloadCsvTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                  title="Download CSV template"
                >
                  <Download size={13} /> Template
                </button>
                <button
                  id="bulk-csv-upload-btn"
                  onClick={() => csvRef.current?.click()}
                  disabled={csvUploading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {csvUploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
                  {csvUploading ? 'Uploading…' : 'CSV Upload'}
                </button>
                <button
                  id="add-line-item-override-btn"
                  onClick={() => setModal({ open: true, mode: 'create', scope: 'line_item' })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 transition-all active:scale-95 shadow-lg shadow-rose-500/20"
                >
                  <Plus size={16} /> Add Override
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
              <div className="relative max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="line-item-search"
                  type="text"
                  placeholder="Search by SKU or product ID…"
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
                  value={searchLine}
                  onChange={e => setSearchLine(e.target.value)}
                />
              </div>
            </div>

            {lineSettings.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">{searchLine ? 'No results found' : 'No line-item overrides yet'}</p>
                <p className="text-xs mt-1">{searchLine ? 'Try a different search term.' : 'Add individual product overrides or bulk upload via CSV.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['SKU / Product', 'Override Value', 'Type', 'Active', 'Reason', 'Last Updated', 'Actions'].map(h => (
                        <th key={h} className="text-left text-[11px] font-black text-slate-400 uppercase tracking-wider px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {lineSettings.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-rose-100 flex items-center justify-center">
                              <Package size={12} className="text-rose-600" />
                            </div>
                            <span className="text-sm font-semibold text-slate-700">{s.scope_ref_id || '—'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-sm font-bold ${s.is_active ? 'text-rose-600' : 'text-slate-400'}`}>
                            {fmtMargin(s.margin_value, s.margin_type)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.margin_type === 'percentage' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {s.margin_type === 'percentage' ? '%' : 'Fixed'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <button id={`line-toggle-${s.id}`} onClick={() => toggleActive(s)} className="transition-transform active:scale-90">
                            {s.is_active ? <ToggleRight size={22} className="text-emerald-500" /> : <ToggleLeft size={22} className="text-slate-300" />}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[140px] truncate">{s.reason || '—'}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-400">{fmtDate(s.updated_at)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              id={`line-edit-${s.id}`}
                              onClick={() => setModal({ open: true, mode: 'edit', scope: 'line_item', existing: s })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              id={`line-delete-${s.id}`}
                              onClick={() => handleDelete(s)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Hierarchy info card */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
            <Shield size={20} className="text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-indigo-800 mb-1">Override Hierarchy</h4>
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium flex-wrap">
                <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">Line-Item (highest priority)</span>
                <ChevronRight size={12} className="text-indigo-400" />
                <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full border border-violet-200">Category</span>
                <ChevronRight size={12} className="text-indigo-400" />
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">Global (fallback)</span>
              </div>
              <p className="text-xs text-indigo-500 mt-2">Deleting a rule reverts to the next applicable level. All changes are logged to the audit trail.</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          AUDIT LOG TAB
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div className="space-y-5">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Scope</label>
                <select
                  id="audit-filter-scope"
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={auditFilter.scope}
                  onChange={e => setAuditFilter(f => ({ ...f, scope: e.target.value }))}
                >
                  <option value="">All scopes</option>
                  <option value="global">Global</option>
                  <option value="category">Category</option>
                  <option value="line_item">Line-Item</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">User</label>
                <input
                  id="audit-filter-user"
                  type="text"
                  placeholder="User ID…"
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={auditFilter.user}
                  onChange={e => setAuditFilter(f => ({ ...f, user: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">From</label>
                <input
                  id="audit-filter-start"
                  type="date"
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={auditFilter.startDate}
                  onChange={e => setAuditFilter(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">To</label>
                <input
                  id="audit-filter-end"
                  type="date"
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={auditFilter.endDate}
                  onChange={e => setAuditFilter(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
              <button
                id="audit-filter-apply"
                onClick={loadAudit}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all active:scale-95"
              >
                <Filter size={14} /> Apply
              </button>
              <button
                id="audit-export-btn"
                onClick={exportAuditCsv}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors ml-auto"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Audit table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {auditLoading ? (
              <div className="text-center py-16">
                <RefreshCw size={24} className="mx-auto mb-3 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-500">Loading audit log…</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <History size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No audit records found</p>
                <p className="text-xs mt-1">Adjust filters or create your first override to generate an audit trail.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Timestamp', 'User', 'Action', 'Scope', 'Old Value', 'New Value', 'Reason'].map(h => (
                        <th key={h} className="text-left text-[11px] font-black text-slate-400 uppercase tracking-wider px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {auditLogs.map(l => {
                      let oldVal = '—', newVal = '—';
                      try { const o = JSON.parse(l.old_value || '{}'); oldVal = o.margin_value !== undefined ? fmtMargin(o.margin_value, o.margin_type) : '—'; } catch (e) { logger.error("Operation failed", e as Error); }
                      try { const n = JSON.parse(l.new_value || '{}'); newVal = n.margin_value !== undefined ? fmtMargin(n.margin_value, n.margin_type) : '—'; } catch (e) { logger.error("Operation failed", e as Error); }
                      return (
                        <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(l.timestamp)}</td>
                          <td className="px-5 py-3.5 text-xs font-semibold text-slate-700">{l.performed_by || '—'}</td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                              l.action === 'CREATE' ? 'bg-blue-100 text-blue-700' :
                              l.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                              l.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>{l.action}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                              l.scope === 'global' ? 'bg-blue-100 text-blue-700' :
                              l.scope === 'category' ? 'bg-violet-100 text-violet-700' :
                              'bg-rose-100 text-rose-700'
                            }`}>{l.scope}</span>
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">{oldVal}</td>
                          <td className="px-5 py-3.5 text-xs text-emerald-700 font-mono font-bold">{newVal}</td>
                          <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[200px] truncate">{l.reason || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfitMarkupSettings;
