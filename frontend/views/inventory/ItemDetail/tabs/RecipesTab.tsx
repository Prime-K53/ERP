import React from 'react';
import { FlaskConical, Clock, Cpu, Users, FileText, Layers } from 'lucide-react';
import type { Item } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
}

export const RecipesTab: React.FC<Props> = ({ item }) => {
  const isManufactured = item.productType === 'MANUFACTURED';
  const isPrintingService = item.type === 'Service' && item.printingServiceType;
  const isRawMaterial = item.type === 'Raw Material' || item.type === 'Material';

  if (isRawMaterial) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <FlaskConical size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Recipe Required</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Raw materials do not require recipes.</p>
      </div>
    );
  }

  const SectionCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</span>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );

  if (isManufactured) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SectionCard icon={<FileText size={16} />} title="Bill of Materials">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 14 }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>BOM ID</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: ink }}>{item.serviceRecipeId || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Last Updated</span>
              <span style={{ color: ink }}>{item.validationTimestamp ? new Date(item.validationTimestamp).toLocaleString() : '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Version</span>
              <span style={{ color: ink, fontWeight: 500 }}>{item.pricingVersion ? `v${item.pricingVersion}` : '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Estimated Cost</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: '#111827' }}>{(item.costPrice || item.cost || 0).toFixed(2)}</span>
            </div>
          </div>
          <button className="prime-btn-secondary" style={{ marginTop: 20, padding: '8px 16px', background: t[50], color: t[600], border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background .15s' }}>
            <FileText size={14} /> Open BOM Editor
          </button>
        </SectionCard>
      </div>
    );
  }

  if (isPrintingService) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SectionCard icon={<Layers size={16} />} title="Service Recipe">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontSize: 14 }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Recipe ID</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: ink }}>{item.serviceRecipeId || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Print Type</span>
              <span style={{ textTransform: 'capitalize', fontWeight: 500, color: ink }}>{item.printType || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />Est. Time
              </span>
              <span style={{ fontWeight: 600, color: ink }}>{item.estimatedTime || 0} min</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                <Cpu size={10} style={{ display: 'inline', marginRight: 4 }} />Default Machine
              </span>
              <span style={{ color: ink }}>{item.defaultMachine || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                <Users size={10} style={{ display: 'inline', marginRight: 4 }} />Default Labor
              </span>
              <span style={{ color: ink }}>{item.defaultLabor || '—'}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Department</span>
              <span style={{ color: ink }}>{item.productionDepartment || '—'}</span>
            </div>
          </div>
          <button className="prime-btn-secondary" style={{ marginTop: 20, padding: '8px 16px', background: t[50], color: t[600], border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background .15s' }}>
            <Layers size={14} /> Open Service Recipe
          </button>
        </SectionCard>

        {(item.printFinishing || []).length > 0 && (
          <SectionCard icon={<Layers size={16} />} title="Finishing Options">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {item.printFinishing?.map((f: string, i: number) => (
                <span key={i} style={{ padding: '6px 12px', background: t[50], color: ink, borderRadius: 9, fontSize: 12, fontWeight: 500, border: `1.4px solid ${hairline}` }}>
                  {f}
                </span>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
      <FlaskConical size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
      <p style={{ fontSize: 14, fontWeight: 600 }}>Recipe Not Applicable</p>
      <p style={{ fontSize: 12, marginTop: 4 }}>This item type does not use recipes.</p>
    </div>
  );
};