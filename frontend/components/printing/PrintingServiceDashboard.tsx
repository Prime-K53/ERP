import React, { useEffect, useState } from 'react';
import {
  Printer, TrendingUp, Clock, AlertCircle, CheckCircle, FileText,
  DollarSign, Package, Truck, ChevronRight, RefreshCw
} from 'lucide-react';
import { usePrintingStore } from '../../stores/printingStore';
import { printingService } from '../../services/printingService';
import ProductionQueueDashboard from './ProductionQueueDashboard';
import { formatNumber } from '../../utils/helpers';
import type { ProductionJob, PrintingJobStatus, BOMLine } from '../../types/printing';
import type { CartItem } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const PrintingServiceDashboard: React.FC = () => {
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;
  const {
    productionJobs, metrics, bomTemplates,
    transitionJobStatus, loadBOMTemplates, refreshMetrics,
  } = usePrintingStore();

  const [activeView, setActiveView] = useState<'queue' | 'jobs' | 'reports'>('queue');

  useEffect(() => {
    refreshMetrics();
    loadBOMTemplates();
  }, []);

  const summaryCards = [
    { label: 'Active Jobs', value: productionJobs.filter(j => !['Completed', 'Cancelled', 'Delivered'].includes(j.status)).length, icon: Printer, color: 'bg-indigo-600', change: '' },
    { label: 'Today\'s Revenue', value: productionJobs.filter(j => j.createdAt.startsWith(new Date().toISOString().split('T')[0])).reduce((s, j) => s + j.paidAmount, 0), icon: DollarSign, color: 'bg-emerald-600', isCurrency: true },
    { label: 'Urgent', value: metrics.urgentJobs, icon: AlertCircle, color: 'bg-red-500', change: '' },
    { label: 'Completed Today', value: metrics.completedToday, icon: CheckCircle, color: 'bg-blue-600', change: '' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 rounded-xl">
            <Printer size={24} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Printing Production Dashboard</h1>
            <p className="text-sm text-slate-500">Manage printing jobs, production queue, and BOM templates</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refreshMetrics(); loadBOMTemplates(); }}
            className="px-3 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {summaryCards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 hover:shadow-sm transition-all">
            <div className={`p-2.5 rounded-xl ${card.color}`}>
              <card.icon size={18} className="text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">
                {card.isCurrency ? `${currency}${formatNumber(card.value)}` : card.value}
              </div>
              <div className="text-xs text-slate-500 font-medium">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['queue', 'jobs', 'reports'] as const).map(view => (
          <button key={view} onClick={() => setActiveView(view)}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all capitalize
              ${activeView === view ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {view === 'queue' ? 'Production Queue' : view === 'jobs' ? 'All Jobs' : 'Reports'}
          </button>
        ))}
      </div>

      {/* Active View */}
      {activeView === 'queue' && <ProductionQueueDashboard jobs={productionJobs} />}

      {activeView === 'jobs' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input type="text" placeholder="Search jobs..." className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 max-w-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
            <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none">
              <option value="all">All Statuses</option>
              {['Pending', 'Printing', 'Finishing', 'Quality Control', 'Completed'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {productionJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Printer size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">No production jobs yet</p>
              <p className="text-xs mt-1">Jobs are created automatically when printing services are sold.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {productionJobs.map(job => (
                <JobListItem key={job.id} job={job} currency={currency} onTransition={transitionJobStatus} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === 'reports' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-600" /> Revenue Overview
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Total Revenue</span><span className="font-bold">{currency}{formatNumber(productionJobs.reduce((s, j) => s + j.paidAmount, 0))}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Outstanding</span><span className="font-bold text-amber-600">{currency}{formatNumber(productionJobs.reduce((s, j) => s + j.outstandingAmount, 0))}</span></div>
              <div className="flex justify-between text-sm pt-2 border-t"><span className="text-slate-500">Jobs Completed</span><span className="font-bold">{productionJobs.filter(j => j.status === 'Completed').length}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Avg. Job Value</span><span className="font-bold">{currency}{formatNumber(productionJobs.length > 0 ? productionJobs.reduce((s, j) => s + j.totalAmount, 0) / productionJobs.length : 0)}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Package size={16} className="text-indigo-600" /> Material Usage
            </h3>
            <div className="space-y-3">
              {aggregateMaterials(productionJobs).slice(0, 5).map(mat => (
                <div key={mat.materialName} className="flex justify-between text-sm">
                  <span className="text-slate-500 truncate">{mat.materialName}</span>
                  <span className="font-semibold">{Math.round(mat.totalQuantity)} {mat.unit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function aggregateMaterials(jobs: ProductionJob[]): { materialName: string; totalQuantity: number; unit: string }[] {
  const map = new Map<string, { totalQuantity: number; unit: string }>();
  for (const job of jobs) {
    for (const line of job.estimatedMaterialUsage || []) {
      const key = line.materialName;
      const existing = map.get(key);
      if (existing) {
        existing.totalQuantity += line.estimatedQuantity;
      } else {
        map.set(key, { totalQuantity: line.estimatedQuantity, unit: line.unit });
      }
    }
  }
  return Array.from(map.entries()).map(([k, v]) => ({ materialName: k, ...v }));
}

const JobListItem: React.FC<{
  job: ProductionJob;
  currency: string;
  onTransition: (id: string, status: PrintingJobStatus) => void;
}> = ({ job, currency, onTransition }) => {
  const statusColor = printingService.getStatusColor(job.status);
  const priorityColor = printingService.getPriorityColor(job.spec.priority);
  const paymentColor = printingService.getPaymentStatusColor(job.paymentStatus);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Printer size={16} className="text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-slate-800 text-sm">{job.spec.jobName}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor}`}>{job.status}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${priorityColor}`}>{job.spec.priority}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${paymentColor}`}>{job.paymentStatus}</span>
            </div>
            <p className="text-xs text-slate-500">#{job.productionRef} · {job.customerName} · {job.spec.quantity} {job.spec.unit}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-indigo-600">{currency}{formatNumber(job.totalAmount)}</div>
          {job.paymentStatus === 'Partial' && (
            <div className="text-xs text-amber-600">Paid: {currency}{formatNumber(job.paidAmount)}</div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span>Created: {new Date(job.createdAt).toLocaleDateString()}</span>
        {job.spec.dueDate && <span>Due: {new Date(job.spec.dueDate).toLocaleDateString()}</span>}
      </div>
    </div>
  );
};

export default PrintingServiceDashboard;
