import React, { useState, useEffect, useCallback } from 'react';
import { Package, DollarSign, Warehouse, Shield, Download } from 'lucide-react';
import type { Item } from '../../../../types';
import { resolveMinimumMarkup } from '../../../../services/pricingValidationService';
import { generateBarcodeDataUrl, saveBarcodeAsImage } from '../../../../utils/barcodeGenerator';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: Item;
}

export const OverviewTab: React.FC<Props> = ({ item }) => {
  const [barcodeDataUrl, setBarcodeDataUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const barcodeText = item.barcode || item.sku || item.id || item.name;

  useEffect(() => {
    if (barcodeText) {
      setBarcodeDataUrl(generateBarcodeDataUrl(barcodeText));
    } else {
      setBarcodeDataUrl('');
    }
  }, [barcodeText]);

  useEffect(() => {
    if (item.qrCode) {
      import('qrcode').then(QRCode => {
        QRCode.default.toDataURL(item.qrCode!, { width: 120, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
      });
    } else {
      setQrDataUrl('');
    }
  }, [item.qrCode]);

  const handleSaveBarcode = useCallback(() => {
    if (barcodeText) {
      saveBarcodeAsImage(barcodeText, `barcode-${item.sku || item.id}.png`, { height: 80, width: 3 });
    }
  }, [barcodeText, item.sku, item.id]);

  const handleSaveQR = useCallback(() => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `qrcode-${item.sku || item.id}.png`;
    link.href = qrDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [qrDataUrl, item.sku, item.id]);

  const b = (val: any, fallback = '—') => val || fallback;

  const sections = [
    {
      icon: <Package size={16} />,
      title: 'General',
      fields: [
        { label: 'Name', value: item.name, bold: true },
        { label: 'SKU', value: b(item.sku), mono: true },
        { label: 'Description', value: b(item.description), span: 2 },
        { label: 'Brand', value: b(item.brand) },
        { label: 'Category', value: b(item.category) },
        { label: 'Classification', value: item.type },
        { label: 'Product Type', value: b(item.productType) },
        { label: 'Inventory Role', value: item.inventoryRole || 'sellable', capitalize: true },
        { label: 'Barcode', value: item.barcode, mono: true, barcode: true },
        { label: 'QR Code', value: item.qrCode, mono: true, qrcode: true },
      ],
    },
    {
      icon: <DollarSign size={16} />,
      title: 'Costing & Pricing',
      fields: [
        { label: 'Cost Method', value: item.costingMethod || 'weighted_average', capitalize: true },
        { label: 'Last Purchase Cost', value: (item.costPrice || item.cost || 0).toFixed(2), amount: true },
        { label: 'Avg Cost', value: (item.normalizedCP || item.costPrice || item.cost || 0).toFixed(2), amount: true },
        { label: 'Cost Price', value: (item.costPrice || item.cost || 0).toFixed(2), amount: true, bold: true },
        { label: 'Selling Price', value: (item.sellingPrice || item.price || 0).toFixed(2), amount: true, bold: true, accent: true },
        { label: 'Min Markup', value: `${resolveMinimumMarkup(item)}%` },
        { label: 'Currency', value: item.currency || 'KWD' },
      ],
    },
    {
      icon: <Warehouse size={16} />,
      title: 'Storage',
      fields: [
        { label: 'Warehouse', value: b(item.warehouseId) },
        { label: 'Storage Location', value: b(item.storageLocation) },
        { label: 'Shelf', value: b(item.shelf) },
        { label: 'Bin', value: b(item.binLocation), mono: true },
      ],
    },
    {
      icon: <Shield size={16} />,
      title: 'Tracking',
      fields: [
        { label: 'Lot Tracking', value: item.lotTracking ? 'Enabled' : '—', enabled: !!item.lotTracking },
        { label: 'Serial Tracking', value: item.serialTracking ? 'Enabled' : '—', enabled: !!item.serialTracking },
        { label: 'Batch Controlled', value: item.batchControlled ? 'Enabled' : '—', enabled: !!item.batchControlled },
        { label: 'Temperature Controlled', value: item.temperatureControlled ? 'Enabled' : '—', enabled: !!item.temperatureControlled },
        { label: 'Hazardous', value: item.hazardous ? 'Yes' : 'No' },
        { label: 'Expiration Tracking', value: item.expirationTracking ? 'Enabled' : '—', enabled: !!item.expirationTracking },
      ],
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 24 }}>
      {sections.map(section => (
        <div key={section.title} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '14px 20px', background: t[50], borderBottom: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: 6, borderRadius: 9, background: paper, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: inkSoft }}>{section.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>{section.title}</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 24px', fontSize: 14 }}>
              {section.fields.map(f => {
                if ((f as any).barcode && barcodeText) {
                  return (
                    <div key={f.label} style={{ gridColumn: 'span 2' }}>
                      <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 2 }}>
                        {f.label}{!item.barcode && barcodeText ? <span style={{ fontSize: 8, color: inkSoft, fontWeight: 400, marginLeft: 4 }}>(using SKU)</span> : ''}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {barcodeDataUrl && (
                          <>
                            <img src={barcodeDataUrl} alt={`Barcode ${barcodeText}`} style={{ height: 40, border: `1.4px solid ${hairline}`, borderRadius: 4 }} />
                            <button onClick={handleSaveBarcode} className="prime-btn-secondary"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 10, fontWeight: 500, color: '#fff', background: t[500], border: 'none', borderRadius: 4, cursor: 'pointer', transition: 'background .15s' }}>
                              <Download size={12} /> Save Image
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }
                if ((f as any).qrcode && item.qrCode) {
                  return (
                    <div key={f.label} style={{ gridColumn: 'span 2' }}>
                      <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 2 }}>{f.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', color: ink, fontSize: 14 }}>{item.qrCode}</span>
                        {qrDataUrl && (
                          <>
                            <img src={qrDataUrl} alt={`QR ${item.qrCode}`} style={{ height: 40, width: 40, border: `1.4px solid ${hairline}`, borderRadius: 4 }} />
                            <button onClick={handleSaveQR} className="prime-btn-secondary"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 10, fontWeight: 500, color: '#fff', background: t[500], border: 'none', borderRadius: 4, cursor: 'pointer', transition: 'background .15s' }}>
                              <Download size={12} /> Save Image
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={f.label} style={f.span === 2 ? { gridColumn: 'span 2' } : {}}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 2 }}>{f.label}</span>
                    <span style={{
                      fontWeight: f.bold ? 600 : 400,
                      fontFamily: f.mono ? 'monospace' : f.amount ? "'Inter', sans-serif" : undefined,
                      fontVariantNumeric: f.amount ? 'tabular-nums' : undefined,
                      color: f.amount ? '#111827' : f.accent ? t[500] : f.enabled ? t[500] : ink,
                      textTransform: f.capitalize ? 'capitalize' as const : undefined,
                    }}>
                      {f.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};