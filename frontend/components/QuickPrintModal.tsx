import React, { useState, useMemo } from 'react';
import { Copy, Printer, Sparkles, X, ChevronRight } from 'lucide-react';

interface QuickPrintModalProps {
  open: boolean;
  onClose: () => void;
  type: 'photocopy' | 'printing';
  pricePerPage: number;
  costPerPage?: number;
  currency: string;
  staplePrice?: number;
  onConfirm: (quantity: number, pages: number, total: number, type: 'photocopy' | 'printing', pinningCost?: number, pinningCount?: number) => void;
  pinningItem?: {
    costPerUnit: number;
    conversionRate: number;
    materialId?: string;
  } | null;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const QuickPrintModal: React.FC<QuickPrintModalProps> = ({
  open, onClose, type, pricePerPage, costPerPage, currency,
  onConfirm, pinningItem, staplePrice
}) => {
  const [quantity, setQuantity] = useState(1);
  const [pagesPerCopy, setPagesPerCopy] = useState(1);
  const [enableStapling, setEnableStapling] = useState(false);
  const [pricingMethod, setPricingMethod] = useState<'per_page' | 'per_sheet'>(type === 'photocopy' ? 'per_sheet' : 'per_page');

  const totalPages = quantity * pagesPerCopy;
  const totalSheets = type === 'photocopy' ? quantity * Math.ceil(pagesPerCopy / 2) : totalPages;
  const printTotal = (type === 'photocopy' ? totalSheets : (pricingMethod === 'per_page' ? totalPages : totalSheets)) * pricePerPage;
  const materialCost = costPerPage ? (pricingMethod === 'per_page' ? totalPages : totalSheets) * costPerPage : 0;

  const effectiveStaplePrice = useMemo(() => {
    if (typeof staplePrice === 'number' && staplePrice > 0) return staplePrice;
    if (pinningItem && pinningItem.conversionRate > 0) {
      return pinningItem.costPerUnit / pinningItem.conversionRate;
    }
    return null;
  }, [staplePrice, pinningItem]);

  const pinningCost = useMemo(() => {
    if (!enableStapling || !effectiveStaplePrice) return 0;
    return Number((quantity * effectiveStaplePrice).toFixed(2));
  }, [quantity, enableStapling, effectiveStaplePrice]);

  const finalTotal = printTotal + pinningCost;
  const profit = finalTotal - materialCost;
  const profitMarginPct = materialCost > 0 ? ((profit / materialCost) * 100).toFixed(1) : '—';

  const handleConfirm = () => {
    if (pinningCost > 0) {
      onConfirm(quantity, pagesPerCopy, finalTotal, type, pinningCost, quantity);
    } else {
      onConfirm(quantity, pagesPerCopy, finalTotal, type, undefined, undefined);
    }
    setQuantity(1);
    setPagesPerCopy(1);
    setEnableStapling(false);
    setPricingMethod(type === 'photocopy' ? 'per_sheet' : 'per_page');
    onClose();
  };

  if (!open) return null;

  const isPhotocopy = type === 'photocopy';
  const Icon = isPhotocopy ? Copy : Printer;
  const fc = (v: number) => `${currency}${v.toFixed(2)}`;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div style={{
        width: 640, maxWidth: '100%', maxHeight: '92vh',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
      }}>
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
              <Icon size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>
                {isPhotocopy ? 'Quick Photocopy' : 'Type & Printing'}
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                {isPhotocopy ? 'Photocopy Service' : 'Printing Service'} &mdash; {fc(pricePerPage)} per {isPhotocopy ? 'sheet' : (pricingMethod === 'per_page' ? 'page' : 'sheet')}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 10 }}>Quantities</div>
            <div style={{ display: 'flex', border: `1.4px solid ${hairline}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ flex: 1, padding: '8px 12px', borderRight: `1.4px solid ${hairline}` }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4 }}>Pages per Copy</div>
                <input type="number" min={1} value={pagesPerCopy}
                  onChange={e => setPagesPerCopy(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                  style={{ border: 'none', padding: 0, fontSize: 14, fontWeight: 700, color: ink, width: '100%', background: 'transparent', outline: 'none' }} />
              </div>
              <div style={{ flex: 1, padding: '8px 12px', background: teal[50], textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4 }}>Copies</div>
                <input type="number" min={1} value={quantity}
                  onChange={e => setQuantity(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                  style={{ border: 'none', padding: 0, fontSize: 14, fontWeight: 700, color: ink, width: '100%', background: 'transparent', outline: 'none', textAlign: 'center' }} />
              </div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 10 }}>Pricing Method</div>
            <div style={{ display: 'flex', border: `1.4px solid ${hairline}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
              <button type="button" onClick={() => setPricingMethod('per_page')}
                style={{ flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'center', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: pricingMethod === 'per_page' ? teal[600] : paper, color: pricingMethod === 'per_page' ? '#fff' : inkSoft, transition: 'all .12s' }}>
                Per Page
              </button>
              <button type="button" onClick={() => setPricingMethod('per_sheet')}
                style={{ flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'center', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: pricingMethod === 'per_sheet' ? teal[600] : paper, color: pricingMethod === 'per_sheet' ? '#fff' : inkSoft, transition: 'all .12s' }}>
                Per Sheet
              </button>
            </div>

            {effectiveStaplePrice !== null && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 10 }}>Finishing Options</div>
                <button type="button" onClick={() => setEnableStapling(!enableStapling)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', background: enableStapling ? amber[100] : teal[50], transition: 'all .12s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: enableStapling ? amber[500] : inkSoft }}></div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: ink }}>Stapling</span>
                  </div>
                  <span style={{ fontSize: 11, color: enableStapling ? amber[500] : inkSoft }}>{fc(effectiveStaplePrice)}/copy</span>
                </button>
                {enableStapling && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', fontSize: 12 }}>
                    <span style={{ color: inkSoft }}>Stapling ({fc(effectiveStaplePrice)} &times; {quantity})</span>
                    <span style={{ fontWeight: 600, color: ink }}>{fc(pinningCost)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ background: hairline }}></div>

          <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 10 }}>Cost Breakdown</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
              <span style={{ color: inkSoft }}>Total {pricingMethod === 'per_page' ? 'Pages' : 'Sheets'}</span>
              <span style={{ fontWeight: 600, color: ink }}>{pricingMethod === 'per_page' ? totalPages : totalSheets}</span>
            </div>
            {pricingMethod !== 'per_page' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
                <span style={{ color: inkSoft }}>Total Pages <span style={{ fontSize: 10, color: hairline }}>(toner basis)</span></span>
                <span style={{ fontWeight: 600, color: inkSoft }}>{totalPages}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
              <span style={{ color: inkSoft }}>{pricingMethod === 'per_page' ? 'Page' : 'Sheet'} Cost</span>
              <span style={{ fontWeight: 600, color: ink }}>{fc(printTotal)}</span>
            </div>

            {costPerPage ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
                  <span style={{ color: inkSoft }}>Toner Cost ({fc(costPerPage)}/pg)</span>
                  <span style={{ fontWeight: 600, color: ink }}>{fc(materialCost)}</span>
                </div>
                <div style={{ borderTop: `1px dashed ${hairline}`, margin: '4px 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
                  <span style={{ color: inkSoft }}>Cost Price</span>
                  <span style={{ fontWeight: 600, color: ink }}>{fc(materialCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
                  <span style={{ color: inkSoft }}>Selling Price</span>
                  <span style={{ fontWeight: 600, color: ink }}>{fc(printTotal)}</span>
                </div>
                {enableStapling && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12 }}>
                    <span style={{ color: inkSoft }}>Stapling</span>
                    <span style={{ fontWeight: 600, color: ink }}>{fc(pinningCost)}</span>
                  </div>
                )}
                <div style={{ background: '#ecfdf5', borderRadius: 8, padding: '8px 12px', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>
                    Profit <span>+{fc(profit)}</span>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: paper, padding: '2px 8px', borderRadius: 999 }}>{profitMarginPct}% margin</div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '14px 24px 18px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08 }}>Total Due</div>
            <div style={{ fontSize: 22, color: ink, lineHeight: 1.15, fontWeight: 700 }}>{fc(finalTotal)}</div>
            <div style={{ fontSize: 10, color: inkSoft }}>
              {totalPages} page{totalPages !== 1 ? 's' : ''} &middot; {totalSheets} sheet{totalSheets !== 1 ? 's' : ''} &middot; {fc(quantity > 0 ? finalTotal / quantity : 0)}/copy
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onClose}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                background: paper, border: `1.4px solid ${hairline}`, color: inkSoft
              }}>
              Cancel
            </button>
            <button onClick={handleConfirm}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                transition: 'all .15s ease'
              }}>
              <Sparkles size={14} /> Add to Cart <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickPrintModal;
