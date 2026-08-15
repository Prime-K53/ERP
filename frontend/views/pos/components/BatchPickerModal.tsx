import React, { useState, useEffect, useMemo } from 'react';
import { X, Package, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { inventoryTransactionService } from '../../../services/inventoryTransactionService';
import { formatNumber } from '../../../utils/helpers';

interface BatchSelection {
  batchId: string;
  batchNumber: string;
  quantity: number;
}

interface BatchPickerModalProps {
  itemId: string;
  itemName: string;
  targetQuantity: number;
  isOpen: boolean;
  onConfirm: (selections: BatchSelection[]) => void;
  onClose: () => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

const BatchPickerModal: React.FC<BatchPickerModalProps> = ({
  itemId, itemName, targetQuantity, isOpen, onConfirm, onClose
}) => {
  const { companyConfig, notify } = useAuth();
  const currency = companyConfig.currencySymbol;
  const [batches, setBatches] = useState<any[]>([]);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    inventoryTransactionService.getActiveBatches(itemId).then((data) => {
      setBatches(data);
      const initial: Record<string, number> = {};
      data.forEach((b) => { initial[b.id] = 0; });
      setSelections(initial);
      setLoading(false);
    });
  }, [itemId, isOpen]);

  const totalSelected = useMemo(
    () => Object.values(selections).reduce((sum, q) => sum + q, 0),
    [selections]
  );
  const remaining = targetQuantity - totalSelected;
  const isComplete = totalSelected >= targetQuantity;

  const updateSelection = (batchId: string, value: number) => {
    const batch = batches.find((b) => b.id === batchId);
    const max = batch ? batch.remainingQuantity : 0;
    const clamped = Math.max(0, Math.min(value, max));
    setSelections((prev) => ({ ...prev, [batchId]: clamped }));
  };

  const quickFill = (batchId: string) => {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return;
    const canTake = Math.min(remaining, batch.remainingQuantity);
    updateSelection(batchId, (selections[batchId] || 0) + canTake);
  };

  const handleConfirm = () => {
    const result = Object.entries(selections)
      .filter(([, qty]) => qty > 0)
      .map(([batchId, qty]) => ({
        batchId,
        batchNumber: batches.find((b) => b.id === batchId)?.batchNumber || batchId,
        quantity: qty,
      }));
    if (result.length === 0) {
      notify('Select at least one batch', 'warning');
      return;
    }
    if (totalSelected > targetQuantity) {
      notify('Total selected exceeds target quantity', 'error');
      return;
    }
    if (totalSelected < targetQuantity) {
      notify(`Partial selection: ${totalSelected} of ${targetQuantity}. Remaining will use general stock.`, 'info');
    }
    onConfirm(result);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div style={{
        width: 620, maxWidth: '100%', maxHeight: '92vh',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
            }}>
              <Package size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400, fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2 }}>Select Batch / Lot</h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>{itemName} &mdash; Need {targetQuantity} units</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .15s ease'
          }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          ><X size={15} /></button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: inkSoft, fontSize: 13, padding: 32 }}>Loading batches...</div>
        ) : batches.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: inkSoft, padding: 32, gap: 10 }}>
            <AlertTriangle size={30} style={{ color: amber[500] }} />
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>No active batches found for this item.</p>
            <p style={{ fontSize: 12.5, margin: 0 }}>The item will be added to cart without batch tracking.</p>
            <button onClick={() => onConfirm([])} style={{
              marginTop: 8, padding: '10px 24px', border: 'none', borderRadius: 8,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', boxShadow: `0 4px 10px -3px rgba(15,84,76,.4)`
            }}>
              Continue Without Batch
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 24px', background: teal[50], borderBottom: `1px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: inkSoft }}>
              <span>Selected: {totalSelected} / {targetQuantity}</span>
              <span style={{ color: remaining > 0 ? amber[500] : teal[600] }}>
                {remaining > 0 ? `${remaining} remaining` : 'Complete'}
              </span>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: teal[50], fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, position: 'sticky', top: 0 }}>
                    <th style={{ textAlign: 'left', padding: '10px 16px' }}>Batch #</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>Available</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>Expiry</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px' }}>Unit Cost</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>Use</th>
                  </tr>
                </thead>
                <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                  {batches.map((batch) => (
                    <tr key={batch.id} style={{ borderBottom: `1px solid ${hairline}` }}>
                      <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: ink }}>{batch.batchNumber}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: ink }}>{batch.remainingQuantity}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {batch.expiryDate ? (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: inkSoft }}>
                            <Calendar size={10} />{new Date(batch.expiryDate).toLocaleDateString()}
                          </span>
                        ) : (
                          <span style={{ color: '#babec5' }}>&mdash;</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>{currency}{formatNumber(batch.costPerUnit)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min="0"
                            max={batch.remainingQuantity}
                            style={{
                              width: 60, padding: '4px 6px', borderRadius: 6, border: `1.2px solid ${hairline}`, fontSize: 12, fontWeight: 600, textAlign: 'center', outline: 'none', color: ink, background: paper
                            }}
                            value={selections[batch.id] || 0}
                            onChange={(e) => updateSelection(batch.id, parseInt(e.target.value) || 0)}
                          />
                          {remaining > 0 && batch.remainingQuantity > 0 && (
                            <button
                              onClick={() => quickFill(batch.id)}
                              style={{
                                fontSize: 10, padding: '3px 8px', border: `1px solid ${hairline}`, borderRadius: 5,
                                background: paper, color: inkSoft, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                              }}
                            >
                              Fill
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderTop: `1px solid ${hairline}`, background: teal[50] }}>
              <div style={{ fontSize: 11, color: inkSoft, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> FIFO order &mdash; oldest batches shown first
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} style={{
                  padding: '9px 20px', border: `1px solid ${hairline}`, borderRadius: 8,
                  background: paper, color: inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit'
                }}>
                  Cancel
                </button>
                <button onClick={handleConfirm} style={{
                  padding: '9px 24px', border: 'none', borderRadius: 8,
                  background: isComplete ? `linear-gradient(155deg, ${teal[500]}, ${teal[700]})` : `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                  color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', boxShadow: `0 4px 10px -3px rgba(15,84,76,.4)`
                }}>
                  {isComplete ? 'Confirm Full Selection' : `Confirm (${totalSelected}/${targetQuantity})`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BatchPickerModal;
