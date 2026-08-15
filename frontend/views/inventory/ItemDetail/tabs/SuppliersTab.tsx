import React from 'react';
import { Building2, DollarSign, Clock, Package, Phone, Mail, User } from 'lucide-react';
import type { Item, Supplier } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
  suppliers: Supplier[];
}

export const SuppliersTab: React.FC<Props> = ({ item, suppliers }) => {
  const preferredSupplier = suppliers.find(s => s.id === item.preferredSupplierId);
  const alternateSuppliers = suppliers.filter(s => s.id !== item.preferredSupplierId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: t[500] }}><Building2 size={16} /></span>
          <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preferred Supplier</span>
        </div>
        <div style={{ padding: 20 }}>
          {preferredSupplier ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 10, background: t[50], borderRadius: 12 }}><Building2 size={20} style={{ color: t[500] }} /></div>
                <div>
                  <h4 style={{ fontWeight: 600, color: ink }}>{preferredSupplier.name}</h4>
                  <p style={{ fontSize: 12, color: inkSoft }}>Primary source for this item</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 14 }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Name</span>
                  <span style={{ fontWeight: 600, color: ink }}>{preferredSupplier.name}</span>
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Code</span>
                  <span style={{ fontFamily: 'monospace', color: ink }}>{preferredSupplier.code || preferredSupplier.id}</span>
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Contact</span>
                  <span style={{ color: ink }}>{preferredSupplier.contactPerson || preferredSupplier.email || '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Phone</span>
                  <span style={{ color: ink }}>{preferredSupplier.phone || '—'}</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', color: inkSoft }}>
              <Building2 size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p style={{ fontSize: 14, fontWeight: 500 }}>No preferred supplier assigned</p>
            </div>
          )}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1.4px solid ${hairline}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 14 }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />Lead Time
              </span>
              <span style={{ fontWeight: 600, color: ink }}>{item.leadTimeDays || 0} days</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                <Package size={11} style={{ display: 'inline', marginRight: 4 }} />MOQ
              </span>
              <span style={{ fontWeight: 600, color: ink }}>{item.minOrderQty || 0}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>
                <DollarSign size={11} style={{ display: 'inline', marginRight: 4 }} />Last Cost
              </span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: '#111827' }}>{(item.costPrice || item.cost || 0).toFixed(2)}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Supplier SKU</span>
              <span style={{ fontFamily: 'monospace', color: ink }}>{(item as Item & { supplierCode?: string }).supplierCode || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {alternateSuppliers.length > 0 && (
        <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}><User size={16} /></span>
            <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Alternate Suppliers ({alternateSuppliers.length})</span>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alternateSuppliers.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: t[50], borderRadius: 12, border: `1.4px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ padding: 6, background: paper, borderRadius: 9, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <Building2 size={16} style={{ color: inkSoft }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: ink }}>{s.name}</p>
                    <p style={{ fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      {s.contactPerson && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={10} />{s.contactPerson}</span>}
                      {s.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={10} />{s.email}</span>}
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={10} />{s.phone || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!preferredSupplier && alternateSuppliers.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: inkSoft }}>
          <Building2 size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>No Suppliers</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Add suppliers in the Purchasing module.</p>
        </div>
      )}
    </div>
  );
};