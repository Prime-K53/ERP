import React, { useState } from 'react';
import {
  ClipboardList, AlertCircle, Clock, Image, CheckCircle,
  Printer, Scissors, Package, Truck, ChevronRight, Search,
} from 'lucide-react';
import { usePrintingStore } from '../../stores/printingStore';
import { printingService } from '../../services/printingService';
import { formatNumber } from '../../utils/helpers';
import type { ProductionJob, PrintingJobStatus, PrintingDashboardMetrics } from '../../types/printing';
import type { CartItem } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface ProductionQueueDashboardProps {
  jobs: ProductionJob[];
}

const StatusBadge: React.FC<{ status: PrintingJobStatus }> = ({ status }) => {
  const color = printingService.getStatusColor(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}>
      {status}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const color = printingService.getPriorityColor(priority);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      {priority}
    </span>
  );
};

const PaymentBadge: React.FC<{ job: ProductionJob }> = ({ job }) => {
  const color = printingService.getPaymentStatusColor(job.paymentStatus);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      {job.paymentStatus}
      {job.paymentStatus === 'Partial' && (
        <span className="text-[9px]">({formatNumber(job.paidAmount / job.totalAmount * 100)}%)</span>
      )}
    </span>
  );
};

const StatusFlow: React.FC<{ currentStatus: PrintingJobStatus }> = ({ currentStatus }) => {
  const steps: { status: string; label: string; icon: React.ElementType }[] = [
    { status: 'Draft', label: 'Pending', icon: Clock },
    { status: 'Artwork Review', label: 'Artwork', icon: Image },
    { status: 'Printing', label: 'Printing', icon: Printer },
    { status: 'Finishing', label: 'Finishing', icon: Scissors },
    { status: 'Quality Control', label: 'QC', icon: CheckCircle },
    { status: 'Packaging', label: 'Pack', icon: Package },
    { status: 'Ready for Collection', label: 'Ready', icon: Truck },
    { status: 'Delivered', label: 'Done', icon: CheckCircle },
  ];

  const statusOrder: PrintingJobStatus[] = [
    'Draft', 'Quotation', 'Approved', 'Deposit Paid', 'Artwork Review',
    'Artwork Approved', 'Material Reservation', 'Ready for Production',
    'Printing', 'Finishing', 'Quality Control', 'Packaging',
    'Ready for Collection', 'Delivered', 'Completed',
  ];
  const currentIdx = statusOrder.indexOf(currentStatus);

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const stepIdx = statusOrder.indexOf(step.status as PrintingJobStatus);
        const isComplete = currentIdx >= stepIdx;
        const isCurrent = currentStatus === step.status;
        const Icon = step.icon;
        return (
          <React.Fragment key={step.status}>
            {i > 0 && <div className={`w-3 h-px ${isComplete ? 'bg-indigo-500' : 'bg-slate-200'}`} />}
            <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all
              ${isComplete ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-400'}
              ${isCurrent ? 'ring-2 ring-indigo-200 scale-110' : ''}`}
              title={step.label}>
              <Icon size={10} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: number; icon: React.ElementType; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 hover:shadow-sm transition-all">
    <div className={`p-2.5 rounded-xl ${color}`}>
      <Icon size={18} className="text-white" />
    </div>
    <div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
    </div>
  </div>
);

const ProductionQueueDashboard: React.FC<ProductionQueueDashboardProps> = ({ jobs }) => {
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;
  const { metrics } = usePrintingStore();
  const [statusFilter, setStatusFilter] = useState<PrintingJobStatus | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredJobs = jobs.filter(j => {
    if (statusFilter !== 'All' && j.status !== statusFilter) return false;
    if (searchTerm && !(j.productionRef || '').toLowerCase().includes(searchTerm.toLowerCase()) && !(j.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) && !(j.spec?.jobName || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const metricCards = [
    { label: 'Today\'s Jobs', value: metrics.todayJobs, icon: ClipboardList, color: 'bg-blue-600' },
    { label: 'Urgent', value: metrics.urgentJobs, icon: AlertCircle, color: 'bg-red-500' },
    { label: 'Pending Artwork', value: metrics.pendingArtwork, icon: Image, color: 'bg-amber-500' },
    { label: 'Ready to Print', value: metrics.readyToPrint, icon: Printer, color: 'bg-emerald-600' },
    { label: 'In Production', value: metrics.printing, icon: Printer, color: 'bg-orange-500' },
    { label: 'Finishing', value: metrics.finishing, icon: Scissors, color: 'bg-rose-500' },
    { label: 'Ready for Collection', value: metrics.readyForCollection, icon: Package, color: 'bg-purple-600' },
    { label: 'Completed', value: metrics.completedToday, icon: CheckCircle, color: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metricCards.map(m => <MetricCard key={m.label} {...m} />)}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search jobs..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as PrintingJobStatus | 'All')}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white">
          <option value="All">All Statuses</option>
          {['Draft', 'Quotation', 'Approved', 'Artwork Review', 'Ready for Production', 'Printing', 'Finishing', 'Quality Control', 'Packaging', 'Ready for Collection', 'Delivered', 'Completed'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <ClipboardList size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-medium">No production jobs found</p>
          <p className="text-xs mt-1">Jobs will appear here once they are created from POS or Sales Orders.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map(job => (
            <div key={job.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Printer size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-semibold text-slate-800 text-sm">{job.spec.jobName}</h4>
                      <StatusBadge status={job.status} />
                      <PriorityBadge priority={job.spec.priority} />
                      <PaymentBadge job={job} />
                    </div>
                    <p className="text-xs text-slate-500">
                      #{job.productionRef} · {job.customerName} · {job.spec.quantity.toLocaleString()} {job.spec.unit}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Total</div>
                  <div className="font-bold text-indigo-600">{currency}{formatNumber(job.totalAmount)}</div>
                </div>
              </div>

              <StatusFlow currentStatus={job.status} />

              <div className="border-t border-slate-100 mt-3 pt-3 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span>Created: {new Date(job.createdAt).toLocaleDateString()}</span>
                  {job.spec.dueDate && <span>Due: {new Date(job.spec.dueDate).toLocaleDateString()}</span>}
                </div>
                <div className="flex items-center gap-1 text-indigo-600 font-semibold">
                  View Details <ChevronRight size={14} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductionQueueDashboard;
