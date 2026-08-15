import { ExaminationBatchNotification, NotificationAuditLog, NotificationType, NotificationPriority } from '../types';
import { logger } from '@/services/logger';
import { dbService } from './db';
import { examinationDb } from './examinationDb';

const loggedLocalNotificationStores = new Set<string>();

const getLocalNotificationsForUser = async (
  userId: string,
  limit: number
): Promise<ExaminationBatchNotification[]> => {
  let localNotifications: ExaminationBatchNotification[];
  try {
    localNotifications = await examinationDb.examinationBatchNotifications.toArray() as ExaminationBatchNotification[];
  } catch {
    localNotifications = await dbService.getAll<ExaminationBatchNotification>('examinationBatchNotifications');
  }
  if (!loggedLocalNotificationStores.has(userId)) {
    loggedLocalNotificationStores.add(userId);
    logger.debug('[NotificationService] Using cached notifications from local storage');
  }
  return (localNotifications || [])
    .filter(n => n.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
};

export const examinationNotificationService = {
  /**
   * Create a notification for a batch event
   */
  async createBatchNotification(
    batchId: string,
    notificationType: NotificationType,
    batchDetails: Record<string, unknown>,
    userId?: string
  ): Promise<ExaminationBatchNotification> {
    const user = userId || this.getCurrentUserId();
    if (!user) {
      console.warn('[ExaminationNotification] No user ID available — skipping notification');
      return this.createAnonymousNotification(batchId, notificationType, batchDetails);
    }

    // Generate notification content based on type
    const { title, message, priority } = this.generateNotificationContent(notificationType, batchDetails);

    const notification: Partial<ExaminationBatchNotification> = {
      id: this.generateId(),
      batch_id: batchId,
      user_id: user,
      notification_type: notificationType,
      title,
      message,
      priority,
      batch_details: {
        batchId: batchDetails.id || batchId,
        batchName: batchDetails.name || 'Examination Batch',
        examinationDate: batchDetails.exam_date || batchDetails.created_at || new Date().toISOString(),
        numberOfStudents: batchDetails.expected_candidature || batchDetails.total_students || 0,
        schoolName: batchDetails.school_name,
        academicYear: batchDetails.academic_year,
        term: batchDetails.term,
        examType: batchDetails.exam_type,
        totalAmount: batchDetails.total_amount,
        status: batchDetails.status
      },
      is_read: false,
      read_at: null,
      delivered_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      expires_at: this.calculateExpiry(notificationType)
    };

    try {
      await examinationDb.examinationBatchNotifications.put(notification as ExaminationBatchNotification);
    } catch {
      await dbService.put('examinationBatchNotifications', notification as ExaminationBatchNotification);
    }
    await this.createLocalAuditLog(notification.id || this.generateId(), user, 'CREATED', {
      notificationType,
      batchId,
      source: 'batch_calculation'
    });
    return notification as ExaminationBatchNotification;
  },

  /**
   * Fetch notifications for current user
   */
  async getUserNotifications(userId?: string, limit: number = 50): Promise<ExaminationBatchNotification[]> {
    const user = userId || this.getCurrentUserId();
    if (!user) {
      return [];
    }

    try {
      return await getLocalNotificationsForUser(user, limit);
    } catch {
      return [];
    }
  },

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    const user = userId || this.getCurrentUserId();
    if (!user) {
      throw new Error('No user ID available');
    }

    try {
      let notifications: ExaminationBatchNotification[];
      try {
        notifications = await examinationDb.examinationBatchNotifications.toArray() as ExaminationBatchNotification[];
      } catch {
        notifications = await dbService.getAll<ExaminationBatchNotification>('examinationBatchNotifications');
      }
      const notification = notifications.find(n => n.id === notificationId || n.id === `local-${notificationId}`);
      if (notification) {
        notification.is_read = true;
        notification.read_at = new Date().toISOString();
        try {
          await examinationDb.examinationBatchNotifications.put(notification as ExaminationBatchNotification);
        } catch {
          await dbService.put('examinationBatchNotifications', notification as ExaminationBatchNotification);
        }
      }

      await this.createLocalAuditLog(notificationId, user, 'READ', {});
    } catch (error) {
      logger.error('[NotificationService] Failed to update local notification:', error);
      throw error;
    }
  },

  /**
   * Dismiss/delete notification
   */
  async dismissNotification(notificationId: string, userId?: string): Promise<void> {
    const user = userId || this.getCurrentUserId();
    if (!user) {
      throw new Error('No user ID available');
    }

    try {
      try {
        await examinationDb.examinationBatchNotifications.delete(notificationId);
      } catch {
        try {
          await examinationDb.examinationBatchNotifications.delete(`local-${notificationId}`);
        } catch {
          try {
            await dbService.delete('examinationBatchNotifications', notificationId);
          } catch {
            await dbService.delete('examinationBatchNotifications', `local-${notificationId}`);
          }
        }
      }

      await this.createLocalAuditLog(notificationId, user, 'DISMISSED', {});
    } catch (error) {
      logger.error('[NotificationService] Failed to dismiss notification:', error);
      throw error;
    }
  },

  /**
   * Check for duplicate notifications for a batch
   */
  async hasExistingNotification(batchId: string, notificationType: NotificationType, userId?: string): Promise<boolean> {
    const user = userId || this.getCurrentUserId();
    if (!user) return false;

    try {
      const notifications = await this.getUserNotifications(user, 100);
      return notifications.some(
        n => n.batch_id === batchId &&
        n.notification_type === notificationType &&
        !n.is_read &&
        (!n.expires_at || new Date(n.expires_at) > new Date())
      );
    } catch (error) {
      logger.error('[NotificationService] Error checking for duplicate notification:', error);
      return false;
    }
  },

  /**
   * Create audit log entry
   */
  async createAuditLog(
    notificationId: string,
    userId: string,
    action: 'CREATED' | 'DELIVERED' | 'READ' | 'DISMISSED' | 'EXPIRED' | 'FAILED',
    details: Record<string, unknown>
  ): Promise<void> {
    await this.createLocalAuditLog(notificationId, userId, action, details);
  },

  /**
   * Create local audit log (for offline mode)
   */
  async createLocalAuditLog(
    notificationId: string,
    userId: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const auditLog: Partial<NotificationAuditLog> = {
        id: `local-${this.generateId()}`,
        notification_id: notificationId,
        user_id: userId,
        action: action as NotificationAuditLog['action'],
        details_json: details,
        user_agent: navigator.userAgent,
        created_at: new Date().toISOString()
      };

      try {
        await examinationDb.notificationAuditLogs.put(auditLog as NotificationAuditLog);
      } catch {
        await dbService.put('notificationAuditLogs', auditLog as NotificationAuditLog);
      }
    } catch (error) {
      console.warn('[NotificationService] Failed to create local audit log:', error);
    }
  },

  /**
   * Generate notification content based on type
   */
  generateNotificationContent(
    type: NotificationType,
    batch: Record<string, unknown>
  ): { title: string; message: string; priority: NotificationPriority } {
    const schoolName = batch.school_name || batch.name || 'Unknown School';
    const candidateCount = batch.expected_candidature || batch.total_students || 0;
    const examDate = batch.exam_date || batch.created_at || new Date().toISOString().split('T')[0];

    switch (type) {
      case 'BATCH_CREATED':
        return {
          title: `Examination Batch Created: ${schoolName}`,
          message: `A new examination batch has been created for ${candidateCount} students. Examination date: ${examDate}.`,
          priority: 'Medium'
        };
      case 'BATCH_CALCULATED':
        return {
          title: `Examination Batch Ready: ${schoolName}`,
          message: `A new examination batch has been calculated for ${candidateCount} students. Examination date: ${examDate}. Total amount: ${batch.total_amount || 'N/A'}.`,
          priority: candidateCount > 500 ? 'High' : 'Medium'
        };

      case 'BATCH_APPROVED':
        return {
          title: `Batch Approved: ${schoolName}`,
          message: `Examination batch has been approved and is ready for invoicing. Students: ${candidateCount}.`,
          priority: 'Medium'
        };

      case 'BATCH_INVOICED':
        return {
          title: `Invoice Generated: ${schoolName}`,
          message: `Invoice has been automatically generated for the examination batch. Amount: ${batch.total_amount || 'N/A'}.`,
          priority: 'High'
        };

      case 'DEADLINE_REMINDER':
        return {
          title: `Deadline Approaching: ${schoolName}`,
          message: `Examination deadline is approaching. ${candidateCount} students affected.`,
          priority: 'Urgent'
        };

      default:
        return {
          title: 'Examination Notification',
          message: `Notification regarding examination batch for ${schoolName}.`,
          priority: 'Medium'
        };
    }
  },

  /**
   * Calculate expiry date based on notification type
   */
  calculateExpiry(type: NotificationType): string | undefined {
    const now = new Date();
    let daysToAdd: number;

    switch (type) {
      case 'BATCH_CREATED':
        daysToAdd = 7;
        break;
      case 'BATCH_CALCULATED':
        daysToAdd = 7; // Keep for 7 days
        break;
      case 'BATCH_APPROVED':
        daysToAdd = 14;
        break;
      case 'BATCH_INVOICED':
        daysToAdd = 30;
        break;
      case 'DEADLINE_REMINDER':
        daysToAdd = 3; // Short expiry for urgent reminders
        break;
      default:
        daysToAdd = 7;
    }

    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + daysToAdd);
    return expiry.toISOString();
  },

  /**
   * Get current user ID from session
   */
  getCurrentUserId(): string | null {
    const userJson = sessionStorage.getItem('nexus_user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        return user.id || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  },

  /**
   * Generate unique ID
   */
  generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Create notification with system user fallback when no user ID available
   */
  async createAnonymousNotification(
    batchId: string,
    notificationType: NotificationType,
    batchDetails: Record<string, unknown>
  ): Promise<ExaminationBatchNotification> {
    const { title, message, priority } = this.generateNotificationContent(notificationType, batchDetails);
    const notification: Partial<ExaminationBatchNotification> = {
      id: this.generateId(),
      batch_id: batchId,
      user_id: 'system',
      notification_type: notificationType,
      title,
      message,
      priority,
      batch_details: {
        batchId: batchDetails.id || batchId,
        batchName: batchDetails.name || 'Examination Batch',
        examinationDate: batchDetails.exam_date || batchDetails.created_at || new Date().toISOString(),
        numberOfStudents: batchDetails.expected_candidature || batchDetails.total_students || 0,
        schoolName: batchDetails.school_name,
        academicYear: batchDetails.academic_year,
        term: batchDetails.term,
        examType: batchDetails.exam_type,
        totalAmount: batchDetails.total_amount,
        status: batchDetails.status
      },
      is_read: false,
      read_at: null,
      delivered_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      expires_at: this.calculateExpiry(notificationType)
    };
    try {
      await examinationDb.examinationBatchNotifications.put(notification as ExaminationBatchNotification);
    } catch {
      await dbService.put('examinationBatchNotifications', notification as ExaminationBatchNotification);
    }
    return notification as ExaminationBatchNotification;
  }
};

export default examinationNotificationService;
