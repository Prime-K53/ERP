import { JobTicket, JobTicketSettings, JobTicketStatus, JobTicketPriority, JobTicketType } from '../types';
import { logger } from '@/services/logger';
import { generateNextId } from '../utils/helpers';
import { localFileStorage } from './localFileStorage';
import { dbService } from './db';
import { productionDb, getProductionDb } from './productionDb';

export interface JobTicketNotification {
  id: string;
  ticketId: string;
  type: 'created' | 'status_changed' | 'ready' | 'delivered';
  message: string;
  sentAt: string;
  method: 'sms' | 'whatsapp' | 'email';
  success: boolean;
}

const LEGACY_STORAGE_KEY = 'jobTickets';
const LEGACY_SETTINGS_KEY = 'jobTicketSettings';
const MIGRATION_KEY = 'jobTicketsIndexedDbMigrated_v1';
const SETTINGS_ID = 'default';

const defaultSettings: JobTicketSettings = {
  defaultRushFeePercent: 25,
  expressFeePercent: 50,
  urgentFeePercent: 100,
  enableNotifications: true,
  notifyOnReceived: true,
  notifyOnReady: true,
  notifyOnDelivered: true,
};

const getLegacyTickets = (): JobTicket[] => {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(LEGACY_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const getLegacySettings = (): JobTicketSettings | null => {
  if (typeof window === 'undefined') return null;

  try {
    const data = localStorage.getItem(LEGACY_SETTINGS_KEY);
    return data ? { ...defaultSettings, ...JSON.parse(data) } : null;
  } catch {
    return null;
  }
};

const hasOwn = <T extends object>(value: T, key: keyof any) => Object.prototype.hasOwnProperty.call(value, key);

const migrateLegacyData = async () => {
  if (typeof window === 'undefined') return;

  const migrationCompleted = await dbService.getSetting<string>(MIGRATION_KEY) === 'true';
  let existingTickets: JobTicket[];
  try { existingTickets = await productionDb.jobTickets.toArray(); } catch { existingTickets = await dbService.getAll<JobTicket>('jobTickets'); }
  let existingSettings: ({ id: string } & JobTicketSettings) | undefined;
  try { existingSettings = await productionDb.jobTicketSettings.get(SETTINGS_ID); } catch { existingSettings = await dbService.get<{ id: string } & JobTicketSettings>('jobTicketSettings', SETTINGS_ID); }

  if (migrationCompleted && existingTickets.length > 0 && existingSettings) {
    return;
  }

  const legacyTickets = getLegacyTickets();
  const legacySettings = getLegacySettings();

  if (existingTickets.length === 0 && legacyTickets.length > 0) {
    for (const ticket of legacyTickets) {
      const migrated = {
        ...ticket,
        updatedAt: ticket.updatedAt || ticket.createdAt || new Date().toISOString(),
        sourceType: ticket.sourceType || 'manual'
      } as JobTicket;
      try { await productionDb.jobTickets.put(migrated); } catch { await dbService.put('jobTickets', migrated); }
    }
  }

  if (!existingSettings) {
    const migratedSettings = { id: SETTINGS_ID, ...(legacySettings || defaultSettings) };
    try { await productionDb.jobTicketSettings.put(migratedSettings); } catch { await dbService.put('jobTicketSettings', migratedSettings); }
  }

  await dbService.saveSetting(MIGRATION_KEY, 'true');
};

const getStoredTickets = async (): Promise<JobTicket[]> => {
  await migrateLegacyData();
  try {
    const prod = getProductionDb();
    if (prod) {
      const prodTickets = await prod.jobTickets.toArray();
      if (prodTickets.length > 0) return prodTickets;
    }
  } catch { /* fall through */ }
  return dbService.getAll<JobTicket>('jobTickets');
};

const getStoredSettings = async (): Promise<JobTicketSettings> => {
  await migrateLegacyData();
  let saved: ({ id: string } & JobTicketSettings) | undefined;
  try { saved = await productionDb.jobTicketSettings.get(SETTINGS_ID); } catch { saved = await dbService.get<{ id: string } & JobTicketSettings>('jobTicketSettings', SETTINGS_ID); }
  if (!saved) return defaultSettings;
  const { id: _id, ...settings } = saved;
  return { ...defaultSettings, ...settings };
};

const saveTicket = async (ticket: JobTicket) => {
  try { await productionDb.jobTickets.put(ticket); } catch { await dbService.put('jobTickets', ticket); }
};

const saveSettings = async (settings: JobTicketSettings) => {
  try { await productionDb.jobTicketSettings.put({ id: SETTINGS_ID, ...settings }); } catch { await dbService.put('jobTicketSettings', { id: SETTINGS_ID, ...settings }); }
};

export const jobTicketService = {
  getAll: async (): Promise<JobTicket[]> => {
    return getStoredTickets();
  },

  getById: async (id: string): Promise<JobTicket | undefined> => {
    await migrateLegacyData();
    try {
      const prod = getProductionDb();
      if (prod) {
        const ticket = await prod.jobTickets.get(id);
        if (ticket) return ticket;
      }
    } catch { /* fall through */ }
    return dbService.get<JobTicket>('jobTickets', id);
  },

  create: async (ticket: Partial<JobTicket>): Promise<JobTicket> => {
    const tickets = await getStoredTickets();
    const settings = await getStoredSettings();

    const now = new Date().toISOString();
    const newTicket: JobTicket = {
      id: ticket.id || generateNextId('TKT', tickets),
      ticketNumber: ticket.ticketNumber || generateNextId('TKT', tickets),
      type: ticket.type || 'Printing',
      customerId: ticket.customerId,
      customerName: ticket.customerName || 'Walk-in',
      customerPhone: ticket.customerPhone,
      customerEmail: ticket.customerEmail,
      description: ticket.description || '',
      quantity: ticket.quantity || 1,
      priority: ticket.priority || 'Normal',
      status: ticket.status || 'Received',
      paperSize: ticket.paperSize || 'A4',
      paperType: ticket.paperType,
      colorMode: ticket.colorMode || 'BlackWhite',
      sides: ticket.sides || 'Single',
      finishing: ticket.finishing || {},
      unitPrice: ticket.unitPrice || 0,
      rushFee: ticket.rushFee || 0,
      finishingCost: ticket.finishingCost || 0,
      discount: ticket.discount || 0,
      subtotal: ticket.subtotal || 0,
      tax: ticket.tax || 0,
      total: ticket.total || 0,
      dateReceived: ticket.dateReceived || now,
      dueDate: ticket.dueDate,
      dueTime: ticket.dueTime,
      expectedCompletionDate: ticket.expectedCompletionDate,
      expectedCompletionTime: ticket.expectedCompletionTime,
      completedAt: ticket.completedAt,
      deliveredAt: ticket.deliveredAt,
      operatorId: ticket.operatorId,
      operatorName: ticket.operatorName,
      machineId: ticket.machineId,
      machineName: ticket.machineName,
      progressPercent: ticket.progressPercent || 0,
      attachments: ticket.attachments || [],
      notes: ticket.notes,
      internalNotes: ticket.internalNotes,
      sourceType: ticket.sourceType || 'manual',
      sourceId: ticket.sourceId,
      linkedWorkOrderId: ticket.linkedWorkOrderId,
      createdBy: ticket.createdBy,
      createdAt: ticket.createdAt || now,
      updatedAt: now,
    };

    const pricing = jobTicketService.calculatePricing(
      newTicket.quantity,
      newTicket.unitPrice,
      newTicket.priority,
      newTicket.finishing,
      settings
    );

    newTicket.rushFee = pricing.rushFee;
    newTicket.finishingCost = pricing.finishingCost;
    newTicket.discount = pricing.discount;
    newTicket.subtotal = pricing.subtotal;
    newTicket.tax = pricing.tax;
    newTicket.total = pricing.total;

    await saveTicket(newTicket);
    return newTicket;
  },

  update: async (id: string, updates: Partial<JobTicket>): Promise<JobTicket | undefined> => {
    const tickets = await getStoredTickets();
    const settings = await getStoredSettings();
    const current = tickets.find((ticket) => ticket.id === id);

    if (!current) return undefined;

    const updated: JobTicket = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (
      hasOwn(updates, 'quantity') ||
      hasOwn(updates, 'unitPrice') ||
      hasOwn(updates, 'priority') ||
      hasOwn(updates, 'finishing')
    ) {
      const pricing = jobTicketService.calculatePricing(
        updated.quantity,
        updated.unitPrice,
        updated.priority,
        updated.finishing,
        settings
      );
      updated.rushFee = pricing.rushFee;
      updated.finishingCost = pricing.finishingCost;
      updated.discount = pricing.discount;
      updated.subtotal = pricing.subtotal;
      updated.tax = pricing.tax;
      updated.total = pricing.total;
    }

    await saveTicket(updated);
    return updated;
  },

  delete: async (id: string): Promise<boolean> => {
    const existing = await jobTicketService.getById(id);
    if (!existing) return false;
    try { await productionDb.jobTickets.delete(id); } catch { await dbService.delete('jobTickets', id); }
    return true;
  },

  updateStatus: async (id: string, status: JobTicketStatus): Promise<JobTicket | undefined> => {
    const updates: Partial<JobTicket> = { status };

    if (status === 'Ready') {
      updates.completedAt = new Date().toISOString();
    } else if (status === 'Delivered') {
      updates.deliveredAt = new Date().toISOString();
    }

    return jobTicketService.update(id, updates);
  },

  updateProgress: async (id: string, progress: number): Promise<JobTicket | undefined> => {
    return jobTicketService.update(id, {
      progressPercent: Math.min(100, Math.max(0, progress))
    });
  },

  calculatePricing: (
    quantity: number,
    unitPrice: number,
    priority: JobTicketPriority,
    finishing: JobTicket['finishing'],
    settings: JobTicketSettings,
    pages: number = 0,
    ticketType?: JobTicketType
  ) => {
    const subtotal = quantity * unitPrice;

    let rushFee = 0;
    if (priority === 'Rush') {
      rushFee = subtotal * (settings.defaultRushFeePercent / 100);
    } else if (priority === 'Express') {
      rushFee = subtotal * (settings.expressFeePercent / 100);
    } else if (priority === 'Urgent') {
      rushFee = subtotal * (settings.urgentFeePercent / 100);
    }

    let finishingCost = 0;
    if (finishing.staple) finishingCost += quantity * 0.50;
    if (finishing.fold) finishingCost += quantity * 0.25;
    if (finishing.collate) finishingCost += quantity * 0.20;
    if (finishing.trim) finishingCost += quantity * 0.75;
    if (finishing.punch) finishingCost += quantity * 0.30;
    if (finishing.lamination) finishingCost += quantity * 1.50;
    if (finishing.bindingType && finishing.bindingType !== 'None') {
      if (finishing.bindingType === 'Spiral') finishingCost += quantity * 2.00;
      else if (finishing.bindingType === 'Perfect') finishingCost += quantity * 5.00;
      else if (finishing.bindingType === 'Wire') finishingCost += quantity * 3.00;
      else if (finishing.bindingType === 'Tape') finishingCost += quantity * 1.50;
    }

    const afterRushAndFinishing = subtotal + rushFee + finishingCost;
    const tax = afterRushAndFinishing * 0.15;
    const total = afterRushAndFinishing + tax;

    return {
      rushFee: Math.round(rushFee * 100) / 100,
      finishingCost: Math.round(finishingCost * 100) / 100,
      discount: 0,
      subtotal: Math.round(afterRushAndFinishing * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  },

  getSettings: async (): Promise<JobTicketSettings> => {
    return getStoredSettings();
  },

  updateSettings: async (updates: Partial<JobTicketSettings>): Promise<JobTicketSettings> => {
    const current = await getStoredSettings();
    const updated = { ...current, ...updates };
    await saveSettings(updated);
    return updated;
  },

  getByStatus: async (status: JobTicketStatus): Promise<JobTicket[]> => {
    const tickets = await getStoredTickets();
    return tickets.filter((ticket) => ticket.status === status);
  },

  getByPriority: async (priority: JobTicketPriority): Promise<JobTicket[]> => {
    const tickets = await getStoredTickets();
    return tickets.filter((ticket) => ticket.priority === priority);
  },

  getOverdue: async (): Promise<JobTicket[]> => {
    const tickets = await getStoredTickets();
    const now = new Date();
    return tickets.filter((ticket) => {
      if (ticket.status === 'Delivered' || ticket.status === 'Cancelled') return false;
      if (!ticket.dueDate) return false;
      return new Date(ticket.dueDate) < now;
    });
  },

  getByCustomer: async (customerId: string): Promise<JobTicket[]> => {
    const tickets = await getStoredTickets();
    return tickets.filter((ticket) => ticket.customerId === customerId);
  },

  uploadFile: async (ticketId: string, file: File): Promise<{ id: string; name: string; url: string; type: string; size: number }> => {
    const ticket = await jobTicketService.getById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const storedFileId = await localFileStorage.save(file);
    const fileData = {
      id: generateNextId('FILE', ticket.attachments || []),
      name: file.name,
      url: storedFileId,
      fileId: storedFileId,
      type: file.type,
      size: file.size,
    };

    const attachments = [...(ticket.attachments || []), fileData];
    await saveTicket({
      ...ticket,
      attachments,
      updatedAt: new Date().toISOString(),
    });

    return fileData;
  },

  deleteFile: async (ticketId: string, fileId: string): Promise<void> => {
    const ticket = await jobTicketService.getById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const attachments = (ticket.attachments || []).filter((attachment) => attachment.id !== fileId);
    await saveTicket({
      ...ticket,
      attachments,
      updatedAt: new Date().toISOString(),
    });
  },

  getNotificationLog: async (ticketId: string): Promise<JobTicketNotification[]> => {
    try {
      const notifications = await dbService.getSetting<JobTicketNotification[]>('jobTicketNotifications') || [];
      return notifications.filter((entry) => entry.ticketId === ticketId);
    } catch {
      return [];
    }
  },

  saveNotification: async (notification: JobTicketNotification): Promise<void> => {
    try {
      const notifications = await dbService.getSetting<JobTicketNotification[]>('jobTicketNotifications') || [];
      notifications.push(notification);
      await dbService.saveSetting('jobTicketNotifications', notifications);
    } catch (error) {
      logger.error('Failed to save notification:', error);
    }
  },

  sendNotification: async (
    ticketId: string,
    type: 'created' | 'status_changed' | 'ready' | 'delivered',
    method: 'sms' | 'whatsapp' | 'email',
    customerPhone?: string,
    customerEmail?: string
  ): Promise<JobTicketNotification> => {
    const ticket = await jobTicketService.getById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const settings = await getStoredSettings();
    if (!settings.enableNotifications) {
      throw new Error('Notifications are disabled');
    }

    if (type === 'ready' && !settings.notifyOnReady) {
      throw new Error('Ready notifications are disabled');
    }
    if (type === 'delivered' && !settings.notifyOnDelivered) {
      throw new Error('Delivered notifications are disabled');
    }

    if (method === 'email' && !customerEmail && !ticket.customerEmail) {
      throw new Error('Customer email is required');
    }
    if ((method === 'sms' || method === 'whatsapp') && !customerPhone && !ticket.customerPhone) {
      throw new Error('Customer phone is required');
    }

    const messages = {
      created: `Your job ${ticket.ticketNumber} has been received. Quantity: ${ticket.quantity}`,
      status_changed: `Your job ${ticket.ticketNumber} status has been updated to ${ticket.status}`,
      ready: `Your job ${ticket.ticketNumber} is ready for pickup!`,
      delivered: `Your job ${ticket.ticketNumber} has been delivered. Thank you!`,
    };

    const notification: JobTicketNotification = {
      id: generateNextId('NOTIF', []),
      ticketId,
      type,
      message: messages[type],
      sentAt: new Date().toISOString(),
      method,
      success: true,
    };

    jobTicketService.saveNotification(notification);
    return notification;
  },
};

