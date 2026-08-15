import React, { useState } from 'react';
import {
  Plus, Printer, X, ChevronDown, ChevronUp, DollarSign,
  FileText, Clock, Layers, Image, Scissors
} from 'lucide-react';
import { PrintingJobModal } from './PrintingJobModal';
import { usePrintingStore } from '../../stores/printingStore';
import { printingService } from '../../services/printingService';
import { useAuth } from '../../context/AuthContext';
import { formatNumber } from '../../utils/helpers';
import type { PrintingJobSpecification, PrintingJobStatus } from '../../types/printing';
import type { CartItem } from '../../types';

interface SalesOrderPrintingPanelProps {
  customerName?: string;
  customerId?: string;
  items: CartItem[];
  onItemsChange: (items: CartItem[]) => void;
}

export const SalesOrderPrintingPanel: React.FC<SalesOrderPrintingPanelProps> = ({
  customerName, customerId, items, onItemsChange,
}) => {
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;
  const { calculatePricing, createProductionJob } = usePrintingStore();
  const [showNewJobModal, setShowNewJobModal] = useState(false);

  const printingItems = items.filter(i => i.isPrintingJob);
  const regularItems = items.filter(i => !i.isPrintingJob);

  const handleAddPrintingJob = (spec: PrintingJobSpecification) => {
    const pricing = calculatePricing(spec);
    const newItem: CartItem = {
      id: `SO-PRINT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: spec.serviceId,
      name: spec.jobName || spec.serviceName,
      description: `${spec.quantity} ${spec.unit} · ${spec.printing.color} · ${spec.paper.weight}gsm ${spec.paper.type}`,
      quantity: 1,
      price: pricing.grandTotal,
      cost: pricing.subtotal,
      type: 'Service',
      unit: 'job',
      isPrintingJob: true,
      printingSpec: spec,
      productionRef: `PJ-${Date.now().toString(36).toUpperCase()}`,
      serviceDetails: { copies: 1, pages: spec.printing.pages, totalPages: spec.printing.pages * spec.quantity, unitPricePerCopy: pricing.grandTotal, unitCostPerCopy: pricing.subtotal, totalPrice: pricing.grandTotal, totalCost: pricing.subtotal },
    };
    onItemsChange([...items, newItem]);
    setShowNewJobModal(false);
  };

  const handleRemoveJob = (id: string) => {
    onItemsChange(items.filter(i => i.id !== id));
  };

  const handleConvertToProduction = (item: CartItem) => {
    if (!item.printingSpec) return;
    const job = createProductionJob(item.printingSpec);
    job.status = 'Draft';
    const store = usePrintingStore.getState();
    store.addProductionJob(job);
    printingService.saveProductionJob(job);
  };

  return (
    <div className="space-y-4">
      {/* Printing Jobs Section */}
      {printingItems.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Printer size={16} className="text-indigo-600" />
            Printing Jobs ({printingItems.length})
          </h3>
          <div className="space-y-3">
            {printingItems.map(item => {
              const spec = item.printingSpec as PrintingJobSpecification;
              const [expanded, setExpanded] = useState(false);
              const finishingActive = Object.entries(spec.finishing)
                .filter(([k, v]) => v === true && !k.includes('Type'))
                .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

              return (
                <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <button onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                        <Printer size={16} className="text-indigo-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 text-sm">{spec.jobName}</div>
                        <div className="text-xs text-slate-500">{spec.quantity.toLocaleString()} {spec.unit} · {spec.paper.weight}gsm {spec.paper.type} · {spec.printing.color}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Ref: {item.productionRef}</div>
                        <div className="font-bold text-slate-800">{currency}{formatNumber(item.price)}</div>
                      </div>
                      {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-slate-500">Paper:</span> <span className="font-medium">{spec.paper.weight}gsm {spec.paper.type} ({spec.paper.size})</span></div>
                        <div><span className="text-slate-500">Printing:</span> <span className="font-medium">{spec.printing.color} · {spec.printing.sides} · {spec.printing.pages} pages</span></div>
                        <div><span className="text-slate-500">Finishing:</span> <span className="font-medium">{finishingActive.length > 0 ? finishingActive.join(', ') : 'None'}</span></div>
                        <div><span className="text-slate-500">Due Date:</span> <span className="font-medium">{spec.dueDate ? new Date(spec.dueDate).toLocaleDateString() : 'Not set'}</span></div>
                        <div><span className="text-slate-500">Artwork:</span> <span className="font-medium">{spec.artwork.status} ({spec.artwork.source})</span></div>
                        <div><span className="text-slate-500">Priority:</span> <span className="font-medium">{spec.priority}</span></div>
                      </div>
                      <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                          Subtotal: {currency}{formatNumber(spec.pricing.subtotal)} | Tax: {currency}{formatNumber(spec.pricing.tax)}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleConvertToProduction(item)}
                            className="text-xs font-semibold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                            Create Production Job
                          </button>
                          <button onClick={() => handleRemoveJob(item.id)}
                            className="text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Regular Items */}
      {regularItems.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Items</h3>
          {regularItems.map(item => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <div>
                <span className="font-medium text-sm text-slate-700">{item.name}</span>
                <span className="text-xs text-slate-400 ml-2">x{item.quantity}</span>
              </div>
              <span className="font-semibold text-sm">{currency}{formatNumber(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add Printing Job Button */}
      <button onClick={() => setShowNewJobModal(true)}
        className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-2">
        <Plus size={16} /> Add Printing Job
      </button>

      {showNewJobModal && (
        <PrintingJobModal
          serviceId=""
          serviceName="New Printing Job"
          customerName={customerName}
          customerId={customerId}
          onSaveDraft={(spec) => {
            handleAddPrintingJob(spec);
          }}
          onAddToCart={(spec) => {
            handleAddPrintingJob(spec);
          }}
          onSaveAsQuote={(spec) => {
            handleAddPrintingJob(spec);
            // Also create a quotation
            const job = createProductionJob(spec);
            job.status = 'Quotation';
            const store = usePrintingStore.getState();
            store.addProductionJob(job);
            printingService.saveProductionJob(job);
          }}
          onCancel={() => setShowNewJobModal(false)}
        />
      )}
    </div>
  );
};

export default SalesOrderPrintingPanel;
