import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Item, FinishingOption } from '../../../types';
import { useInventory } from '../../../context/InventoryContext';
import { useAuth } from '../../../context/AuthContext';
import { generateAutoSKU } from '../../../utils/skuGenerator';
import { currencyService } from '../../../services/currencyService';
import { aiService } from '../../../services/ai/aiService';
import { ConfirmDialog, ConfirmDialogType } from '../../../components/ConfirmDialog';

type Category = 'raw' | 'product' | 'service' | 'stationery';

const TARGET_MARKUP = 0.38;

interface Props {
  open: boolean;
  item?: Item | null;
  onClose: () => void;
  onSave?: (item: Item) => Promise<void>;
  allItems?: Item[];
  sourceTab?: string | null;
}

function categoryFromSourceTab(tab: string | null | undefined): Category {
  if (tab === 'product') return 'product';
  if (tab === 'printing') return 'service';
  if (tab === 'stationery') return 'stationery';
  return 'raw';
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };

const VAR_STYLES = {
  ink900: '#0F3D3E',
  ink700: '#146B67',
  teal600: teal[500],
  teal500: teal[400],
  teal050: teal[50],
  amber: amber[500],
  amberSoft: amber[100],
  purple: '#7B5CC9',
  purpleSoft: '#EDE6F7',
  paper: '#FBF8F2',
  paperDim: '#F2EEE3',
  card: '#FEFDFB',
  line: '#E4DFD1',
  text: '#23282A',
  textDim: '#666F6C',
  danger: '#B23B3B',
  dangerSoft: '#FBEAEA',
  radius: 14,
  shadowSm: '0 1px 2px rgba(15,61,62,0.06)',
  shadowMd: '0 8px 24px rgba(15,61,62,0.10)',
  shadowLg: '0 24px 60px rgba(15,61,62,0.24)',
};

const PAGES_PER_SHEET = 2;

const BOM_DEFAULT_RATES = {
  paper: 3.50,
  toner: 0.45,
  cover: 15.00,
  staple: 0.50,
  tape: 1.20,
};

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(15, 23, 42, 0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 20px',
    zIndex: 9999,
    fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: '#23282A',
  },
  modal: {
    width: '100%', maxWidth: 1040,
    background: VAR_STYLES.card,
    borderRadius: 18,
    boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
    display: 'flex', flexDirection: 'column',
    maxHeight: 'calc(100vh - 80px)',
    overflow: 'hidden',
    position: 'relative',
  },
  modalHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 22px', borderBottom: `1px solid ${VAR_STYLES.line}`,
    flexShrink: 0,
  },
  modalHeadLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  modalIcon: {
    width: 40, height: 40, borderRadius: 10,
    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    boxShadow: '0 4px 10px -3px rgba(15,84,76,.6)',
  },
  modalTitle: { fontSize: 17, fontWeight: 600, margin: 0, lineHeight: 1.3 },
  modalSub: { fontSize: 12, color: VAR_STYLES.textDim, margin: '1px 0 0' },
  iconBtn: {
    width: 32, height: 32, borderRadius: 8, border: `1px solid ${VAR_STYLES.line}`,
    background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: VAR_STYLES.textDim, flexShrink: 0,
    transition: 'all .15s ease',
  },
  modalMain: { display: 'flex', flex: 1, minHeight: 0 },
  sideNav: {
    width: 266, flexShrink: 0,
    background: VAR_STYLES.paper,
    borderRight: `1px solid ${VAR_STYLES.line}`,
    padding: '14px 12px',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  navLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: VAR_STYLES.textDim, padding: '4px 10px 8px',
  },
  sideDivider: { height: 1, background: VAR_STYLES.line, margin: '14px 2px' },
  tab: {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '9px 11px', borderRadius: 9, border: '1px solid transparent',
    background: 'transparent', font: 'inherit', fontSize: 12.5, fontWeight: 600, color: VAR_STYLES.textDim,
    cursor: 'pointer', whiteSpace: 'nowrap', width: '100%', textAlign: 'left',
    marginBottom: 4,
  },
  tabActive: {
    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
    color: '#fff',
    boxShadow: '0 4px 10px -3px rgba(15,84,76,.6)',
  },
  tabSvg: { width: 15, height: 15, flexShrink: 0 },
  modalContentCol: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  modalBody: { padding: '20px 22px', overflowY: 'auto', flex: 1 },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: teal[700], margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8,
  },
  sectionTitleAfter: { flex: 1, height: 1, background: VAR_STYLES.line },
  grid2: { display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' },
  grid3: { display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr' },
  grid4: { display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr 1fr' },
  field: {},
  fieldLabel: { fontSize: 12, fontWeight: 600, color: VAR_STYLES.textDim, marginBottom: 5, display: 'block' },
  req: { color: VAR_STYLES.danger },
  input: {
    width: '100%', fontFamily: 'Inter, sans-serif', fontSize: 13.5,
    padding: '9px 12px', borderRadius: 9, border: `1px solid ${VAR_STYLES.line}`,
    background: '#fff', color: VAR_STYLES.text, outline: 'none', lineHeight: 1.4,
  },
  textarea: {
    width: '100%', fontFamily: 'Inter, sans-serif', fontSize: 13.5,
    padding: '9px 12px', borderRadius: 9, border: `1px solid ${VAR_STYLES.line}`,
    background: '#fff', color: VAR_STYLES.text, outline: 'none', lineHeight: 1.4,
    resize: 'vertical', minHeight: 64,
  },
  mono: { fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums' },
  prefixInput: { position: 'relative' as const },
  prefixSpan: {
    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5, color: VAR_STYLES.textDim, fontWeight: 600,
  },
  fieldHint: { fontSize: 11.5, color: VAR_STYLES.textDim, marginTop: 4 },
  statusRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: VAR_STYLES.paper, border: `1px solid ${VAR_STYLES.line}`, borderRadius: 11,
    padding: '11px 14px',
  },
  statusLabel: { fontSize: 13, fontWeight: 600 },
  statusSub: { fontSize: 11.5, color: VAR_STYLES.textDim, marginTop: 1 },
  switch: {
    width: 38, height: 22, borderRadius: 100, background: VAR_STYLES.line,
    position: 'relative' as const, cursor: 'pointer', flexShrink: 0,
  },
  switchOn: { background: teal[600] },
  switchKnob: {
    position: 'absolute', width: 18, height: 18, borderRadius: '50%',
    background: '#fff', top: 2, left: 2, transition: 'left .15s ease', boxShadow: VAR_STYLES.shadowSm,
  },
  switchKnobOn: { left: 18 },
  variantList: { border: `1px solid ${VAR_STYLES.line}`, borderRadius: 11, overflow: 'hidden' },
  variantRow: {
    display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr auto',
    gap: 10, alignItems: 'center',
    padding: '10px 14px', borderBottom: `1px solid ${VAR_STYLES.paperDim}`,
    fontSize: 13,
  },
  variantRowHead: {
    background: VAR_STYLES.paper, fontSize: 11.5, fontWeight: 700, color: VAR_STYLES.textDim,
    textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 14px',
  },
  variantInput: {
    fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '7px 9px', borderRadius: 7,
    border: `1px solid ${VAR_STYLES.line}`, width: '100%', outline: 'none',
  },
  variantAmt: { fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 600, textAlign: 'right' as const },
  variantRemove: {
    width: 24, height: 24, borderRadius: 7, border: `1px solid ${VAR_STYLES.line}`,
    background: '#fff', color: VAR_STYLES.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0,
  },
  addVariant: {
    display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px',
    fontSize: 12.5, fontWeight: 600, color: teal[600], cursor: 'pointer',
    borderTop: `1px dashed ${VAR_STYLES.line}`,
  },
  chipGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  chip: {
    border: `1.5px solid ${VAR_STYLES.line}`, borderRadius: 10, padding: '10px 12px',
    cursor: 'pointer', background: '#fff',
  },
  chipActive: {
    border: `1.5px solid ${teal[400]}`, background: `linear-gradient(135deg, ${teal[50]}, #FFFFFF)`,
    boxShadow: `0 0 0 1px ${teal[400]} inset`,
  },
  chipTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  chipName: { fontSize: 12.5, fontWeight: 600 },
  chipPrice: { fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, color: VAR_STYLES.ink700 },
  chipCheck: { width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${VAR_STYLES.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipCheckActive: { background: teal[600], border: `1.5px solid ${teal[600]}` },
  costStrip: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10,
    background: VAR_STYLES.paper, border: `1px solid ${VAR_STYLES.line}`, borderRadius: 11, padding: '14px 16px',
  },
  costItem: {},
  costItemK: { fontSize: 11.5, color: VAR_STYLES.textDim, fontWeight: 600, marginBottom: 3 },
  costItemV: { fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 700 },
  methodRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  method: {
    border: `1.5px solid ${VAR_STYLES.line}`, borderRadius: 10, padding: '12px 13px', cursor: 'pointer',
    background: '#fff',
  },
  methodActive: { border: `1.5px solid ${teal[400]}`, background: `linear-gradient(135deg, ${teal[50]}, #FFFFFF)` },
  methodName: { fontSize: 13, fontWeight: 600, marginBottom: 3 },
  methodDesc: { fontSize: 11.5, color: VAR_STYLES.textDim, lineHeight: 1.4 },
  modalFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 22px', borderTop: `1px solid ${VAR_STYLES.line}`, flexShrink: 0,
  },
  footerNote: { fontSize: 11.5, color: VAR_STYLES.textDim },
  footerActions: { display: 'flex', gap: 8 },
  btn: {
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
    padding: '9px 18px', borderRadius: 9, border: `1.4px solid ${VAR_STYLES.line}`,
    background: '#fff', color: VAR_STYLES.textDim, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.4,
  },
  btnPrimary: {
    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
    color: '#fff', border: 'none',
    boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
  },
  btnDanger: {
    background: `linear-gradient(135deg, ${VAR_STYLES.danger}, #7A2020)`,
    color: '#fff', border: 'none',
  },
  badge: { fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 100 },
  badgeTeal: { background: VAR_STYLES.teal050, color: VAR_STYLES.ink700 },
  badgeAmber: { background: VAR_STYLES.amberSoft, color: '#8a5c1f' },
  badgePurple: { background: VAR_STYLES.purpleSoft, color: VAR_STYLES.purple },
  markupWarn: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: VAR_STYLES.danger,
    background: VAR_STYLES.dangerSoft, padding: '6px 10px', borderRadius: 100, marginTop: 10, width: 'fit-content',
  },
  bomSubOverlay: {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: 'rgba(15, 23, 42, 0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  bomSubModal: { width: '100%', maxWidth: 480, background: VAR_STYLES.card, borderRadius: 18, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 120px)', position: 'relative' },
  bomList: { border: `1px solid ${VAR_STYLES.line}`, borderRadius: 11, overflow: 'hidden' },
  bomRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '9px 14px', borderBottom: `1px solid ${VAR_STYLES.paperDim}`, fontSize: 13,
  },
  bomTotalRow: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '13px 14px', background: VAR_STYLES.paper, borderTop: `1px solid ${VAR_STYLES.line}`,
    fontWeight: 700, fontSize: 13.5,
  },
  bomTotalAmt: { fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums', fontSize: 18, color: VAR_STYLES.ink700 },
  bomRateNote: { fontSize: 11, color: VAR_STYLES.textDim, marginTop: 10, lineHeight: 1.5 },
  bomCostRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: VAR_STYLES.paper, border: `1px solid ${VAR_STYLES.line}`, borderRadius: 10 },
  bomCostLabel: { fontSize: 13, fontWeight: 700, color: VAR_STYLES.ink700 },
  bomCostValue: { fontFamily: 'JetBrains Mono, monospace', fontVariantNumeric: 'tabular-nums', fontSize: 18, fontWeight: 700, color: VAR_STYLES.teal600 },
  aiGenBtn: {
    fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
    padding: '5px 11px', borderRadius: 8, border: 'none',
    background: `linear-gradient(135deg, ${VAR_STYLES.purple}, #6D44B8)`,
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  aiGenBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  descRow: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  descTextarea: { flex: 1, minHeight: 80 },
  briefCard: {
    border: `1px solid ${VAR_STYLES.line}`,
    borderRadius: 12,
    padding: '14px 14px 10px',
    background: VAR_STYLES.card,
  },
  briefHead: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, fontWeight: 700, color: VAR_STYLES.ink900 },
  briefItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: `1px solid ${VAR_STYLES.paperDim}` },
  briefLabel: { color: VAR_STYLES.textDim, fontWeight: 500 },
  briefValue: { fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  bomEditBtn: {
    fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 600,
    padding: '6px 10px', borderRadius: 7, border: `1px solid ${VAR_STYLES.line}`,
    background: '#fff', color: VAR_STYLES.ink900, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
  },
};

function formatCurrency(amount: number, symbol: string): string {
  const sign = amount < 0 ? '-' : '';
  return sign + symbol + ' ' + Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function barFillStyle(pct: number, color: string): React.CSSProperties {
  return { height: '100%', width: `${Math.max(pct, 2)}%`, borderRadius: 4, background: color, transition: 'width 0.3s ease' };
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div style={s.field}>
      <label style={s.fieldLabel}>
        {label} {required && <span style={s.req}>*</span>}
      </label>
      {children}
      {hint && <p style={s.fieldHint}>{hint}</p>}
    </div>
  );
}

export const ItemModal: React.FC<Props> = ({ open, item, onClose, onSave, allItems, sourceTab }) => {
  const { addItem, updateItem, deleteItem } = useInventory();
  const { companyConfig, notify, user: USER } = useAuth();
  const currencySymbol = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  const defaultMarkup = companyConfig?.pricingSettings?.defaultMarkup ?? 20;

  const [category, setCategory] = useState<Category>('raw');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [skuManuallySet, setSkuManuallySet] = useState(false);
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [skuError, setSkuError] = useState('');
  const [pricingWarning, setPricingWarning] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const dirtyRef = useRef(false);

  // Raw material
  const [rawBuyUnit, setRawBuyUnit] = useState('Ream');
  const [rawUseUnit, setRawUseUnit] = useState('Sheet');
  const [rawConvRate, setRawConvRate] = useState(500);
  const [rawBuyCost, setRawBuyCost] = useState(0);
  const [rawStock, setRawStock] = useState(0);
  const [rawReorder, setRawReorder] = useState(0);
  const [rawSupplier, setRawSupplier] = useState('');
  const [rawLocation, setRawLocation] = useState('');
  const [rawConsumableType, setRawConsumableType] = useState<'consumable' | 'non_consumable'>('consumable');
  const [rawCategory, setRawCategory] = useState<string>('');

  // Product
  const [variants, setVariants] = useState<{ name: string; bomCost: number; cost: number; selling: number; bomPages?: number; bomCovers?: number; bomStaples?: number; bomTape?: number }[]>([]);
  const [productPaperCost, setProductPaperCost] = useState(0);
  const [productTonerCost, setProductTonerCost] = useState(0);
  const [productFinishCost, setProductFinishCost] = useState(0);
  const [productStock, setProductStock] = useState(0);
  const [productReorder, setProductReorder] = useState(0);
  const [productSP, setProductSP] = useState(0);

  // Service
  const [pricingMethod, setPricingMethod] = useState<'per_page' | 'per_job' | 'per_sheet'>('per_page');
  const [servicePaperCost, setServicePaperCost] = useState(0);
  const [serviceTonerCost, setServiceTonerCost] = useState(0);
  const [serviceFinishing, setServiceFinishing] = useState<{ name: string; price: number; active: boolean; quantity?: number }[]>([]);
  const [serviceSP, setServiceSP] = useState(0);
  const [turnaround, setTurnaround] = useState('');
  const [rushSurcharge, setRushSurcharge] = useState(0);
  const [trackStock, setTrackStock] = useState(false);
  const [serviceStock, setServiceStock] = useState(0);
  const [serviceReorder, setServiceReorder] = useState(0);

  // Stationery
  const [statVariants, setStatVariants] = useState<{ name: string; qtyPack: number; packCost: number; sellItem: number }[]>([]);
  const [statQtyPack, setStatQtyPack] = useState(0);
  const [statPackCost, setStatPackCost] = useState(0);
  const [statSP, setStatSP] = useState(0);
  const [statTotalStock, setStatTotalStock] = useState(0);
  const [statReorder, setStatReorder] = useState(0);
  const [statSupplier, setStatSupplier] = useState('');
  const [costingMethod, setCostingMethod] = useState<'weighted_average' | 'fifo' | 'standard'>('weighted_average');

  // BOM Builder
  const [bomOpen, setBomOpen] = useState(false);
  const [bomVariantIdx, setBomVariantIdx] = useState(0);
  const [bomPages, setBomPages] = useState(96);
  const [bomCovers, setBomCovers] = useState(2);
  const [bomStaples, setBomStaples] = useState(2);
  const [bomTape, setBomTape] = useState(0);

  // Product-level BOM (used when no variants exist)
  const [productBomPages, setProductBomPages] = useState(96);
  const [productBomCovers, setProductBomCovers] = useState(2);
  const [productBomStaples, setProductBomStaples] = useState(2);
  const [productBomTape, setProductBomTape] = useState(0);

  const isEditing = !!item?.id;

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    type?: ConfirmDialogType;
    onConfirm?: () => void;
  }>({ open: false, title: '', message: '' });

  const handleRequestClose = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmState({
        open: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        type: 'warning',
        confirmText: 'Discard',
        onConfirm: () => {
          onClose();
        }
      });
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setName(item.name || '');
      setSku(item.sku || '');
      setDescription(item.description || '');
      setActive(item.status !== 'Inactive');

      if ((item as any).classification === 'printing_service' || item.type === 'Service') setCategory('service');
      else if (item.type === 'Product' || (item as any).classification === 'product') setCategory('product');
      else if (item.type === 'Stationery' || (item as any).classification === 'stationery') setCategory('stationery');
      else setCategory('raw');

      setCostingMethod((item as any).costingMethod || 'weighted_average');

      const sp = item.smartPricing as any;

      if (item.type === 'Raw Material') {
        setRawBuyCost(sp?.paperCost || item.cost_price || item.cost || 0);
        setRawStock(item.stock || 0);
        setRawReorder(item.reorderPoint || 0);
        setRawSupplier(item.preferredSupplierId || '');
        setRawLocation(item.binLocation || '');
        setRawBuyUnit((item as any).purchaseUnit || (item as any).usageUnit || 'Ream');
        setRawUseUnit((item as any).usageUnit || 'Sheet');
        setRawConvRate((item as any).conversionRate || (item as any).conversion_rate || (item as any).conversionFactor || 500);
        setRawConsumableType((item as any).rawMaterialCategory || 'consumable');
        setRawCategory((item as any).category || '');
      }

      if (item.type === 'Product') {
        setProductBomPages((item as any).bomPages ?? 96);
        setProductBomCovers((item as any).bomCovers ?? 2);
        setProductBomStaples((item as any).bomStaples ?? 2);
        setProductBomTape((item as any).bomTape ?? 0);
        if ((sp?.paperCost || sp?.tonerCost || sp?.finishingCost)) {
          setProductPaperCost(sp.paperCost || 0);
          setProductTonerCost(sp.tonerCost || 0);
          setProductFinishCost(sp.finishingCost || 0);
        } else {
          setProductPaperCost(0);
          setProductTonerCost(0);
          setProductFinishCost(0);
        }
        setProductStock(0);
        setProductReorder(0);
        setProductSP(item.sellingPrice || item.price || 0);
      }

      if (item.type === 'Service') {
        setPricingMethod((item as any).pricingConfig?.pricingMethod || 'per_job');
        setServicePaperCost(sp?.paperCost || 0);
        setServiceTonerCost(sp?.tonerCost || 0);
        setServiceSP(item.sellingPrice || item.price || 0);
        setServiceStock(0);
        setServiceReorder(0);
        setTurnaround((item as any).pricingConfig?.turnaround || '');
        setRushSurcharge((item as any).pricingConfig?.rushSurcharge || 0);
        setTrackStock(false);
      }

      if (item.type === 'Stationery') {
        setStatTotalStock(item.stock || 0);
        setStatReorder(item.reorderPoint || 0);
        setStatSupplier(item.preferredSupplierId || '');
        setStatQtyPack((item as any).qtyPack || 12);
        setStatPackCost((item as any).packCost || 0);
        setStatSP(item.selling_price || item.price || 0);
      }

      const loadedVariants = (item as any).variants;
      if (loadedVariants && loadedVariants.length > 0) {
        setVariants(loadedVariants.map((v: any) => ({
          name: v.name || '',
          bomCost: v.bomCost ?? v.costPrice ?? 0,
          cost: v.costPrice ?? v.cost ?? 0,
          selling: v.sellingPrice ?? v.selling ?? 0,
          bomPages: v.bomPages,
          bomCovers: v.bomCovers,
          bomStaples: v.bomStaples,
          bomTape: v.bomTape,
        })));
      } else {
        setVariants([]);
      }
      const loadedStatVariants = (item as any).variants as any;
      if (loadedStatVariants && item.type === 'Stationery') {
        if (loadedStatVariants.length > 0) {
          setStatVariants(loadedStatVariants.map((v: any) => ({
            name: v.name || '',
            qtyPack: v.unitsPerPack || 12,
            packCost: v.costPerPack || 0,
            sellItem: v.sellingPrice || 0,
          })));
        } else {
          setStatVariants([]);
        }
      }
    } else {
      setName('');
      setDescription('');
      setActive(true);
      setSkuManuallySet(false);
       const initialCategory = categoryFromSourceTab(sourceTab);
      setCategory(initialCategory);
      const initialSku = generateAutoSKU(initialCategory, '', undefined, allItems);
      setSku(initialSku);
      setRawBuyCost(0);
      setRawStock(0);
      setRawReorder(0);
      setRawSupplier('');
      setRawLocation('');
      setRawConsumableType('consumable');
      setProductBomPages(96);
      setProductBomCovers(2);
      setProductBomStaples(2);
      setProductBomTape(0);
      setProductPaperCost(0);
      setProductTonerCost(0);
      setProductFinishCost(0);
      setProductStock(0);
      setProductReorder(0);
      setProductSP(0);
      setServicePaperCost(0);
      setServiceTonerCost(0);
      setServiceSP(0);
      setServiceStock(0);
      setServiceReorder(0);
      setTurnaround('');
      setRushSurcharge(0);
      setTrackStock(false);
      setVariants([]);
      setStatVariants([]);
      setStatQtyPack(12);
      setStatPackCost(0);
      setStatSP(0);
      setStatTotalStock(0);
      setStatReorder(0);
      setStatSupplier('');
      setCostingMethod('weighted_average');
    }
  }, [open, item, sourceTab, allItems]);

  /* Auto-scroll to active category tab in side nav */
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      const activeTab = document.querySelector(`[data-category-tab="${category}"]`) as HTMLElement;
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
    return () => clearTimeout(timeout);
  }, [open, category]);

  /* Auto-generate SKU when name or category changes and SKU hasn't been manually set */
  useEffect(() => {
    if (!open) return;
    if (isEditing) return;            /* don't overwrite existing item's SKU */
    if (!name.trim()) return;
    if (skuManuallySet) return;
    const generated = generateAutoSKU(category, name, undefined, allItems);
    if (generated) setSku(generated);
  }, [name, category, open, isEditing, skuManuallySet, allItems]);

  /* Resolve a raw material's conversion rate no matter which field it was
     persisted under. The DB column is snake_case `conversion_rate`
     (see backend/db.cjs), but items created/edited through this modal are
     saved as camelCase `conversionRate`/`conversionFactor`, and some flows
     nest it under `smartPricing.conversionRate`. Reading only one of these
     silently falls back to a rate of 1, which turns the item's full
     cost_price into a per-unit rate (e.g. a K12,000 toner cartridge priced
     as K12,000/page instead of being divided by its page yield). */
  const getItemConversionRate = (item: any, fallback = 1): number => {
    const rate = item?.conversionRate
      ?? item?.conversion_rate
      ?? item?.conversionFactor
      ?? item?.smartPricing?.conversionRate
      ?? fallback;
    return rate > 0 ? rate : fallback;
  };

  const rawCategoryOf = (item: any): string =>
    String((item as any)?.category ?? (item as any)?.material ?? (item as any)?.rawCategory ?? '').toLowerCase();

  /* Resolve which raw material drives a BOM rate. Scanning by name alone is
     ambiguous: e.g. "Fuser Paper" or "Glossy Paper" also match /paper|bond/,
     and whichever item appears first in the list silently wins — producing
     rates that contradict the item's own Cost Summary. We therefore score
     candidates: an explicit category match (Paper/Toner/Staple/…) outranks a
     name-only match, and a stored conversion rate (i.e. a real bulk-priced
     material) outranks an item with no rate. Ties keep list order. */
  const resolveRawMaterial = (rawItems: any[], namePattern: RegExp, categoryKeywords: string[]): any | undefined => {
    const candidates = rawItems.filter(i =>
      namePattern.test(String(i?.name || '')) ||
      categoryKeywords.some(k => rawCategoryOf(i).includes(k))
    );
    if (candidates.length <= 1) return candidates[0];
    return candidates
      .map(item => ({
        item,
        score:
          (categoryKeywords.some(k => rawCategoryOf(item).includes(k)) ? 10 : 0) +
          (namePattern.test(String(item?.name || '')) ? 5 : 0) +
          (getItemConversionRate(item) > 1 ? 2 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0].item;
  };

  /* Derive paper/toner costs from raw material items.
     This always applies the live inventory rate (cost_price ÷ conversion
     rate) so BOM Materials tracks inventory changes and conversion-rate
     fixes. Previously this only filled in the cost when the field was
     empty (`prev || cost`), so an existing item's frozen smartPricing
     snapshot — set on load just above — would never be replaced by the
     corrected live rate. It now only falls back to that snapshot when the
     matching raw material can't be found in inventory at all (e.g. it was
     deleted). */
  useEffect(() => {
    if (!open || !allItems) return;
    const rawItems = allItems.filter(i => i.type === 'Raw Material' || (i as any).classification === 'raw');
    const paperItem = resolveRawMaterial(rawItems, /paper|bond/i, ['paper', 'bond']);
    const tonerItem = resolveRawMaterial(rawItems, /toner|ink|cartridge/i, ['toner', 'ink', 'cartridge']);
    if (paperItem) {
      const rate = getItemConversionRate(paperItem);
      const cost = (paperItem.cost_price || paperItem.cost || 0) / rate;
      if (category === 'product') setProductPaperCost(cost);
      if (category === 'service') setServicePaperCost(cost);
    }
    if (tonerItem) {
      const rate = getItemConversionRate(tonerItem);
      const cost = (tonerItem.cost_price || tonerItem.cost || 0) / rate;
      if (category === 'service') setServiceTonerCost(cost);
      if (category === 'product') setProductTonerCost(cost);
    }
  }, [open, allItems, category]);

  const rawUnitCost = useMemo(() => {
    const rate = rawConvRate || 1;
    return rate > 0 ? rawBuyCost / rate : 0;
  }, [rawBuyCost, rawConvRate]);

  const serviceFinishingTotal = useMemo(() =>
    serviceFinishing.filter(f => f.active).reduce((s, f) => s + f.price * (f.quantity || 1), 0),
    [serviceFinishing]
  );

  const bomRates = useMemo(() => {
    const rawItems = allItems?.filter(i => i.type === 'Raw Material' || (i as any).classification === 'raw') || [];
    const paperItem = resolveRawMaterial(rawItems, /paper|bond/i, ['paper', 'bond']);
    const tonerItem = resolveRawMaterial(rawItems, /toner|ink|cartridge/i, ['toner', 'ink', 'cartridge']);
    const coverItem = resolveRawMaterial(rawItems, /card|cover|board/i, ['cover', 'card', 'board']);
    const stapleItem = resolveRawMaterial(rawItems, /staple/i, ['staple']);
    const tapeItem = resolveRawMaterial(rawItems, /tape/i, ['tape']);
    const rateOf = (item: any, fallback: number) => item ? ((item.cost_price || item.cost || 0) / getItemConversionRate(item)) : fallback;
    return {
      paper: rateOf(paperItem, BOM_DEFAULT_RATES.paper),
      toner: rateOf(tonerItem, BOM_DEFAULT_RATES.toner),
      cover: rateOf(coverItem, BOM_DEFAULT_RATES.cover),
      staple: rateOf(stapleItem, BOM_DEFAULT_RATES.staple),
      tape: rateOf(tapeItem, BOM_DEFAULT_RATES.tape),
      sources: {
        paper: paperItem?.name || '',
        toner: tonerItem?.name || '',
        cover: coverItem?.name || '',
        staple: stapleItem?.name || '',
        tape: tapeItem?.name || '',
      },
    };
  }, [allItems]);

  const productBomTotal = useMemo(() => {
    return Math.ceil(productBomPages / PAGES_PER_SHEET) * bomRates.paper
      + productBomPages * bomRates.toner
      + productBomCovers * bomRates.cover
      + productBomStaples * bomRates.staple
      + productBomTape * bomRates.tape;
  }, [productBomPages, productBomCovers, productBomStaples, productBomTape, bomRates]);

  const bomRateLabel = (key: keyof typeof BOM_DEFAULT_RATES, unit: string): string => {
    const label = { paper: 'Paper', toner: 'Toner', cover: 'Cover', staple: 'Staple', tape: 'Binding Tape' }[key];
    const source = bomRates.sources[key];
    return `${label} ${formatCurrency(bomRates[key], currencySymbol)}/${unit}${source ? ` (${source})` : ''}`;
  };

  const productBase = useMemo(() => {
    if (productBomTotal > 0) return productBomTotal;
    const variantsWithBom = variants.filter(v => v.bomCost > 0);
    if (variantsWithBom.length > 0) {
      return variantsWithBom.reduce((sum, v) => sum + v.bomCost, 0) / variantsWithBom.length;
    }
    return productPaperCost + productTonerCost + productFinishCost;
  }, [productPaperCost, productTonerCost, productFinishCost, variants, productBomTotal]);
  const effectiveProductSP = useMemo(() => {
    if (productSP > 0) return productSP;
    const variantsWithSell = variants.filter(v => v.selling > 0);
    if (variantsWithSell.length > 0) {
      return variantsWithSell.reduce((sum, v) => sum + v.selling, 0) / variantsWithSell.length;
    }
    return productSP;
  }, [productSP, variants]);
  const productProfit = useMemo(() => effectiveProductSP - productBase, [effectiveProductSP, productBase]);
  const productMarkup = useMemo(() => productBase > 0 ? (productProfit / productBase) * 100 : 0, [productProfit, productBase]);

  const serviceBase = useMemo(() => servicePaperCost + serviceTonerCost + serviceFinishingTotal, [servicePaperCost, serviceTonerCost, serviceFinishingTotal]);
  const serviceProfit = useMemo(() => serviceSP - serviceBase, [serviceSP, serviceBase]);
  const serviceMarkup = useMemo(() => serviceBase > 0 ? (serviceProfit / serviceBase) * 100 : 0, [serviceProfit, serviceBase]);

  const globalFinishingOptions = useMemo<FinishingOption[]>(() => {
    const TURNAROUND_IDS = new Set(['standardTurnaround', 'rushSurcharge', 'standard_turnaround', 'rush_surcharge']);
    const fromConfig = companyConfig?.productionSettings?.finishingOptions;
    if (fromConfig && fromConfig.length > 0) return fromConfig.filter(o => !TURNAROUND_IDS.has(o.id));
    return [
      { id: 'binding', name: 'Binding', enabled: false, price: Math.round(bomRates.tape * 100) / 100 || 1.20, description: 'Book binding - comb or spiral', items: [], quantity: 1 },
      { id: 'coverPages', name: 'Cover Pages', enabled: false, price: Math.round(bomRates.cover * 100) / 100 || 15.00, description: 'Front and back cover pages per copy', items: [], quantity: 1 },
      { id: 'cutting', name: 'Cutting & Trimming', enabled: false, price: 30, description: 'Trim edges to clean finish', items: [], batchSize: 10 },
      { id: 'holePunch', name: 'Hole Punching', enabled: false, price: 20, description: 'Punch holes for folder binding', items: [], batchSize: 10 },
      { id: 'folding', name: 'Folding', enabled: false, price: 15, description: 'Fold pages for insertion', items: [], batchSize: 10 },
      { id: 'stapling', name: 'Stapling', enabled: false, price: Math.round(bomRates.staple * 100) / 100 || 0.50, description: 'Corner or saddle stapling', items: [] },
    ];
  }, [companyConfig, bomRates]);

  useEffect(() => {
    if (!open) return;
    const defCovers = globalFinishingOptions.find(o => o.id === 'coverPages')?.quantity ?? 2;
    const defStaples = globalFinishingOptions.find(o => o.id === 'stapling')?.quantity ?? 2;
    const defTape = globalFinishingOptions.find(o => o.id === 'binding')?.quantity ?? 0;
    if (item) {
      const saved = item as any;
      setProductBomCovers(saved.bomCovers ?? saved.productBomCovers ?? defCovers);
      setProductBomStaples(saved.bomStaples ?? saved.productBomStaples ?? defStaples);
      setProductBomTape(saved.bomTape ?? saved.productBomTape ?? defTape);
      const TURNAROUND_IDS = new Set(['standardTurnaround', 'rushSurcharge', 'standard_turnaround', 'rush_surcharge']);
      const savedFinishing = saved.pricingConfig?.finishingOptions || saved.smartPricing?.finishingOptions;
      if (savedFinishing && savedFinishing.length > 0) {
        setServiceFinishing(savedFinishing.filter((o: any) => !TURNAROUND_IDS.has(o.id)).map((o: any) => ({ name: o.name || o.id || '', price: Number(o.price) || 0, active: o.enabled ?? true, quantity: Number(o.quantity) || 1 })));
        return;
      }
    } else {
      setProductBomCovers(defCovers);
      setProductBomStaples(defStaples);
      setProductBomTape(defTape);
    }
    setServiceFinishing(globalFinishingOptions.map(o => ({ name: o.name, price: o.price, active: false, quantity: o.quantity || 1 })));
  }, [open, item, globalFinishingOptions]);

  const statBlend = useMemo(() => {
    const rows = statVariants.filter(v => v.name.trim());
    if (rows.length === 0) {
      const cpt = statQtyPack > 0 ? statPackCost / statQtyPack : 0;
      return { avgCost: cpt, avgSell: statSP, profit: statSP - cpt, margin: statSP > 0 ? ((statSP - cpt) / statSP) * 100 : 0 };
    }
    let costSum = 0;
    const sellRows: number[] = [];
    rows.forEach(v => {
      const costPerItem = v.qtyPack > 0 ? v.packCost / v.qtyPack : 0;
      costSum += costPerItem;
      sellRows.push(v.sellItem);
    });
    const avgCost = costSum / rows.length;
    const avgSell = sellRows.reduce((s, p) => s + p, 0) / rows.length;
    const profit = avgSell - avgCost;
    const margin = avgSell > 0 ? (profit / avgSell) * 100 : 0;
    return { avgCost, avgSell, profit, margin };
  }, [statVariants, statQtyPack, statPackCost, statSP]);

  const renderBrief = () => {
    if (category === 'raw') {
      return (
        <>
          <div style={s.briefItem}><span style={s.briefLabel}>Cost / {rawUseUnit}</span><span style={s.briefValue}>{formatCurrency(rawUnitCost, currencySymbol)}</span></div>
          <div style={s.briefItem}><span style={s.briefLabel}>Cost / {rawBuyUnit}</span><span style={s.briefValue}>{formatCurrency(rawBuyCost, currencySymbol)}</span></div>
          <div style={s.briefItem}><span style={s.briefLabel}>Conversion</span><span style={s.briefValue}>1:{rawConvRate}</span></div>
        </>
      );
    }
    if (category === 'product') {
      const variantsWithBom = variants.filter(v => v.name.trim() && v.bomCost > 0);
      const bomBased = variantsWithBom.length > 0;
      return (
        <>
          {bomBased ? (
            <>
              <div style={s.briefItem}><span style={s.briefLabel}>BOM Variants</span><span style={s.briefValue}>{variantsWithBom.length} active</span></div>
              <div style={s.briefItem}><span style={s.briefLabel}>Avg BOM Cost</span><span style={s.briefValue}>{formatCurrency(productBase, currencySymbol)}</span></div>
              <div style={{ ...s.briefItem, borderBottom: 'none', marginTop: 4 }}><span style={s.briefLabel}>Total Base Price</span><span style={{ ...s.briefValue, color: VAR_STYLES.ink700, fontSize: 13 }}>{formatCurrency(productBase, currencySymbol)}</span></div>
            </>
          ) : (
            <>
              <div style={s.briefItem}><span style={s.briefLabel}>Paper</span><span style={s.briefValue}>{formatCurrency(productPaperCost, currencySymbol)}</span></div>
              <div style={s.briefItem}><span style={s.briefLabel}>Toner</span><span style={s.briefValue}>{formatCurrency(productTonerCost, currencySymbol)}</span></div>
              {(productBomCovers > 0 || productBomStaples > 0 || productBomTape > 0 || productFinishCost > 0) && (
                <div style={s.briefItem}>
                  <span style={s.briefLabel}>Finishing</span>
                  <span style={s.briefValue}>
                    {formatCurrency(
                      (productBomCovers * bomRates.cover) +
                      (productBomStaples * bomRates.staple) +
                      (productBomTape * bomRates.tape) +
                      productFinishCost,
                      currencySymbol
                    )}
                  </span>
                </div>
              )}
              <div style={{ ...s.briefItem, borderBottom: 'none', marginTop: 4 }}><span style={s.briefLabel}>Total Base Price</span><span style={{ ...s.briefValue, color: VAR_STYLES.ink700, fontSize: 13 }}>{formatCurrency(productBase, currencySymbol)}</span></div>
            </>
          )}
          <div style={s.briefItem}><span style={s.briefLabel}>Avg Sell Price</span><span style={{ ...s.briefValue, color: VAR_STYLES.teal500 }}>{formatCurrency(effectiveProductSP, currencySymbol)}</span></div>
          <div style={{ ...s.briefItem, borderBottom: 'none' }}>
            <span style={s.briefLabel}>Avg Profit</span>
            <span style={{ ...s.briefValue, color: productProfit < 0 ? VAR_STYLES.danger : VAR_STYLES.teal600 }}>{formatCurrency(productProfit, currencySymbol)}</span>
          </div>
        </>
      );
    }
    if (category === 'service') {
      return (
        <>
          <div style={s.briefItem}><span style={s.briefLabel}>Paper</span><span style={s.briefValue}>{formatCurrency(servicePaperCost, currencySymbol)}</span></div>
          <div style={s.briefItem}><span style={s.briefLabel}>Toner</span><span style={s.briefValue}>{formatCurrency(serviceTonerCost, currencySymbol)}</span></div>
          <div style={{ ...s.briefItem, borderBottom: 'none' }}><span style={s.briefLabel}>Finishing</span><span style={s.briefValue}>{formatCurrency(serviceFinishingTotal, currencySymbol)}</span></div>
        </>
      );
    }
    return (
      <>
        <div style={s.briefItem}><span style={s.briefLabel}>Avg Cost</span><span style={s.briefValue}>{formatCurrency(statBlend.avgCost, currencySymbol)}</span></div>
        <div style={s.briefItem}><span style={s.briefLabel}>Avg Sell</span><span style={s.briefValue}>{formatCurrency(statBlend.avgSell, currencySymbol)}</span></div>
        <div style={{ ...s.briefItem, borderBottom: 'none' }}>
          <span style={s.briefLabel}>Profit</span>
          <span style={{ ...s.briefValue, color: statBlend.profit < 0 ? VAR_STYLES.danger : VAR_STYLES.teal600 }}>{formatCurrency(statBlend.profit, currencySymbol)}</span>
        </div>
        <div style={s.briefItem}><span style={s.briefLabel}>Margin</span><span style={s.briefValue}>{statBlend.margin.toFixed(1)}%</span></div>
      </>
    );
  };

  const handleGenerateDescription = useCallback(async () => {
    if (!name.trim()) { notify?.('Enter an item name first', 'error'); return; }
    setAiGenerating(true);
    try {
      const categoryLabel = titleMap[category];
      const priceInfo = category === 'raw' ? `Cost per unit: ${formatCurrency(rawUnitCost, currencySymbol)}` :
        category === 'product' ? `Base cost: ${formatCurrency(productBase, currencySymbol)}, Selling: ${formatCurrency(effectiveProductSP, currencySymbol)}` :
        category === 'service' ? `Base cost: ${formatCurrency(serviceBase, currencySymbol)}, Selling: ${formatCurrency(serviceSP, currencySymbol)}` :
        `Selling: ${formatCurrency(statBlend.avgSell, currencySymbol)}`;
      const prompt = `Generate a concise 2-3 sentence professional product description for the following item:\n\nName: ${name}\nCategory: ${categoryLabel}\nSKU: ${sku || 'Auto-generated'}\n${priceInfo}\n\nDescription should be factual, highlight typical use cases, and suitable for a printing business catalog.`;
      const result = await aiService.generateAIResponse(prompt, 'You are a professional product catalog writer. Write clear, concise descriptions. Do not use markdown. Do not add disclaimers.');
      setDescription(result.trim());
      dirtyRef.current = true;
      notify?.('Description generated', 'success');
    } catch (err: any) {
      notify?.(`AI generation failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setAiGenerating(false);
    }
  }, [name, category, sku, rawUnitCost, productBase, productSP, serviceBase, serviceSP, statBlend, currencySymbol, notify]);

  const handleSave = useCallback(async () => {
    const statHasVariants = statVariants.some(v => v.name.trim());
    const statItemCost = statQtyPack > 0 ? statPackCost / statQtyPack : 0;
    const statBase = statHasVariants ? statBlend.avgCost : statItemCost;
    const statSell = statHasVariants ? statBlend.avgSell : statSP;
    const statProfit = statHasVariants ? statBlend.profit : statSP - statItemCost;
    const statMarkup = statSell > 0 ? (statProfit / statSell) * 100 : 0;

    const effectiveBase = category === 'raw'
      ? rawBuyCost
      : category === 'product'
        ? productBase
        : category === 'service'
          ? serviceBase
          : statBase;

    const effectiveSell = category === 'raw'
      ? rawBuyCost
      : category === 'product'
        ? productSP
        : category === 'service'
          ? serviceSP
          : statSell;

    const effectiveProfit = category === 'raw'
      ? 0
      : category === 'product'
        ? productProfit
        : category === 'service'
          ? serviceProfit
          : statProfit;

    const effectiveMarkup = category === 'raw'
      ? 0
      : category === 'product'
        ? productMarkup
        : category === 'service'
          ? serviceMarkup
          : statMarkup;

    const baseItem: any = {
      id: item?.id || '',
      name,
      sku: sku || generateAutoSKU(category, name, undefined, allItems),
      type: category === 'raw' ? 'Raw Material' : category === 'product' ? 'Product' : category === 'service' ? 'Service' : 'Stationery',
      description,
      status: active ? 'Active' : 'Inactive',
      stock: category === 'raw' ? rawStock : category === 'stationery' ? statTotalStock : 0,
      cost: effectiveBase,
      cost_price: effectiveBase,
      price: effectiveSell,
      selling_price: effectiveSell,
      sellingPrice: effectiveSell,
      costPrice: effectiveBase,
      profitAmount: effectiveProfit,
      profitMargin: effectiveMarkup,
      minimumMargin: defaultMarkup,
      pricingValidated: category === 'product'
        ? productSP >= productBase * (1 + TARGET_MARKUP)
        : true,
      costingMethod: category !== 'service' ? costingMethod : undefined,
      updatedBy: USER?.id,
      ...(item?.id ? {} : { createdBy: USER?.id }),
    };

    let rawExtras: any = {};
    if (category === 'raw') {
      rawExtras = {
        category: rawCategory,
        purchaseUnit: rawBuyUnit,
        usageUnit: rawUseUnit,
        conversionRate: rawConvRate,
        consumptionUnit: rawUseUnit,
        conversionFactor: rawConvRate,
        reorderPoint: rawReorder,
        binLocation: rawLocation,
        preferredSupplierId: rawSupplier,
        rawMaterialCategory: rawConsumableType,
      };
    }

    let productExtras: any = {};
    if (category === 'product') {
      productExtras = {
        bomPages: productBomPages,
        bomCovers: productBomCovers,
        bomStaples: productBomStaples,
        bomTape: productBomTape,
        variants: variants.filter(v => v.name.trim() || v.bomCost > 0).map(v => ({
          name: v.name,
          costPrice: v.cost || v.bomCost,
          sellingPrice: v.selling,
          bomCost: v.bomCost,
          bomPages: v.bomPages,
          bomCovers: v.bomCovers,
          bomStaples: v.bomStaples,
          bomTape: v.bomTape,
        })),
        reorderPoint: 0,
        smartPricing: {
          paperCost: productPaperCost,
          tonerCost: productTonerCost,
          finishingCost: productFinishCost,
        },
      };
    }

    let serviceExtras: any = {};
    if (category === 'service') {
      serviceExtras = {
        pricingConfig: {
          pricingMethod,
          paperCost: servicePaperCost,
          tonerCost: serviceTonerCost,
          finishingOptions: serviceFinishing.filter(f => f.active),
          turnaround,
          rushSurcharge,
          trackStock: false,
          stockOnHand: 0,
          reorderPoint: 0,
        },
        reorderPoint: 0,
        stock: 0,
      };
    }

    let stationeryExtras: any = {};
    if (category === 'stationery') {
      const savedVariants = statVariants.filter(v => v.name.trim());
      stationeryExtras = {
        variants: savedVariants.map(v => ({
          name: v.name,
          costPrice: v.qtyPack > 0 ? v.packCost / v.qtyPack : 0,
          sellingPrice: v.sellItem,
          unitsPerPack: v.qtyPack,
          costPerPack: v.packCost,
        })),
        reorderPoint: statReorder,
        preferredSupplierId: statSupplier,
      };
      if (savedVariants.length === 0) {
        stationeryExtras.qtyPack = statQtyPack;
        stationeryExtras.packCost = statPackCost;
        stationeryExtras.sellingPrice = statSP;
      }
    }

    const finalItem: Item = {
      ...baseItem,
      ...rawExtras,
      ...productExtras,
      ...serviceExtras,
      ...stationeryExtras,
      unit: category === 'raw' ? rawUseUnit : category === 'stationery' ? 'Piece' : 'Booklet',
      classification: category === 'service' ? 'printing_service' : category === 'product' ? 'product' : category === 'stationery' ? 'stationery' : undefined,
    };

    if (!name.trim()) { notify?.('Item name is required', 'error'); return; }
    if (skuError) { notify?.(skuError, 'error'); return; }
    setSaving(true);
    try {
      if (onSave) {
        await onSave(finalItem);
        onClose();
      } else {
        if (item?.id) {
          await updateItem(finalItem);
          notify?.('Item updated successfully', 'success');
        } else {
          await addItem(finalItem);
          notify?.('Item created successfully', 'success');
        }
        onClose();
      }
    } catch (err: any) {
      notify?.(`Save failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [item, name, sku, category, description, active, skuError, rawStock, rawBuyCost, rawBuyUnit, rawUseUnit, rawConvRate, rawReorder, rawSupplier, rawLocation, rawConsumableType, variants, productPaperCost, productTonerCost, productFinishCost, productStock, productReorder, productSP, pricingMethod, servicePaperCost, serviceTonerCost, serviceFinishing, serviceSP, serviceStock, serviceReorder, turnaround, rushSurcharge, trackStock, statVariants, statTotalStock, statReorder, statSupplier, costingMethod, USER, allItems, onSave, addItem, updateItem, deleteItem, notify, onClose, serviceFinishingTotal, productBase, serviceBase, productProfit, serviceProfit, productMarkup, serviceMarkup, statBlend, TARGET_MARKUP]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleRequestClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!name.trim()) { setNameError('Item name is required'); return; }
    setNameError('');
  }, [name]);

  useEffect(() => {
    if (!sku.trim() || !skuManuallySet) { setSkuError(''); return; }
    const existing = allItems?.find(i => i.id !== item?.id && i.sku === sku.trim());
    setSkuError(existing ? `SKU "${sku}" is already used by "${existing.name}"` : '');
  }, [sku, skuManuallySet, allItems, item?.id]);

  useEffect(() => {
    if (category === 'product') {
      if (productSP > 0 && productBase > 0 && productSP < productBase) {
        setPricingWarning(`Selling price (${formatCurrency(productSP, currencySymbol)}) is below cost (${formatCurrency(productBase, currencySymbol)})`);
        return;
      }
    }
    if (category === 'service') {
      if (serviceSP > 0 && serviceBase > 0 && serviceSP < serviceBase) {
        setPricingWarning(`Selling price (${formatCurrency(serviceSP, currencySymbol)}) is below cost (${formatCurrency(serviceBase, currencySymbol)})`);
        return;
      }
    }
    setPricingWarning('');
  }, [category, productSP, productBase, serviceSP, serviceBase]);

  if (!open) return null;

  const titleMap: Record<Category, string> = {
    raw: 'Raw Material', product: 'Printing Product', service: 'Printing Service', stationery: 'Stationery',
  };

  const renderRawTab = () => (
    <div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Material Category</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setRawConsumableType('consumable')} style={{
            flex: 1, padding: '10px 16px', borderRadius: 8, border: `2px solid ${rawConsumableType === 'consumable' ? teal[400] : '#E2E8F0'}`,
            background: rawConsumableType === 'consumable' ? teal[50] : '#FFF', cursor: 'pointer', textAlign: 'center' as const,
            fontWeight: rawConsumableType === 'consumable' ? 600 : 400, fontSize: 13.5, color: rawConsumableType === 'consumable' ? teal[700] : '#64748B',
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>🔄</div>
            <div>Consumable</div>
            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>Paper, toner, ink — used up per job</div>
          </button>
          <button type="button" onClick={() => setRawConsumableType('non_consumable')} style={{
            flex: 1, padding: '10px 16px', borderRadius: 8, border: `2px solid ${rawConsumableType === 'non_consumable' ? teal[400] : '#E2E8F0'}`,
            background: rawConsumableType === 'non_consumable' ? teal[50] : '#FFF', cursor: 'pointer', textAlign: 'center' as const,
            fontWeight: rawConsumableType === 'non_consumable' ? 600 : 400, fontSize: 13.5, color: rawConsumableType === 'non_consumable' ? teal[700] : '#64748B',
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>⚙️</div>
            <div>Non-Consumable</div>
            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>Printer parts — wear out over time</div>
          </button>
        </div>
      </div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Category</p>
        <input type="text" style={s.input} value={rawCategory} onChange={e => setRawCategory(e.target.value)} placeholder="e.g. Paper, Toner, Ink, Binding" />
      </div>
      {rawConsumableType === 'non_consumable' && (
        <div style={s.section}>
          <p style={s.sectionTitle}>Cost Price</p>
          <Field label="Unit Cost" hint="What you pay per unit">
            <div style={s.prefixInput}>
              <span style={s.prefixSpan}>{currencySymbol}</span>
              <input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={rawBuyCost} onChange={e => setRawBuyCost(Number(e.target.value) || 0)} />
            </div>
          </Field>
        </div>
      )}
      {rawConsumableType === 'consumable' && (
        <div style={s.section}>
          <p style={s.sectionTitle}>Unit Conversion</p>
          <div style={s.grid3}>
            <Field label="Buying Unit" hint="The unit you purchase from your supplier">
              <select style={s.input} value={rawBuyUnit} onChange={e => setRawBuyUnit(e.target.value)}>
                <option>Ream</option><option>Roll</option><option>Box</option><option>Litre</option><option>Kilogram</option>
              </select>
            </Field>
            <Field label="Using Unit" hint="The unit consumed inside a BOM">
              <select style={s.input} value={rawUseUnit} onChange={e => setRawUseUnit(e.target.value)}>
                <option>Sheet</option><option>Meter</option><option>Piece</option><option>Millilitre</option><option>Gram</option>
              </select>
            </Field>
            <Field label="Conversion Rate" hint={`1 ${rawBuyUnit} = ${rawConvRate} ${rawUseUnit}s`}>
              <input type="number" style={{ ...s.input, ...s.mono }} value={rawConvRate} onChange={e => setRawConvRate(Number(e.target.value) || 0)} />
            </Field>
          </div>
        </div>
      )}
      {rawConsumableType === 'consumable' && (
        <div style={s.section}>
          <p style={s.sectionTitle}>Cost Input</p>
          <Field label={`Cost per ${rawBuyUnit}`} hint="What your supplier charges per buying unit">
            <div style={s.prefixInput}>
              <span style={s.prefixSpan}>{currencySymbol}</span>
              <input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={rawBuyCost} onChange={e => setRawBuyCost(Number(e.target.value) || 0)} />
            </div>
          </Field>
        </div>
      )}
      <div style={s.section}>
        <p style={s.sectionTitle}>Stock &amp; Reorder</p>
        <div style={s.grid2}>
          <Field label={`Stock on Hand (${rawUseUnit}s)`}>
            <input type="number" style={{ ...s.input, ...s.mono }} value={rawStock} onChange={e => setRawStock(Number(e.target.value) || 0)} />
          </Field>
          <Field label={`Reorder Level (${rawUseUnit}s)`} hint="Triggers a low-stock alert below this quantity">
            <input type="number" style={{ ...s.input, ...s.mono }} value={rawReorder} onChange={e => setRawReorder(Number(e.target.value) || 0)} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Storage Location">
            <input type="text" style={s.input} value={rawLocation} onChange={e => setRawLocation(e.target.value)} placeholder="e.g. Warehouse A, Shelf 3" />
          </Field>
        </div>
      </div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Supplier</p>
        <Field label="Preferred Supplier">
          <input type="text" style={s.input} value={rawSupplier} onChange={e => setRawSupplier(e.target.value)} placeholder="e.g. Kaziboni Stationers" />
        </Field>
      </div>
    </div>
  );

  const renderProductTab = () => {
    return (
    <div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Bill of Materials</p>
        <div style={{ ...s.grid4, marginBottom: 14 }}>
          <Field label="Pages"><input type="number" style={s.input} value={productBomPages} min={0} onChange={e => setProductBomPages(Number(e.target.value) || 0)} /></Field>
          <Field label="Covers"><input type="number" style={s.input} value={productBomCovers} min={0} onChange={e => setProductBomCovers(Number(e.target.value) || 0)} /></Field>
          <Field label="Staples"><input type="number" style={s.input} value={productBomStaples} min={0} onChange={e => setProductBomStaples(Number(e.target.value) || 0)} /></Field>
          <Field label="Tape (cm)"><input type="number" style={s.input} value={productBomTape} min={0} onChange={e => setProductBomTape(Number(e.target.value) || 0)} /></Field>
        </div>
        <div style={s.bomCostRow}>
          <span style={s.bomCostLabel}>BOM Cost</span>
          <span style={s.bomCostValue}>{formatCurrency(productBomTotal, currencySymbol)}</span>
        </div>
        <p style={s.bomRateNote}>Rates — {bomRateLabel('paper', 'sheet')} · {bomRateLabel('toner', 'page')} · {bomRateLabel('cover', 'ea')} · {bomRateLabel('staple', 'ea')} · {bomRateLabel('tape', 'cm')}</p>
      </div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Variants (optional)</p>
        {variants.length > 0 ? (
          <div style={s.variantList}>
            <div style={{ ...s.variantRow, ...s.variantRowHead }}>
              <span>Variant</span><span>BOM</span><span>Cost (CP)</span><span>Selling (SP)</span><span></span>
            </div>
            {variants.map((v, i) => (
              <div key={i} style={s.variantRow}>
                <input type="text" style={s.variantInput} value={v.name} onChange={e => {
                  const next = [...variants]; next[i] = { ...next[i], name: e.target.value }; setVariants(next);
                }} placeholder="e.g. 96 Page" />
                <button style={s.bomEditBtn} onClick={() => {
                  const defCovers = globalFinishingOptions.find(o => o.id === 'coverPages')?.quantity ?? 2;
                  const defStaples = globalFinishingOptions.find(o => o.id === 'stapling')?.quantity ?? 2;
                  const defTape = globalFinishingOptions.find(o => o.id === 'binding')?.quantity ?? 0;
                  setBomVariantIdx(i); setBomPages(v.bomPages ?? 96);
                  setBomCovers(v.bomCovers ?? defCovers); setBomStaples(v.bomStaples ?? defStaples); setBomTape(v.bomTape ?? defTape); setBomOpen(true);
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M16 3l5 5L8 21H3v-5L16 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
                  Edit BOM
                </button>
                <input type="number" style={{ ...s.variantInput, ...s.mono }} value={v.cost || ''} onChange={e => {
                  const next = [...variants]; next[i] = { ...next[i], cost: Number(e.target.value) || 0 }; setVariants(next);
                }} placeholder="0.00" />
                <input type="number" style={{ ...s.variantInput, ...s.mono }} value={v.selling || ''} onChange={e => {
                  const next = [...variants]; next[i] = { ...next[i], selling: Number(e.target.value) || 0 }; setVariants(next);
                }} placeholder="0.00" />
                <button style={s.variantRemove} onClick={() => { setVariants(variants.filter((_, j) => j !== i)); }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              </div>
            ))}
            <div style={s.addVariant} onClick={() => setVariants([...variants, { name: '', bomCost: 0, cost: 0, selling: 0, bomPages: 96, bomCovers: 2, bomStaples: 2, bomTape: 0 }])}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Add another variant
            </div>
          </div>
        ) : (
          <div style={s.addVariant} onClick={() => setVariants([{ name: '', bomCost: 0, cost: 0, selling: 0, bomPages: 96, bomCovers: 2, bomStaples: 2, bomTape: 0 }])}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Add variant
          </div>
        )}
        <p style={s.fieldHint}>Variants are optional. The product BOM above determines Total Base Price.</p>
      </div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Cost Inputs</p>
        <div style={s.grid3}>
          <Field label="Paper Cost"><div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={productPaperCost} onChange={e => setProductPaperCost(Number(e.target.value) || 0)} /></div></Field>
          <Field label="Toner Cost"><div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={productTonerCost} onChange={e => setProductTonerCost(Number(e.target.value) || 0)} /></div></Field>
          <Field label="Finishing Cost"><div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={productFinishCost} onChange={e => setProductFinishCost(Number(e.target.value) || 0)} /></div></Field>
        </div>
        <div style={{ ...s.grid2, marginTop: 14 }}>
          <Field label="Total Base Price">
            <input type="text" readOnly style={{ ...s.input, ...s.mono, background: VAR_STYLES.paper, fontWeight: 700, color: VAR_STYLES.ink700 }} value={formatCurrency(productBase, currencySymbol)} />
          </Field>
          <Field label="Selling Price">
            <div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={productSP} onChange={e => setProductSP(Number(e.target.value) || 0)} /></div>
            {productSP === 0 && effectiveProductSP > 0 && <span style={{ fontSize: 10, color: VAR_STYLES.teal500, marginTop: 2, display: 'block' }}>Avg from variants: {formatCurrency(effectiveProductSP, currencySymbol)}</span>}
          </Field>
        </div>
        {productBase > 0 && (
          <div style={{ ...s.costStrip, marginTop: 14 }}>
            <div style={{ ...s.costItem, ...(productProfit < 0 ? { color: VAR_STYLES.danger } : { color: VAR_STYLES.ink700 }) }}>
              <div style={s.costItemK}>Total Profit</div>
              <div style={s.costItemV}>{formatCurrency(productProfit, currencySymbol)}</div>
            </div>
            <div style={{ ...s.costItem, ...(productProfit < 0 ? { color: VAR_STYLES.danger } : { color: VAR_STYLES.ink700 }) }}>
              <div style={s.costItemK}>Markup</div>
              <div style={s.costItemV}>{productMarkup.toFixed(1)}%</div>
            </div>
              <div style={s.costItem}>
                <div style={s.costItemK}>AI Suggested SP</div>
                <div style={{ ...s.costItemV, color: VAR_STYLES.purple }}>{formatCurrency(productBase * (1 + TARGET_MARKUP), currencySymbol)}</div>
              </div>
            <div style={s.costItem}>
              <div style={s.costItemK}>Suggested @</div>
              <div style={{ ...s.costItemV, fontSize: 12.5 }}>38% markup</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  };

  const renderServiceTab = () => {
    return (
    <div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Pricing Method</p>
        <div style={s.methodRow}>
          {(['per_page', 'per_job', 'per_sheet'] as const).map(m => (
            <div key={m} style={{ ...s.method, ...(pricingMethod === m ? s.methodActive : {}) }} onClick={() => setPricingMethod(m)}>
              <div style={s.methodName}>{m === 'per_page' ? 'Per Page' : m === 'per_job' ? 'Per Job' : 'Per Sheet'}</div>
              <div style={s.methodDesc}>{m === 'per_page' ? 'Priced per printed page' : m === 'per_job' ? 'One flat price regardless of quantity' : 'Priced by physical sheet used'}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={s.section}>
        <p style={s.sectionTitle}>BOM Materials <span style={{ ...s.badge, ...s.badgeTeal, marginLeft: 6 }}>Auto-selected</span></p>
        <div style={s.grid3}>
          <Field label="Paper (per sheet)"><div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={servicePaperCost} onChange={e => setServicePaperCost(Number(e.target.value) || 0)} /></div></Field>
          <Field label="Toner (per page)"><div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={serviceTonerCost} onChange={e => setServiceTonerCost(Number(e.target.value) || 0)} /></div></Field>
          <Field label="Min. Markup Required"><input type="text" readOnly style={{ ...s.input, ...s.mono }} value={`${defaultMarkup}%`} /></Field>
        </div>
      </div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Finishing Options Offered <span style={s.badge}>Per job</span></p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {serviceFinishing.map((f, i) => (
            <button key={f.name}
              onClick={() => {
                const next = [...serviceFinishing]; next[i] = { ...next[i], active: !next[i].active }; setServiceFinishing(next);
              }}
              style={{
                padding: '8px 16px', borderRadius: 100, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', lineHeight: 1.3,
                background: f.active ? teal[600] : VAR_STYLES.paper,
                color: f.active ? '#fff' : VAR_STYLES.textDim,
                transition: 'all .15s',
              }}
              onMouseOver={e => { if (!f.active) e.currentTarget.style.background = VAR_STYLES.line; }}
              onMouseOut={e => { if (!f.active) e.currentTarget.style.background = VAR_STYLES.paper; }}>
              {f.name}
            </button>
          ))}
        </div>
      </div>
      <div style={s.section}>
        <p style={s.sectionTitle}>Turnaround</p>
        <div style={s.grid2}>
          <Field label="Standard Turnaround">
            <input type="text" style={s.input} value={turnaround} onChange={e => setTurnaround(e.target.value)} placeholder="e.g. 2 business days" />
          </Field>
          <Field label="Rush Surcharge">
            <div style={s.prefixInput}><span style={s.prefixSpan}>%</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 24 }} value={rushSurcharge || ''} onChange={e => setRushSurcharge(Number(e.target.value) || 0)} /></div>
          </Field>
        </div>
        <div style={{ ...s.statusRow, marginTop: 14 }}>
          <div>
            <div style={s.statusLabel}>Track Stock</div>
            <div style={s.statusSub}>Off by default — services aren't held as inventory</div>
          </div>
          <div style={{ ...s.switch, ...(trackStock ? s.switchOn : {}) }} onClick={() => setTrackStock(!trackStock)}>
            <div style={{ ...s.switchKnob, ...(trackStock ? s.switchKnobOn : {}) }} />
          </div>
        </div>
        {trackStock && (
          <div style={{ ...s.grid2, marginTop: 14 }}>
            <Field label="Stock on Hand" hint="How many units are currently available">
              <input type="number" style={{ ...s.input, ...s.mono }} value={serviceStock} onChange={e => setServiceStock(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Reorder Level" hint="Trigger alert when stock falls to this level">
              <input type="number" style={{ ...s.input, ...s.mono }} value={serviceReorder} onChange={e => setServiceReorder(Number(e.target.value) || 0)} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
  };

  const renderStationeryTab = () => {
    return (
      <div>
        <div style={s.section}>
          <p style={s.sectionTitle}>Pricing</p>
          {statVariants.some(v => v.name.trim()) ? (
            <div style={s.costStrip}>
              <div style={s.costItem}><div style={s.costItemK}>Blended Cost/Item</div><div style={s.costItemV}>{formatCurrency(statBlend.avgCost, currencySymbol)}</div></div>
              <div style={s.costItem}><div style={s.costItemK}>Blended Sell/Item</div><div style={s.costItemV}>{formatCurrency(statBlend.avgSell, currencySymbol)}</div></div>
              <div style={{ ...s.costItem, ...(statBlend.profit < 0 ? { color: VAR_STYLES.danger } : { color: VAR_STYLES.ink700 }) }}>
                <div style={s.costItemK}>Profit/Item</div>
                <div style={s.costItemV}>{formatCurrency(statBlend.profit, currencySymbol)}</div>
              </div>
              <div style={{ ...s.costItem, ...(statBlend.profit < 0 ? { color: VAR_STYLES.danger } : { color: VAR_STYLES.ink700 }) }}>
                <div style={s.costItemK}>Margin</div>
                <div style={s.costItemV}>{statBlend.margin.toFixed(1)}%</div>
              </div>
            </div>
          ) : (
            <div>
              <div style={s.grid3}>
                <Field label="Qty/Pack">
                  <input type="number" style={{ ...s.input, ...s.mono }} value={statQtyPack || ''} onChange={e => setStatQtyPack(Number(e.target.value) || 0)} />
                </Field>
                <Field label="Pack Cost">
                  <div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={statPackCost || ''} onChange={e => setStatPackCost(Number(e.target.value) || 0)} /></div>
                </Field>
                <Field label="Cost/Item">
                  <input type="text" readOnly style={{ ...s.input, ...s.mono, background: VAR_STYLES.paper, fontWeight: 600 }} value={formatCurrency(statQtyPack > 0 ? statPackCost / statQtyPack : 0, currencySymbol)} />
                </Field>
              </div>
              <div style={{ ...s.grid2, marginTop: 14 }}>
                <Field label="Selling Price (SP)">
                  <div style={s.prefixInput}><span style={s.prefixSpan}>{currencySymbol}</span><input type="number" style={{ ...s.input, ...s.mono, paddingLeft: 28 }} value={statSP} onChange={e => setStatSP(Number(e.target.value) || 0)} /></div>
                </Field>
                <div style={s.costStrip}>
                  <div style={{ ...s.costItem, ...(statSP - (statQtyPack > 0 ? statPackCost / statQtyPack : 0) < 0 ? { color: VAR_STYLES.danger } : { color: VAR_STYLES.ink700 }) }}>
                    <div style={s.costItemK}>Margin</div>
                    <div style={s.costItemV}>{statSP > 0 ? (((statSP - (statQtyPack > 0 ? statPackCost / statQtyPack : 0)) / statSP) * 100).toFixed(1) : 0}%</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={s.section}>
          <p style={s.sectionTitle}>Variants (optional)</p>
          {statVariants.length > 0 ? (
            <div style={s.variantList}>
              <div style={{ ...s.variantRow, ...s.variantRowHead, gridTemplateColumns: '1.2fr 0.75fr 0.9fr 0.9fr 0.9fr auto' }}>
                <span>Variant</span><span>Qty/Pack</span><span>Pack Cost</span><span>Cost/Item</span><span>Sell/Item</span><span></span>
              </div>
              {statVariants.map((v, i) => (
                <div key={i} style={{ ...s.variantRow, gridTemplateColumns: '1.2fr 0.75fr 0.9fr 0.9fr 0.9fr auto' }}>
                  <input type="text" style={s.variantInput} value={v.name} onChange={e => {
                    const next = [...statVariants]; next[i] = { ...next[i], name: e.target.value }; setStatVariants(next);
                  }} placeholder="e.g. Blue Ink Pen" />
                  <input type="number" style={{ ...s.variantInput, ...s.mono }} value={v.qtyPack || ''} onChange={e => {
                    const next = [...statVariants]; next[i] = { ...next[i], qtyPack: Number(e.target.value) || 0 }; setStatVariants(next);
                  }} />
                  <input type="number" style={{ ...s.variantInput, ...s.mono }} value={v.packCost || ''} onChange={e => {
                    const next = [...statVariants]; next[i] = { ...next[i], packCost: Number(e.target.value) || 0 }; setStatVariants(next);
                  }} />
                  <span style={s.variantAmt}>{formatCurrency(v.qtyPack > 0 ? v.packCost / v.qtyPack : 0, currencySymbol)}</span>
                  <input type="number" style={{ ...s.variantInput, ...s.mono }} value={v.sellItem || ''} onChange={e => {
                    const next = [...statVariants]; next[i] = { ...next[i], sellItem: Number(e.target.value) || 0 }; setStatVariants(next);
                  }} />
                  <button style={s.variantRemove} onClick={() => { setStatVariants(statVariants.filter((_, j) => j !== i)); }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              ))}
              <div style={s.addVariant} onClick={() => setStatVariants([...statVariants, { name: '', qtyPack: 12, packCost: 0, sellItem: 0 }])}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                Add another variant
              </div>
            </div>
          ) : (
            <div style={s.addVariant} onClick={() => setStatVariants([{ name: '', qtyPack: 12, packCost: 0, sellItem: 0 }])}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Add variant
            </div>
          )}
          <p style={s.fieldHint}>Variants are optional. Bought by the pack, sold per item.</p>
        </div>
        <div style={s.section}>
          <p style={s.sectionTitle}>Stock &amp; Reorder</p>
          <div style={s.grid2}>
            <Field label="Total Stock on Hand (Items)" hint="Sum across all variants">
              <input type="number" style={{ ...s.input, ...s.mono }} value={statTotalStock} onChange={e => setStatTotalStock(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Reorder Level (Items)">
              <input type="number" style={{ ...s.input, ...s.mono }} value={statReorder} onChange={e => setStatReorder(Number(e.target.value) || 0)} />
            </Field>
          </div>
        </div>
        <div style={s.section}>
          <p style={s.sectionTitle}>Supplier</p>
          <Field label="Preferred Supplier">
            <input type="text" style={s.input} value={statSupplier} onChange={e => setStatSupplier(e.target.value)} placeholder="e.g. Zaithwa Wholesalers" />
          </Field>
        </div>
      </div>
    );
  };

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) handleRequestClose(); }}>
      <div style={s.modal}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 1,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`,
          borderRadius: '18px 18px 0 0',
        }} />
        {/* Header */}
        <div style={s.modalHead}>
          <div style={s.modalHeadLeft}>
            <div style={s.modalIcon}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h9" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
            <div>
              <h2 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>{isEditing ? `Edit ${titleMap[category]}` : `Add New Item`}</h2>
              <p style={{ ...s.modalSub, marginTop: 2 }}>{isEditing ? `Edit ${titleMap[category].toLowerCase()} record` : `Create a ${titleMap[category].toLowerCase()} record`}</p>
            </div>
          </div>
          <button style={s.iconBtn} onClick={handleRequestClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Side nav + content */}
        <div style={s.modalMain}>
          <div style={s.sideNav}>
            <p style={s.navLabel}>Item Category</p>
            {(['raw', 'product', 'service', 'stationery'] as const).map(cat => (
              <button 
                key={cat} 
                data-category-tab={cat}
                style={{ ...s.tab, ...(category === cat ? s.tabActive : {}) }} 
                onClick={() => {
                  if (category !== cat && dirtyRef.current) {
                    setConfirmState({
                      open: true,
                      title: 'Switch Category',
                      message: 'Switching category will lose unsaved form data. Continue?',
                      type: 'warning',
                      confirmText: 'Continue',
                      onConfirm: () => {
                        setCategory(cat);
                        dirtyRef.current = true;
                      }
                    });
                    return;
                  }
                  setCategory(cat);
                  dirtyRef.current = true;
                }}
              >
                {cat === 'raw' && <svg style={s.tabSvg} viewBox="0 0 24 24" fill="none"><path d="M12 2l9 4.5v9L12 20l-9-4.5v-9L12 2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>}
                {cat === 'product' && <svg style={s.tabSvg} viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}
                {cat === 'service' && <svg style={s.tabSvg} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                {cat === 'stationery' && <svg style={s.tabSvg} viewBox="0 0 24 24" fill="none"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                {cat === 'raw' ? 'Raw Material' : cat === 'product' ? 'Printing Product' : cat === 'service' ? 'Printing Service' : 'Stationery'}
              </button>
            ))}

            <div style={s.sideDivider} />
            <div style={s.briefCard}>
              <div style={s.briefHead}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h9" stroke={VAR_STYLES.ink700} strokeWidth="2" strokeLinecap="round"/></svg>
                Cost Summary
                {category === 'product' && productBase > 0 && (
                  <span style={{ ...s.badge, ...s.badgeTeal, marginLeft: 'auto', fontSize: 10 }}>Auto-calculated</span>
                )}
              </div>
              {renderBrief()}
            </div>
          </div>

            <div style={s.modalContentCol}>
            <div style={s.modalBody}>
              {/* Common fields */}
              <div style={s.section}>
                <p style={s.sectionTitle}>Item Details</p>
                <div style={{ ...s.grid2, marginBottom: 14 }}>
                  <Field label="Item Name" required>
                    <input type="text" style={{ ...s.input, ...(nameError ? { border: `1px solid ${VAR_STYLES.danger}` } : {}) }} value={name} onChange={e => { setName(e.target.value); dirtyRef.current = true; }} placeholder="e.g. Bond Paper 80gsm" />
                    {nameError && <p style={{ ...s.fieldHint, color: VAR_STYLES.danger }}>{nameError}</p>}
                  </Field>
                  <Field label="SKU / Code">
                    <input type="text" style={{ ...s.input, ...s.mono, ...(skuError ? { border: `1px solid ${VAR_STYLES.danger}` } : {}) }} value={sku} onChange={e => { setSku(e.target.value); setSkuManuallySet(true); }} placeholder="Auto-generated" />
                    {skuError && <p style={{ ...s.fieldHint, color: VAR_STYLES.danger }}>{skuError}</p>}
                  </Field>
                </div>
                <Field label="Description">
                  <div style={s.descRow}>
                    <textarea style={{ ...s.textarea, ...s.descTextarea }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes about this item…" />
                    <button
                      style={{ ...s.aiGenBtn, ...(aiGenerating ? s.aiGenBtnDisabled : {}) }}
                      disabled={aiGenerating}
                      onClick={handleGenerateDescription}
                      title="Generate with AI"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        {aiGenerating
                          ? <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          : <><path d="M12 3l1.6 4.9L18.5 9.5 13.6 11 12 16l-1.6-5-4.9-1.5 4.9-1.6L12 3z" fill="currentColor"/><path d="M8 18h8M10 21h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
                        }
                      </svg>
                      {aiGenerating ? 'Generating…' : 'AI'}
                    </button>
                  </div>
                </Field>
              </div>

              {/* Costing Method (not shown for services) */}
              {category !== 'service' && (
                <div style={s.section}>
                  <p style={s.sectionTitle}>Costing &amp; Valuation</p>
                  <Field label="Costing Method" hint="Determines how cost of goods sold is calculated">
                    <select style={s.input} value={costingMethod} onChange={e => { setCostingMethod(e.target.value as any); dirtyRef.current = true; }}>
                      <option value="weighted_average">Weighted Average</option>
                      <option value="fifo">FIFO (First In, First Out)</option>
                      <option value="standard">Standard Cost</option>
                    </select>
                  </Field>
                </div>
              )}

              {category === 'raw' && renderRawTab()}
              {category === 'product' && renderProductTab()}
              {category === 'service' && renderServiceTab()}
              {category === 'stationery' && renderStationeryTab()}

              {/* Status toggle */}
              <div style={s.section}>
                <div style={s.statusRow}>
                  <div>
                    <div style={s.statusLabel}>Item Active</div>
                    <div style={s.statusSub}>Inactive items are hidden from POS and pricing tools</div>
                  </div>
                  <div style={{ ...s.switch, ...(active ? s.switchOn : {}) }} onClick={() => setActive(!active)}>
                    <div style={{ ...s.switchKnob, ...(active ? s.switchKnobOn : {}) }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={s.modalFooter}>
          <span style={s.footerNote}>Category: {titleMap[category]}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {pricingWarning && (
              <span style={{ ...s.markupWarn, marginTop: 0, width: 'auto' }}>{pricingWarning}</span>
            )}
            <div style={s.footerActions}>
              {isEditing && (
                <button style={{ ...s.btn, ...s.btnDanger }} onClick={async () => {
                  setConfirmState({
                    open: true,
                    title: 'Archive Item',
                    message: `Archive "${name}"? It will be marked inactive and hidden from POS.`,
                    type: 'warning',
                    confirmText: 'Archive',
                    onConfirm: async () => {
                      try {
                        await updateItem({ ...item, status: 'Inactive' } as Item, 'Archived by user');
                        notify?.('Item archived', 'success');
                        onClose();
                      } catch (err: any) {
                        notify?.(`Archive failed: ${err?.message}`, 'error');
                      }
                    }
                  });
                }}>Archive</button>
              )}
              <button style={s.btn} onClick={handleRequestClose}>Cancel</button>
              <button style={{ ...s.btn, ...s.btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save Item'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BOM Builder sub-modal */}
      {bomOpen && (
        <div style={s.bomSubOverlay} onClick={e => { if (e.target === e.currentTarget) setBomOpen(false); }}>
          <div style={s.bomSubModal}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 1,
              background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`,
              borderRadius: '18px 18px 0 0',
            }} />
            <div style={s.modalHead}>
              <div style={s.modalHeadLeft}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="#fff" strokeWidth="1.7"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <h2 style={{
                    fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                    fontSize: 20, margin: 0, color: teal[800], letterSpacing: 0.2
                  }}>Bill of Materials</h2>
                  <p style={{ fontSize: 12, color: VAR_STYLES.textDim, margin: '1px 0 0' }}>For: {variants[bomVariantIdx]?.name || 'variant'}</p>
                </div>
              </div>
              <button style={s.iconBtn} onClick={() => setBomOpen(false)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div style={{ ...s.modalBody, padding: '20px 22px' }}>
              <div style={s.section}>
                <p style={s.sectionTitle}>Job Specification</p>
                <div style={{ ...s.grid2, marginBottom: 14 }}>
                  <Field label="Number of Pages">
                    <input type="number" style={{ ...s.input, ...s.mono }} value={bomPages} min={0} onChange={e => setBomPages(Number(e.target.value) || 0)} />
                  </Field>
                  <Field label="Number of Covers">
                    <input type="number" style={{ ...s.input, ...s.mono }} value={bomCovers} min={0} onChange={e => setBomCovers(Number(e.target.value) || 0)} />
                  </Field>
                </div>
                <div style={s.grid2}>
                  <Field label="Number of Staples">
                    <input type="number" style={{ ...s.input, ...s.mono }} value={bomStaples} min={0} onChange={e => setBomStaples(Number(e.target.value) || 0)} />
                  </Field>
                  <Field label="Binding Tape (cm)">
                    <input type="number" style={{ ...s.input, ...s.mono }} value={bomTape} min={0} onChange={e => setBomTape(Number(e.target.value) || 0)} />
                  </Field>
                </div>
              </div>
              <div style={s.section}>
                <p style={s.sectionTitle}>Generated BOM</p>
                <div style={s.bomList}>
                  <div style={s.bomRow}><span>Paper ({Math.ceil(bomPages / PAGES_PER_SHEET)} sheets × {formatCurrency(bomRates.paper, currencySymbol)})</span><span style={s.variantAmt}>{formatCurrency(Math.ceil(bomPages / PAGES_PER_SHEET) * bomRates.paper, currencySymbol)}</span></div>
                  <div style={s.bomRow}><span>Toner ({bomPages} pages × {formatCurrency(bomRates.toner, currencySymbol)})</span><span style={s.variantAmt}>{formatCurrency(bomPages * bomRates.toner, currencySymbol)}</span></div>
                  <div style={s.bomRow}><span>Cover Pages ({bomCovers} × {formatCurrency(bomRates.cover, currencySymbol)})</span><span style={s.variantAmt}>{formatCurrency(bomCovers * bomRates.cover, currencySymbol)}</span></div>
                  <div style={s.bomRow}><span>Staples ({bomStaples} × {formatCurrency(bomRates.staple, currencySymbol)})</span><span style={s.variantAmt}>{formatCurrency(bomStaples * bomRates.staple, currencySymbol)}</span></div>
                  <div style={s.bomRow}><span>Binding Tape ({bomTape} cm × {formatCurrency(bomRates.tape, currencySymbol)})</span><span style={s.variantAmt}>{formatCurrency(bomTape * bomRates.tape, currencySymbol)}</span></div>
                  <div style={s.bomTotalRow}>
                    <span>Total BOM Cost</span>
                    <span style={s.bomTotalAmt}>{formatCurrency(Math.ceil(bomPages / PAGES_PER_SHEET) * bomRates.paper + bomPages * bomRates.toner + bomCovers * bomRates.cover + bomStaples * bomRates.staple + bomTape * bomRates.tape, currencySymbol)}</span>
                  </div>
                </div>
                <p style={s.bomRateNote}>Rates — {bomRateLabel('paper', 'sheet')} · {bomRateLabel('toner', 'page')} · {bomRateLabel('cover', 'ea')} · {bomRateLabel('staple', 'ea')} · {bomRateLabel('tape', 'cm')}</p>
              </div>
            </div>
            <div style={s.modalFooter}>
              <span style={s.footerNote}>Toner scales automatically with page count</span>
              <div style={s.footerActions}>
                <button style={s.btn} onClick={() => setBomOpen(false)}>Cancel</button>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => {
                  const cost = Math.ceil(bomPages / PAGES_PER_SHEET) * bomRates.paper + bomPages * bomRates.toner + bomCovers * bomRates.cover + bomStaples * bomRates.staple + bomTape * bomRates.tape;
                  const next = [...variants];
                  next[bomVariantIdx] = { ...next[bomVariantIdx], bomCost: cost, cost, bomPages, bomCovers, bomStaples, bomTape };
                  setVariants(next);
                  setBomOpen(false);
                }}>Apply to Variant</button>
              </div>
            </div>
          </div>
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
  );
};

export default ItemModal;
