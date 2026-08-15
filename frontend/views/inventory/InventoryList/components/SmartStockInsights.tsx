import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, X, AlertTriangle, TrendingUp, Package, RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { detectInventoryRisks } from '../../../../services/geminiService';
import type { Item } from '../../../../types';
import { useAuth } from '../../../../context/AuthContext';
import { currencyService } from '../../../../services/currencyService';

interface RiskItem {
  sku?: string;
  name: string;
  risk: 'stockout' | 'low_stock' | 'zero_stock' | 'overstock';
  currentStock: number;
  suggestedAction: string;
  costPrice?: number;
  sellingPrice?: number;
}

interface Props {
  items: Item[];
  onClose: () => void;
}

function localFallbackAnalysis(items: Item[]): RiskItem[] {
  const risks: RiskItem[] = [];
  for (const item of items) {
    const stock = item.stock || 0;
    const minStock = item.minStockLevel || item.reorderPoint || 0;
    const name = item.name || 'Unknown';
    const sku = item.sku;
    const costPrice = item.costPrice || item.cost || 0;
    const sellingPrice = item.sellingPrice || item.price || 0;

    if (stock <= 0) {
      risks.push({ sku, name, risk: 'zero_stock', currentStock: 0, suggestedAction: 'Place urgent reorder \u2014 item is out of stock', costPrice, sellingPrice });
    } else if (minStock > 0 && stock <= minStock) {
      risks.push({ sku, name, risk: 'low_stock', currentStock: stock, suggestedAction: `Reorder soon \u2014 stock (${stock}) is at or below minimum (${minStock})`, costPrice, sellingPrice });
    } else if (stock <= 5) {
      risks.push({ sku, name, risk: 'stockout', currentStock: stock, suggestedAction: `Critical \u2014 only ${stock} units remaining`, costPrice, sellingPrice });
    } else if (stock > 500) {
      risks.push({ sku, name, risk: 'overstock', currentStock: stock, suggestedAction: `Overstocked \u2014 ${stock} units, consider promotion or transfer`, costPrice, sellingPrice });
    }
  }
  return risks.slice(0, 30);
}

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; Icon: React.FC<any> }> = {
  zero_stock: { label: 'Out of Stock', color: '#DC2626', bg: '#FEF2F2', border: '#DC2626', Icon: AlertCircle },
  low_stock: { label: 'Low Stock', color: '#D97706', bg: '#FFFBEB', border: '#D97706', Icon: AlertTriangle },
  stockout: { label: 'Critical', color: '#DC2626', bg: '#FEF2F2', border: '#DC2626', Icon: AlertCircle },
  overstock: { label: 'Overstocked', color: '#2563EB', bg: '#EFF6FF', border: '#2563EB', Icon: TrendingUp },
};

const teal = { 50:'#eef7f6', 100:'#d3ece9', 200:'#a6d9d3', 300:'#72c0b7', 400:'#3fa294', 500:'#1f8577', 600:'#146b60', 700:'#0f544c', 800:'#0b3e39', 900:'#082e2a' };
const amber = { 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

export const SmartStockInsights: React.FC<Props> = ({ items, onClose }) => {
  const { companyConfig } = useAuth();
  const cs = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'ai' | 'local'>('ai');

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const aiResult = await detectInventoryRisks(items);
      if (Array.isArray(aiResult) && aiResult.length > 0) {
        setRisks(aiResult);
        setMode('ai');
      } else {
        setRisks(localFallbackAnalysis(items));
        setMode('local');
      }
    } catch {
      setRisks(localFallbackAnalysis(items));
      setMode('local');
    } finally {
      setLoading(false);
    }
  }, [items]);

  useEffect(() => { analyze(); }, [analyze]);

  const grouped = risks.reduce<Record<string, RiskItem[]>>((acc, r) => {
    if (!acc[r.risk]) acc[r.risk] = [];
    acc[r.risk].push(r);
    return acc;
  }, {});

  const riskOrder = ['zero_stock', 'stockout', 'low_stock', 'overstock'];
  const sortedGroups = riskOrder.filter(k => grouped[k]).map(k => ({ key: k, items: grouped[k] }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }} onClick={onClose}>
      <div style={{
        maxWidth: '100%', width: 600, background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
        maxHeight: '85vh',
      }} onClick={(e) => e.stopPropagation()}>
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
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0, color: '#fff'
            }}>
              <Sparkles size={20} />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'Inter','DM Sans',sans-serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>Smart Stock Insights</h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                {loading ? 'Analyzing inventory...' : mode === 'ai' ? 'AI-powered analysis' : 'Rule-based analysis'}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .15s ease', flexShrink: 0,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          ><X size={15} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: paper }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px' }}>
              <Loader2 size={36} className="animate-spin" style={{ color: teal[500] }} />
              <p style={{ fontSize: 13, fontWeight: 500, color: inkSoft, marginTop: 12 }}>AI is scanning your inventory...</p>
            </div>
          ) : risks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <CheckCircle size={24} style={{ color: '#16A34A' }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: inkSoft, textAlign: 'center' }}>No issues detected</p>
              <p style={{ fontSize: 11, color: hairline, marginTop: 4, textAlign: 'center' }}>Your inventory looks healthy</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mode === 'local' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', fontWeight: 600 }}>
                  <AlertTriangle size={14} />
                  <span>AI analysis unavailable \u2014 showing rule-based results. <button onClick={analyze} className="underline font-medium" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D97706', textDecoration: 'underline', padding: 0, font: 'inherit' }}>Retry AI</button></span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: ink }}>
                <Package size={16} />
                <span>{risks.length} item{risks.length !== 1 ? 's' : ''} flagged for attention</span>
                <button
                  onClick={analyze}
                  style={{
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                    color: '#fff', border: '1.4px solid transparent',
                    transition: 'all .12s'
                  }}>
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>

              {sortedGroups.map(group => {
                const cfg = RISK_CONFIG[group.key] || RISK_CONFIG.low_stock;
                const Icon = cfg.Icon;
                return (
                  <div key={group.key} style={{ borderRadius: 10, border: `1px solid ${cfg.border}`, overflow: 'hidden' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 12px', fontSize: 11, fontWeight: 700,
                      background: cfg.bg, color: cfg.color,
                    }}>
                      <Icon size={14} />
                      {cfg.label}
                      <span style={{ marginLeft: 'auto' }}>{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                    </div>
                    {group.items.map((r, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderTop: `1px solid ${teal[50]}`,
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: ink }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: inkSoft, marginTop: 2 }}>
                            Stock: <span style={{ fontWeight: 700, color: r.currentStock <= 0 ? '#DC2626' : ink }}>{r.currentStock}</span>
                            {r.sku ? ` \u00B7 SKU: ${r.sku}` : ''}
                            {r.costPrice ? ` \u00B7 Cost: ${cs}${r.costPrice.toLocaleString()}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: cfg.color, marginTop: 2 }}>
                            {r.suggestedAction}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: '10px 20px', background: teal[50], borderTop: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
            padding: '7px 16px', borderRadius: 9, cursor: 'pointer',
            background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
            transition: 'all .15s ease',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          >Close</button>
        </div>
      </div>
    </div>
  );
};
