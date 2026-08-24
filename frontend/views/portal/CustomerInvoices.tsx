import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Search, FileText, ChevronRight } from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';
import PortalPageHeader from './components/PortalPageHeader';
import PortalInput from './components/PortalInput';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import StatusBadge from './components/StatusBadge';
import { DEFAULT_PAGE_SIZE, formatK } from './constants';
import { F } from './portalStyles';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  created_at: string;
}

const statuses = ['All', 'Paid', 'Unpaid', 'Overdue', 'Partially Paid'];

const CustomerInvoices: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(searchParams.get('status') || 'All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const status = searchParams.get('status');
    if (status !== filter) {
      setFilter(status || 'All');
      setPage(1);
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.invoices.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined, status: filter === 'All' ? undefined : filter });
      if ('invoices' in data) {
        setInvoices((data as any).invoices);
        setTotalPages((data as any).totalPages);
        setTotal((data as any).total);
      } else {
        setInvoices(data as Invoice[]);
        setTotalPages(1);
        setTotal((data as Invoice[]).length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, search, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload?.docType === 'invoice' && !cancelled) {
            load();
          }
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [load]);

  const filtered = filter === 'All' ? invoices : invoices.filter((inv) => {
    const key = inv.status?.toLowerCase().replace(/\s+/g, '_');
    const filterKey = filter.toLowerCase().replace(/\s+/g, '_');
    return key === filterKey || key === filterKey.replace('_', '');
  });

  if (loading && page === 1) return <div style={{ padding: 16, maxWidth: 560, marginInline: 'auto' }}><PortalLoadingSkeleton type="table" count={8} /></div>;

  return (
    <div>
      <PortalPageHeader title="Invoices" subtitle="View and manage your invoices" icon={Eye} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* Filters Bar */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid #E9EDF3', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
            <input
              type="text"
              placeholder="Search invoice number, amount..."
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              style={{ width: '100%', padding: '8px 12px 8px 38px', borderRadius: 10, background: '#F7F8FA', border: '1px solid #E9EDF3', fontSize: 12, color: '#1A202C', outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
            />
          </div>
          <select
            value={filter}
            onChange={(e) => { setPage(1); const val = e.target.value; setFilter(val); setSearchParams(prev => { const next = new URLSearchParams(prev); if (val === 'All') { next.delete('status'); } else { next.set('status', val); } return next; }); }}
            aria-label="Filter by status"
            style={{ padding: '8px 32px 8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: '#fff', border: '1px solid #E9EDF3', color: '#4A5568', outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,.04)', cursor: 'pointer' }}
          >
            <option value="All">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Overdue">Overdue</option>
            <option value="Partially Paid">Partially Paid</option>
          </select>
        </div>

        {/* Invoices List */}
        {filtered.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="No invoices found" description={filter === 'All' ? 'You have no invoices yet.' : `No invoices with status "${filter}".`} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', padding: '0 4px' }}>
              Showing {invoices.length} of {total} invoice{total !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((inv) => {
                const date = new Date(inv.created_at).toLocaleDateString();
                return (
                  <div
                    key={inv.id}
                    onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                    style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, border: '1px solid #E9EDF3', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#ECFDF5', color: '#0D5047', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(16,185,129,0.15)', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                        <FileText size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1A202C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.invoice_number}</div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: '#8A94A6', marginTop: 2 }}>
                          {date} • Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                      <StatusBadge status={inv.status || 'Unpaid'} size="sm" />
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A202C', fontVariantNumeric: 'tabular-nums' }}>
                          {formatK(inv.total_amount)}
                        </div>
                        <div style={{ fontSize: 10, color: '#8A94A6', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.05 }}>Total</div>
                      </div>
                      <div style={{ padding: 6, borderRadius: 8, background: '#ECFDF5', color: '#0D5047', cursor: 'pointer' }}>
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingInline: 4, fontSize: 12, color: '#8A94A6', fontWeight: 600 }}>
                <span>Page {page} of {totalPages}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#fff', border: '1px solid #E9EDF3', color: '#4A5568', opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#fff', border: '1px solid #E9EDF3', color: '#4A5568', opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerInvoices;
