import React, { useEffect, useMemo, useState } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { currencyService } from '../../services/currencyService';
import { useExamination } from '../../context/ExaminationContext';
import { useData, REFRESH_INTERVAL } from '../../context/DataContext';
import { useModuleRefresh } from '../../hooks/useModuleRefresh';
import { toast } from '../../components/Toast';
import {
  Plus,
  Search,
  DollarSign,
  FileText,
  CheckCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Download,
  Trash2,
  Droplet,
  MoreVertical,
  Calculator,
  CheckSquare,
  FileOutput,
  Edit3,
  Repeat,
  X
} from 'lucide-react';
import { buildRecurringDraftFromExaminationBatch } from '../../utils/recurringConversion';
import '../inventory/inventory-reference.css';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};
const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};

const ExaminationHub: React.FC = () => {
  const DEFAULT_TONER_PAGES_PER_UNIT = 20000;

  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const {
    batches,
    schools,
    loading,
    batchLoadError,
    loadAllData,
    deleteBatches,
    calculateBatch,
    approveBatch,
    generateInvoice,
    deleteBatch
  } = useExamination();
  const { refreshAllData } = useData();

  useModuleRefresh(async () => {
    await Promise.allSettled([
      loadAllData(),
      refreshAllData()
    ]);
  }, { interval: REFRESH_INTERVAL });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const getSchoolName = (schoolId: string) => {
    return schools.find((school) => String(school.id) === String(schoolId))?.name || 'Unknown School';
  };

  const resolvePositiveNumber = (...values: any[]) => {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  };

  const isCalculatedBatch = (batch: any) => String(batch?.status || '').toLowerCase() === 'calculated';

  const getBatchClassCount = (batch: any) => {
    const rawCount = Number(
      batch?.class_count
      ?? batch?.classCount
      ?? batch?.classes?.length
      ?? 0
    );
    return Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : 0;
  };

  const getBatchPageCount = (batch: any): number => {
    if (!batch || typeof batch !== 'object') {
      return 0;
    }

    const explicitTotal = Number(batch?.total_pages ?? batch?.totalPages ?? 0);
    if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
      return Math.round(explicitTotal);
    }

    if (Array.isArray(batch?.classes)) {
      const calculatedFromSubjects = batch.classes.reduce((sum: number, cls: any) => {
        if (!cls || typeof cls !== 'object') {
          return sum;
        }
        
        const classCalcPages = Number(cls?.calculated_total_pages ?? 0);
        if (Number.isFinite(classCalcPages) && classCalcPages > 0) {
          return sum + classCalcPages;
        }

        const subjects = Array.isArray(cls?.subjects) ? cls.subjects : [];
        return sum + subjects.reduce((subjectSum: number, subject: any) => {
          if (!subject || typeof subject !== 'object') {
            return subjectSum;
          }
          const subjectTotalPages = Number(subject?.total_pages ?? 0);
          if (Number.isFinite(subjectTotalPages) && subjectTotalPages > 0) {
            return subjectSum + subjectTotalPages;
          }
          const learners = Math.max(0, Math.floor(Number(cls?.number_of_learners) || 0));
          const pages = Math.max(1, Math.floor(Number(subject?.pages) || 0));
          const extraCopies = Math.max(0, Math.floor(Number(subject?.extra_copies) || 0));
          return subjectSum + (pages * (learners + extraCopies));
        }, 0);
      }, 0);
      if (Number.isFinite(calculatedFromSubjects) && calculatedFromSubjects > 0) {
        return Math.round(calculatedFromSubjects);
      }
    }

    return 0;
  };

  const getBatchSheetCount = (batch: any): number => {
    if (!batch || typeof batch !== 'object') {
      return 0;
    }

    const explicitTotal = resolvePositiveNumber(batch?.total_sheets, batch?.totalSheets);
    if (explicitTotal !== null) {
      return Math.round(explicitTotal);
    }

    if (Array.isArray(batch?.classes)) {
      const calculatedFromSubjects = batch.classes.reduce((sum: number, cls: any) => {
        if (!cls || typeof cls !== 'object') {
          return sum;
        }
        const subjects = Array.isArray(cls?.subjects) ? cls.subjects : [];
        return sum + subjects.reduce((subjectSum: number, subject: any) => {
          if (!subject || typeof subject !== 'object') {
            return subjectSum;
          }
          const subjectTotalSheets = resolvePositiveNumber(subject?.total_sheets, subject?.totalSheets);
          if (subjectTotalSheets !== null) {
            return subjectSum + subjectTotalSheets;
          }
          const learners = Math.max(0, Math.floor(Number(cls?.number_of_learners) || 0));
          const pages = Math.max(0, Math.floor(Number(subject?.pages ?? subject?.pages_per_paper) || 0));
          const extraCopies = Math.max(0, Math.floor(Number(subject?.extra_copies) || 0));
          const copies = learners + extraCopies;

          if (pages > 0 && copies > 0) {
            return subjectSum + (Math.ceil(pages / 2) * copies);
          }

          const totalPages = resolvePositiveNumber(subject?.total_pages, subject?.totalPages);
          if (totalPages !== null) return subjectSum + Math.ceil(totalPages / 2);
          return subjectSum;
        }, 0);
      }, 0);

      if (Number.isFinite(calculatedFromSubjects) && calculatedFromSubjects > 0) {
        return Math.round(calculatedFromSubjects);
      }
    }

    const totalPages = getBatchPageCount(batch);
    return totalPages > 0 ? Math.ceil(totalPages / 2) : 0;
  };

  const getBatchTonerPagesPerUnit = (batch: any) => {
    return resolvePositiveNumber(
      batch?.toner_pages_per_unit,
      batch?.pricing_settings?.constants?.toner_pages_per_unit,
      batch?.pricingSettings?.constants?.toner_pages_per_unit,
      batch?.pricingSettings?.constants?.tonerPagesPerUnit
    ) ?? DEFAULT_TONER_PAGES_PER_UNIT;
  };

  const getBatchTonerNeeded = (batch: any) => {
    const totalPages = getBatchPageCount(batch);
    if (totalPages <= 0) return 0;
    return totalPages / getBatchTonerPagesPerUnit(batch);
  };

  const stats = useMemo(() => {
    const calculatedBatches = batches.filter(isCalculatedBatch);

    return {
      totalBatches: batches.length,
      approvedBatches: batches.filter((batch) => batch.status === 'Approved').length,
      invoicedBatches: batches.filter((batch) => batch.status === 'Invoiced').length,
      totalAmount: batches.reduce((sum, batch) => sum + (batch.total_amount || 0), 0),
      calculatedBatches: calculatedBatches.length,
      totalTonerNeeded: calculatedBatches.reduce((sum, batch) => sum + getBatchTonerNeeded(batch), 0),
      totalPaperNeeded: calculatedBatches.reduce((sum, batch) => sum + getBatchSheetCount(batch), 0)
    };
  }, [batches]);

  const filteredBatches = useMemo(() => {
    return batches
      .filter((batch) => {
        const normalizedSearch = searchTerm.toLowerCase();
        const matchesSearch =
          searchTerm === '' ||
          String(batch.name || '').toLowerCase().includes(normalizedSearch) ||
          String(batch.exam_type || '').toLowerCase().includes(normalizedSearch) ||
          getSchoolName(String(batch.school_id)).toLowerCase().includes(normalizedSearch);

        const matchesSchool = selectedSchool === '' || String(batch.school_id) === String(selectedSchool);
        const matchesStatus = selectedStatus === '' || batch.status === selectedStatus;

        return matchesSearch && matchesSchool && matchesStatus;
      })
      .sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [batches, searchTerm, selectedSchool, selectedStatus, schools]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Draft':
        return {
          badgeStyle: { background: teal[50], color: teal[800], border: `1px solid ${teal[200]}` },
          icon: <Clock size={12} />
        };
      case 'Calculated':
        return {
          badgeStyle: { background: teal[50], color: teal[700], border: `1px solid ${teal[200]}` },
          icon: <FileText size={12} />
        };
      case 'Approved':
        return {
          badgeStyle: { background: amber[100], color: '#92400e', border: `1px solid ${amber[300]}` },
          icon: <CheckCircle size={12} />
        };
      case 'Invoiced':
        return {
          badgeStyle: { background: teal[500], color: '#fff', border: `1px solid ${teal[500]}` },
          icon: <DollarSign size={12} />
        };
      default:
        return {
          badgeStyle: { background: teal[50], color: inkSoft, border: `1px solid ${hairline}` },
          icon: <RefreshCw size={12} />
        };
    }
  };

  const toggleBatchSelection = (batchId: string) => {
    const newSelected = new Set(selectedBatchIds);
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId);
    } else {
      newSelected.add(batchId);
    }
    setSelectedBatchIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedBatchIds.size === filteredBatches.length) {
      setSelectedBatchIds(new Set());
    } else {
      setSelectedBatchIds(new Set(filteredBatches.map(b => b.id)));
    }
  };

  const clearSelection = () => {
    setSelectedBatchIds(new Set());
  };

  const handleBatchRowClick = (event: React.MouseEvent<HTMLElement>, batch: any) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, a, [data-row-action="true"]')) {
      return;
    }
    const batchRef = String(batch.batch_number || batch.batchNumber || batch.id || '').trim();
    navigate(`/examination/batches/${batch.id}`, { state: { name: batchRef } });
  };

  const handleBulkDelete = async () => {
    if (selectedBatchIds.size === 0) return;
    
    setIsDeleting(true);
    try {
      const results = await deleteBatches(Array.from(selectedBatchIds));
      
      if (results.success.length > 0) {
        toast.success(`Successfully deleted ${results.success.length} batch(es)`);
      }
      
      if (results.failed.length > 0) {
        toast.error(`Failed to delete ${results.failed.length} batch(es)`);
        logger.error('Failed deletions:', results.failed);
      }

      try {
        await loadAllData();
      } catch (refreshError) {
        console.warn('Failed to refresh batches after bulk delete:', refreshError);
      }
      setSelectedBatchIds(new Set());
      setShowDeleteConfirm(false);
    } catch (error) {
      toast.error('Failed to delete batches');
      logger.error('Bulk delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCalculate = async (batchId: string) => {
    setActionLoading(batchId);
    try {
      await calculateBatch(batchId);
      toast.success('Batch calculated successfully');
      loadAllData();
    } catch (error) {
      toast.error('Failed to calculate batch');
      logger.error('Calculate error:', error);
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  };

  const handleApprove = async (batchId: string) => {
    setActionLoading(batchId);
    try {
      const { warnings } = await approveBatch(batchId);
      if (warnings && warnings.length > 0) {
        warnings.forEach(w => toast.warning(w.message));
        toast.warning('Batch approved with inventory warnings.');
      } else {
        toast.success('Batch approved successfully');
      }
      loadAllData();
    } catch (error) {
      toast.error('Failed to approve batch');
      logger.error('Approve error:', error);
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  };

  const handleGenerateInvoice = async (batchId: string) => {
    setActionLoading(batchId);
    try {
      const result = await generateInvoice(batchId);
      if (result.success) {
        toast.success('Invoice generated successfully');
        loadAllData();
      } else {
        toast.error('Failed to generate invoice');
      }
    } catch (error) {
      toast.error('Failed to generate invoice');
      logger.error('Invoice generation error:', error);
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  };

  const handleConvertToRecurring = (batch: any) => {
    const recurringDraft = buildRecurringDraftFromExaminationBatch(batch, getSchoolName(String(batch.school_id)));
    navigate('/sales-flow/subscriptions', {
      state: {
        action: 'create',
        recurringDraft
      }
    });
    setOpenMenuId(null);
    toast.success('Batch loaded into a recurring invoice draft');
  };

  const handleDeleteSingle = async (batchId: string) => {
    if (!confirm('Are you sure you want to delete this batch? This action cannot be undone.')) {
      setOpenMenuId(null);
      return;
    }
    setActionLoading(batchId);
    try {
      await deleteBatch(batchId);
      toast.success('Batch deleted successfully');
      loadAllData();
    } catch (error) {
      toast.error('Failed to delete batch');
      logger.error('Delete error:', error);
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  };

  const exportData = () => {
    const csvContent = [
      ['Batch Name', 'School', 'Classes', 'Status', 'Amount', 'Created'],
      ...filteredBatches.map((batch) => [
        batch.name,
        getSchoolName(String(batch.school_id)),
        getBatchClassCount(batch),
        batch.status,
        `${batch.currency || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} ${(batch.total_amount || 0).toLocaleString()}`,
        new Date(batch.created_at).toLocaleDateString()
      ])
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `examination-batches-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('Data exported successfully');
  };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      padding: '16px 24px', maxWidth: 1600, margin: '0 auto',
      width: '100%', fontFamily: "'Inter','DM Sans',sans-serif",
      fontWeight: 400, overflowY: 'auto', color: ink, fontSize: 13.5
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        marginBottom: 16, flexShrink: 0
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: teal[800], letterSpacing: 0.2, margin: 0 }}>
            Examination Printing
          </h1>
          <p style={{ fontSize: 12, color: inkSoft, margin: 0 }}>
            Batch pricing, cost review, and invoice workflow
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadAllData} disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: teal[50], color: teal[700],
              padding: '8px 16px', borderRadius: 9, fontWeight: 600,
              fontSize: 13, border: `1px solid ${teal[200]}`,
              cursor: 'pointer', transition: 'all .15s ease',
              opacity: loading ? 0.6 : 1
            }}>
            <RefreshCw size={16} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
          <button onClick={exportData}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: paper, color: inkSoft,
              padding: '8px 16px', borderRadius: 9, fontWeight: 600,
              fontSize: 13, border: `1.4px solid ${hairline}`,
              cursor: 'pointer', transition: 'all .15s ease'
            }}>
            <Download size={16} />
            Export
          </button>
          <button onClick={() => navigate('/examination/batches/new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: teal[500], color: '#fff',
              padding: '8px 16px', borderRadius: 9, fontWeight: 600,
              fontSize: 13, border: 'none',
              cursor: 'pointer', boxShadow: `0 4px 10px -4px rgba(15,84,76,.4)`,
              transition: 'all .15s ease'
            }}>
            <Plus size={16} />
            Create Batch
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12, marginBottom: 24, flexShrink: 0
      }}>
        {[
          { label: 'Total Batches', value: stats.totalBatches, sub: 'Active and historical', color: ink, borderColor: teal[500], iconColor: teal[500], bg: teal[50], icon: <FileText size={18} /> },
          { label: 'Total Amount', value: `${currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'}${stats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, sub: 'Across all batches', color: ink, borderColor: amber[500], iconColor: amber[500], bg: amber[100], icon: <DollarSign size={18} /> },
          { label: 'Total Toner Needed', value: `${stats.totalTonerNeeded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`, sub: 'For calculated batches', color: ink, borderColor: teal[300], iconColor: teal[600], bg: teal[50], icon: <Droplet size={18} /> },
          { label: 'Total Papers Needed', value: `${stats.totalPaperNeeded.toLocaleString()} sheets`, sub: `Across ${stats.calculatedBatches} calculated batch(es)`, color: ink, borderColor: amber[300], iconColor: '#b97e2b', bg: amber[100], icon: <FileText size={18} /> },
          { label: 'Ready / Invoiced', value: `${stats.approvedBatches} / ${stats.invoicedBatches}`, sub: 'Approval lifecycle', color: ink, borderColor: ink, iconColor: inkSoft, bg: teal[50], icon: <CheckCircle size={18} /> }
        ].map((kpi, i) => (
          <div key={i} style={{
            background: paper, borderRadius: 12, padding: '14px 16px',
            border: `1.4px solid ${hairline}`, borderLeft: `3px solid ${kpi.borderColor}`,
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,.04)'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: kpi.bg, color: kpi.iconColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              {kpi.icon}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.02 }}>{kpi.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: kpi.color, marginTop: 2 }}>{kpi.value}</div>
              <div style={{ fontSize: 9.5, color: inkSoft, marginTop: 1 }}>{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: paper, padding: '16px 20px', borderRadius: 12,
        border: `1.4px solid ${hairline}`, marginBottom: 16, flexShrink: 0
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search batches, exam type, or school"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <select
              value={selectedSchool}
              onChange={(event) => setSelectedSchool(event.target.value)}
              style={{ ...selectStyle, minWidth: 220 }}
            >
              <option value="">All Schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              style={{ ...selectStyle, minWidth: 180 }}
            >
              <option value="">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Calculated">Calculated</option>
              <option value="Approved">Approved</option>
              <option value="Invoiced">Invoiced</option>
            </select>
          </div>
        </div>
      </div>

      {selectedBatchIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: `${danger}10`, border: `1px solid ${danger}25`,
          borderRadius: 12, padding: '12px 16px', marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: danger }}>
              {selectedBatchIds.size} batch{selectedBatchIds.size !== 1 ? 'es' : ''} selected
            </span>
            <button onClick={clearSelection} style={{
              fontSize: 12, color: danger, textDecoration: 'underline',
              background: 'none', border: 'none', cursor: 'pointer'
            }}>
              Clear selection
            </button>
          </div>
          <button onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: danger, color: '#fff',
              padding: '6px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', opacity: isDeleting ? 0.6 : 1
            }}>
            <Trash2 size={14} />
            {isDeleting ? 'Deleting...' : 'Delete Selected'}
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {batchLoadError ? (
          <div style={{
            background: paper, borderRadius: 12,
            border: `1.4px solid ${hairline}`, padding: 40, textAlign: 'center'
          }}>
            <RefreshCw size={40} style={{ margin: '0 auto 12', color: danger }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: danger, margin: 0 }}>Unable to load batches</p>
            <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>{batchLoadError}</p>
            <button onClick={loadAllData} disabled={loading}
              style={{
                marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
                background: `${danger}10`, color: danger,
                padding: '8px 16px', borderRadius: 9, fontWeight: 600,
                fontSize: 13, border: `1px solid ${danger}25`,
                cursor: 'pointer', opacity: loading ? 0.6 : 1
              }}>
              <RefreshCw size={16} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
              Retry
            </button>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div style={{
            background: paper, borderRadius: 12,
            border: `1.4px solid ${hairline}`, padding: 40, textAlign: 'center'
          }}>
            <FileText size={40} style={{ margin: '0 auto 12', color: teal[200] }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: ink, margin: 0 }}>No batches found</p>
            <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>Adjust filters or create a new examination batch.</p>
          </div>
        ) : (
          <div style={{
            background: paper, borderRadius: 12, overflow: 'hidden',
            border: `1.4px solid ${hairline}`
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead style={{ background: teal[50], position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ width: 40, padding: '10px 6px', textAlign: 'center', color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08 }}>
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.size === filteredBatches.length && filteredBatches.length > 0}
                        onChange={toggleSelectAll}
                        style={{ accentColor: teal[600] }}
                      />
                    </th>
                    <th style={{ color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, padding: '10px 12px' }}>Batch</th>
                    <th style={{ color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, padding: '10px 12px' }}>School</th>
                    <th style={{ color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, padding: '10px 12px' }}>Exam Type</th>
                    <th style={{ color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, padding: '10px 12px' }}>Academic</th>
                    <th style={{ color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, padding: '10px 12px', textAlign: 'right' }}>Classes</th>
                    <th style={{ color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, padding: '10px 12px', textAlign: 'right' }}>Amount</th>
                    <th style={{ color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, padding: '10px 12px' }}>Status</th>
                    <th style={{ width: 40, padding: '10px 6px', textAlign: 'right', color: inkSoft, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08 }}>Action</th>
                  </tr>
                </thead>
                <tbody style={{ borderCollapse: 'collapse' }}>
                  {filteredBatches.map((batch) => {
                    const statusConfig = getStatusConfig(batch.status);
                    const schoolName = getSchoolName(String(batch.school_id));
                    const batchReference = String(batch.batch_number || batch.batchNumber || batch.id || '').trim();
                    return (
                      <tr key={batch.id}
                        onClick={(event) => handleBatchRowClick(event, batch)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setOpenMenuId(batch.id);
                        }}
                        style={{ cursor: 'pointer', borderBottom: `1px solid ${hairline}` }}
                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ width: 40, padding: '8px 6px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedBatchIds.has(batch.id)}
                            onChange={() => toggleBatchSelection(batch.id)}
                            style={{ accentColor: teal[600] }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{batchReference || batch.id}</div>
                        </td>
                        <td style={{ padding: '8px 12px', color: inkSoft }}>
                          {schoolName}
                          {batch.sub_account_name && <span style={{ color: inkSoft, marginLeft: 4 }}>({batch.sub_account_name})</span>}
                        </td>
                        <td style={{ padding: '8px 12px', color: ink }}>{batch.exam_type}</td>
                        <td style={{ padding: '8px 12px', color: inkSoft }}>{batch.academic_year} Term {batch.term}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: ink }}>{getBatchClassCount(batch)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: ink }}>
                          {batch.currency || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'}
                          {(batch.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            borderRadius: 8, padding: '3px 10px',
                            fontSize: 11, fontWeight: 600, ...statusConfig.badgeStyle
                          }}>
                            {statusConfig.icon}
                            {batch.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(openMenuId === batch.id ? null : batch.id)}
                              disabled={actionLoading === batch.id}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 32, height: 32, borderRadius: 8,
                                color: inkSoft, cursor: 'pointer',
                                background: paper, border: `1px solid ${hairline}`,
                                transition: 'all .15s ease'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                              onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
                            >
                              {actionLoading === batch.id ? (
                                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                              ) : (
                                <MoreVertical size={16} />
                              )}
                            </button>
                            
                            {openMenuId === batch.id && (
                              <div style={{
                                position: 'absolute', right: 0, marginTop: 4, width: 192,
                                background: paper, borderRadius: 12,
                                boxShadow: '0 8px 24px rgba(0,0,0,.15)',
                                border: `1px solid ${hairline}`, padding: '4px 0', zIndex: 50
                              }}>
                                <button type="button" onClick={() => {
                                  const batchRef = String(batch.batch_number || batch.batchNumber || batch.id || '').trim();
                                  navigate(`/examination/batches/${batch.id}`, { state: { name: batchRef } });
                                }}
                                  style={{
                                    width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                    color: ink, background: 'transparent', border: 'none',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <Edit3 size={14} color={inkSoft} />
                                  {batch.status === 'Draft' || batch.status === 'Calculated' ? 'Edit' : 'View Details'}
                                </button>
                                
                                {batch.status === 'Draft' && (
                                  <button type="button" onClick={() => handleCalculate(batch.id)} disabled={actionLoading === batch.id}
                                    style={{
                                      width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                      color: ink, background: 'transparent', border: 'none',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <Calculator size={14} color={teal[500]} />
                                    Calculate
                                  </button>
                                )}
                                
                                {batch.status === 'Calculated' && (
                                  <button type="button" onClick={() => handleApprove(batch.id)} disabled={actionLoading === batch.id}
                                    style={{
                                      width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                      color: ink, background: 'transparent', border: 'none',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <CheckSquare size={14} color={amber[500]} />
                                    Approve
                                  </button>
                                )}
                                
                                {batch.status === 'Approved' && (
                                  <button type="button" onClick={() => handleGenerateInvoice(batch.id)} disabled={actionLoading === batch.id}
                                    style={{
                                      width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                      color: ink, background: 'transparent', border: 'none',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <FileOutput size={14} color={teal[500]} />
                                    Generate Invoice
                                  </button>
                                )}
                                
                                {batch.status === 'Invoiced' && batch.invoice_id && (
                                  <button type="button" onClick={() => navigate(`/sales/invoice/${batch.invoice_id}`)}
                                    style={{
                                      width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                      color: ink, background: 'transparent', border: 'none',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <FileText size={14} color={teal[600]} />
                                    View Invoice
                                  </button>
                                )}

                                <button type="button" onClick={() => handleConvertToRecurring(batch)}
                                  style={{
                                    width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                    color: teal[800], background: 'transparent', border: 'none',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <Repeat size={14} color={teal[500]} />
                                  Convert to Recurring
                                </button>
                                
                                <div style={{ borderTop: `1px solid ${hairline}`, margin: '4px 0' }} />
                                
                                {(batch.status === 'Draft' || batch.status === 'Calculated') && (
                                  <button type="button" onClick={() => handleDeleteSingle(batch.id)} disabled={actionLoading === batch.id}
                                    style={{
                                      width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                      color: danger, background: 'transparent', border: 'none',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = `${danger}10`}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <Trash2 size={14} color={danger} />
                                    Delete
                                  </button>
                                )}
                                
                                <button type="button" onClick={() => setOpenMenuId(null)}
                                  style={{
                                    width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 13,
                                    color: inkSoft, background: 'transparent', border: 'none',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <X size={14} color={inkSoft} />
                                  Close
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5,
        }} onClick={() => { if (!isDeleting) setShowDeleteConfirm(false); }}>
          <div style={{
            width: 480, maxWidth: '100%',
            background: paper, borderRadius: 14, padding: 28,
            boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)',
            position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 4,
              borderRadius: '14px 14px 0 0',
              background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
            }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 8 }}>
              <div style={{
                flexShrink: 0, width: 44, height: 44, borderRadius: 10,
                background: `${danger}15`, color: danger,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Trash2 size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{
                  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                  fontSize: 20, margin: 0, color: teal[800], letterSpacing: 0.2
                }}>
                  Delete Batches
                </h2>
                <p style={{ fontSize: 13, color: inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                  Are you sure you want to delete <strong>{selectedBatchIds.size} batch{selectedBatchIds.size !== 1 ? 'es' : ''}</strong>?
                  This action cannot be undone.
                </p>
                <div style={{
                  marginTop: 12, padding: 12, borderRadius: 9,
                  background: `${amber[100]}80`, border: `1px solid ${amber[300]}`,
                  fontSize: 12, color: '#92400e'
                }}>
                  <strong>Note:</strong> Only Draft or Calculated batches can be deleted. 
                  Approved and Invoiced batches will remain.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                  transition: 'all .15s ease'
                }}>
                Cancel
              </button>
              <button onClick={handleBulkDelete} disabled={isDeleting}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                  background: danger, color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                  opacity: isDeleting ? 0.6 : 1, transition: 'all .15s ease'
                }}>
                <RefreshCw size={14} style={isDeleting ? { animation: 'spin 1s linear infinite' } : {}} />
                {isDeleting ? 'Deleting...' : `Delete ${selectedBatchIds.size} Batch${selectedBatchIds.size !== 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExaminationHub;