import React, { useEffect, useState } from 'react';
import { Bell, Info, AlertCircle, CheckCircle, CreditCard, ShoppingCart, FileText, MessageCircle } from 'lucide-react';
import { portalApi, portalLifecycle, PortalNotification } from '../../services/portalApiClient';

import PortalPageHeader from './components/PortalPageHeader';
import PortalButton from './components/PortalButton';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { useToast } from './components/Toast';
import { useNavigate } from 'react-router-dom';
import { F } from './portalStyles';

const typeIcons: Record<string, React.ReactNode> = {
  info: <Info size={18} />,
  alert: <AlertCircle size={18} />,
  success: <CheckCircle size={18} />,
  payment: <CreditCard size={18} />,
  order: <ShoppingCart size={18} />,
  invoice: <FileText size={18} />,
  message: <MessageCircle size={18} />,
};

const CustomerNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const fetchNotifications = (isRealtime = false) => {
    portalApi.get<PortalNotification[]>('/notifications')
      .then((result) => { setNotifications(result && result.length > 0 ? result : []); setRefreshError(null); })
      .catch(() => {
        if (isRealtime) {
          setRefreshError('Unable to refresh — data may be stale');
        } else {
          setError('Failed to load notifications');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNotifications(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type) => {
          if (type === 'notification' && !cancelled) fetchNotifications(true);
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await portalApi.put(`/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err: any) {
      addToast('error', err.message || 'Failed to mark as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await portalApi.put('/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      addToast('success', 'All notifications marked as read');
    } catch (err: any) {
      addToast('error', err.message || 'Failed to mark all as read');
    }
  };

  const handleNotificationClick = (notif: PortalNotification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) {
      const path = notif.link.startsWith('#') ? notif.link.slice(1) : notif.link;
      navigate(path);
    }
  };

  if (loading) return <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}><PortalLoadingSkeleton type="card" count={6} /></div>;
  if (error) return <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>;

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      <div style={{ padding: '20px 28px 8px' }}>
        {refreshError && <div style={{ marginBottom: 8 }}><ErrorBanner message={refreshError} onDismiss={() => setRefreshError(null)} /></div>}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'info', label: 'Info' },
            { key: 'alert', label: 'Alerts' },
            { key: 'success', label: 'Success' },
            { key: 'payment', label: 'Receipt' },
            { key: 'order', label: 'Orders' },
            { key: 'invoice', label: 'Invoices' },
            { key: 'message', label: 'Messages' },
          ].map((chip) => {
            const active = typeFilter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setTypeFilter(chip.key)}
                style={{
                  fontFamily: F, fontSize: 12, fontWeight: 600,
                  padding: '7px 14px', borderRadius: 9, border: active ? '1px solid transparent' : '1px solid #E9EDF3',
                  background: active ? '#008A4C' : '#fff',
                  color: active ? '#fff' : '#718096', cursor: 'pointer',
                  transition: 'all .15s ease', lineHeight: 1.4,
                  boxShadow: active ? '0 2px 8px rgba(0,138,76,0.25)' : 'none',
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '0 28px 28px' }}>
        {notifications.length === 0 ? (
          <EmptyState icon={<Bell size={28} />} title="No notifications" description="You're all caught up! Notifications will appear here." />
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #E9EDF3' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notifications.filter((n) => typeFilter === 'all' || n.type === typeFilter).map((n) => {
              const icon = typeIcons[n.type] || typeIcons.info;

              return (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    width: '100%', padding: '14px 20px', textAlign: 'left',
                    background: '#fff', borderRadius: 12,
                    border: '1px solid #E9EDF3',
                    boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                    cursor: 'pointer', transition: 'all .15s ease',
                    opacity: n.is_read ? 0.7 : 1
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ECFDF5'; e.currentTarget.style.borderColor = '#A7F3D0'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#E9EDF3'; }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 10,
                    background: '#ECFDF5', color: '#0D5047',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: n.is_read ? '#4A5568' : '#1A202C' }}>{n.title}</p>
                      {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#008A4C', flexShrink: 0 }} />}
                    </div>
                    {n.body && <p style={{ fontSize: 11, color: '#4A5568', marginTop: 1, lineHeight: 1.4 }}>{n.body}</p>}
                    <p style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 2 }}>
                      {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </button>
              );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerNotifications;
