import React, { useState } from 'react';
import { Loader2, FileText, ArrowLeft, DollarSign, CheckCircle2, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useProduction } from '../../context/ProductionContext';
import { generateBOM } from '../../services/aiAnalyticsUtils';
import { currencyService } from '../../services/currencyService';

const BOMGenerator: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const { inventory } = useInventory();
  const { boms } = useProduction();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState(100);

  const runGenerate = () => {
    if (!productName.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const res = generateBOM(productName, quantity, inventory || [], boms || []);
      setResult(res);
      setLoading(false);
    }, 300);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 24, background: '#FEFDFB', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/ai-analytics')} style={{ padding: 8, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FEFDFB' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        ><ArrowLeft size={20} /></button>
        <FileText color="#1f8577" size={28} />
        <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#23282A', margin: 0 }}>BOM Generator</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>Generate Bill of Materials from product specs</p></div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <input value={productName} onChange={e => setProductName(e.target.value)} onKeyDown={e => e.key === 'Enter' && runGenerate()} placeholder="Product name (e.g., 'Exam Booklet A4')" style={{ flex: 1, padding: '10px 16px', borderRadius: 12, border: '1.4px solid #e4ddd1', fontSize: 13, outline: 'none', background: '#FEFDFB', color: '#23282A' }} />
        <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} min={1} style={{ width: 96, padding: '10px 16px', borderRadius: 12, border: '1.4px solid #e4ddd1', fontSize: 13, background: '#FEFDFB', color: '#23282A' }} />
        <button onClick={runGenerate} disabled={loading || !productName.trim()} style={{ padding: '10px 24px', background: '#1f8577', color: '#fff', borderRadius: 12, fontWeight: 500, border: 'none', cursor: 'pointer', opacity: loading || !productName.trim() ? 0.5 : 1 }}
          onMouseEnter={e => { if (!loading && productName.trim()) e.currentTarget.style.background = '#166b60' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1f8577' }}
        >Generate</button>
      </div>

      {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={40} className="animate-spin" color="#1f8577" style={{ margin: '0 auto' }} /></div>}

      {result?.bom && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #5c6567' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><FileText size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Material</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{currency}{(result.bom.materialCost || 0).toFixed(2)}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><DollarSign size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Labor</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{currency}{(result.bom.laborCost || 0).toFixed(2)}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#d3ece9', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><CheckCircle2 size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Total Cost</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{currency}{(result.bom.totalCost || 0).toFixed(2)}</p></div>
            </div>
            <div style={{ background: '#FEFDFB', padding: 12, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: '1.4px solid #e4ddd1', display: 'flex', alignItems: 'center', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: '#eef7f6', color: '#1f8577', borderRadius: 8, flexShrink: 0 }}><TrendingUp size={20} /></div>
              <div style={{ minWidth: 0 }}><p style={{ fontSize: 10, fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1, margin: '0 0 6px 0' }}>Suggested Price</p><p style={{ fontSize: 18, fontWeight: 600, color: '#23282A', margin: 0 }}>{currency}{(result.bom.suggestedSellingPrice || 0).toFixed(2)}</p></div>
            </div>
          </div>

          <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#23282A' }}>{result.bom.name} v{result.bom.version}</span>
              <span style={{ fontSize: 11, background: '#d3ece9', color: '#1f8577', padding: '2px 8px', borderRadius: 9999, fontWeight: 500, textTransform: 'capitalize' }}>{result.bom.status}</span>
            </div>
            <div style={{ padding: 12, borderBottom: '1px solid #e4ddd1' }}>
              <div style={{ fontSize: 11, color: '#5c6567', marginBottom: 8 }}>Components</div>
              {result.bom.items?.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 4, fontSize: 13 }}><span style={{ color: '#23282A' }}>{item.name}</span><span style={{ color: '#5c6567' }}>{item.quantity} {item.unit} @ {currency}{(item.unitCost || 0).toFixed(2)}</span></div>
              ))}
            </div>
            <div style={{ padding: 12, fontSize: 11, color: '#5c6567', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.bom.estimatedProductionHours && <div>Est. Hours: {result.bom.estimatedProductionHours}</div>}
              <div>Suggested Margin: {result.bom.suggestedProfitMargin}</div>
            </div>
          </div>

          {result.similarBoms?.length > 0 && (
            <div style={{ background: '#FEFDFB', borderRadius: 12, padding: 16, border: '1.4px solid #e4ddd1', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#23282A', marginBottom: 8 }}>Similar BOMs</div>
              {result.similarBoms.map((b: any, i: number) => (
                <div key={i} style={{ fontSize: 13, color: '#5c6567', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><FileText size={14} color="#5c6567" />{b.name} — {currency}{(b.totalCost || 0).toFixed(2)}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 448 }}>
            <FileText size={48} color="#1f8577" style={{ margin: '0 auto 16px', opacity: 0.6 }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#23282A', marginBottom: 8 }}>Generate a Bill of Materials</h2>
            <p style={{ fontSize: 13, color: '#5c6567' }}>Enter a product name and quantity above. The AI analyzes your inventory and existing BOMs to suggest materials, costs, and pricing. {(inventory || []).length} inventory items, {(boms || []).length} existing BOMs loaded.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BOMGenerator;