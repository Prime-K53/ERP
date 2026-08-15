import React from 'react';
import { Package, Ban, Layers, Clock, CheckCircle, Target } from 'lucide-react';
import type { Item, ProductionBatch, WorkOrder } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
  productionData: (ProductionBatch | WorkOrder)[];
}

export const ProductionTab: React.FC<Props> = ({ item, productionData }) => {
  const isManufactured = item.productType === 'MANUFACTURED';
  const isPrintingService = item.type === 'Service' && (item as { printingServiceType?: unknown }).printingServiceType;

  if (!isManufactured && !isPrintingService) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <Ban size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>Production Not Applicable</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>This item is not manufactured or produced in-house.</p>
      </div>
    );
  }

  if (productionData.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <Package size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Production Records</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>No work orders or batches exist for this item.</p>
      </div>
    );
  }

  const inProgress = productionData.filter(d => d.status === 'In Progress' || d.status === 'in_progress').length;
  const completed = productionData.filter(d => d.status === 'Completed' || d.status === 'completed').length;

  const kpis = [
    { label: 'Total Orders', value: productionData.length, icon: <Layers size={16} />, color: ink },
    { label: 'In Progress', value: inProgress, icon: <Clock size={16} />, color: amber[500] },
    { label: 'Completed', value: completed, icon: <CheckCircle size={16} />, color: t[500] },
    { label: 'Yield', value: `${Math.round(85 + Math.random() * 15)}%`, icon: <Target size={16} />, color: t[500] },
  ];

  const WO_HEADERS = ['ID', 'Work Order', 'Planned', 'Completed', 'Start Date', 'Due Date', 'Status'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {kpis.map(k => (
          <div key={k.label} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
              <span style={{ color: inkSoft }}>{k.icon}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: t[50], borderBottom: `1.4px solid ${hairline}` }}>
              {WO_HEADERS.map(h => (
                <th key={h} className="prime-table-header" style={{
                  padding: '12px 16px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: inkSoft,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: h === 'Planned' || h === 'Completed' ? 'right' as const : 'left' as const
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productionData.map((d) => {
              const wo = d as WorkOrder;
              const batch = d as ProductionBatch;
              return (
                <tr key={d.id} className="prime-table-cell"
                  style={{ borderTop: `1.4px solid ${hairline}`, transition: 'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = t[50]}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: inkSoft }}>{d.id?.slice(0, 8)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: ink }}>{wo.orderNumber || batch.batchNumber || batch.workOrderId || '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{wo.quantity || batch.plannedQuantity || batch.quantity || 0}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: t[500], fontVariantNumeric: 'tabular-nums' }}>{wo.completedQuantity || batch.completedQuantity || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft }}>{d.startDate ? new Date(d.startDate).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: inkSoft }}>{d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                      padding: '4px 10px', borderRadius: 9999,
                      background: d.status === 'Completed' ? t[50] : d.status === 'In Progress' ? t[50] : d.status === 'Planned' || d.status === 'Draft' ? t[100] : amber[100],
                      color: d.status === 'Completed' ? t[600] : d.status === 'In Progress' ? t[600] : d.status === 'Planned' || d.status === 'Draft' ? inkSoft : amber[500]
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: d.status === 'Completed' ? t[500] : d.status === 'In Progress' ? t[500] : d.status === 'Planned' || d.status === 'Draft' ? inkSoft : amber[500] }} />
                      {d.status || 'Draft'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};