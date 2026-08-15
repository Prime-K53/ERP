import React from 'react';
import { Edit3, Warehouse, Users, Printer, Download, Archive, CheckCircle, XCircle, Barcode, QrCode, PlusCircle, Trash2, X } from 'lucide-react';

interface Props {
  selectedCount: number;
  onBulkEdit: () => void;
  onAssignWarehouse: () => void;
  onAssignSupplier: () => void;
  onPrintLabels: () => void;
  onExportSelected: () => void;
  onArchive: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onGenerateBarcodes: () => void;
  onGenerateQRCodes: () => void;
  onStockAdjust: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export const BulkActionToolbar: React.FC<Props> = (p) => {
  if (p.selectedCount === 0) return null;

  const actions = [
    { icon: <Edit3 size={14} />, label: 'Bulk Edit', onClick: p.onBulkEdit },
    { icon: <Warehouse size={14} />, label: 'Assign Warehouse', onClick: p.onAssignWarehouse },
    { icon: <Users size={14} />, label: 'Assign Supplier', onClick: p.onAssignSupplier },
    { icon: <Printer size={14} />, label: 'Print Labels', onClick: p.onPrintLabels },
    { icon: <Download size={14} />, label: 'Export Selected', onClick: p.onExportSelected },
    { icon: <Archive size={14} />, label: 'Archive', onClick: p.onArchive },
    { icon: <CheckCircle size={14} />, label: 'Activate', onClick: p.onActivate },
    { icon: <XCircle size={14} />, label: 'Deactivate', onClick: p.onDeactivate },
    { icon: <Barcode size={14} />, label: 'Gen. Barcodes', onClick: p.onGenerateBarcodes },
    { icon: <QrCode size={14} />, label: 'Gen. QR Codes', onClick: p.onGenerateQRCodes },
    { icon: <PlusCircle size={14} />, label: 'Stock Adjustment', onClick: p.onStockAdjust },
    { icon: <Trash2 size={14} />, label: 'Delete', onClick: p.onDelete, danger: true },
  ];

  return (
    <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-rose-800 mr-2">{p.selectedCount} selected</span>
        {actions.map(a => (
          <button key={a.label} onClick={a.onClick}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              a.danger
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>
      <button onClick={p.onClear} className="p-1 rounded-md text-slate-400 hover:text-slate-600 transition-colors">
        <X size={15} />
      </button>
    </div>
  );
};
