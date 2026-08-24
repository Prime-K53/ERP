import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Search, Calendar, ChevronRight } from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';
import PortalPageHeader from './components/PortalPageHeader';
import PortalInput from './components/PortalInput';
import PortalCard from './components/PortalCard';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { DEFAULT_PAGE_SIZE, formatK } from './constants';
import { F } from './portalStyles';

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  date: string;
  reference: string;
}

const CustomerPayments: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalLifecycle.payments.list({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined });
      if ('payments' in data) {
        setPayments((data as any).payments);
        setTotalPages((data as any).totalPages);
        setTotal((data as any).total);
      } else {
        setPayments(data as Payment[]);
        setTotalPages(1);
        setTotal((data as Payment[]).length);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const filteredPayments = useMemo(() => {
    let result = payments;
    if (dateFrom) {
      result = result.filter((p) => new Date(p.date) >= new Date(dateFrom));
    }
    if (dateTo) {
      result = result.filter((p) => new Date(p.date) <= new Date(dateTo + 'T23:59:59'));
    }
    return result;
  }, [payments, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type !== 'entity_changed' || cancelled) return;
          const event = payload?.event;
          if (event === 'payment_allocated' || event === 'payment_recorded' || event === 'payment_made' || event === 'balance_changed') load();
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [load]);

  if (loading && page === 1) return <div style={{ padding: 32, maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}><PortalLoadingSkeleton type="table" count={6} /></div>;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const totalPaid = filteredPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paidThisMonth = filteredPayments
    .filter((p) => new Date(p.date).getMonth() === currentMonth && new Date(p.date).getFullYear() === currentYear)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paidThisYear = filteredPayments
    .filter((p) => new Date(p.date).getFullYear() === currentYear)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <div>
      <PortalPageHeader title="Payments" subtitle="Your complete payment history" icon={CreditCard} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div className="cp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 16 }}>
          <style>{`@media (min-width: 640px) { .cp-grid-3 { grid-template-columns: repeat(3, 1fr) !important; } }`}</style>
          <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E9EDF3', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A94A6', display: 'block', marginBottom: 4 }}>Total Paid</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#1A202C', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>{formatK(totalPaid)}</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E9EDF3', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A94A6', display: 'block', marginBottom: 4 }}>This Month</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#0D5047', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>{formatK(paidThisMonth)}</span>
          </div>
          <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #E9EDF3', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A94A6', display: 'block', marginBottom: 4 }}>This Year</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#1A202C', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>{formatK(paidThisYear)}</span>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid #E9EDF3', boxShadow: '0 1px 3px rgba(0,0,0,.04)', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
            <input
              type="text"
              placeholder="Search reference or method..."
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              style={{ width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 8, paddingBottom: 8, borderRadius: 10, background: '#F7FAFC', border: '1px solid #E9EDF3', fontSize: 13, color: '#1A202C', fontFamily: F, outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', flexShrink: 0 }}>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid #E9EDF3', fontSize: 13, color: '#1A202C', fontFamily: F, outline: 'none' }}
            />
            <span style={{ fontSize: 13, color: '#8A94A6', fontWeight: 600 }}>to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid #E9EDF3', fontSize: 13, color: '#1A202C', fontFamily: F, outline: 'none' }}
            />
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <EmptyState icon={<CreditCard size={32} />} title="No payments found" description="You have no payment history matching your filter." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', paddingLeft: 4, paddingRight: 4 }}>
              Showing {filteredPayments.length} of {total} payment{total !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredPayments.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/portal/payments/${p.id}`)}
                  style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, border: '1px solid #E9EDF3', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid #D1FAE5', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                      <CreditCard size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1A202C', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.reference || p.id.slice(0, 8)}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#8A94A6', marginTop: 2 }}>
                        {new Date(p.date).toLocaleDateString()} • {p.payment_method || 'Standard Method'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontFamily: F, fontVariantNumeric: 'tabular-nums' }}>
                        {formatK(p.amount)}
                      </div>
                      <div style={{ fontSize: 10, color: '#8A94A6', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Amount Paid</div>
                    </div>
                    <div style={{ padding: 6, borderRadius: 8, background: '#ECFDF5', color: '#0D5047' }}>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingLeft: 4, paddingRight: 4, fontSize: 12, color: '#8A94A6', fontWeight: 600 }}>
                <span>Page {page} of {totalPages}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '8px 14px', borderRadius: 8, background: '#fff', border: '1px solid #E9EDF3', color: '#1A202C', fontSize: 12, fontWeight: 600, fontFamily: F, cursor: 'pointer', opacity: page <= 1 ? 0.4 : 1, lineHeight: 1.4 }}>Previous</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '8px 14px', borderRadius: 8, background: '#fff', border: '1px solid #E9EDF3', color: '#1A202C', fontSize: 12, fontWeight: 600, fontFamily: F, cursor: 'pointer', opacity: page >= totalPages ? 0.4 : 1, lineHeight: 1.4 }}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerPayments;
