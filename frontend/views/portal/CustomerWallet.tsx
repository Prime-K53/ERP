import React, { useEffect, useState, useMemo } from 'react';
import { Wallet, Filter, TrendingUp, TrendingDown } from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';
import PortalPageHeader from './components/PortalPageHeader';
import PortalButton from './components/PortalButton';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { formatK } from './constants';
import { F } from './portalStyles';

interface WalletTransaction {
  date: string;
  amount: number;
  type: string;
  reference: string;
}

interface WalletData {
  balance: number;
  transactions: WalletTransaction[];
}

const CustomerWallet: React.FC = () => {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    portalLifecycle.wallet.get()
      .then(setData)
      .catch((err) => setError(err.message || 'Failed to load wallet'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && (payload?.docType === 'invoice' || payload?.docType === 'wallet' || payload?.docType === 'payment' || payload?.event === 'payment_allocated') && !cancelled) {
            portalLifecycle.wallet.get()
              .then(setData)
              .catch(() => {});
          }
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    return data.transactions.filter((t) => {
      const matchesType = typeFilter === 'all' || t.type === typeFilter;
      const matchesDate = !dateFrom || new Date(t.date) >= new Date(dateFrom);
      const matchesDateTo = !dateTo || new Date(t.date) <= new Date(dateTo);
      return matchesType && matchesDate && matchesDateTo;
    });
  }, [data, typeFilter, dateFrom, dateTo]);

  if (loading) return <div style={{ padding: 32, maxWidth: 896, margin: '0 auto' }}><PortalLoadingSkeleton type="table" count={5} /></div>;

  return (
    <div>
      <PortalPageHeader title="Wallet" subtitle="Your digital wallet balance and transactions" icon={Wallet} />

      <div style={{ padding: '20px 28px 8px' }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {data && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3', padding: '20px 24px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D5047', flexShrink: 0 }}>
              <Wallet size={22} />
            </div>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: 0.06 }}>Wallet Balance</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#2D3748', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatK(data.balance || 0)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '0 28px 28px' }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E9EDF3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A202C' }}>
              Transaction History
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  fontFamily: F, fontSize: 13, fontWeight: 500,
                  color: '#1A202C', background: '#fff',
                  border: '1px solid #E9EDF3', borderRadius: 10,
                  padding: '8px 32px 8px 12px', outline: 'none', cursor: 'pointer',
                  minWidth: 110
                }}
              >
                <option value="all">All Types</option>
                <option value="credit">Credits</option>
                <option value="debit">Debits</option>
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" style={{ fontFamily: F, fontSize: 13, padding: '8px 12px', border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', width: 130 }} />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" style={{ fontFamily: F, fontSize: 13, padding: '8px 12px', border: '1px solid #E9EDF3', borderRadius: 10, background: '#fff', color: '#1A202C', outline: 'none', width: 130 }} />
            </div>
          </div>
          {!data ? null : filteredTransactions.length === 0 ? (
            <EmptyState icon={<Wallet size={28} />} title="No transactions" description={typeFilter !== 'all' || dateFrom || dateTo ? 'No transactions match your filters.' : 'Your wallet transactions will appear here.'} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredTransactions.map((t, i) => {
                const isCredit = Number(t.amount) >= 0;
                return (
                  <div key={`${t.date}-${t.reference}-${i}`} style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', border: '1px solid #E9EDF3', marginBottom: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: isCredit ? '#ecfdf5' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCredit ? '#059669' : '#dc2626', flexShrink: 0 }}>
                          {isCredit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#1A202C', margin: 0 }}>{t.type}</p>
                          <p style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 1 }}>{new Date(t.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: isCredit ? '#059669' : '#dc2626', margin: 0 }}>
                          {formatK(t.amount)}
                        </p>
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 4 }}>
                      Reference: <span style={{ color: '#2D3748', fontWeight: 500 }}>{t.reference || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerWallet;
