import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Layers, Palette, Scissors, Image, AlertCircle, CheckCircle, Printer, FileText } from 'lucide-react';
import { printingService } from '../../services/printingService';
import { formatNumber } from '../../utils/helpers';
import type { PrintingJobSpecification } from '../../types/printing';

interface PrintJobCartCardProps {
  spec: PrintingJobSpecification;
  currency: string;
  productionRef: string;
  onUpdateSpec?: (spec: PrintingJobSpecification) => void;
  onRemove?: () => void;
}

export const PrintJobCartCard: React.FC<PrintJobCartCardProps> = ({ spec, currency, productionRef, onRemove }) => {
  const [expanded, setExpanded] = useState(false);

  const finishingActive = Object.entries(spec.finishing)
    .filter(([k, v]) => v === true && !k.includes('Type'))
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1));

  const estimatedTime = printingService.estimateProductionTime(spec);

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      'Pending': 'bg-amber-100 text-amber-700',
      'Received': 'bg-blue-100 text-blue-700',
      'Approved': 'bg-emerald-100 text-emerald-700',
    };
    return map[status] || 'bg-slate-100 text-slate-600';
  };

  const priorityColor = printingService.getPriorityColor(spec.priority);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Collapsed Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
            <Printer size={16} className="text-indigo-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-slate-800 text-sm truncate">{spec.jobName || spec.serviceName}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${priorityColor}`}>
                {spec.priority}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{spec.quantity.toLocaleString()} {spec.unit}</span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span>{spec.printing.color}</span>
              {finishingActive.length > 0 && (
                <>
                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                  <span>{finishingActive[0]}{finishingActive.length > 1 ? ` +${finishingActive.length - 1}` : ''}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          <div className="text-right">
            <div className="text-xs text-slate-400">Ref: {productionRef}</div>
            <div className="font-bold text-slate-800">{currency}{formatNumber(spec.pricing.grandTotal)}</div>
          </div>
          {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-4 bg-slate-50/50 animate-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Layers size={14} /> Paper
              </div>
              <p className="text-sm text-slate-700 ml-6">{spec.paper.weight}gsm {spec.paper.type} — {spec.paper.size}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Printer size={14} /> Printing
              </div>
              <p className="text-sm text-slate-700 ml-6">{spec.printing.color} · {spec.printing.sides} · {spec.printing.pages} pages</p>
            </div>
            {finishingActive.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <Scissors size={14} /> Finishing
                </div>
                <div className="flex flex-wrap gap-1 ml-6">
                  {finishingActive.map(f => (
                    <span key={f} className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded font-medium text-slate-600">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Image size={14} /> Artwork
              </div>
              <div className="flex items-center gap-2 ml-6">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(spec.artwork.status)}`}>
                  {spec.artwork.status}
                </span>
                <span className="text-xs text-slate-500">{spec.artwork.source}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Clock size={14} /> Due Date
              </div>
              <p className="text-sm text-slate-700 ml-6">
                {spec.dueDate ? new Date(spec.dueDate).toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Clock size={14} /> Est. Production Time
              </div>
              <p className="text-sm text-slate-700 ml-6">{estimatedTime}</p>
            </div>
          </div>

          {/* Expanded Totals */}
          <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Subtotal: <strong className="text-slate-700">{currency}{formatNumber(spec.pricing.subtotal)}</strong></span>
              <span>Tax: <strong className="text-slate-700">{currency}{formatNumber(spec.pricing.tax)}</strong></span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Line Total</span>
              <div className="font-bold text-lg text-indigo-600">{currency}{formatNumber(spec.pricing.grandTotal)}</div>
            </div>
          </div>

          {onRemove && (
            <div className="flex justify-end">
              <button onClick={onRemove}
                className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                Remove Job
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PrintJobCartCard;
