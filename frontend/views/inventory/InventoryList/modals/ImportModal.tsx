import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../../components/Dialog';
import { Upload, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import type { Item } from '../../../../types';
import { parseCSV } from '../../../../services/excelService';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (items: Partial<Item>[]) => Promise<{ success: number; errors: string[] }>;
}

export const ImportModal: React.FC<Props> = ({ open, onClose, onImport }) => {
  const { notify } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload');
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);

  const SAMPLE_CSV = 'name,sku,type,category,unit,stock,costPrice,sellingPrice,status\n"Sample Item","SKU-001","Product","General","pcs",10,5.00,15.00,Active';

  React.useEffect(() => { if (!open) { setStep('upload'); setRawData([]); setColumnMap({}); setResult(null); } }, [open]);
  if (!open) return null;

  const handleFile = async (file: File) => {
    try {
      const rows = await parseCSV(file);
      if (rows.length === 0) { notify?.('CSV must have a header row and at least one data row', 'error'); return; }
      setRawData(rows as Record<string, string>[]);
      const headers = Object.keys(rows[0]);
      const autoMap: Record<string, string> = {};
      const itemKeys = ['name', 'sku', 'barcode', 'type', 'category', 'unit', 'stock', 'costPrice', 'sellingPrice', 'price', 'status', 'description', 'brand'];
      headers.forEach(h => {
        const key = h.trim().toLowerCase().replace(/[^a-z]/g, '');
        if (itemKeys.includes(key)) autoMap[h.trim()] = key;
        else if (key === 'cost' || key === 'costprice') autoMap[h.trim()] = 'costPrice';
        else if (key === 'sellingprice' || key === 'price') autoMap[h.trim()] = 'sellingPrice';
        else if (key === 'minstock' || key === 'minstocklevel') autoMap[h.trim()] = 'minStockLevel';
        else if (key === 'reorder' || key === 'reorderpoint') autoMap[h.trim()] = 'reorderPoint';
      });
      setColumnMap(autoMap);
      setStep('preview');
    } catch { notify?.('Failed to parse CSV file.', 'error'); }
  };

  const handleImport = async () => {
    setStep('importing');
    const mapped = rawData.map(row => {
      const item: Record<string, any> = {};
      Object.entries(columnMap).forEach(([csvCol, itemKey]) => {
        if (itemKey) {
          const val = row[csvCol];
          if (['stock', 'costPrice', 'sellingPrice', 'price', 'minStockLevel', 'reorderPoint'].includes(itemKey)) item[itemKey] = parseFloat(val) || 0;
          else item[itemKey] = val || '';
        }
      });
      if (!item.sku) item.sku = '';
      if (!item.unit) item.unit = 'pcs';
      if (!item.status) item.status = 'Active';
      return item as Partial<Item>;
    });
    const res = await onImport(mapped);
    setResult(res);
    setStep('result');
  };

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'inventory-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Import Items">
      {step === 'upload' && (
        <div className="space-y-6">
          <div className="border-2 border-dashed rounded-[16px] p-12 text-center cursor-pointer transition-colors" style={{ borderColor: '#9CA59E', background: '#F6F7F2' }}
            onClick={() => fileRef.current?.click()}>
            <Upload size={40} className="mx-auto mb-3" style={{ color: '#9CA59E' }} />
            <p className="text-sm font-semibold" style={{ color: '#3B453F' }}>Drop CSV file here or click to browse</p>
            <p className="text-xs mt-1" style={{ color: '#9CA59E' }}>Supports .csv files with header row</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
          <button onClick={downloadTemplate} className="flex items-center gap-2 text-xs font-medium mx-auto transition-all cursor-pointer" style={{ color: '#128C72' }}>
            <Download size={14} /> Download sample template
          </button>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-[10px] border" style={{ background: '#FBEFDA', borderColor: '#FBEFDA' }}>
            <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: '#B9791C' }} />
            <div className="text-xs" style={{ color: '#B9791C' }}>
              <p className="font-semibold">Map CSV columns to item fields</p>
              <p>Unmapped columns will be ignored.</p>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto border border-[#E5E8E1] rounded-[10px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E5E8E1]" style={{ background: '#F6F7F2' }}>
                  <th className="text-left p-2 font-medium" style={{ color: '#9CA59E' }}>CSV Column</th>
                  <th className="text-left p-2 font-medium" style={{ color: '#9CA59E' }}>Item Field</th>
                  <th className="text-left p-2 font-medium" style={{ color: '#9CA59E' }}>Sample Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(rawData[0] || {}).map(col => (
                  <tr key={col} className="border-b border-[#EFF1EB]">
                    <td className="p-2 font-medium" style={{ color: '#3B453F' }}>{col}</td>
                    <td className="p-2">
                      <select value={columnMap[col] || ''} onChange={e => setColumnMap(prev => ({ ...prev, [col]: e.target.value }))}
                        className="w-full px-2 py-1 border border-[#E5E8E1] rounded-[5px] text-xs bg-white outline-none" style={{ color: '#16201B' }}>
                        <option value="">— Skip —</option>
                        {['name', 'sku', 'barcode', 'type', 'category', 'brand', 'unit', 'stock', 'costPrice', 'sellingPrice', 'status', 'description', 'minStockLevel', 'reorderPoint'].map(k => (
                          <option key={k} value={k}>{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2" style={{ color: '#9CA59E' }}>{rawData[0]?.[col] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={40} className="animate-spin mb-4" style={{ color: '#128C72' }} />
          <p className="text-sm font-semibold" style={{ color: '#3B453F' }}>Importing {rawData.length} items...</p>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          <div className={`rounded-[16px] p-6 text-center border ${result.errors.length === 0 ? 'bg-[#F2FAF7] border-[#DCF0EA]' : 'bg-[#FBEFDA] border-[#FBEFDA]'}`}>
            <div className={`inline-flex p-3 rounded-full mb-3 ${result.errors.length === 0 ? 'bg-[#DCF0EA]' : 'bg-[#FBEFDA]'}`} style={{ color: result.errors.length === 0 ? '#128C72' : '#B9791C' }}>
              {result.errors.length === 0 ? <CheckCircle size={32} /> : <AlertCircle size={32} />}
            </div>
            <p className="text-lg font-bold" style={{ color: '#16201B' }}>{result.success} item{result.success !== 1 ? 's' : ''} imported</p>
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold mb-1" style={{ color: '#BE4339' }}>{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:</p>
                <ul className="text-xs space-y-0.5" style={{ color: '#BE4339' }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {step !== 'importing' && (
        <DialogFooter>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-[#E5E8E1] rounded-[7px] text-sm font-medium transition-all cursor-pointer bg-white" style={{ color: '#3B453F' }}>
            {step === 'result' ? 'Close' : 'Cancel'}
          </button>
          {step === 'preview' && (
            <button onClick={handleImport}
              className="px-6 py-2.5 rounded-[7px] text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ml-auto bg-[#128C72] text-white hover:bg-[#0E5C4C]">
              <Upload size={16} /> Import {rawData.length} Items
            </button>
          )}
        </DialogFooter>
      )}
    </Dialog>
  );
};
