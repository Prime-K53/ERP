/**
 * Notification Service for Prime ERP
 * Handles in-app notifications and alerts.
 */

import { dbService } from './db';
import { logger } from './logger';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  userId?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

const NOTIFICATIONS_KEY = 'nexus_notifications';
const MAX_NOTIFICATIONS = 100;

let notifications: Notification[] = [];
const listeners: Set<(notifications: Notification[]) => void> = new Set();
let hydrationPromise: Promise<void> | null = null;

const persistLocalMirror = async () => {
  try {
    await dbService.saveSetting(NOTIFICATIONS_KEY, notifications);
  } catch (error) {
    logger.error('Failed to save notifications to local mirror', error as Error);
  }
};

const loadLocalMirror = async () => {
  try {
    const saved = await dbService.getSetting<Notification[]>(NOTIFICATIONS_KEY);
    if (!saved) return [];

    return Array.isArray(saved)
      ? saved.map((entry) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }))
      : [];
  } catch (error) {
    logger.error('Failed to load notifications', error as Error);
    return [];
  }
};

const notifyListeners = () => {
  listeners.forEach((listener) => listener([...notifications]));
};

const replaceNotifications = async (next: Notification[]) => {
  const previousIds = new Set(notifications.map((entry) => entry.id));
  notifications = next
    .slice()
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, MAX_NOTIFICATIONS);
  const retainedIds = new Set(notifications.map((entry) => entry.id));
  const removedIds = [...previousIds].filter((id) => !retainedIds.has(id));
  await persistLocalMirror();
  notifyListeners();
};

const persistState = async () => {
  await persistLocalMirror();
  notifyListeners();
};

/**
 * Initialize the notification service.
 */
export async function initializeNotifications(): Promise<void> {
  notifications = await loadLocalMirror();

  if (!hydrationPromise) {
    hydrationPromise = loadLocalMirror().finally(() => {
      hydrationPromise = null;
    });
  }
}

/**
 * Subscribe to notification changes.
 */
export function subscribeToNotifications(callback: (notifications: Notification[]) => void): () => void {
  listeners.add(callback);
  callback([...notifications]);
  return () => listeners.delete(callback);
}

/**
 * Create a notification.
 */
export async function notify(options: {
  type?: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}): Promise<Notification> {
  const notification: Notification = {
    id: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    type: options.type || 'info',
    title: options.title,
    message: options.message,
    timestamp: new Date(),
    read: false,
    userId: options.userId,
    entityType: options.entityType,
    entityId: options.entityId,
    actionUrl: options.actionUrl,
    metadata: options.metadata
  };

  await replaceNotifications([notification, ...notifications]);

  logger.info('Notification created', {
    id: notification.id,
    type: notification.type,
    title: notification.title
  });

  return notification;
}

/**
 * Get all notifications.
 */
export function getNotifications(userId?: string, unreadOnly = false): Notification[] {
  let filtered = [...notifications];

  if (userId) {
    filtered = filtered.filter((notification) => notification.userId === userId || !notification.userId);
  }

  if (unreadOnly) {
    filtered = filtered.filter((notification) => !notification.read);
  }

  return filtered;
}

/**
 * Get notification by ID.
 */
export function getNotification(id: string): Notification | undefined {
  return notifications.find((notification) => notification.id === id);
}

/**
 * Mark notification as read.
 */
export async function markAsRead(id: string): Promise<boolean> {
  const notification = notifications.find((entry) => entry.id === id);
  if (!notification) return false;

  notification.read = true;
  await persistState();
  return true;
}

/**
 * Mark all notifications as read.
 */
export async function markAllAsRead(userId?: string): Promise<void> {
  notifications.forEach((notification) => {
    if (!userId || notification.userId === userId) {
      notification.read = true;
    }
  });

  await persistState();
}

/**
 * Delete a notification.
 */
export async function deleteNotification(id: string): Promise<boolean> {
  const index = notifications.findIndex((notification) => notification.id === id);
  if (index === -1) return false;

  notifications.splice(index, 1);
  await persistState();
  return true;
}

/**
 * Clear all notifications.
 */
export async function clearNotifications(userId?: string): Promise<void> {
  const removedIds = notifications
    .filter((notification) => !userId || notification.userId === userId)
    .map((notification) => notification.id);
  notifications = userId
    ? notifications.filter((notification) => notification.userId !== userId)
    : [];
  await persistState();
}

/**
 * Get unread count.
 */
export function getUnreadCount(userId?: string): number {
  return notifications.filter((notification) => !notification.read && (!userId || notification.userId === userId)).length;
}

void initializeNotifications();

export const notificationService = {
  notify,
  getNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  getUnreadCount,
  subscribeToNotifications
};
