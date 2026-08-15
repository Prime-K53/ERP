import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { logger } from '@/services/logger';
import { ExaminationBatchNotification } from '../types';
import { examinationNotificationService } from '../services/examinationNotificationService';
import { dbService } from '../services/db';
import { NOTIFICATION_SYNC_KEY, NOTIFICATION_UPDATE_EVENT, publishSystemAlert } from '../services/systemAlertService';
import { subscribeAdminEvents } from '../services/adminPortalClient';

interface NotificationContextType {
  // State
  notifications: UnifiedNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

  // Actions
  refreshNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissNotification: (notificationId: string) => Promise<void>;
  clearAllRead: () => Promise<void>;
  getNotificationById: (id: string) => UnifiedNotification | undefined;
  notify: (options: NotifyOptions) => Promise<void>;
}

export interface UnifiedNotification {
  id: string;
  type: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
  module?: string;
  batch_id?: string;
}

export interface NotifyOptions {
  type?: 'info' | 'success' | 'warning' | 'error' | 'urgent';
  title: string;
  message: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  module?: string;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
  pollInterval?: number; // in milliseconds, default 30 seconds
  maxNotifications?: number; // max number to fetch, default 50
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
  pollInterval = 30000,
  maxNotifications = 50
}) => {
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const userIdRef = useRef<string | null>(null);

  const fetchNotifications = useCallback(async (isInitialLoad: boolean = false) => {
    const now = Date.now();
    if (!isInitialLoad && now - lastFetchTimeRef.current < 5000) return;

    setLoading(true);
    try {
      const user = examinationNotificationService.getCurrentUserId();
      userIdRef.current = user;

      // Parallel fetch from both sources
      const [examNotifs, systemAlerts] = await Promise.all([
        user
          ? examinationNotificationService.getUserNotifications(user, maxNotifications)
          : Promise.resolve([]),
        dbService.getAll<any>('alerts')
      ]);

      // Unified mapping
      const mappedExam: UnifiedNotification[] = examNotifs.map(n => ({
        id: n.id,
        type: n.notification_type || 'EXAM',
        priority: (n.priority || 'Medium') as UnifiedNotification['priority'],
        title: n.title,
        message: n.message,
        is_read: n.is_read,
        created_at: n.created_at,
        read_at: n.read_at,
        module: 'Examination',
        batch_id: n.batch_id,
        actionUrl: `/examination/batches/${n.batch_id}`
      }));

      const mappedSystem: UnifiedNotification[] = systemAlerts.map(a => ({
        id: a.id,
        type: a.type?.toUpperCase() || 'SYSTEM',
        priority: (() => {
          const priorityMap: Record<string, 'High' | 'Medium' | 'Low'> = {
            ERROR: 'High',
            WARNING: 'Medium',
            INFO: 'Low'
          };
          const typeKey = (a.priority || a.severity || a.type || 'info').toUpperCase();
          return priorityMap[typeKey] || 'Low';
        })(),
        title: a.title || 'System Alert',
        message: a.message,
        is_read: !!a.read,
        created_at: a.date || a._updatedAt || new Date().toISOString(),
        read_at: a.readAt,
        module: a.module || 'System',
        actionUrl: a.actionUrl || '/audit'
      }));

      const combined = [...mappedExam, ...mappedSystem]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, maxNotifications);

      setNotifications(combined);
      lastFetchTimeRef.current = now;
    } catch (err) {
      logger.error('[NotificationContext] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [maxNotifications]);

  const refreshNotifications = useCallback(async () => {
    await fetchNotifications(false);
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const notification = notifications.find(n => n.id === notificationId);
      if (!notification) return;

      if (notification.module === 'Examination') {
        await examinationNotificationService.markAsRead(notificationId);
      } else {
        const storedAlert = await dbService.get<any>('alerts', notificationId);
        if (storedAlert) {
          await dbService.put('alerts', {
            ...storedAlert,
            read: true,
            readAt: new Date().toISOString()
          });
        }
      }

      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, is_read: true, read_at: new Date().toISOString() }
            : n
        )
      );
    } catch (err) {
      logger.error('[NotificationContext] Error marking as read:', err);
    }
  }, [notifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      const unreadNodes = notifications.filter(n => !n.is_read);
      await Promise.all(unreadNodes.map(n => markAsRead(n.id)));
    } catch (err) {
      logger.error('[NotificationContext] Error marking all as read:', err);
    }
  }, [notifications, markAsRead]);

  const dismissNotification = useCallback(async (notificationId: string) => {
    try {
      const notif = notifications.find(n => n.id === notificationId);
      if (!notif) return;

      if (notif.module === 'Examination') {
        await examinationNotificationService.dismissNotification(notificationId);
      } else {
        await dbService.delete('alerts', notificationId);
      }

      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      logger.error('[NotificationContext] Error dismissing:', err);
    }
  }, [notifications]);

  const notify = useCallback(async (options: NotifyOptions) => {
    await publishSystemAlert({
      type: options.type?.toUpperCase() || 'INFO',
      title: options.title,
      message: options.message,
      module: options.module || 'System',
      priority: options.priority
    });
    await fetchNotifications(true);
  }, [fetchNotifications]);

  const clearAllRead = useCallback(async () => {
    try {
      const readNotifications = notifications.filter(n => n.is_read);
      await Promise.all(
        readNotifications.map(n => dismissNotification(n.id))
      );
      setNotifications(prev => prev.filter(n => !n.is_read));
    } catch (err) {
      logger.error('[NotificationContext] Error clearing read notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear read notifications');
      throw err;
    }
  }, [notifications, dismissNotification]);

  const getNotificationById = useCallback((id: string) => {
    return notifications.find(n => n.id === id);
  }, [notifications]);

  // Listen for admin portal SSE system_alert events (works even when
  // QuotationRequests page is not active) and surface them as system alerts.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      try {
        const unsub = await subscribeAdminEvents({
          onSystemAlert: (n) => {
            if (cancelled) return;
            const title = n.title || 'Customer Request Update';
            const message = n.body || (n.customer_name ? `${n.customer_name} — ${n.title}` : n.title);
            publishSystemAlert({
              type: 'INFO',
              title,
              message,
              module: 'Sales',
              priority: 'Medium',
              actionUrl: n.link && n.link.startsWith('#') ? n.link.slice(1) : (n.link || '/sales-flow/requests'),
            }).catch(() => {});
          },
          onError: () => { /* silent — QuotationRequests handles its own reload */ },
        });
        if (!cancelled) unsubscribe = unsub;
      } catch {
        // Ticket issuance failed — admin page will fall back to polling.
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Listen for admin portal notifications (relayed from QuotationRequests SSE handler)
  // and surface them as system alerts in the unified notification centre.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const title = detail.title || 'Customer Request Update';
      const message = detail.body || detail.customer_name
        ? `${detail.customer_name || 'A customer'} — ${detail.title}`
        : detail.title;
      publishSystemAlert({
        type: 'INFO',
        title,
        message,
        module: 'Sales',
        priority: 'Medium',
        actionUrl: detail.link && detail.link.startsWith('#')
          ? detail.link.slice(1)
          : (detail.link || '/sales-flow/requests'),
      }).catch(() => {});
    };
    window.addEventListener('primeerp:admin-notification', handler as EventListener);
    return () => window.removeEventListener('primeerp:admin-notification', handler as EventListener);
  }, []);

  // Initial load
  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  // Set up polling for real-time updates
  useEffect(() => {
    if (pollInterval > 0) {
      pollIntervalRef.current = setInterval(() => {
        fetchNotifications(false);
      }, pollInterval);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pollInterval, fetchNotifications]);

  // Listen for storage events (for cross-tab sync)
  useEffect(() => {
    const handleNotificationUpdate = () => {
      fetchNotifications(true);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === NOTIFICATION_SYNC_KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (!data.userId || data.userId === userIdRef.current) {
            fetchNotifications(true);
          }
        } catch (err) {
          // Ignore invalid data
        }
      }
    };

    window.addEventListener(NOTIFICATION_UPDATE_EVENT, handleNotificationUpdate as EventListener);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener(NOTIFICATION_UPDATE_EVENT, handleNotificationUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [fetchNotifications]);

  const value: NotificationContextType = {
    notifications,
    unreadCount: notifications.filter(n => !n.is_read).length,
    loading,
    error,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearAllRead,
    getNotificationById,
    notify
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationContext;
