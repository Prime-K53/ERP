import React from 'react';
import { Clock, User, Calendar, ChevronRight, AlertCircle, CheckCircle, XCircle, Play, DollarSign, Layers, Wrench } from 'lucide-react';
import type { ServiceJob, ServiceJobStatus } from '../../types';

interface ServiceJobCardProps {
  job: ServiceJob;
  onTransition: (jobId: string, status: ServiceJobStatus) => void;
  onAssign: (job: ServiceJob) => void;
  onReserveMaterials?: (jobId: string) => void;
  onCompleteJob?: (jobId: string) => void;
}

const STATUS_STYLES: Record<ServiceJobStatus, { bg: string; text: string; icon: React.ReactNode }> = {
  'Draft': { bg: 'bg-slate-100', text: 'text-slate-600', icon: <Clock className="w-3.5 h-3.5" /> },
  'Quoted': { bg: 'bg-blue-100', text: 'text-blue-700', icon: <DollarSign className="w-3.5 h-3.5" /> },
  'Approved': { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  'Materials Reserved': { bg: 'bg-cyan-100', text: 'text-cyan-700', icon: <Layers className="w-3.5 h-3.5" /> },
  'In Progress': { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Play className="w-3.5 h-3.5" /> },
  'Quality Check': { bg: 'bg-purple-100', text: 'text-purple-700', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  'Completed': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  'Invoiced': { bg: 'bg-teal-100', text: 'text-teal-700', icon: <ChevronRight className="w-3.5 h-3.5" /> },
  'Closed': { bg: 'bg-slate-200', text: 'text-slate-500', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const TRANSITION_BUTTONS: Partial<Record<ServiceJobStatus, { to: ServiceJobStatus; label: string }[]>> = {
  'Draft': [{ to: 'Quoted', label: 'Quote' }],
  'Quoted': [{ to: 'Approved', label: 'Approve' }],
  'Approved': [{ to: 'Materials Reserved', label: 'Reserve' }],
  'Materials Reserved': [{ to: 'In Progress', label: 'Start' }],
  'In Progress': [{ to: 'Quality Check', label: 'Send to QC' }],
  'Quality Check': [{ to: 'Completed', label: 'Complete' }],
  'Completed': [{ to: 'Invoiced', label: 'Invoice' }],
  'Invoiced': [{ to: 'Closed', label: 'Close' }],
};

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString() : '-';
const isOverdue = (job: ServiceJob) => {
  if (['Completed', 'Invoiced', 'Closed'].includes(job.status)) return false;
  if (!job.dueDate) return false;
  return new Date(job.dueDate) < new Date();
};

const ServiceJobCard: React.FC<ServiceJobCardProps> = ({ job, onTransition, onAssign, onReserveMaterials, onCompleteJob }) => {
  const style = STATUS_STYLES[job.status];
  const overdue = isOverdue(job);
  const pricing = job.pricingSnapshot;

  const totalMaterialCost = (job.materials || []).reduce((s, m) => s + (m.state === 'Consumed' ? m.actualCost : m.estimatedCost), 0);
  const totalLaborCost = (job.labor || []).reduce((s, l) => s + l.totalCost, 0);
  const totalMachineCost = (job.machine || []).reduce((s, m) => s + m.operatingCost, 0);
  const actualCost = totalMaterialCost + totalLaborCost + totalMachineCost;
  const materialState = job.materials?.every(m => m.state === 'Consumed') ? 'All Consumed' :
    job.materials?.some(m => m.state === 'Reserved') ? 'Partially Reserved' : '';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
              {style.icon}
              {job.status}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              job.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
              job.priority === 'High' ? 'bg-orange-100 text-orange-700' :
              job.priority === 'Low' ? 'bg-slate-100 text-slate-500' :
              'bg-blue-100 text-blue-700'
            }`}>
              {job.priority}
            </span>
            {overdue && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                <AlertCircle className="w-3 h-3" /> Overdue
              </span>
            )}
            {materialState && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 text-cyan-700">
                <Layers className="w-3 h-3" /> {materialState}
              </span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-slate-800 truncate">{job.variantName}</h4>
          <p className="text-xs text-slate-500 truncate">#{job.jobNumber} &middot; Qty: {job.quantity}</p>
        </div>
        <span className="text-xs font-medium text-slate-400">{job.customerName || 'Walk-in'}</span>
      </div>

      {/* Pricing Summary */}
      {pricing && (
        <div className="flex items-center gap-3 text-[11px] bg-slate-50 rounded-lg px-3 py-2">
          <span className="text-slate-500">CP: <strong className="text-slate-700">{pricing.costPrice.toFixed(2)}</strong></span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">SP: <strong className="text-slate-700">{pricing.sellingPrice.toFixed(2)}</strong></span>
          <span className="text-slate-300">|</span>
          <span className={`font-medium ${pricing.profitMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {pricing.profitMargin.toFixed(1)}%
          </span>
          {!pricing.marginValidated && (
            <span className="text-[10px] text-red-500 font-medium ml-auto">Below Min Margin</span>
          )}
        </div>
      )}

      {/* Cost Summary (when execution data exists) */}
      {(actualCost > 0 || job.executionSnapshot) && (
        <div className="flex items-center gap-3 text-[11px] bg-amber-50 rounded-lg px-3 py-2">
          {totalMaterialCost > 0 && <span className="text-slate-600">Mat: <strong>{totalMaterialCost.toFixed(2)}</strong></span>}
          {totalLaborCost > 0 && <span className="text-slate-600">Lab: <strong>{totalLaborCost.toFixed(2)}</strong></span>}
          {totalMachineCost > 0 && <span className="text-slate-600">Mch: <strong>{totalMachineCost.toFixed(2)}</strong></span>}
          {actualCost > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <span className={actualCost > (pricing?.costPrice || 0) ? 'text-red-600' : 'text-emerald-600'}>
                Actual: <strong>{actualCost.toFixed(2)}</strong>
              </span>
            </>
          )}
          {job.executionSnapshot && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">
                Variance: <strong className={job.executionSnapshot.costVariance > 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {job.executionSnapshot.costVariance > 0 ? '+' : ''}{job.executionSnapshot.costVariancePercent.toFixed(1)}%
                </strong>
              </span>
            </>
          )}
        </div>
      )}

      {/* Assignments */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        {job.assignedEmployeeName && (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span>{job.assignedEmployeeName}</span>
          </div>
        )}
        {job.assignedMachineName && (
          <div className="flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            <span>{job.assignedMachineName}</span>
          </div>
        )}
        {job.dueDate && (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(job.dueDate)}</span>
          </div>
        )}
        {!job.assignedEmployeeName && !job.assignedMachineName && (
          <button onClick={() => onAssign(job)} className="text-blue-600 hover:text-blue-700 font-medium">
            + Assign
          </button>
        )}
      </div>

      {/* Dates */}
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>Created: {formatDate(job.createdAt)}</span>
        {job.completedAt && <span>Done: {formatDate(job.completedAt)}</span>}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 pt-1 border-t border-slate-100">
        {(TRANSITION_BUTTONS[job.status] || []).map(({ to, label }) => (
          <button
            key={to}
            onClick={() => onTransition(job.id, to)}
            className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 transition-colors"
          >
            {label}
          </button>
        ))}
        {job.status === 'Approved' && onReserveMaterials && (
          <button
            onClick={() => onReserveMaterials(job.id)}
            className="px-2 py-1.5 text-[10px] font-semibold rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-600 transition-colors"
          >
            Reserve Mat.
          </button>
        )}
        {job.status === 'Quality Check' && onCompleteJob && (
          <button
            onClick={() => onCompleteJob(job.id)}
            className="px-2 py-1.5 text-[10px] font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
          >
            Complete
          </button>
        )}
        <button
          onClick={() => onAssign(job)}
          className="px-2 py-1.5 text-[10px] font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
        >
          Assign
        </button>
      </div>
    </div>
  );
};

export default ServiceJobCard;
