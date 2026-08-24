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
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const fetchNotifications = () => {
    portalApi.get<PortalNotification[]>('/notifications')
      .then(setNotifications)
      .catch((err) => {
        setError(err.message || 'Failed to load notifications');
        addToast('error', err.message || 'Failed to load notifications');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type) => {
          if (type === 'notification' && !cancelled) fetchNotifications();
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
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748' }}>
      <PortalPageHeader title="Notifications" subtitle={unread > 0 ? `You have ${unread} unread notification${unread > 1 ? 's' : ''}` : 'You\'re all caught up'} icon={Bell} />

      <div style={{ padding: '20px 28px 8px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              fontFamily: F, fontSize: 13, fontWeight: 500,
              color: '#1A202C', background: '#fff',
              border: '1px solid #E9EDF3', borderRadius: 10,
              padding: '8px 32px 8px 12px', outline: 'none', cursor: 'pointer',
              minWidth: 130
            }}
          >
            <option value="all">All Types</option>
            <option value="info">Info</option>
            <option value="alert">Alerts</option>
            <option value="success">Success</option>
            <option value="payment">Payments</option>
            <option value="order">Orders</option>
            <option value="invoice">Invoices</option>
            <option value="message">Messages</option>
          </select>
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
