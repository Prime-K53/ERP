import React, { useEffect, useState, useMemo } from 'react';
import { Wallet, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';

import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { formatK } from './constants';
import { F, MONO, NAVY, TEAL_GRADIENT } from './designTokens';

interface WalletTransaction {
  date: string;
  amount: number;
  type: string;
  reference: string;
}

interface WalletData {
  walletBalance: number;
  transactions: WalletTransaction[];
}

type WalletTab = 'all' | 'credit' | 'debit';

const CustomerWallet: React.FC = () => {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<WalletTab>('all');

  useEffect(() => {
    portalLifecycle.wallet.get()
      .then((result) => { setData(result && result.walletBalance != null ? result : null); setRefreshError(null); })
      .catch(() => { if (!data) setError('Failed to load wallet data'); else setRefreshError('Unable to refresh — data may be stale'); })
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
              .then((result) => { setData(result && result.walletBalance != null ? result : data); setRefreshError(null); })
              .catch(() => { if (!cancelled) setRefreshError('Unable to refresh — data may be stale'); });
          }
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const counts = useMemo(() => {
    if (!data?.transactions) return { all: 0, credit: 0, debit: 0 };
    return {
      all: data.transactions.length,
      credit: data.transactions.filter((t) => Number(t.amount) >= 0).length,
      debit: data.transactions.filter((t) => Number(t.amount) < 0).length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.transactions) return [];
    let list = data.transactions;
    if (tab !== 'all') {
      list = list.filter((t) => {
        if (tab === 'credit') return Number(t.amount) >= 0;
        if (tab === 'debit') return Number(t.amount) < 0;
        return true;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        String(t.type || '').toLowerCase().includes(q) ||
        String(t.reference || '').toLowerCase().includes(q) ||
        String(t.amount || '').includes(q)
      );
    }
    return [...list].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [data, tab, search]);

  if (loading) return <div style={{ padding: 32, maxWidth: 896, margin: '0 auto' }}><PortalLoadingSkeleton type="table" count={5} /></div>;

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {refreshError && <div style={{ padding: '0 28px' }}><ErrorBanner message={refreshError} onDismiss={() => setRefreshError(null)} /></div>}

      {/* Header */}
      <div style={{ padding: '0 0 16px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>Wallet</h1>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', margin: 0, lineHeight: 1.5 }}>Receipts, credits, and wallet transactions</p>
      </div>

      {/* Balance */}
      {data && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 18px' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wallet Balance</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 2 }}>{formatK(data.walletBalance || 0)}</div>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: '#F8FAFC', border: '1px solid #E2E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B',
          }}>
            <Wallet size={22} />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {([
          ['all', 'All Transactions'],
          ['credit', 'Credits'],
          ['debit', 'Debits'],
        ] as [WalletTab, string][]).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '8px 16px', borderRadius: 9999,
                border: active ? '1px solid transparent' : '1px solid #E2E8F0',
                background: active ? TEAL_GRADIENT : 'rgba(255,255,255,0.9)',
                color: active ? '#fff' : '#475569',
                fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em',
                cursor: 'pointer', transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
                boxShadow: active ? '0 4px 14px -4px rgba(15,84,76,0.55)' : '0 1px 2px rgba(15,23,42,0.04)',
                transform: active ? 'translateY(-1px)' : 'none', lineHeight: 1.4,
              }}
            >
              {label}
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 7px',
                background: active ? 'rgba(255,255,255,.18)' : '#F1F5F9', color: active ? '#fff' : '#64748B',
              }}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8A94A6' }} />
        <input
          type="text"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12,
            background: '#fff', border: '1px solid #E2E8F0', fontSize: 13, color: '#1A202C', outline: 'none',
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)', fontFamily: F,
          }}
        />
      </div>

      {/* Transaction list */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Wallet size={32} />} title="No transactions" description={search || tab !== 'all' ? 'No transactions match your filters.' : 'Your wallet transactions will appear here.'} />
      ) : (
        <div>
          {filtered.map((t, index) => {
            const isCredit = Number(t.amount) >= 0;
            const isLast = index === filtered.length - 1;
            const dateStr = t.date ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

            return (
              <div
                key={`${t.date}-${t.reference}-${index}`}
                style={{
                  paddingTop: 10,
                  paddingBottom: 10,
                  paddingLeft: 12,
                  paddingRight: 12,
                  borderBottom: isLast ? 'none' : '1px solid #F1F5F9',
                  borderLeft: '3px solid transparent',
                  borderRadius: 8,
                  background: '#fff',
                  transition: 'all 200ms cubic-bezier(.4,0,.2,1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F8FAFC';
                  e.currentTarget.style.borderLeftColor = '#0F2C59';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.borderLeftColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.3, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                        {t.type}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        {dateStr}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '3px 10px', borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      color: isCredit ? '#059669' : '#DC2626',
                      background: isCredit ? '#ECFDF5' : '#FEF2F2',
                      whiteSpace: 'nowrap',
                    }}>
                      {isCredit ? 'CREDIT' : 'DEBIT'}
                    </span>
                  </div>

                  {t.reference && (
                    <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.4 }}>
                      Reference: <span style={{ color: '#1E293B', fontWeight: 600, fontFamily: MONO }}>{t.reference}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontFamily: F, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                      {isCredit ? '+' : ''}{formatK(Number(t.amount))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomerWallet;
