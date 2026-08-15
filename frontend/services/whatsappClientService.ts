import { dbService } from './db';

const META_API_VERSION = 'v22.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface WhatsAppAccount {
  id: string;
  user_id: string;
  phone_number_id: string | null;
  access_token: string | null;
  display_name: string | null;
  connection_status: 'disconnected' | 'connected';
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppClientStatus {
  configured: boolean;
  ready: boolean;
  status: string;
  accountId: string | null;
  userId: string | null;
}

export interface WhatsAppMessageEvent {
  from: string;
  body: string;
  contactName: string;
  contactNumber: string;
  chatId: string;
}

export interface QueuedMessage {
  id: string;
  account_id: string;
  recipient: string;
  message_content: string;
  status: string;
  retry_count: number;
  batch_id: string | null;
}

type StatusCallback = (status: WhatsAppClientStatus) => void;
type MessageCallback = (msg: WhatsAppMessageEvent) => void;
type ErrorCallback = (err: Error) => void;
type AccountCallback = (account: WhatsAppAccount | null) => void;

class WhatsAppClientService {
  private statusListeners: StatusCallback[] = [];
  private messageListeners: MessageCallback[] = [];
  private errorListeners: ErrorCallback[] = [];
  private accountListeners: AccountCallback[] = [];

  private currentStatus: WhatsAppClientStatus = {
    configured: false,
    ready: false,
    status: 'disconnected',
    accountId: null,
    userId: null,
  };

  private _account: WhatsAppAccount | null = null;

  private accountSettingsKey(userId: string): string {
    return `whatsapp_account_${userId}`;
  }

  async getAccount(userId: string): Promise<WhatsAppAccount | null> {
    const key = this.accountSettingsKey(userId);
    const data = await dbService.getSetting<WhatsAppAccount>(key);
    if (data) {
      this._account = data;
      this.currentStatus = {
        configured: !!data.access_token,
        ready: !!data.access_token,
        status: data.access_token ? 'connected' : 'disconnected',
        accountId: data.id,
        userId: data.user_id,
      };
    }
    return data || null;
  }

  async saveConfig(userId: string, phoneNumberId: string, accessToken: string): Promise<WhatsAppAccount> {
    const existing = await this.getAccount(userId);
    const key = this.accountSettingsKey(userId);
    const now = new Date().toISOString();

    const account: WhatsAppAccount = existing || {
      id: `wa-${userId}-${Date.now()}`,
      user_id: userId,
      created_at: now,
      display_name: 'Meta WhatsApp API',
      connection_status: 'connected',
      last_connected_at: null,
      phone_number_id: null,
      access_token: null,
      updated_at: now,
    };

    account.phone_number_id = phoneNumberId;
    account.access_token = accessToken;
    account.display_name = 'Meta WhatsApp API';
    account.connection_status = 'connected';
    account.last_connected_at = now;
    account.updated_at = now;

    await dbService.saveSetting(key, account);

    this._account = account;
    this.currentStatus = {
      configured: true,
      ready: true,
      status: 'connected',
      accountId: account.id,
      userId,
    };
    this.statusListeners.forEach((cb) => cb(this.currentStatus));
    this.accountListeners.forEach((cb) => cb(this._account));
    return account;
  }

  async disconnect(userId: string): Promise<void> {
    const key = this.accountSettingsKey(userId);
    const existing = await dbService.getSetting<WhatsAppAccount>(key);
    if (existing) {
      existing.connection_status = 'disconnected';
      existing.access_token = null;
      existing.phone_number_id = null;
      existing.updated_at = new Date().toISOString();
      await dbService.saveSetting(key, existing);
    }
    this._account = null;
    this.currentStatus = { configured: false, ready: false, status: 'disconnected', accountId: null, userId: null };
    this.statusListeners.forEach((cb) => cb(this.currentStatus));
    this.accountListeners.forEach((cb) => cb(null));
  }

  async sendMessage(phoneNumberId: string, accessToken: string, to: string, message: string): Promise<{ messageId: string }> {
    const res = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { body: message },
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `Meta API error: ${res.status}`);
    }
    const data = await res.json();
    return { messageId: data.messages?.[0]?.id || `meta-${Date.now()}` };
  }

  async logMessage(accountId: string, userId: string, recipient: string, content: string, status: string, direction: string, messageId?: string) {
    await dbService.put('whatsappChats', {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      account_id: accountId,
      user_id: userId,
      recipient,
      message_content: content,
      status,
      direction,
      message_id: messageId || null,
      created_at: new Date().toISOString(),
    });
  }

  async getMessageLogs(accountId: string, userId: string, filters?: { status?: string; dateRange?: string }): Promise<any[]> {
    const all = await dbService.getAll<any>('whatsappChats');
    let filtered = all.filter((m: any) => m.account_id === accountId && m.user_id === userId);

    if (filters?.status) {
      filtered = filtered.filter((m: any) => m.status === filters.status);
    }
    if (filters?.dateRange === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((m: any) => new Date(m.created_at) >= start);
    } else if (filters?.dateRange === 'week') {
      const start = new Date(); start.setDate(start.getDate() - 7);
      filtered = filtered.filter((m: any) => new Date(m.created_at) >= start);
    } else if (filters?.dateRange === 'month') {
      const start = new Date(); start.setMonth(start.getMonth() - 1);
      filtered = filtered.filter((m: any) => new Date(m.created_at) >= start);
    }

    filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return filtered.slice(0, 200);
  }

  private queueSettingsKey(accountId: string): string {
    return `whatsapp_message_queue_${accountId}`;
  }

  async queueMessages(accountId: string, userId: string, recipients: { phone: string; name?: string }[], messageContent: string, options?: { batchId?: string }): Promise<{ queued: number }> {
    const batchId = options?.batchId || `batch-${Date.now()}`;
    const key = this.queueSettingsKey(accountId);
    const existing: QueuedMessage[] = (await dbService.getSetting<QueuedMessage[]>(key)) || [];
    const rows: QueuedMessage[] = recipients.map((r) => ({
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      account_id: accountId,
      recipient: r.phone,
      message_content: messageContent,
      status: 'pending',
      retry_count: 0,
      batch_id: batchId,
    }));
    existing.push(...rows);
    await dbService.saveSetting(key, existing);
    return { queued: rows.length };
  }

  async processQueue(accountId: string, userId: string, phoneNumberId: string, accessToken: string): Promise<number> {
    const key = this.queueSettingsKey(accountId);
    const all: QueuedMessage[] = (await dbService.getSetting<QueuedMessage[]>(key)) || [];
    const pending = all.filter((item) => item.status === 'pending').slice(0, 50);
    if (pending.length === 0) return 0;

    let processed = 0;
    for (const item of pending) {
      try {
        const result = await this.sendMessage(phoneNumberId, accessToken, item.recipient, item.message_content);
        item.status = 'sent';
        item.retry_count = (item.retry_count || 0) + 1;
        await this.logMessage(accountId, userId, item.recipient, item.message_content, 'sent', 'outbound', result.messageId);
        processed++;
      } catch {
        item.status = 'failed';
        item.retry_count = (item.retry_count || 0) + 1;
        await this.logMessage(accountId, userId, item.recipient, item.message_content, 'failed', 'outbound');
      }
    }

    await dbService.saveSetting(key, all);
    return processed;
  }

  async getQueueStatus(accountId: string): Promise<{ status: string; count: number }[]> {
    const key = this.queueSettingsKey(accountId);
    const all: QueuedMessage[] = (await dbService.getSetting<QueuedMessage[]>(key)) || [];
    const counts: Record<string, number> = {};
    for (const item of all) {
      counts[item.status] = (counts[item.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }

  getStatus(): WhatsAppClientStatus {
    return this.currentStatus;
  }

  getAccountInfo(): WhatsAppAccount | null {
    return this._account;
  }

  triggerIncomingMessage(msg: WhatsAppMessageEvent) {
    this.messageListeners.forEach((cb) => cb(msg));
  }

  onStatus(cb: StatusCallback) {
    this.statusListeners.push(cb);
    return () => { this.statusListeners = this.statusListeners.filter((l) => l !== cb); };
  }

  onMessage(cb: MessageCallback) {
    this.messageListeners.push(cb);
    return () => { this.messageListeners = this.messageListeners.filter((l) => l !== cb); };
  }

  onError(cb: ErrorCallback) {
    this.errorListeners.push(cb);
    return () => { this.errorListeners = this.errorListeners.filter((l) => l !== cb); };
  }

  onAccount(cb: AccountCallback) {
    this.accountListeners.push(cb);
    return () => { this.accountListeners = this.accountListeners.filter((l) => l !== cb); };
  }
}

export const whatsappClient = new WhatsAppClientService();
