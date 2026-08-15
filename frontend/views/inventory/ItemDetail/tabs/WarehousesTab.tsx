import React from 'react';
import { Warehouse, MapPin, Thermometer, AlertTriangle, Layers, Hash, Barcode, Shield } from 'lucide-react';
import type { Item } from '../../../../types';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
}

export const WarehousesTab: React.FC<Props> = ({ item }) => {
  const locationStock = item.locationStock || [];
  const hasMultiWarehouse = locationStock.length > 0;

  const primaryWarehouse = {
    name: item.warehouseId || 'Default',
    location: item.storageLocation || '',
    shelf: item.shelf || '',
    bin: item.binLocation || '',
    quantity: locationStock.find((ls) => ls.warehouseId === item.warehouseId)?.quantity || item.stock || 0,
    reserved: item.reserved || 0,
  };

  const conditions = [
    { label: 'Hazardous', enabled: item.hazardous, color: '#ef4444' },
    { label: 'Temperature Controlled', enabled: item.temperatureControlled, color: t[500] },
    { label: 'Batch Controlled', enabled: item.batchControlled, color: '#a855f7' },
    { label: 'Lot Tracking', enabled: item.lotTracking, color: amber[500] },
    { label: 'Serial Tracking', enabled: item.serialTracking, color: t[500] },
    { label: 'Expiration Tracking', enabled: item.expirationTracking, color: '#ef4444' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}><Warehouse size={16} /></span>
          <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {hasMultiWarehouse ? `Warehouses (${locationStock.length})` : 'Primary Warehouse'}
          </span>
        </div>
        {!hasMultiWarehouse ? (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 10, background: t[50], borderRadius: 12 }}><Warehouse size={20} style={{ color: t[500] }} /></div>
              <div>
                <h4 style={{ fontWeight: 600, color: ink }}>{primaryWarehouse.name}</h4>
                <p style={{ fontSize: 12, color: inkSoft }}>Primary Warehouse</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 14 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Storage Location</span>
                <span style={{ fontWeight: 600, color: ink }}>{primaryWarehouse.location || '—'}</span>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Shelf</span>
                <span style={{ fontWeight: 600, color: ink }}>{primaryWarehouse.shelf || '—'}</span>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Bin</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: ink }}>{primaryWarehouse.bin || '—'}</span>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Quantity</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: ink }}>{primaryWarehouse.quantity}</span>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: inkSoft }}>
              <span>Reserved: <strong style={{ color: amber[500] }}>{primaryWarehouse.reserved}</strong></span>
              <span>Available: <strong style={{ color: Math.max(0, primaryWarehouse.quantity - primaryWarehouse.reserved) > 0 ? t[500] : danger }}>
                {Math.max(0, primaryWarehouse.quantity - primaryWarehouse.reserved)}
              </strong></span>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {locationStock.map((ls, i: number) => (
              <div key={i} style={{ background: t[50], borderRadius: 12, padding: 16, border: `1.4px solid ${hairline}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MapPin size={16} style={{ color: inkSoft }} />
                  <span style={{ fontWeight: 600, color: ink }}>{ls.warehouseId}</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 700, color: ink }}>{ls.quantity}</p>
                <p style={{ fontSize: 12, color: inkSoft }}>{item.unit || 'pcs'} in stock</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}><Shield size={16} /></span>
          <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>Storage Conditions</span>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {conditions.map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 9, background: t[50] }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.enabled ? c.color : hairline }} />
                <span style={{ fontSize: 14, color: c.enabled ? ink : inkSoft, fontWeight: c.enabled ? 500 : 400 }}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};