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

/**
 * Mark unread bell alerts for a destination as read (e.g. opening the
 * Quotation Requests hub clears its dashboard/topbar notification dot).
 * Broadcasts the update event so every open surface refreshes.
 */
export const markAlertsReadForActionUrl = async (actionUrlPrefix: string): Promise<number> => {
  try {
    const alerts = await dbService.getAll<any>('alerts');
    const targets = (alerts || []).filter(
      (a: any) => a && !a.read && typeof a.actionUrl === 'string' && a.actionUrl.startsWith(actionUrlPrefix)
    );
    for (const a of targets) {
      await dbService.put('alerts', { ...a, read: true, readAt: new Date().toISOString() });
    }
    if (targets.length > 0 && typeof window !== 'undefined') {
      const detail = { id: `hub-read-${Date.now()}`, date: new Date().toISOString() };
      await dbService.saveSetting(NOTIFICATION_SYNC_KEY, detail);
      window.dispatchEvent(new CustomEvent(NOTIFICATION_UPDATE_EVENT, { detail }));
    }
    return targets.length;
  } catch {
    return 0;
  }
};
