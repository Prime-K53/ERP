import React, { useMemo } from 'react';
import { TrendingUp, DollarSign, PieChart, AlertTriangle, Recycle, BarChart3, ShieldCheck, X, ChevronRight } from 'lucide-react';
import { Invoice, WorkOrder } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useInventory } from '../../../context/InventoryContext';
import { useProduction } from '../../../context/ProductionContext';
import { currencyService } from '../../../services/currencyService';

interface ProfitAnalysisModalProps {
  invoice: Invoice;
  onClose: () => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

export const ProfitAnalysisModal: React.FC<ProfitAnalysisModalProps> = ({ invoice, onClose }) => {
  const { companyConfig } = useAuth(); const { boms = [], workOrders = [] } = useProduction(); const { inventory = [] } = useInventory();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const analysis = useMemo(() => {
    let totalWasteCost = 0;
    const snapshots = invoice.adjustmentSnapshots || [];

    const itemsData = (invoice.items || []).map(item => {
        const grossTotal = (item.price || 0) * (item.quantity || 0);
        const netTotal = grossTotal;
        let unitCost = item.cost || 0;
        let scrapCost = 0;

        const bom = boms.find((b: any) => b.productId === item.id);

        if (item.type === 'Stationery') {
            unitCost = item.cost || 0;
        } else if (bom) {
            let bomMaterialCost = 0;
            bom.components.forEach((comp: any) => {
                const mat = inventory.find((inv: any) => inv.id === comp.materialId);
                const matPrice = mat?.cost || mat?.price || 0;
                bomMaterialCost += (comp.quantity * matPrice);
            });
            unitCost = bomMaterialCost + (bom.laborCost || 0);

            const relatedWOs = (workOrders as WorkOrder[]).filter(wo => wo.productId === item.id && wo.customerName === invoice.customerName);
            const totalQty = relatedWOs.reduce((s, w) => s + (w.quantityPlanned || 0), 0);
            const totalWaste = relatedWOs.reduce((s, w) => s + (w.quantityWaste || 0), 0);

            if (totalQty > 0) {
                const wasteFactor = totalWaste / totalQty;
                scrapCost = unitCost * wasteFactor;
                totalWasteCost += (scrapCost * (item.quantity || 0));
            }
        }

        const totalCost = (unitCost + scrapCost) * (item.quantity || 0);
        const profit = netTotal - totalCost;
        const margin = netTotal > 0 ? (profit / netTotal) * 100 : 0;

        return { ...item, grossTotal, netTotal, totalCost, scrapCost, profit, margin };
    });

    const totalRevenue = itemsData.reduce((sum, i) => sum + (i.netTotal || 0), 0);
    const totalCost = itemsData.reduce((sum, i) => sum + (i.totalCost || 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return { items: itemsData, totalRevenue, totalCost, totalProfit, totalMargin, totalWasteCost, snapshots };
  }, [invoice, boms, inventory, workOrders]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div style={{
        width: 960, maxWidth: '100%', maxHeight: '92vh',
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
              <BarChart3 size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>
                P&L Performance Audit
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                Voucher Tracking ID: {invoice.id}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid #3b82f6`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, background: '#eff6ff', color: '#2563eb' }}>
                  <DollarSign size={18} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Net Billings</p>
                  <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{currency}{(analysis.totalRevenue || 0).toLocaleString()}</p>
                </div>
              </div>
              <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid #475569`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, background: '#f1f5f9', color: '#475569' }}>
                  <TrendingUp size={18} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>True COGS</p>
                  <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{currency}{(analysis.totalCost || 0).toLocaleString()}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 9, fontWeight: 600, color: inkSoft, textTransform: 'uppercase' }}>Includes Material & Labor</p>
                </div>
              </div>
              <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid #059669`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, background: '#ecfdf5', color: '#059669' }}>
                  <BarChart3 size={18} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Gross Result</p>
                  <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: analysis.totalProfit >= 0 ? ink : '#dc2626', fontFamily: "'JetBrains Mono', monospace" }}>{currency}{(analysis.totalProfit || 0).toLocaleString()}</p>
                </div>
              </div>
              <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}`, borderLeft: `4px solid #9333ea`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ padding: 8, borderRadius: 8, background: '#f5f3ff', color: '#9333ea' }}>
                  <PieChart size={18} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05 }}>Net Yield</p>
                  <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: analysis.totalMargin >= 0 ? ink : '#dc2626', fontFamily: "'JetBrains Mono', monospace" }}>{(analysis.totalMargin || 0).toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {/* Market Adjustment Snapshots */}
            {analysis.snapshots.length > 0 && (
              <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 8, background: teal[50] }}>
                  <ShieldCheck size={15} color={teal[600]} />
                  <h3 style={{ margin: 0, fontSize: 10, fontWeight: 800, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.08 }}>Market Adjustment Audit (Snapshot)</h3>
                </div>
                <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {analysis.snapshots.map((adj, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: teal[50], borderRadius: 8, border: `1px solid ${teal[100]}` }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>{adj.name}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: ink }}>{adj.type === 'PERCENTAGE' ? `${adj.value}% of Cost` : 'Fixed Amount'}</div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{currency}{adj.calculatedAmount.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Waste Impact Warning */}
            {analysis.totalWasteCost > 0 && (
              <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${amber[300]}`, background: `${amber[100]}80`, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: amber[100], color: amber[500], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Recycle size={24} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 11, fontWeight: 800, color: amber[600], textTransform: 'uppercase', letterSpacing: 0.08 }}>Wastage Impact Detected</h4>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                    Manufacturing records show production scrap for this job. We have added <strong>{currency}{(analysis.totalWasteCost || 0).toFixed(2)}</strong> to the COGS to reflect actual raw material loss.
                  </p>
                </div>
              </div>
            )}

            {/* Detailed Table */}
            <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 8, background: teal[50] }}>
                <BarChart3 size={15} color={inkSoft} />
                <h3 style={{ margin: 0, fontSize: 10, fontWeight: 800, color: ink, textTransform: 'uppercase', letterSpacing: 0.08 }}>Line Item Attribution</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 9, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Specification</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 9, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Volume</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 9, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Net Unit</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 9, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Yield</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 9, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>P&L Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${hairline}` }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: ink }}>{item.name}</div>
                          <div style={{ fontSize: 10, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{item.type}</div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{item.quantity}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{currency}{((item.netTotal || 0) / (item.quantity || 1)).toFixed(2)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            background: item.margin >= 20 ? '#ecfdf5' : item.margin > 0 ? `${amber[100]}` : '#fef2f2',
                            color: item.margin >= 20 ? '#059669' : item.margin > 0 ? '#d97706' : '#dc2626',
                            border: `1px solid ${item.margin >= 20 ? '#a7f3d0' : item.margin > 0 ? amber[300] : '#fecaca'}`
                          }}>
                            {(item.margin || 0).toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: item.profit >= 0 ? ink : '#dc2626', fontFamily: "'JetBrains Mono', monospace" }}>{currency}{(item.profit || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {analysis.totalProfit < 0 && (
              <div style={{
                padding: 16, borderRadius: 12, background: '#fef2f2', border: `1px solid #fecaca`,
                display: 'flex', alignItems: 'center', gap: 12, color: '#991b1b'
              }}>
                <AlertTriangle size={22} />
                <div>
                  <h4 style={{ margin: 0, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.08 }}>Negative Liquidity Warning</h4>
                  <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 500 }}>Transaction is currently operating at a loss. Strategic pricing review recommended for this SKU.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '16px 28px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
          <button type="button" onClick={onClose}
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
        </div>
      </div>
    </div>
  );
};

export default ProfitAnalysisModal;
