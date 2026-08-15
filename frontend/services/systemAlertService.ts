import { dbService } from './db';

export const NOTIFICATION_SYNC_KEY = 'nexus_notification_update';
export const NOTIFICATION_UPDATE_EVENT = 'primeerp:notification-update';

type SystemAlertInput = {
  id?: string;
  type?: string;
  title?: string;
  message: string;
  module?: string;
  severity?: string;
  priority?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  date?: string;
  read?: boolean;
  readAt?: string | null;
};

export const publishSystemAlert = async (input: SystemAlertInput) => {
  const alert = {
    id: input.id || `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type || 'INFO',
    title: input.title || 'System Alert',
    message: input.message,
    module: input.module || 'System',
    severity: input.severity || input.priority || 'Medium',
    priority: input.priority || input.severity || 'Medium',
    actionUrl: input.actionUrl,
    metadata: input.metadata,
    date: input.date || new Date().toISOString(),
    read: Boolean(input.read),
    readAt: input.readAt || null
  };

  await dbService.put('alerts', alert);

  if (typeof window !== 'undefined') {
    const payload = {
      id: alert.id,
      date: alert.date
    };
    await dbService.saveSetting(NOTIFICATION_SYNC_KEY, payload);
    window.dispatchEvent(new CustomEvent(NOTIFICATION_UPDATE_EVENT, { detail: payload }));
  }

  return alert;
};
