import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, ChevronRight } from 'lucide-react';
import { portalLifecycle, QuotationRecord } from '../../services/portalApiClient';
import PortalPageHeader from './components/PortalPageHeader';
import PortalInput from './components/PortalInput';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { DEFAULT_PAGE_SIZE, FRIENDLY_STATUS_MAP } from './constants';
import { F } from './portalStyles';

const CustomerQuotations: React.FC = () => {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.quotations.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined });
      if ('quotations' in data) {
        setQuotations((data as any).quotations);
        setTotalPages((data as any).totalPages);
        setTotal((data as any).total);
      } else {
        setQuotations(data as QuotationRecord[]);
        setTotalPages(1);
        setTotal((data as QuotationRecord[]).length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload.docType === 'quotation' && !cancelled) load();
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [load]);

  const sorted = useMemo(
    () => [...quotations]
      .filter((q) => statusFilter === 'all' || q.status === statusFilter)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [quotations, statusFilter]
  );

  if (loading && page === 1) return <div style={{ padding: 32, maxWidth: 896, margin: '0 auto' }}><PortalLoadingSkeleton type="table" count={6} /></div>;

  return (
    <div>
      <PortalPageHeader
        title="Quotations"
        subtitle="View your quotations"
        icon={FileText}
        action={{ label: 'New Quotation', onClick: () => navigate('/portal/new-request?type=quotation'), icon: Plus }}
      />

      <div style={{ padding: '20px 28px 8px' }}>
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 10, lineHeight: 1.4 }}>{error}</div>
        )}
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <PortalInput label="" placeholder="Search quotations..." value={search} onChange={(v) => { setPage(1); setSearch(v); }} onFocus={() => {}} onBlur={() => {}} style={{ paddingLeft: 32 }} />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            fontFamily: F, fontSize: 13,
            padding: '8px 32px 8px 12px', border: '1px solid #E9EDF3', borderRadius: 10,
            background: '#fff', color: '#1A202C', outline: 'none', cursor: 'pointer',
            minWidth: 130, lineHeight: 1.4
          }}
        >
          <option value="all">All Statuses</option>
          <option value="ready">Ready</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="revision_requested">Revision Requested</option>
          <option value="converted">Converted</option>
        </select>
      </div>

      <div style={{ padding: '16px 28px 28px' }}>
        {sorted.length === 0 ? (
          <EmptyState icon={<FileText size={28} />} title="No quotations yet" description="Your quotations will appear here once created." />
        ) : (
          <>
            <div style={{ fontSize: 10.5, color: '#8A94A6', marginBottom: 8 }}>
              Showing {quotations.length} of {total} quotation{total !== 1 ? 's' : ''}
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}>
                {sorted.map((q) => {
                  const friendlyStatus = FRIENDLY_STATUS_MAP[q.status] || q.status;
                  const isExpired = q.status === 'expired' || (q.valid_until && new Date(q.valid_until) < new Date());
                  const isExpiringSoon = q.valid_until && !isExpired && (new Date(q.valid_until).getTime() - Date.now()) < 7 * 86400000;
                  const quotationNumber = q.quotation_number || q.id.slice(0, 8);
                  const date = new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const total = Number(q.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
                return (
                  <div
                    key={q.id}
                    onClick={() => navigate(`/portal/quotations/${q.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', background: '#FFFFFF',
                      borderRadius: 14, border: '1px solid rgba(16,24,40,0.05)',
                      borderLeft: '4px solid #4ed3c7', cursor: 'pointer',
                      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                      transition: 'all .15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16,24,40,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(16,24,40,0.04)';
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef7f6', flexShrink: 0 }}>
                      <FileText size={16} color="#1f8577" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0b3e39' }}>{quotationNumber}</div>
                      <div style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 1, lineHeight: 1.3 }}>
                          {date} • {friendlyStatus}
                          {isExpired && ' • Expired'}
                          {isExpiringSoon && !isExpired && ' • Expiring soon'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: 80 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0b3e39', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }}>
                          K {total}
                        </div>
                        <div style={{ fontSize: 10, color: '#5c6567', textTransform: 'uppercase', marginTop: 1, lineHeight: 1.3 }}>
                          Total
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: 6, background: '#ECFDF5', fontSize: 10, fontWeight: 600, color: '#0f544c', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, border: '1px solid #d3ece9' }}>
                        View
                        <ChevronRight size={10} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 12, fontWeight: 600, color: '#8A94A6' }}>
                <span>Page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #E9EDF3', background: '#fff', color: '#4A5568', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, lineHeight: 1.4 }}>Previous</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid #E9EDF3', background: '#fff', color: '#4A5568', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, lineHeight: 1.4 }}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CustomerQuotations;
