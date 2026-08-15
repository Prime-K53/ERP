import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../../components/Dialog';
import { Printer, QrCode, Barcode, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import type { Item } from '../../../../types';
import { generateBarcodeDataUrl } from '../../../../utils/barcodeGenerator';
import { currencyService } from '../../../../services/currencyService';
import { useAuth } from '../../../../context/AuthContext';

interface Props {
  open: boolean;
  items: Item[];
  mode: 'barcode' | 'qrcode' | 'label';
  onClose: () => void;
}

export const PrintLabelModal: React.FC<Props> = ({ open, items, mode, onClose }) => {
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const [showName, setShowName] = useState(true);
  const [showSKU, setShowSKU] = useState(true);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [barcodeDataUrls, setBarcodeDataUrls] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const generate = async () => {
      setGenerating(true);
      const qrUrls: Record<string, string> = {};
      const bcUrls: Record<string, string> = {};
      for (const item of items) {
        const barcodeText = item.barcode || item.sku || item.id || item.name;
        if (barcodeText) {
          const isLabelMode = mode === 'label';
          bcUrls[item.id] = generateBarcodeDataUrl(barcodeText, {
            height: isLabelMode ? 38 : 50,
            width: 2,
            margin: 6,
            marginTop: 6,
            marginBottom: 6,
            fontSize: isLabelMode ? 9 : 10,
            displayValue: true,
          });
        }
        if (mode === 'qrcode') {
          try { qrUrls[item.id] = await QRCode.toDataURL(item.id || item.sku || item.name, { width: 150, margin: 1 }); } catch { qrUrls[item.id] = ''; }
        }
      }
      setBarcodeDataUrls(bcUrls);
      setQrDataUrls(qrUrls);
      setGenerating(false);
    };
    generate();
  }, [open, mode, items]);

  if (!open || items.length === 0) return null;

  const handlePrint = () => window.print();

  const printStyles = `
    @media print {
      body * { visibility: hidden; }
      #printable-labels, #printable-labels * { visibility: visible; }
      #printable-labels { position: absolute; left: 5mm; top: 5mm; width: 100%; display: flex; flex-wrap: wrap; gap: 4mm; }
      .print-label { break-inside: avoid; page-break-inside: avoid; border: 1px solid #ccc; }
      @page { margin: 5mm; size: auto; }
    }
  `;

  const renderBarcode = (item: Item) => {
    const url = barcodeDataUrls[item.id];
    if (!url) return null;
    return <img src={url} alt={`Barcode ${item.barcode}`} className="w-full h-auto" />;
  };

  const getLabelStyle = () => {
    if (mode === 'barcode' || mode === 'label') return { width: '50mm', height: '30mm' };
    return { width: '38mm', height: '38mm' };
  };

  const title = mode === 'barcode' ? 'Print Barcodes' : mode === 'qrcode' ? 'Print QR Codes' : 'Print Labels';

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <style>{printStyles}</style>
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'name', label: 'Name', state: showName, set: setShowName },
          { key: 'sku', label: 'SKU', state: showSKU, set: setShowSKU },
        ].map(cfg => (
          <label key={cfg.key} className="flex items-center gap-1.5 text-xs font-medium cursor-pointer" style={{ color: '#3B453F' }}>
            <input type="checkbox" checked={cfg.state} onChange={e => cfg.set(e.target.checked)} style={{ accentColor: '#128C72' }} /> {cfg.label}
          </label>
        ))}
        <div className="w-px h-5" style={{ background: '#E5E8E1' }} />
        <button onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-[14px] py-[8.5px] rounded-[7px] text-xs font-medium transition-all cursor-pointer bg-[#128C72] text-white hover:bg-[#0E5C4C]">
          <Printer size={13} /> Print
        </button>
      </div>

      {generating ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#9CA59E' }} /></div>
      ) : (
        <div id="printable-labels" className="flex flex-wrap gap-4 justify-center">
          {items.map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="bg-white border border-[#E5E8E1] rounded-lg flex flex-col items-center text-center p-2 shadow-sm print-label overflow-hidden" style={getLabelStyle()}>
              {mode === 'qrcode' && qrDataUrls[item.id] ? (
                <img src={qrDataUrls[item.id]} alt={`QR for ${item.name}`} className="w-24 h-24" />
              ) : mode === 'barcode' ? renderBarcode(item) : null}
              {mode === 'label' && renderBarcode(item)}
              {showName && <div className="text-[9px] font-bold leading-tight line-clamp-1 mt-1.5" style={{ color: '#16201B' }}>{item.name}</div>}
              {showSKU && <div className="text-[7px] font-mono mt-1" style={{ color: '#9CA59E' }}>{item.sku}</div>}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
};
