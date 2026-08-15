import React, { useEffect, useMemo, useState } from 'react';
import { logger } from '@/services/logger';
import { examinationBatchService } from '../../../services/examinationBatchService';
import { dbService } from '../../../services/db';
import { Select } from '../../../components/Select';
import { ExaminationBatch, Item, MarketAdjustment } from '../../../types';
import { isMarketAdjustmentActive } from '../../../utils/marketAdjustmentUtils';
import { X, AlertCircle, RefreshCw, Save, Settings2, Truck, ChevronRight } from 'lucide-react';
import { calculateBatchPricing, PricingSettings } from '../../../utils/examinationPricingCalculator';
import { currencyService } from '../../../services/currencyService';

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

type PreviewMetrics = ReturnType<typeof calculateBatchPricing>;

const buildPreview = (batch: ExaminationBatch | null | undefined, settings: PricingSettings | null, activeAdjustments: MarketAdjustment[]): PreviewMetrics => {
  return calculateBatchPricing(batch, settings, activeAdjustments);
};

const isPaperCandidate = (item: Item) => {
  const hint = `${String(item.name || '')} ${String(item.category || '')} ${String((item as Item & Record<string, unknown>).material || '')}`.toLowerCase();
  return hint.includes('paper');
};
const isTonerCandidate = (item: Item) => {
  const hint = `${String(item.name || '')} ${String(item.category || '')} ${String((item as Item & Record<string, unknown>).material || '')}`.toLowerCase();
  return hint.includes('toner');
};

export const ExaminationPricingSettingsDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  batch?: ExaminationBatch | null;
  onSaved?: () => void | Promise<void>;
  onPreviewChange?: (settings: PricingSettings | null, activeAdjustments: MarketAdjustment[]) => void;
  externalSettings?: PricingSettings | null;
  externalInventoryItems?: Item[];
  externalMarketAdjustments?: MarketAdjustment[];
  externalLoading?: boolean;
  onSaveSettings?: (settings: PricingSettings) => Promise<void>;
}> = ({
  isOpen, onClose, batch, onSaved, onPreviewChange,
  externalSettings, externalInventoryItems, externalMarketAdjustments, externalLoading = false, onSaveSettings
}) => {
    const [internalSettings, setInternalSettings] = useState<PricingSettings | null>(null);
    const [internalInventoryItems, setInternalInventoryItems] = useState<Item[]>([]);
    const [internalMarketAdjustments, setInternalMarketAdjustments] = useState<MarketAdjustment[]>([]);
    const [internalLoading, setInternalLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isExternal = externalSettings !== undefined && externalInventoryItems !== undefined;
    const settings = isExternal ? externalSettings : internalSettings;
    const inventoryItems = isExternal ? externalInventoryItems : internalInventoryItems;
    const marketAdjustments = externalMarketAdjustments ?? internalMarketAdjustments;
    const loading = isExternal ? externalLoading : internalLoading;

    const currency = batch?.currency || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const activeMarketAdjustments = useMemo(() => (marketAdjustments || []).filter(isMarketAdjustmentActive), [marketAdjustments]);
    const preview = useMemo(() => buildPreview(batch, settings, activeMarketAdjustments), [batch, settings, activeMarketAdjustments]);

    const setSettings = isExternal ? () => { } : setInternalSettings;
    const setInventoryItems = isExternal ? () => { } : setInternalInventoryItems;
    const setMarketAdjustments = isExternal ? () => { } : setInternalMarketAdjustments;
    const setLoading = isExternal ? () => { } : setInternalLoading;

    const loadSettings = async () => {
      setLoading(true); setError(null);
      try {
        const [settingsData, inventoryData, marketAdjustmentsData] = await Promise.all([
          examinationBatchService.getPricingSettings(),
          dbService.getAll<Item>('inventory'),
          dbService.getAll<MarketAdjustment>('marketAdjustments')
        ]);
        const inventoryItemsList = Array.isArray(inventoryData) ? inventoryData : [];
        setInventoryItems(inventoryItemsList);
        setMarketAdjustments(Array.isArray(marketAdjustmentsData) ? marketAdjustmentsData : []);
        if (settingsData) {
          if (!settingsData.paper_item_id) {
            const defaultPaper = inventoryItemsList.find(i => i.name.toLowerCase().includes('a4 paper') && i.name.toLowerCase().includes('80gsm'));
            if (defaultPaper) { settingsData.paper_item_id = defaultPaper.id; settingsData.paper_item_name = defaultPaper.name; settingsData.paper_unit_cost = Number((defaultPaper as Item & Record<string, unknown>).cost_per_unit ?? defaultPaper.cost ?? 0); }
          }
          if (!settingsData.toner_item_id) {
            const defaultToner = inventoryItemsList.find(i => i.name.toLowerCase().includes('hp universal toner') && i.name.toLowerCase().includes('1kg'));
            if (defaultToner) { settingsData.toner_item_id = defaultToner.id; settingsData.toner_item_name = defaultToner.name; settingsData.toner_unit_cost = Number((defaultToner as Item & Record<string, unknown>).cost_per_unit ?? defaultToner.cost ?? 0); }
          }
        }
        setSettings(settingsData);
      } catch (loadError) { logger.error('Error loading examination pricing settings:', loadError); setError('Failed to load pricing settings.'); }
      finally { setLoading(false); }
    };

    useEffect(() => { if (isOpen) void loadSettings(); }, [isOpen]);
    useEffect(() => {
      if (!onPreviewChange) return;
      if (!isOpen) { onPreviewChange(null, []); return; }
      onPreviewChange(settings, activeMarketAdjustments);
    }, [activeMarketAdjustments, isOpen, onPreviewChange, settings]);

    const handleSave = async () => {
      if (!settings) return;
      if (isExternal && onSaveSettings) {
        setSaving(true);
        try { await onSaveSettings(settings); if (onSaved) await onSaved(); onClose(); }
        catch (saveError) { logger.error('Error saving via parent:', saveError); setError('Failed to save pricing settings.'); }
        finally { setSaving(false); }
        return;
      }
      setSaving(true); setError(null);
      try {
        await examinationBatchService.updatePricingSettings({ paper_item_id: settings.paper_item_id, toner_item_id: settings.toner_item_id, trigger_recalculate: false, lock_pricing_snapshot: Boolean(batch?.id), lock_batch_id: batch?.id || undefined, lock_reason: batch?.id ? 'Saved via examination pricing settings' : undefined });
        if (batch?.id) {
          const syncSettings = { paper_item_id: settings.paper_item_id, paper_item_name: settings.paper_item_name, paper_unit_cost: settings.paper_unit_cost, toner_item_id: settings.toner_item_id, toner_item_name: settings.toner_item_name, toner_unit_cost: settings.toner_unit_cost, conversion_rate: settings.conversion_rate, constants: { pages_per_sheet: 2, toner_pages_per_unit: settings.constants?.toner_pages_per_unit || 20000, default_paper_conversion_rate: settings.conversion_rate || 500 }, active_adjustments: settings.active_adjustments || [] };
          try { await examinationBatchService.syncPricingToBatch(batch.id, { settings: syncSettings, adjustments: activeMarketAdjustments, triggerSource: 'PRICING_SETTINGS_SYNC' }); }
          catch (syncError) { logger.error('[ExaminationPricingSettings] Failed to sync pricing to classes:', syncError); setError('Settings saved, but failed to sync to some classes. Please recalculate the batch.'); }
        }
        if (onSaved) await onSaved();
        onClose();
      } catch (saveError) { logger.error('Error saving examination pricing settings:', saveError); setError('Failed to save pricing settings.'); }
      finally { setSaving(false); }
    };

    const paperOptions = useMemo(() => inventoryItems.filter(isPaperCandidate), [inventoryItems]);
    const tonerOptions = useMemo(() => inventoryItems.filter(isTonerCandidate), [inventoryItems]);

    const handlePaperSelection = (value: string) => {
      if (!settings) return;
      const selected = inventoryItems.find((item) => String(item.id) === String(value));
      setSettings({ ...settings, paper_item_id: value || null, paper_item_name: selected ? selected.name : null, paper_unit_cost: selected ? Number((selected as Item & Record<string, unknown>).cost_per_unit ?? selected.cost ?? selected.cost_price ?? 0) : 0 });
    };
    const handleTonerSelection = (value: string) => {
      if (!settings) return;
      const selected = inventoryItems.find((item) => String(item.id) === String(value));
      setSettings({ ...settings, toner_item_id: value || null, toner_item_name: selected ? selected.name : null, toner_unit_cost: selected ? Number((selected as Item & Record<string, unknown>).cost_per_unit ?? selected.cost ?? selected.cost_price ?? 0) : 0 });
    };

    if (!isOpen) return null;

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
      }} onClick={onClose}>
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
                <Settings2 size={19} color="#fff" />
              </div>
              <div>
                <h1 style={{
                  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                  fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                }}>
                  Examination Pricing Settings
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                  Configure global hidden BOM defaults and review a live preview for this batch
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${hairline}`, background: paper, color: inkSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
            }}
              onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
              onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: '24px 28px 8px', overflowY: 'auto', flex: 1 }}>
            {error && (
              <div style={{ padding: 12, borderRadius: 9, marginBottom: 18, background: `${danger}10`, border: `1px solid ${danger}30`, color: danger, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: inkSoft }}>Loading pricing settings...</div>
            ) : settings ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Hidden BOM Section */}
                <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, padding: 16, background: paper }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: teal[800], margin: '0 0 12px' }}>Hidden BOM (Automatic Cost Calculation)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Paper Item</label>
                      <select value={settings.paper_item_id || ''} onChange={(event) => handlePaperSelection(event.target.value)}
                        style={{
                          width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper,
                          border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '9px 12px', outline: 'none',
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30, cursor: 'pointer'
                        }}>
                        <option value="">No paper default</option>
                        {paperOptions.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Toner Item</label>
                      <select value={settings.toner_item_id || ''} onChange={(event) => handleTonerSelection(event.target.value)}
                        style={{
                          width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper,
                          border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '9px 12px', outline: 'none',
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30, cursor: 'pointer'
                        }}>
                        <option value="">No toner default</option>
                        {tonerOptions.map((item) => (<option key={item.id} value={item.id}>{item.name}</option>))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Active Market Adjustments */}
                <div style={{ borderRadius: 12, padding: 16, background: teal[50], border: `1px solid ${teal[100]}` }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: teal[800], margin: '0 0 4px' }}>Active Market Adjustments</h4>
                  <p style={{ fontSize: 11, color: inkSoft, margin: '0 0 12px' }}>Automated system-wide pricing adjustments</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {activeMarketAdjustments.length > 0 ? activeMarketAdjustments.map((rule) => (
                      <div key={rule.id} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${teal[200]}`, background: paper, fontSize: 12, color: teal[800], display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                        <Truck size={12} />
                        {rule.name}
                        <span style={{ background: teal[50], padding: '1px 6px', borderRadius: 4, fontSize: 10, whiteSpace: 'nowrap' }}>
                          {rule.type === 'PERCENTAGE' || rule.type === 'PERCENT' || rule.type === 'percentage' ? `+${rule.value}%` : `+${currency}${rule.value}`}
                        </span>
                      </div>
                    )) : (
                      <span style={{ fontSize: 12, color: inkSoft, fontStyle: 'italic' }}>No active market adjustments found</span>
                    )}
                  </div>
                </div>

                {/* Live Batch Preview */}
                <div style={{ borderRadius: 12, border: `1px solid ${teal[200]}`, padding: 16, background: teal[50] }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: teal[800], margin: '0 0 12px' }}>Live Batch Preview</h3>
                  {preview.classes.length === 0 ? (
                    <p style={{ fontSize: 13, color: inkSoft }}>No classes available for preview.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {preview.classes.map((classPreview) => (
                        <div key={classPreview.classId} style={{ borderRadius: 10, border: `1px solid ${teal[200]}`, padding: 12, background: paper }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 600, color: ink, margin: 0 }}>{classPreview.className}</h4>
                            <span style={{ fontSize: 11, fontWeight: 500, color: teal[600] }}>{classPreview.learners.toLocaleString()} learners</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
                            <div style={{ padding: '8px 10px', borderRadius: 6, background: teal[50], border: `1px solid ${teal[100]}` }}>
                              <div style={{ fontSize: 10, color: inkSoft }}>Total Sheets</div>
                              <div style={{ fontWeight: 600, color: ink }}>{classPreview.totalSheets.toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 6, background: teal[50], border: `1px solid ${teal[100]}` }}>
                              <div style={{ fontSize: 10, color: inkSoft }}>Total Pages</div>
                              <div style={{ fontWeight: 600, color: ink }}>{classPreview.totalPages.toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 6, background: teal[50], border: `1px solid ${teal[100]}` }}>
                              <div style={{ fontSize: 10, color: inkSoft }}>Total BOM Cost</div>
                              <div style={{ fontWeight: 600, color: ink }}>{classPreview.totalBomCost.toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 6, background: teal[50], border: `1px solid ${teal[100]}` }}>
                              <div style={{ fontSize: 10, color: inkSoft }}>Total Adjustments</div>
                              <div style={{ fontWeight: 600, color: ink }}>{classPreview.totalAdjustments.toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 6, background: teal[50], border: `1px solid ${teal[100]}` }}>
                              <div style={{ fontSize: 10, color: inkSoft }}>Total Cost</div>
                              <div style={{ fontWeight: 600, color: ink }}>{classPreview.totalCost.toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '8px 10px', borderRadius: 6, background: teal[50], border: `1px solid ${teal[100]}` }}>
                              <div style={{ fontSize: 10, color: inkSoft }}>Fee per Learner</div>
                              <div style={{ fontWeight: 600, color: teal[600] }}>{classPreview.expectedFeePerLearner.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {settings && (
              <div style={{ display: 'flex', gap: 8, marginTop: 20, marginBottom: 16 }}>
                <button type="button" onClick={() => void loadSettings()} disabled={loading || saving}
                  style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                    background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                    display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
                  }}>
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button type="button" onClick={() => void handleSave()} disabled={saving || loading}
                  style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                    color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                    boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                    transition: 'all .15s ease', opacity: (saving || loading) ? 0.6 : 1
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Settings'}
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
