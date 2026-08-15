import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Save, ShoppingCart,   FileText, Hash, Layers,
  Printer, Book, Palette, Scissors, Wrench, Package,
  DollarSign, AlertCircle,
  CheckCircle, Upload, Star
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePrintingStore } from '../../stores/printingStore';
import { printingService } from '../../services/printingService';
import { formatNumber } from '../../utils/helpers';
import { Dialog } from '../Dialog';
import type {
  PrintingJobSpecification, PaperSize, ColorMode, SidedMode,
  Orientation, PrintingJobPriority, FinishingSpec,
} from '../../types/printing';

interface PrintingJobModalProps {
  serviceId: string;
  serviceName: string;
  customerName?: string;
  customerId?: string;
  open?: boolean;
  onClose?: () => void;
  onSaveDraft: (spec: PrintingJobSpecification) => void;
  onAddToCart: (spec: PrintingJobSpecification) => void;
  onSaveAsQuote: (spec: PrintingJobSpecification) => void;
  onCancel?: () => void;
}

type ModalTab = 'basic' | 'specs' | 'finishing' | 'pricing' | 'summary';

const TABS: { key: ModalTab; label: string; icon: React.ElementType }[] = [
  { key: 'basic', label: 'Basic Info', icon: FileText },
  { key: 'specs', label: 'Print Specs', icon: Printer },
  { key: 'finishing', label: 'Finishing', icon: Scissors },
  { key: 'pricing', label: 'Pricing', icon: DollarSign },
  { key: 'summary', label: 'Summary', icon: Star },
];

const PAPER_TYPES = ['Art Card', 'Art Paper', 'Gloss Art', 'Matte Art', 'Offset', 'Newsprint', 'Kraft', 'Specialty'];
const PAPER_WEIGHTS = [80, 100, 120, 150, 170, 200, 250, 300, 350, 400];
const PAPER_SIZES: PaperSize[] = ['A4', 'A3', 'A5', 'Legal', 'Letter', 'Custom'];

const ink900 = '#16191c', ink700 = '#3a4046', ink500 = '#6b7178', ink300 = '#aeb3b8', line = '#e7e5e1', canvas = '#eeece7', amber = '#b8742f', good = '#3f7d52', goodTint = '#eef6ef';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: `1px solid ${line}`, borderRadius: 8,
  fontSize: 13, color: ink900, background: '#fff', outline: 'none', fontFamily: 'inherit'
};

const labelStyle: React.CSSProperties = {
  fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: ink500, marginBottom: 4
};

const sectionTitle: React.CSSProperties = {
  fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: ink500, marginBottom: 12
};

const PaperSpecSection: React.FC<{
  paper: PrintingJobSpecification['paper'];
  onChange: (paper: PrintingJobSpecification['paper']) => void;
}> = ({ paper, onChange }) => (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <div style={labelStyle}>Paper Type</div>
      <select value={paper.type} onChange={e => onChange({ ...paper, type: e.target.value })} style={inputStyle}>
        {PAPER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
    <div>
      <div style={labelStyle}>Weight (gsm)</div>
      <select value={paper.weight} onChange={e => onChange({ ...paper, weight: Number(e.target.value) })} style={inputStyle}>
        {PAPER_WEIGHTS.map(w => <option key={w} value={w}>{w} gsm</option>)}
      </select>
    </div>
    <div>
      <div style={labelStyle}>Size</div>
      <select value={paper.size} onChange={e => onChange({ ...paper, size: e.target.value as PaperSize })} style={inputStyle}>
        {PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
    {paper.size === 'Custom' && (
      <>
        <div>
          <div style={labelStyle}>Width (mm)</div>
          <input type="number" value={paper.customWidth || ''} onChange={e => onChange({ ...paper, customWidth: Number(e.target.value) })}
            style={inputStyle} placeholder="e.g. 210" />
        </div>
        <div>
          <div style={labelStyle}>Height (mm)</div>
          <input type="number" value={paper.customHeight || ''} onChange={e => onChange({ ...paper, customHeight: Number(e.target.value) })}
            style={inputStyle} placeholder="e.g. 297" />
        </div>
      </>
    )}
  </div>
);

const FinishingOptions: React.FC<{
  finishing: FinishingSpec;
  onChange: (f: FinishingSpec) => void;
}> = ({ finishing, onChange }) => {
  const toggle = (key: keyof FinishingSpec) => onChange({ ...finishing, [key]: !finishing[key] });
  const options: { key: keyof FinishingSpec; label: string; icon: React.ElementType }[] = [
    { key: 'lamination', label: 'Lamination', icon: Layers },
    { key: 'binding', label: 'Binding', icon: Book },
    { key: 'folding', label: 'Folding', icon: Wrench },
    { key: 'creasing', label: 'Creasing', icon: Wrench },
    { key: 'perforation', label: 'Perforation', icon: Scissors },
    { key: 'numbering', label: 'Numbering', icon: Hash },
    { key: 'stitching', label: 'Stitching', icon: Wrench },
    { key: 'spotUV', label: 'Spot UV', icon: Palette },
    { key: 'foiling', label: 'Foiling', icon: Star },
    { key: 'dieCutting', label: 'Die Cutting', icon: Scissors },
    { key: 'packaging', label: 'Packaging', icon: Package },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(opt => {
        const Icon = opt.icon;
        const isOn = finishing[opt.key] === true;
        return (
          <button key={opt.key} onClick={() => toggle(opt.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 8,
              border: `1px solid ${isOn ? amber : line}`, cursor: 'pointer', width: '100%', textAlign: 'left',
              background: isOn ? '#fbf2e6' : '#fff', fontSize: 12, fontWeight: isOn ? 600 : 500, color: isOn ? amber : ink700,
              transition: 'all .12s'
            }}>
            <Icon size={14} style={{ color: isOn ? amber : ink300 }} />
            <span style={{ flex: 1 }}>{opt.label}</span>
            {isOn && <CheckCircle size={12} style={{ color: amber }} />}
          </button>
        );
      })}
    </div>
  );
};

const PricingDisplay: React.FC<{ pricing: PrintingJobSpecification['pricing']; currency: string }> = ({ pricing, currency }) => {
  const Row = ({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12.5 }}>
      <span style={{ color: highlight ? ink900 : ink500, fontWeight: highlight ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: highlight ? 700 : 600, color: ink900 }}>
        {currency}{formatNumber(value)}
      </span>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${line}` }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: good }} />
        <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: good, fontWeight: 700 }}>Live Pricing</span>
      </div>
      <Row label="Printing Cost" value={pricing.printingCost} />
      <Row label="Paper Cost" value={pricing.paperCost} />
      <Row label="Ink Cost" value={pricing.inkCost} />
      <Row label="Finishing Cost" value={pricing.finishingCost} />
      <Row label="Design Cost" value={pricing.designCost} />
      <Row label="Machine Setup" value={pricing.machineSetupCost} />
      <Row label="Delivery Cost" value={pricing.deliveryCost} />
      {pricing.urgentFee > 0 && <Row label="Urgent Fee" value={pricing.urgentFee} />}
      <div style={{ borderTop: `1px solid ${line}`, margin: '4px 0' }} />
      <Row label="Subtotal" value={pricing.subtotal} />
      {pricing.discount > 0 && <Row label="Discount" value={-pricing.discount} />}
      <Row label="Tax (16%)" value={pricing.tax} />
      <Row label="Grand Total" value={pricing.grandTotal} highlight />
    </div>
  );
};

const JobSummaryCard: React.FC<{ spec: PrintingJobSpecification; currency: string }> = ({ spec, currency }) => {
  const finishingActive = Object.entries(spec.finishing).filter(([k, v]) => v === true && !k.includes('Type')).map(([k]) => k);
  const estimatedTime = printingService.estimateProductionTime(spec);
  const estimatedProfit = spec.pricing.grandTotal - spec.pricing.subtotal + spec.pricing.tax;
  return (
    <div style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 20, background: canvas }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: ink900, lineHeight: 1.2 }}>{spec.jobName || spec.serviceName}</div>
          <div style={{ fontSize: 13, color: ink500, marginTop: 2 }}>{spec.quantity} {spec.unit}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: ink500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Amount</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: ink900 }}>{currency}{formatNumber(spec.pricing.grandTotal)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 16 }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: `1px solid ${line}` }}>
          <div style={{ fontSize: 8.5, color: ink500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Paper</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: ink900 }}>{spec.paper.weight}gsm {spec.paper.type} — {spec.paper.size}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: `1px solid ${line}` }}>
          <div style={{ fontSize: 8.5, color: ink500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Printing</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: ink900 }}>{spec.printing.color} · {spec.printing.sides}</div>
        </div>
        {finishingActive.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: `1px solid ${line}` }}>
            <div style={{ fontSize: 8.5, color: ink500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Finishing</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: ink900 }}>{finishingActive.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ')}</div>
          </div>
        )}
        <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: `1px solid ${line}` }}>
          <div style={{ fontSize: 8.5, color: ink500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Due</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: ink900 }}>{spec.dueDate ? new Date(spec.dueDate).toLocaleDateString() : 'Not set'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderTop: `1px solid ${line}`, paddingTop: 14 }}>
        {[
          { label: 'Est. Time', value: estimatedTime },
          { label: 'Est. Cost', value: `${currency}${formatNumber(spec.pricing.subtotal)}` },
          { label: 'Est. Profit', value: `${currency}${formatNumber(estimatedProfit)}` },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 8.5, color: ink500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: item.label === 'Est. Profit' ? good : ink900 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const tabBtn = (isActive: boolean, hasError?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none',
  fontSize: 11.5, fontWeight: isActive ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
  background: isActive ? ink900 : 'transparent',
  color: isActive ? '#fff' : ink500,
  transition: 'all .12s', fontFamily: 'inherit',
  ...(hasError ? { boxShadow: `inset 0 0 0 2px #ef4444` } : {}),
});

export const PrintingJobModal: React.FC<PrintingJobModalProps> = ({
  serviceId, serviceName, customerName, customerId,
  open = true, onClose, onSaveDraft, onAddToCart, onSaveAsQuote, onCancel,
}) => {
  const handleClose = useCallback(() => {
    onClose?.();
    onCancel?.();
  }, [onClose, onCancel]);
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;
  const { calculatePricing } = usePrintingStore();

  const [activeTab, setActiveTab] = useState<ModalTab>('basic');
  const [spec, setSpec] = useState<PrintingJobSpecification>({
    serviceId, serviceName,
    jobName: serviceName,
    customerName: customerName || '',
    customerId,
    quantity: 500, unit: 'pcs', dueDate: '', priority: 'Normal',
    paper: { type: 'Art Card', weight: 300, size: 'A4' },
    printing: { color: 'Full Color', sides: 'Double Sided', pages: 1, copies: 1, orientation: 'Portrait' },
    finishing: {
      lamination: false, binding: false, folding: false, creasing: false,
      perforation: false, numbering: false, stitching: false, spotUV: false,
      foiling: false, dieCutting: false, packaging: false,
    },
    artwork: { source: 'Customer Artwork', files: [], status: 'Pending', notes: '' },
    customerNotes: '', internalNotes: '',
    pricing: {
      printingCost: 0, paperCost: 0, inkCost: 0, finishingCost: 0,
      designCost: 0, machineSetupCost: 0, deliveryCost: 0, urgentFee: 0,
      discount: 0, tax: 0, subtotal: 0, grandTotal: 0,
    },
  });

  const updateSpec = useCallback((patch: Partial<PrintingJobSpecification>) => {
    setSpec(prev => {
      const next = { ...prev, ...patch };
      if (patch.printing || patch.paper || patch.finishing || patch.priority || patch.quantity) {
        next.pricing = calculatePricing(next);
      }
      return next;
    });
  }, [calculatePricing]);

  useEffect(() => {
    setSpec(prev => {
      const pricing = calculatePricing(prev);
      return { ...prev, pricing };
    });
  }, []);

  const tabErrors = useMemo(() => {
    const errs: Partial<Record<ModalTab, string[]>> = {};
    if (!spec.jobName) errs.basic = ['Job name is required'];
    if (!spec.customerName) errs.basic = [...(errs.basic || []), 'Customer is required'];
    if (spec.quantity < 1) errs.basic = [...(errs.basic || []), 'Quantity must be at least 1'];
    return errs;
  }, [spec]);

  const canAddToCart = !tabErrors.basic || tabErrors.basic.length === 0;

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-4xl">
      {/* Custom header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 20px 10px 20px', borderBottom: `1px solid ${line}` }}>
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: amber, marginBottom: 4 }}>Printing Job</div>
          <div style={{ fontSize: 19, color: ink900, lineHeight: 1.1, fontWeight: 700 }}>{spec.jobName || serviceName}</div>
        </div>
        <button onClick={handleClose} style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'transparent', color: ink500, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginTop: 2 }}
          onMouseOver={e => { e.currentTarget.style.background = canvas; e.currentTarget.style.color = ink900; }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ink500; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 20px', borderBottom: `1px solid ${line}`, background: canvas, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={tabBtn(activeTab === t.key, !!tabErrors[t.key]?.length)}
            onMouseOver={e => { if (activeTab !== t.key) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = ink700; } }}
            onMouseOut={e => { if (activeTab !== t.key) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = ink500; } }}>
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
        {activeTab === 'basic' && (
          <div style={{ maxWidth: 560 }}>
            <div style={sectionTitle}>Basic Information</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div style={labelStyle}>Job Name *</div>
                <input type="text" value={spec.jobName} onChange={e => updateSpec({ jobName: e.target.value })}
                  style={inputStyle} placeholder="e.g. Business Cards" />
              </div>
              <div>
                <div style={labelStyle}>Service</div>
                <input type="text" value={spec.serviceName} disabled style={{ ...inputStyle, background: canvas, color: ink500 }} />
              </div>
              <div>
                <div style={labelStyle}>Customer *</div>
                <input type="text" value={spec.customerName} onChange={e => updateSpec({ customerName: e.target.value })}
                  style={inputStyle} placeholder="Customer name" />
              </div>
              <div>
                <div style={labelStyle}>Unit</div>
                <select value={spec.unit} onChange={e => updateSpec({ unit: e.target.value })} style={inputStyle}>
                  <option value="pcs">Pieces</option>
                  <option value="sets">Sets</option>
                  <option value="books">Books</option>
                  <option value="boxes">Boxes</option>
                </select>
              </div>
              <div>
                <div style={labelStyle}>Quantity</div>
                <input type="number" min={1} value={spec.quantity} onChange={e => updateSpec({ quantity: Math.max(1, Number(e.target.value)) })}
                  style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Due Date</div>
                <input type="date" value={spec.dueDate} onChange={e => updateSpec({ dueDate: e.target.value })}
                  style={inputStyle} />
              </div>
              <div className="col-span-2">
                <div style={labelStyle}>Priority</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['Normal', 'Urgent', 'Express'] as PrintingJobPriority[]).map(p => (
                    <button key={p} onClick={() => updateSpec({ priority: p })}
                      style={{
                        flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                        background: spec.priority === p ? ink900 : '#fff',
                        color: spec.priority === p ? '#fff' : ink700,
                        outline: `1px solid ${spec.priority === p ? ink900 : line}`,
                        transition: 'all .12s'
                      }}
                      onMouseOver={e => { if (spec.priority !== p) e.currentTarget.style.background = canvas; }}
                      onMouseOut={e => { if (spec.priority !== p) e.currentTarget.style.background = '#fff'; }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'specs' && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={13} /> Paper
            </div>
            <PaperSpecSection paper={spec.paper} onChange={paper => updateSpec({ paper })} />
            <div style={{ borderTop: `1px solid ${line}`, marginTop: 16, paddingTop: 16 }}>
              <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Printer size={13} /> Printing
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div style={labelStyle}>Color</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Full Color', 'Black & White'] as ColorMode[]).map(c => (
                      <button key={c} onClick={() => updateSpec({ printing: { ...spec.printing, color: c } })}
                        style={{
                          flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                          background: spec.printing.color === c ? ink900 : '#fff',
                          color: spec.printing.color === c ? '#fff' : ink700,
                          outline: `1px solid ${spec.printing.color === c ? ink900 : line}`,
                          transition: 'all .12s'
                        }}
                        onMouseOver={e => { if (spec.printing.color !== c) e.currentTarget.style.background = canvas; }}
                        onMouseOut={e => { if (spec.printing.color !== c) e.currentTarget.style.background = '#fff'; }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Sides</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Single Sided', 'Double Sided'] as SidedMode[]).map(s => (
                      <button key={s} onClick={() => updateSpec({ printing: { ...spec.printing, sides: s } })}
                        style={{
                          flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                          background: spec.printing.sides === s ? ink900 : '#fff',
                          color: spec.printing.sides === s ? '#fff' : ink700,
                          outline: `1px solid ${spec.printing.sides === s ? ink900 : line}`,
                          transition: 'all .12s'
                        }}
                        onMouseOver={e => { if (spec.printing.sides !== s) e.currentTarget.style.background = canvas; }}
                        onMouseOut={e => { if (spec.printing.sides !== s) e.currentTarget.style.background = '#fff'; }}>
                        {s === 'Single Sided' ? 'Single' : 'Double'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Pages per Copy</div>
                  <input type="number" min={1} value={spec.printing.pages} onChange={e => updateSpec({ printing: { ...spec.printing, pages: Math.max(1, Number(e.target.value)) } })}
                    style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Orientation</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Portrait', 'Landscape'] as Orientation[]).map(o => (
                      <button key={o} onClick={() => updateSpec({ printing: { ...spec.printing, orientation: o } })}
                        style={{
                          flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                          background: spec.printing.orientation === o ? ink900 : '#fff',
                          color: spec.printing.orientation === o ? '#fff' : ink700,
                          outline: `1px solid ${spec.printing.orientation === o ? ink900 : line}`,
                          transition: 'all .12s'
                        }}
                        onMouseOver={e => { if (spec.printing.orientation !== o) e.currentTarget.style.background = canvas; }}
                        onMouseOut={e => { if (spec.printing.orientation !== o) e.currentTarget.style.background = '#fff'; }}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'finishing' && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Scissors size={13} /> Finishing Options
            </div>
            <FinishingOptions finishing={spec.finishing} onChange={finishing => updateSpec({ finishing })} />
          </div>
        )}

        {activeTab === 'pricing' && (
          <div style={{ maxWidth: 400, margin: '0 auto' }}>
            <div style={{ ...sectionTitle, textAlign: 'center' }}>Pricing Breakdown</div>
            <PricingDisplay pricing={spec.pricing} currency={currency} />
          </div>
        )}

        {activeTab === 'summary' && (
          <div style={{ maxWidth: 500, margin: '0 auto' }}>
            <div style={{ ...sectionTitle, textAlign: 'center' }}>Job Summary</div>
            <JobSummaryCard spec={spec} currency={currency} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px 16px 20px', borderTop: `1px solid ${line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: ink500 }}>Total</div>
            <div style={{ fontSize: 21, color: ink900, lineHeight: 1.15, fontWeight: 700 }}>{currency}{formatNumber(spec.pricing.grandTotal)}</div>
          </div>
          {!canAddToCart && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#dc2626', background: '#fef2f2', padding: '6px 10px', borderRadius: 6 }}>
              <AlertCircle size={12} /> Fill required fields
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={handleClose}
            style={{ border: `1px solid ${line}`, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#fff', color: ink700, whiteSpace: 'nowrap', transition: 'all .15s', fontFamily: 'inherit' }}
            onMouseOver={e => e.currentTarget.style.background = canvas}
            onMouseOut={e => e.currentTarget.style.background = '#fff'}>
            Cancel
          </button>
          <button onClick={() => onSaveDraft(spec)}
            style={{ border: `1px solid ${line}`, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#fff', color: ink700, whiteSpace: 'nowrap', transition: 'all .15s', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
            onMouseOver={e => e.currentTarget.style.background = canvas}
            onMouseOut={e => e.currentTarget.style.background = '#fff'}>
            <Save size={13} /> Save Draft
          </button>
          <button onClick={() => onSaveAsQuote(spec)}
            style={{ border: `1px solid ${line}`, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: '#fff', color: ink700, whiteSpace: 'nowrap', transition: 'all .15s', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
            onMouseOver={e => e.currentTarget.style.background = canvas}
            onMouseOut={e => e.currentTarget.style.background = '#fff'}>
            <FileText size={13} /> Save as Quote
          </button>
          <button onClick={() => onAddToCart(spec)} disabled={!canAddToCart}
            style={{ border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: canAddToCart ? 'pointer' : 'not-allowed', background: ink900, color: '#fff', whiteSpace: 'nowrap', transition: 'all .15s', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: canAddToCart ? 1 : 0.5 }}
            onMouseOver={e => { if (canAddToCart) e.currentTarget.style.background = '#000'; }}
            onMouseOut={e => { if (canAddToCart) e.currentTarget.style.background = ink900; }}>
            <ShoppingCart size={14} /> Add to Cart
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default PrintingJobModal;
