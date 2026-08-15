import React, { useEffect, useState } from 'react';
import { Gift, Star, Wallet } from 'lucide-react';
import { portalLifecycle } from '../../services/portalApiClient';

import PortalPageHeader from './components/PortalPageHeader';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { formatK } from './constants';
import { F } from './portalStyles';

interface PointsHistory {
  date: string;
  description: string;
  points: number;
  balance: number;
}

interface LoyaltyData {
  points: number;
  cashback: number;
  tier: string;
  pointsHistory: PointsHistory[];
}

const CustomerLoyalty: React.FC = () => {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    portalLifecycle.loyalty.get()
      .then((result) => { setData(result && result.points ? result : null); setRefreshError(null); })
      .catch(() => { if (!data) setError('Failed to load loyalty data'); else setRefreshError('Unable to refresh — data may be stale'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && (payload?.docType === 'invoice' || payload?.event === 'payment_allocated') && !cancelled) {
            portalLifecycle.loyalty.get()
              .then((result) => { setData(result && result.points ? result : data); setRefreshError(null); })
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

  if (loading) return <div style={{ padding: 16, maxWidth: 560, marginInline: 'auto' }}><PortalLoadingSkeleton type="card" count={3} /></div>;

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      <div style={{ padding: '20px 28px 8px' }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {refreshError && <ErrorBanner message={refreshError} onDismiss={() => setRefreshError(null)} />}

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 10, border: '1px solid #E9EDF3' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#146b60' }}>
                  <Gift size={18} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06 }}>Points Balance</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0b3e39', fontFamily: "'JetBrains Mono', monospace" }}>
                {data.points?.toLocaleString() || 0}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 10, border: '1px solid #E9EDF3' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#146b60' }}>
                  <Wallet size={18} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06 }}>Cashback Available</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0b3e39', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatK(data.cashback || 0)}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 10, border: '1px solid #E9EDF3' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#146b60' }}>
                  <Star size={18} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.06 }}>Membership Tier</span>
              </div>
              <div style={{
                display: 'inline-block', padding: '6px 14px', borderRadius: 20,
                fontSize: 13, fontWeight: 700, border: '1.4px solid #a6d9d3', background: '#eef7f6', color: '#0f544c'
              }}>
                {data.tier || 'Bronze'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '0 28px 28px' }}>
        {!data ? null : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E9EDF3', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A202C', textTransform: 'uppercase', letterSpacing: 0.06 }}>
                Points History
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.pointsHistory || []).length === 0 ? (
                <p style={{ textAlign: 'center', color: '#8A94A6', padding: '24px 0' }}>No points history yet</p>
              ) : (
                (data.pointsHistory || []).map((h, i) => (
                  <div key={`${h.date}-${h.description}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px', borderTop: '1px solid #F3F4F6', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0b3e39', margin: 0 }}>{h.description}</p>
                      <p style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 2 }}>{new Date(h.date).toLocaleDateString()}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: Number(h.points) >= 0 ? '#146b60' : '#b5493f' }}>
                        {Number(h.points) >= 0 ? '+' : ''}{h.points} pts
                      </span>
                      <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: '#0b3e39' }}>
                        Balance: {h.balance?.toLocaleString() || 0}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerLoyalty;
