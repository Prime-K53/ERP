import { create } from 'zustand';
import { logger } from '@/services/logger';
import { JobTicket, JobTicketSettings } from '../types';
import { generateNextId } from '../utils/helpers';
import { dbService } from '../services/db';

interface JobTicketState {
  jobTickets: JobTicket[];
  isLoading: boolean;
  settings: JobTicketSettings;
  
  // Actions
  fetchJobTickets: () => Promise<void>;
  addJobTicket: (ticket: JobTicket) => Promise<void>;
  updateJobTicket: (ticket: JobTicket) => Promise<void>;
  deleteJobTicket: (id: string) => Promise<void>;
  updateJobTicketStatus: (id: string, status: JobTicket['status']) => Promise<void>;
  updateJobProgress: (id: string, progress: number) => Promise<void>;
  
  // Settings
  updateSettings: (settings: Partial<JobTicketSettings>) => Promise<void>;
  
  // Computed
  getTicketsByStatus: (status: JobTicket['status']) => JobTicket[];
  getTicketsByPriority: (priority: JobTicket['priority']) => JobTicket[];
  getOverdueTickets: () => JobTicket[];
}

const defaultSettings: JobTicketSettings = {
  defaultRushFeePercent: 25,
  expressFeePercent: 50,
  urgentFeePercent: 100,
  enableNotifications: true,
  notifyOnReceived: true,
  notifyOnReady: true,
  notifyOnDelivered: true,
};

export const useJobTicketStore = create<JobTicketState>((set, get) => ({
  jobTickets: [],
  isLoading: false,
  settings: defaultSettings,

  fetchJobTickets: async () => {
    set({ isLoading: true });
    try {
      const tickets = await dbService.getAll<JobTicket>('jobTickets') || [];
      const settings = await dbService.get<JobTicketSettings>('jobTicketSettings', 'default') || defaultSettings;
      set({ 
        jobTickets: tickets, 
        settings,
        isLoading: false 
      });
    } catch (error) {
      logger.error('Failed to fetch job tickets:', error);
      set({ isLoading: false });
    }
  },

  addJobTicket: async (ticket) => {
    const newTicket = {
      ...ticket,
      id: ticket.id || generateNextId('TKT', get().jobTickets),
      ticketNumber: ticket.ticketNumber || generateNextId('TKT', get().jobTickets),
      createdAt: ticket.createdAt || new Date().toISOString(),
      status: ticket.status || 'Received',
      progressPercent: ticket.progressPercent || 0,
    };
    
    set(state => ({ jobTickets: [...state.jobTickets, newTicket] }));
    await dbService.put('jobTickets', newTicket);
  },

  updateJobTicket: async (ticket) => {
    const updated = { ...ticket, updatedAt: new Date().toISOString() };
    set(state => ({
      jobTickets: state.jobTickets.map(t => t.id === ticket.id ? updated : t)
    }));
    await dbService.put('jobTickets', updated);
  },

  deleteJobTicket: async (id) => {
    set(state => ({ jobTickets: state.jobTickets.filter(t => t.id !== id) }));
    await dbService.delete('jobTickets', id);
  },

  updateJobTicketStatus: async (id, status) => {
    const ticket = get().jobTickets.find(t => t.id === id);
    if (!ticket) return;
    
    const updates: Partial<JobTicket> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    
    if (status === 'Ready') {
      updates.completedAt = new Date().toISOString();
    } else if (status === 'Delivered') {
      updates.deliveredAt = new Date().toISOString();
    }
    
    const updated = { ...ticket, ...updates };
    set(state => ({ 
      jobTickets: state.jobTickets.map(t => t.id === id ? updated : t) 
    }));
    await dbService.put('jobTickets', updated);
  },

  updateJobProgress: async (id, progress) => {
    const ticket = get().jobTickets.find(t => t.id === id);
    if (!ticket) return;
    
    const updated = {
      ...ticket,
      progressPercent: progress,
      updatedAt: new Date().toISOString(),
    };
    
    set(state => ({
      jobTickets: state.jobTickets.map(t => t.id === id ? updated : t)
    }));
    await dbService.put('jobTickets', updated);
  },

  updateSettings: async (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    await dbService.put('jobTicketSettings', { id: 'default', ...updated });
  },

  getTicketsByStatus: (status) => {
    return get().jobTickets.filter(t => t.status === status);
  },

  getTicketsByPriority: (priority) => {
    return get().jobTickets.filter(t => t.priority === priority);
  },

  getOverdueTickets: () => {
    const now = new Date();
    return get().jobTickets.filter(t => {
      if (t.status === 'Delivered' || t.status === 'Cancelled') return false;
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < now;
    });
  },
}));