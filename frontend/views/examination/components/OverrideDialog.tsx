import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, DollarSign, ChevronRight } from 'lucide-react';

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
const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'none', minHeight: 80, lineHeight: 1.5
};

interface OverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (manualPrice: number, reason: string) => void;
  currentPrice: number;
  expectedPrice?: number;
  currencySymbol?: string;
}

const OverrideDialog: React.FC<OverrideDialogProps> = ({
  isOpen, onClose, onSubmit, currentPrice, expectedPrice, currencySymbol = '$'
}) => {
  const [manualPrice, setManualPrice] = useState(currentPrice);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const safeCurrentPrice = Number(currentPrice || 0);
  const safeExpectedPrice = Number(expectedPrice ?? currentPrice ?? 0);

  useEffect(() => {
    if (!isOpen) return;
    setManualPrice(safeCurrentPrice);
    setReason('');
  }, [isOpen, safeCurrentPrice]);

  const handleSubmit = async () => {
    if (manualPrice <= 0) {
      alert('Manual price must be greater than 0');
      return;
    }
    if (!reason.trim()) {
      alert('Please provide a reason for the manual override');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(manualPrice, reason);
      setManualPrice(safeCurrentPrice);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setManualPrice(safeCurrentPrice);
    setReason('');
    onClose();
  };

  const priceDifference = manualPrice - safeCurrentPrice;
  const percentageChange = safeCurrentPrice > 0 ? (priceDifference / safeCurrentPrice) * 100 : 0;
  const autoVsCurrentDelta = useMemo(() => {
    const delta = safeCurrentPrice - safeExpectedPrice;
    if (Math.abs(delta) < 0.005) return 0;
    return delta;
  }, [safeCurrentPrice, safeExpectedPrice]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }} onClick={onClose}>
      <div style={{
        width: 520, maxWidth: '100%', maxHeight: '92vh',
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
              <AlertTriangle size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>
                Manual Price Override
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                Override the auto-calculated price for this class
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
          <div style={{ padding: 16, background: teal[50], borderRadius: 9, border: `1px solid ${teal[100]}`, marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: inkSoft }}>Expected Auto Price:</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{currencySymbol} {safeExpectedPrice.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: inkSoft }}>Current Final Price:</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{currencySymbol} {safeCurrentPrice.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: inkSoft }}>Manual Price:</span>
              <div style={{ position: 'relative', width: 160 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft, fontWeight: 700, fontSize: 13 }}>
                  <DollarSign size={14} />
                </span>
                <input type="number" min="0" step="0.01" value={manualPrice}
                  onChange={(e) => setManualPrice(parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, paddingLeft: 28, textAlign: 'right' }} />
              </div>
            </div>
            {autoVsCurrentDelta !== 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: inkSoft }}>Current vs Expected:</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: autoVsCurrentDelta > 0 ? '#059669' : '#d97706' }}>
                  {autoVsCurrentDelta > 0 ? '+' : ''}{currencySymbol} {autoVsCurrentDelta.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: ink }}>Change:</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: percentageChange > 0 ? '#059669' : percentageChange < 0 ? '#dc2626' : inkSoft }}>
                {percentageChange > 0 ? '+' : ''}{percentageChange.toFixed(2)}%
                {priceDifference !== 0 && ` (${currencySymbol} ${priceDifference.toLocaleString()})`}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>
              Reason for Override <span style={{ color: danger, fontWeight: 700 }}>*</span>
            </label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why you are overriding the auto-calculated price..."
              style={textareaStyle} />
          </div>

          {percentageChange !== 0 && (
            <div style={{
              padding: 12, borderRadius: 9, marginBottom: 18,
              background: `${amber[100]}80`, border: `1px solid ${amber[300]}`
            }}>
              <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>
                <strong>Note:</strong> This override will {percentageChange > 0 ? 'increase' : 'decrease'} the price by {Math.abs(percentageChange).toFixed(2)}%.
                This change will be recorded in the audit trail.
              </p>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '16px 28px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
          <button type="button" onClick={handleCancel} disabled={isSubmitting}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
              background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit}
            disabled={isSubmitting || manualPrice <= 0 || !reason.trim()}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
              background: `linear-gradient(155deg, ${amber[500]}, ${amber[600]})`,
              color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: `0 6px 16px -6px rgba(185,126,43,.55)`,
              transition: 'all .15s ease', opacity: (isSubmitting || manualPrice <= 0 || !reason.trim()) ? 0.6 : 1
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(185,126,43,.65)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(185,126,43,.55)'; }}>
            {isSubmitting ? 'Applying Override...' : 'Apply Override'}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverrideDialog;
