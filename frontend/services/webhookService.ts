import { dbService } from './db';
import { logger } from '@/services/logger';
import { OFFLINE_MODE } from '../constants';
import { shouldBlockRemoteNetwork } from '../utils/networkPolicy';

export type WebhookEvent = 
  | 'order.created'
  | 'order.updated'
  | 'order.completed'
  | 'payment.received'
  | 'inventory.low'
  | 'customer.created'
  | 'invoice.created'
  | 'invoice.overdue';

export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  secret?: string;
  retryOnFailure: boolean;
  maxRetries: number;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
}

const WEBHOOK_CONFIG_STORE = 'webhook_configs';
const WEBHOOK_LOG_STORE = 'webhook_logs';

export interface WebhookLog {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: any;
  responseStatus?: number;
  responseBody?: string;
  success: boolean;
  timestamp: string;
  error?: string;
}

class WebhookService {
  private createLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  async getConfigs(): Promise<WebhookConfig[]> {
    try {
      const configs = await dbService.getAll<WebhookConfig>(WEBHOOK_CONFIG_STORE);
      return configs || [];
    } catch (error) {
      logger.error('Failed to fetch webhook configs:', error);
      return [];
    }
  }

  async saveConfig(config: WebhookConfig): Promise<void> {
    await dbService.put(WEBHOOK_CONFIG_STORE, config);
  }

  async deleteConfig(id: string): Promise<void> {
    await dbService.delete(WEBHOOK_CONFIG_STORE, id);
  }

  async trigger(event: WebhookEvent, data: any): Promise<void> {
    const configs = await this.getConfigs();
    const activeWebhooks = configs.filter(c => c.enabled && c.events.includes(event));

    for (const webhook of activeWebhooks) {
      await this.sendWebhook(webhook, event, data);
    }
  }

  private async sendWebhook(
    webhook: WebhookConfig,
    event: WebhookEvent,
    data: any
  ): Promise<void> {
    if (OFFLINE_MODE && shouldBlockRemoteNetwork(webhook.url)) {
      await this.logWebhook({
        id: this.createLogId(),
        webhookId: webhook.id,
        event,
        payload: data,
        responseStatus: 200,
        responseBody: 'Offline simulation only',
        success: true,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Timestamp': payload.timestamp
    };

    if (webhook.secret) {
      const signature = await this.generateSignature(payload, webhook.secret);
      headers['X-Webhook-Signature'] = signature;
    }

    let lastError: string | undefined;
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= (webhook.maxRetries || 1); attempt++) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        lastStatus = response.status;
        
        if (response.ok) {
          await this.logWebhook({
            id: this.createLogId(),
            webhookId: webhook.id,
            event,
            payload: data,
            responseStatus: response.status,
            success: true,
            timestamp: new Date().toISOString()
          });
          return;
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Network error';
      }

      if (attempt < (webhook.maxRetries || 1)) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    await this.logWebhook({
      id: this.createLogId(),
      webhookId: webhook.id,
      event,
      payload: data,
      responseStatus: lastStatus,
      success: false,
      timestamp: new Date().toISOString(),
      error: lastError
    });
  }

  private async generateSignature(payload: WebhookPayload, secret: string): Promise<string> {
    const data = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(data);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async logWebhook(log: WebhookLog): Promise<void> {
    try {
      await dbService.put(WEBHOOK_LOG_STORE, log);
    } catch (error) {
      logger.error('Failed to log webhook:', error);
    }
  }

  async getLogs(webhookId?: string, limit = 50): Promise<WebhookLog[]> {
    try {
      const logs = await dbService.getAll<WebhookLog>(WEBHOOK_LOG_STORE);
      let filtered = logs || [];
      
      if (webhookId) {
        filtered = filtered.filter(l => l.webhookId === webhookId);
      }
      
      return filtered
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to fetch webhook logs:', error);
      return [];
    }
  }

  async testWebhook(config: WebhookConfig): Promise<{ success: boolean; message: string }> {
    if (OFFLINE_MODE && shouldBlockRemoteNetwork(config.url)) {
      return { success: true, message: 'Offline desktop mode simulated the webhook locally without network access.' };
    }

    const testPayload: WebhookPayload = {
      event: 'order.created' as WebhookEvent,
      timestamp: new Date().toISOString(),
      data: { test: true, message: 'Prime ERP test webhook' }
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': 'test'
      };

      if (config.secret) {
        const signature = await this.generateSignature(testPayload, config.secret);
        headers['X-Webhook-Signature'] = signature;
      }

      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload)
      });

      if (response.ok) {
        return { success: true, message: 'Test webhook sent successfully' };
      }

      return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to send test webhook' 
      };
    }
  }
}

export const webhookService = new WebhookService();
