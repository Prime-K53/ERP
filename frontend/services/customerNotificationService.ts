import { dbService } from './db';
import { logger } from '@/services/logger';
import { CompanyConfig } from '../types';
import { aiService } from './ai/aiService';
import { durableSyncQueue } from './durableSyncQueue';

export type NotificationActivityType =
  | 'QUOTATION'
  | 'SALES_ORDER'
  | 'INVOICE'
  | 'EXAMINATION_INVOICE'
  | 'EXAM_BATCH'
  | 'PAYMENT'
  | 'RECEIPT';

export interface NotificationLog {
  id: string;
  type: NotificationActivityType;
  entityId: string;
  customerName: string;
  phoneNumber: string;
  message: string;
  timestamp: string;
  status: 'sent' | 'failed' | 'cancelled' | 'pending';
  deliveryMode?: 'offline-draft' | 'external' | 'queued' | 'ai';
  error?: string;
}

const getCompanyConfig = (): CompanyConfig | null => {
  const saved = localStorage.getItem('nexus_company_config');
  return saved ? JSON.parse(saved) : null;
};

const DEFAULT_TEMPLATES: Record<NotificationActivityType, string> = {
  QUOTATION: "Hi {customerName}! Great news! Your quotation #{id} for {amount} is ready at {companyName}. Review it today and let us know if you have any questions.",
  SALES_ORDER: "Hi {customerName}! Your sales order #{id} for {amount} has been confirmed at {companyName}. Our team is preparing your items. We'll notify you as soon as they're ready.",
  INVOICE: "Hi {customerName}! Your invoice #{id} for {amount} from {companyName} is now due on {dueDate}. Pay on time to continue enjoying our services.",
  EXAMINATION_INVOICE: "Hi {customerName}! Your service invoice #{id} for {amount} from {companyName} is now due on {dueDate}. Complete your payment today.",
  EXAM_BATCH: "Hi {customerName}! Your examination batch #{id} has been approved at {companyName} with {count} candidates. We're committed to making this process smooth for you.",
  PAYMENT: "Hi {customerName}! Thank you! We've received your payment of {amount} for {id} at {companyName}. We appreciate your continued trust.",
  RECEIPT: "Hi {customerName}! Your receipt #{id} for {amount} has been issued by {companyName}. Thank you for your continued support!"
};

const ACTIVITY_LABELS: Record<NotificationActivityType, string> = {
  QUOTATION: 'quotation',
  SALES_ORDER: 'sales order',
  INVOICE: 'invoice',
  EXAMINATION_INVOICE: 'service invoice',
  EXAM_BATCH: 'examination batch',
  PAYMENT: 'payment receipt',
  RECEIPT: 'payment receipt'
};

const generateMessageFromTemplate = (
  type: NotificationActivityType,
  data: any,
  config: CompanyConfig
): string => {
  const template = DEFAULT_TEMPLATES[type] || "Hi {customerName}! Thank you for choosing {companyName}!";
  return replacePlaceholders(template, data, config);
};

const replacePlaceholders = (template: string, data: any, config: CompanyConfig): string => {
  return template
    .replace(/{customerName}/g, data.customerName || 'Valued Customer')
    .replace(/{id}/g, data.id || '')
    .replace(/{amount}/g, data.amount || '')
    .replace(/{dueDate}/g, data.dueDate || '')
    .replace(/{count}/g, data.count || '')
    .replace(/{companyName}/g, config.companyName);
};

const sanitizePhoneNumber = (phoneNumber: string): string => {
  const digitsOnly = String(phoneNumber || '').replace(/[^\d]/g, '');
  return digitsOnly || String(phoneNumber || '').replace(/\s+/g, '');
};

const checkRateLimit = async (type: NotificationActivityType, entityId: string): Promise<boolean> => {
  try {
    const logs = await dbService.getAll<NotificationLog>('customerNotificationLogs');
    const recent = logs.find(l => 
      l.type === type && 
      l.entityId === entityId && 
      (Date.now() - new Date(l.timestamp).getTime() < 5 * 60 * 1000)
    );
    return !recent;
  } catch {
    return true;
  }
};

const isOnline = () => typeof navigator !== 'undefined' && navigator.onLine;

const getEnabledWebhooks = (config: CompanyConfig) => {
  const webhooks = config.integrationSettings?.webhooks || [];
  return webhooks.filter(w => w.enabled && w.url && w.url !== 'https://');
};

const sendViaWebhook = async (webhookUrl: string, type: NotificationActivityType, payload: any) => {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: `notification.${(type || '').toLowerCase()}`,
      timestamp: new Date().toISOString(),
      data: payload
    })
  });
  if (!response.ok) {
    throw new Error(`Webhook responded with ${response.status}`);
  }
};

const generateAIMessage = async (
  type: NotificationActivityType,
  data: any,
  config: CompanyConfig
): Promise<string | null> => {
  try {
    const prompt = `Generate a brief professional SMS notification for a customer. Type: ${ACTIVITY_LABELS[type] || type}. Customer: ${data.customerName}. Details: ${data.id}, ${data.amount || ''}. Company: ${config.companyName}. Keep it under 160 characters. No emojis.`;
    const result = await aiService.generateAIResponse(prompt, 'You are a customer notification assistant. Generate concise SMS messages.');
    if (result && result.length > 5) return result;
    return null;
  } catch {
    return null;
  }
};

const saveLog = async (entry: Omit<NotificationLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => {
  await dbService.put('customerNotificationLogs', {
    id: entry.id || `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    ...entry
  });
};

export const customerNotificationService = {
  async triggerNotification(
    type: NotificationActivityType,
    data: {
      id: string;
      customerName: string;
      phoneNumber?: string;
      amount?: string;
      dueDate?: string;
      count?: number;
      [key: string]: any;
    }
  ) {
    const config = getCompanyConfig();
    if (!config?.notificationSettings?.customerActivityNotifications) {
      logger.info(`[Notification] System disabled for ${type}`);
      return;
    }

    if (!data.phoneNumber) {
      console.warn(`[Notification] No phone number for ${data.customerName}`);
      return;
    }

    const canProceed = await checkRateLimit(type, data.id);
    if (!canProceed) {
      logger.info(`[Notification] Rate limit exceeded for ${type} ${data.id}`);
      return;
    }

    const online = isOnline();
    let message = generateMessageFromTemplate(type, data, config);

    if (online) {
      const aiMessage = await generateAIMessage(type, data, config);
      if (aiMessage) message = aiMessage;

      const webhooks = getEnabledWebhooks(config);
      const payload = {
        type,
        customerName: data.customerName,
        phoneNumber: sanitizePhoneNumber(data.phoneNumber || ''),
        message,
        id: data.id,
        amount: data.amount,
        dueDate: data.dueDate,
        count: data.count
      };

      if (webhooks.length > 0) {
        let sentAny = false;
        for (const webhook of webhooks) {
          try {
            await sendViaWebhook(webhook.url, type, payload);
            sentAny = true;
          } catch (err) {
            console.warn(`[Notification] Webhook failed for ${webhook.url}:`, err);
          }
        }
        if (sentAny) {
          await saveLog({ type, entityId: data.id, customerName: data.customerName, phoneNumber: data.phoneNumber || '', message, status: 'sent', deliveryMode: 'external' });
          logger.info(`[Notification] Sent via webhook for ${type}`);
          return;
        }
      }

      try {
        await saveLog({ type, entityId: data.id, customerName: data.customerName, phoneNumber: data.phoneNumber || '', message, status: 'sent', deliveryMode: 'ai' });
        logger.info(`[Notification] AI-processed for ${type}`);
      } catch (error) {
        logger.error(`[Notification] Failed to process ${type}:`, error);
        await saveLog({ type, entityId: data.id, customerName: data.customerName, phoneNumber: data.phoneNumber || '', message, status: 'failed', error: String(error) });
      }
    } else {
      try {
        await durableSyncQueue.enqueue({
          table: 'customerNotificationLogs',
          recordId: data.id,
          operation: 'insert',
          payload: { type, data, message, phoneNumber: sanitizePhoneNumber(data.phoneNumber || '') },
          userId: null,
        });
        await saveLog({ type, entityId: data.id, customerName: data.customerName, phoneNumber: data.phoneNumber || '', message, status: 'pending', deliveryMode: 'queued' });
        logger.info(`[Notification] Queued for offline delivery: ${type}`);
      } catch (error) {
        logger.error(`[Notification] Failed to queue offline ${type}:`, error);
        await saveLog({ type, entityId: data.id, customerName: data.customerName, phoneNumber: data.phoneNumber || '', message, status: 'failed', error: String(error), deliveryMode: 'queued' });
      }
    }
  },

  async processPendingNotifications() {
    if (!isOnline()) return { processed: 0, failed: 0 };

    const config = getCompanyConfig();
    if (!config?.notificationSettings?.customerActivityNotifications) return { processed: 0, failed: 0 };

    let logs: NotificationLog[] = [];
    try {
      logs = await dbService.getAll<NotificationLog>('customerNotificationLogs');
    } catch {
      return { processed: 0, failed: 0 };
    }

    const pending = logs.filter(l => l.status === 'pending');
    if (pending.length === 0) return { processed: 0, failed: 0 };

    const webhooks = getEnabledWebhooks(config);
    let processed = 0;
    let failed = 0;

    for (const log of pending) {
      const canProceed = await checkRateLimit(log.type, log.entityId);
      if (!canProceed) {
        await saveLog({ ...log, status: 'cancelled', deliveryMode: log.deliveryMode, error: 'Rate limit exceeded on retry' });
        processed++;
        continue;
      }

      const payload = {
        type: log.type,
        customerName: log.customerName,
        phoneNumber: log.phoneNumber,
        message: log.message,
        id: log.entityId
      };

      if (webhooks.length > 0) {
        let sentAny = false;
        for (const webhook of webhooks) {
          try {
            await sendViaWebhook(webhook.url, log.type, payload);
            sentAny = true;
          } catch (e) { logger.error("Operation failed", e as Error); }
        }
        if (sentAny) {
          const existing = await dbService.get<NotificationLog>('customerNotificationLogs', log.id);
          if (existing) {
            await saveLog({ ...existing, status: 'sent', deliveryMode: 'external' });
          }
          processed++;
          continue;
        }
      }

      failed++;
      const existing = await dbService.get<NotificationLog>('customerNotificationLogs', log.id);
      if (existing) {
        await saveLog({ ...existing, status: 'failed', deliveryMode: 'queued', error: 'No webhook available' });
      }
    }

    return { processed, failed };
  },

  async getLogs(): Promise<NotificationLog[]> {
    return await dbService.getAll<NotificationLog>('customerNotificationLogs');
  }
};
