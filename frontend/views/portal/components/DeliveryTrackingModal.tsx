import React from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  Package,
  PhoneCall,
  Truck,
  User,
  X,
} from 'lucide-react';
import { DeliveryNotification, DeliveryStatus } from '../../../types';
import { getDeliveryStatusBadge } from '../../../utils/formatters';

interface DeliveryTrackingModalProps {
  delivery: DeliveryNotification | null;
  isOpen: boolean;
  onClose: () => void;
  /** Active only once POD is sealed — swaps "Close Tracker" for "Download Delivery Note". */
  onDownloadDeliveryNote?: () => void;
  downloadingNote?: boolean;
}

const TIMELINE_STEPS = [
  { key: 'placed', label: 'Order Placed' },
  { key: 'dispatched', label: 'Warehouse Dispatched' },
  { key: 'out', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

/**
 * Resolve how many timeline steps are complete from the delivery status.
 *
 * Admin tab  → portal stage
 * Inbound    → Warehouse Dispatched (1)
 * Active     → Out for Delivery    (2)
 * Delivered  → Delivered (POD)     (3)
 */
const resolveCompletedSteps = (status: DeliveryStatus | string): number => {
  const s = String(status || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (/(delivered|fulfilled|completed)/.test(s)) return 3;
  if (/(intransit|dispatched|active|shipped|outfordelivery)/.test(s)) return 2;
  if (/(pending|ready|processing|preparing|confirmed|ordered|created)/.test(s)) return 1;
  return 0;
};

export const DeliveryTrackingModal: React.FC<DeliveryTrackingModalProps> = ({
  delivery,
  isOpen,
  onClose,
  onDownloadDeliveryNote,
  downloadingNote = false,
}) => {
  if (!isOpen || !delivery) return null;

  const completedSteps = resolveCompletedSteps(delivery.status);
  const isDelivered = completedSteps >= 3;
  const badge = getDeliveryStatusBadge(delivery.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col p-6 animate-slide-up space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Order #{delivery.orderId}
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Tracking: {delivery.trackingNumber}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Box */}
        <div className="flex items-center gap-3.5 p-3.5 rounded-2xl border border-slate-100"
          style={{ background: badge.bg }}>
          <div
            className="p-2.5 rounded-xl text-white shrink-0"
            style={{ background: badge.color }}
          >
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-black uppercase" style={{ color: badge.color }}>
              {badge.label}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              ETA: {delivery.estimatedArrival || 'Aug 12, 10:00 AM'}
            </p>
          </div>
        </div>

        {/* Driver & Courier Details */}
        <div className="space-y-2.5 text-xs font-extrabold text-slate-900">
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-slate-800 shrink-0" />
            <span>Driver: {delivery.driverName || 'Sam Harris'}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <PhoneCall className="w-4 h-4 text-slate-800 shrink-0" />
            <span>Contact: {delivery.driverPhone || '+1 (555) 720-1923'}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Truck className="w-4 h-4 text-slate-800 shrink-0" />
            <span>Vehicle: {delivery.vehicleNumber || 'TRK-109'}</span>
          </div>
        </div>

        {/* Delivery Timeline */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h3 className="text-xs font-black text-slate-900 tracking-tight">Delivery Timeline</h3>

          <div className="space-y-3 pl-1">
            {TIMELINE_STEPS.map((step, index) => {
              const done = index <= completedSteps;
              const isCurrent = index === completedSteps && !isDelivered;

              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: done ? '#0F172A' : '#F8FAFC',
                      border: `2px solid ${done ? '#0F172A' : '#E2E8F0'}`,
                      boxShadow: isCurrent ? '0 0 0 4px rgba(15,23,42,0.12)' : 'none',
                    }}
                  >
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <span
                    className="text-xs"
                    style={{
                      fontWeight: done ? 900 : 700,
                      color: done ? '#0F172A' : '#94A3B8',
                    }}
                  >
                    {step.label}
                    {isCurrent && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Current
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Close / Download Action */}
        <div className="pt-2">
          {isDelivered ? (
            <button
              onClick={onDownloadDeliveryNote}
              disabled={downloadingNote}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-full shadow-md transition text-center flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {downloadingNote ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Preparing Delivery Note…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download Delivery Note
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-3.5 bg-slate-950 hover:bg-slate-800 text-white font-extrabold text-xs rounded-full shadow-md transition text-center"
            >
              Close Tracker
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
