import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Clock, AlertTriangle, Search, DollarSign, CheckCircle, Play, Wrench } from 'lucide-react';
import type { ServiceJob, ServiceJobStatus } from '../../types';
import { serviceJobService } from '../../services/serviceJobService';
import ServiceJobCard from './ServiceJobCard';

const KANBAN_COLUMNS: ServiceJobStatus[] = [
  'Draft', 'Quoted', 'Approved', 'Materials Reserved', 'In Progress', 'Quality Check',
];

const TERMINAL_STATUSES: ServiceJobStatus[] = ['Completed', 'Invoiced', 'Closed'];

const STATUS_FILTERS: { label: string; value: ServiceJobStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'Draft' },
  { label: 'In Progress', value: 'In Progress' },
  { label: 'QC', value: 'Quality Check' },
  { label: 'Completed', value: 'Completed' },
];

const ServiceJobDashboard: React.FC = () => {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ServiceJobStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const all = await serviceJobService.getAllJobs();
      setJobs(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleTransition = async (jobId: string, newStatus: ServiceJobStatus) => {
    const result = await serviceJobService.transitionStatus(jobId, newStatus);
    if (result.success) {
      await fetchJobs();
    } else {
      setError(result.error || 'Transition failed');
    }
  };

  const handleReserveMaterials = async (jobId: string) => {
    try {
      await serviceJobService.reserveMaterials(jobId);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reserve materials');
    }
  };

  const handleCompleteJob = async (jobId: string) => {
    try {
      await serviceJobService.completeJob(jobId, 'system');
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete job');
    }
  };

  const handleAssign = (_job: ServiceJob) => {
  };

  // Metrics
  const metrics = useMemo(() => {
    const active = jobs.filter(j => !['Completed', 'Invoiced', 'Closed'].includes(j.status));
    const pending = jobs.filter(j => j.status === 'Draft' || j.status === 'Quoted');
    const inProgress = jobs.filter(j => j.status === 'In Progress');
    const completed = jobs.filter(j => j.status === 'Completed');
    const overdue = jobs.filter(j => {
      if (['Completed', 'Invoiced', 'Closed'].includes(j.status)) return false;
      if (!j.dueDate) return false;
      return new Date(j.dueDate) < new Date();
    });
    const totalRevenue = jobs.reduce((s, j) => s + (j.executionSnapshot?.sellingPrice ?? j.pricingSnapshot?.sellingPrice ?? 0), 0);
    const totalCost = jobs.reduce((s, j) => s + (j.executionSnapshot?.actualCostPrice ?? j.pricingSnapshot?.costPrice ?? 0), 0);
    return {
      active: active.length,
      pending: pending.length,
      inProgress: inProgress.length,
      completed: completed.length,
      overdue: overdue.length,
      totalRevenue,
      totalCost,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (statusFilter !== 'ALL') result = result.filter(j => j.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(j =>
        j.variantName.toLowerCase().includes(q) ||
        j.jobNumber.toLowerCase().includes(q) ||
        j.customerName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [jobs, statusFilter, searchQuery]);

  const groupedJobs = useMemo(() => {
    const groups: Record<string, ServiceJob[]> = {};
    for (const status of [...KANBAN_COLUMNS, ...TERMINAL_STATUSES]) {
      groups[status] = [];
    }
    for (const j of filteredJobs) {
      if (!groups[j.status]) groups[j.status] = [];
      groups[j.status].push(j);
    }
    return groups;
  }, [filteredJobs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Service Jobs</h2>
            <p className="text-sm text-slate-500">Operational execution of service catalog items</p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-7 gap-4">
        {[
          { label: 'Active', value: metrics.active, color: 'text-blue-600', bg: 'bg-blue-50', icon: <Play className="w-4 h-4" /> },
          { label: 'Pending', value: metrics.pending, color: 'text-slate-600', bg: 'bg-slate-50', icon: <Clock className="w-4 h-4" /> },
          { label: 'In Progress', value: metrics.inProgress, color: 'text-amber-600', bg: 'bg-amber-50', icon: <Wrench className="w-4 h-4" /> },
          { label: 'Completed', value: metrics.completed, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <CheckCircle className="w-4 h-4" /> },
          { label: 'Overdue', value: metrics.overdue, color: 'text-red-600', bg: 'bg-red-50', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Revenue', value: metrics.totalRevenue.toFixed(2), color: 'text-emerald-600', bg: 'bg-emerald-50', icon: <DollarSign className="w-4 h-4" /> },
          { label: 'Cost', value: metrics.totalCost.toFixed(2), color: 'text-red-600', bg: 'bg-red-50', icon: <DollarSign className="w-4 h-4" /> },
        ].map(m => (
          <div key={m.label} className={`${m.bg} rounded-xl p-4 border border-slate-200/60`}>
            <div className="flex items-center gap-2">
              <div className={`${m.color}`}>{m.icon}</div>
              <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 font-medium">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search jobs..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === f.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 mt-3">Loading jobs...</p>
        </div>
      )}

      {/* Kanban columns */}
      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {KANBAN_COLUMNS.map(status => (
              <div key={status} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{status}</h3>
                  <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {(groupedJobs[status] || []).length}
                  </span>
                </div>
                <div className="space-y-3 min-h-[200px]">
                  {(groupedJobs[status] || []).map(job => (
                    <ServiceJobCard
                      key={job.id}
                      job={job}
                      onTransition={handleTransition}
                      onAssign={handleAssign}
                      onReserveMaterials={handleReserveMaterials}
                      onCompleteJob={handleCompleteJob}
                    />
                  ))}
                  {!(groupedJobs[status] || []).length && (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                      <p className="text-xs text-slate-400">No jobs</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Completed/Invoiced/Closed section */}
          {TERMINAL_STATUSES.some(s => (groupedJobs[s] || []).length > 0) && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Completed & Finished
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {TERMINAL_STATUSES.flatMap(s => groupedJobs[s] || []).map(job => (
                  <ServiceJobCard
                    key={job.id}
                    job={job}
                    onTransition={handleTransition}
                    onAssign={handleAssign}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ServiceJobDashboard;
