import React from 'react';
import { ItemizedTable, SummaryBlock } from './ItemizedTables';
import { Truck, Store, MapPin } from 'lucide-react';

interface POItem {
  description: string;
  sku?: string;
  quantity: number;
  rate: number;
  total: number;
}

interface PurchaseOrderProps {
  items: POItem[];
  subtotal: number;
  total: number;
  currencySymbol?: string;
  vendorName: string;
  vendorAddress: string;
  vendorEmail?: string;
  shippingAddress: string;
  shippingContact?: string;
  expectedDeliveryDate?: string;
  paymentTerms?: string;
}

/**
 * PurchaseOrder Component
 * Specialized outbound document for vendors.
 * Prioritizes shipping logistics and vendor identification.
 */
const PurchaseOrder: React.FC<PurchaseOrderProps> = ({
  items,
  subtotal,
  total,
  currencySymbol = '$',
  vendorName,
  vendorAddress,
  vendorEmail,
  shippingAddress,
  shippingContact,
  expectedDeliveryDate,
  paymentTerms
}) => {
  const columns = [
    { header: 'Qty', accessor: 'quantity', align: 'center' as const, width: '10%' },
    { header: 'Description', accessor: 'description', width: '50%', wrapSafe: true, render: (val) => (
      <div className="font-bold">{val}</div>
    )},
    { header: 'Price', accessor: 'rate', isCurrency: true, align: 'right' as const, width: '20%' },
    { header: 'Total', accessor: 'total', isCurrency: true, align: 'right' as const, width: '20%' }
  ];

  return (
    <div className="purchase-order space-y-8">
      {/* Dual Address Block Section */}
      <div className="grid grid-cols-2 gap-8">
        {/* Vendor Details (Left) */}
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Store size={14} />
            <h3 className="text-[10px] font-black uppercase tracking-widest">Vendor Details</h3>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-black text-slate-800">{vendorName}</div>
            <div className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{vendorAddress}</div>
            {vendorEmail && <div className="text-[10px] text-blue-600 font-medium pt-1">{vendorEmail}</div>}
          </div>
        </div>

        {/* Ship To (Right) */}
        <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50 space-y-4">
          <div className="flex items-center gap-2 text-blue-500">
            <Truck size={14} />
            <h3 className="text-[10px] font-black uppercase tracking-widest">Ship To</h3>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-black text-slate-800">Prime ERP Warehouse</div>
            <div className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{shippingAddress}</div>
            {shippingContact && (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1">
                <MapPin size={10} />
                <span>Attn: {shippingContact}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logistics Header */}
      <div className="flex justify-between items-center px-6 py-4 bg-white border-y border-slate-100">
        <div className="space-y-1">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Expected Delivery</p>
          <p className="text-xs font-bold text-slate-800">{expectedDeliveryDate || 'TBD'}</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment Terms</p>
          <p className="text-xs font-bold text-slate-800">{paymentTerms || 'Net 30'}</p>
        </div>
      </div>

      {/* Items Table */}
      <ItemizedTable 
        columns={columns} 
        data={items} 
        currencySymbol={currencySymbol} 
      />

      {/* Summary Section */}
      <SummaryBlock 
        items={[
          { label: 'Subtotal', value: subtotal },
          { label: 'Total Order Value', value: total, isGrandTotal: true }
        ]}
        currencySymbol={currencySymbol}
        notes="Please include the Purchase Order number on all invoices and shipping documents."
      />

      <style>{`
        @media print {
          .purchase-order {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default PurchaseOrder;
