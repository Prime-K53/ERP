import { create } from 'zustand';
import type {
  ServiceJob, ServiceJobStatus,
  ServiceLaborEntry, ServiceMachineEntry, ServiceMaterialConsumption,
} from '../types';
import { serviceJobService } from '../services/serviceJobService';

interface ServiceJobState {
  jobs: ServiceJob[];
  isLoading: boolean;
  error: string | null;

  fetchJobs: (filters?: Parameters<typeof serviceJobService.getAllJobs>[0]) => Promise<void>;
  createJob: (input: Parameters<typeof serviceJobService.createJob>[0]) => Promise<ServiceJob | null>;
  transitionJob: (jobId: string, newStatus: ServiceJobStatus) => Promise<boolean>;
  assignEmployee: (jobId: string, employeeId: string, employeeName: string) => Promise<void>;
  assignMachine: (jobId: string, machineId: string, machineName: string) => Promise<void>;
  reserveMaterials: (jobId: string) => Promise<void>;
  updateMaterialActual: (jobId: string, materialId: string, actualQuantity: number) => Promise<void>;
  addLaborEntry: (jobId: string, entry: ServiceLaborEntry) => Promise<void>;
  updateLaborEntry: (jobId: string, entryId: string, patch: Partial<ServiceLaborEntry>) => Promise<void>;
  removeLaborEntry: (jobId: string, entryId: string) => Promise<void>;
  addMachineEntry: (jobId: string, entry: ServiceMachineEntry) => Promise<void>;
  updateMachineEntry: (jobId: string, entryId: string, patch: Partial<ServiceMachineEntry>) => Promise<void>;
  removeMachineEntry: (jobId: string, entryId: string) => Promise<void>;
  completeJob: (jobId: string, completedBy: string) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useServiceJobStore = create<ServiceJobState>((set, get) => ({
  jobs: [],
  isLoading: false,
  error: null,

  fetchJobs: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const jobs = await serviceJobService.getAllJobs(filters);
      set({ jobs, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch jobs', isLoading: false });
    }
  },

  createJob: async (input) => {
    set({ error: null });
    try {
      const job = await serviceJobService.createJob(input);
      set(state => ({ jobs: [...state.jobs, job] }));
      return job;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create job' });
      return null;
    }
  },

  transitionJob: async (jobId, newStatus) => {
    set({ error: null });
    const result = await serviceJobService.transitionStatus(jobId, newStatus);
    if (result.success) {
      const updated = await serviceJobService.getJob(jobId);
      if (updated) {
        set(state => ({
          jobs: state.jobs.map(j => j.id === jobId ? updated : j),
        }));
      }
    } else {
      set({ error: result.error || 'Transition failed' });
    }
    return result.success;
  },

  assignEmployee: async (jobId, employeeId, employeeName) => {
    set({ error: null });
    const updated = await serviceJobService.assignEmployee(jobId, employeeId, employeeName);
    if (updated) {
      set(state => ({ jobs: state.jobs.map(j => j.id === jobId ? updated : j) }));
    }
  },

  assignMachine: async (jobId, machineId, machineName) => {
    set({ error: null });
    const updated = await serviceJobService.assignMachine(jobId, machineId, machineName);
    if (updated) {
      set(state => ({ jobs: state.jobs.map(j => j.id === jobId ? updated : j) }));
    }
  },

  reserveMaterials: async (jobId) => {
    set({ error: null });
    try {
      const materials = await serviceJobService.reserveMaterials(jobId);
      const updated = await serviceJobService.getJob(jobId);
      if (updated) {
        set(state => ({ jobs: state.jobs.map(j => j.id === jobId ? updated : j) }));
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to reserve materials' });
    }
  },

  updateMaterialActual: async (jobId, materialId, actualQuantity) => {
    set({ error: null });
    try {
      const materials = await serviceJobService.updateMaterialActual(jobId, materialId, actualQuantity);
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? { ...j, materials } : j),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update material' });
    }
  },

  addLaborEntry: async (jobId, entry) => {
    set({ error: null });
    try {
      const labor = await serviceJobService.addLaborEntry(jobId, entry);
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? { ...j, labor } : j),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add labor entry' });
    }
  },

  updateLaborEntry: async (jobId, entryId, patch) => {
    set({ error: null });
    try {
      const labor = await serviceJobService.updateLaborEntry(jobId, entryId, patch);
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? { ...j, labor } : j),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update labor entry' });
    }
  },

  removeLaborEntry: async (jobId, entryId) => {
    set({ error: null });
    try {
      const labor = await serviceJobService.removeLaborEntry(jobId, entryId);
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? { ...j, labor } : j),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove labor entry' });
    }
  },

  addMachineEntry: async (jobId, entry) => {
    set({ error: null });
    try {
      const machine = await serviceJobService.addMachineEntry(jobId, entry);
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? { ...j, machine } : j),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add machine entry' });
    }
  },

  updateMachineEntry: async (jobId, entryId, patch) => {
    set({ error: null });
    try {
      const machine = await serviceJobService.updateMachineEntry(jobId, entryId, patch);
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? { ...j, machine } : j),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update machine entry' });
    }
  },

  removeMachineEntry: async (jobId, entryId) => {
    set({ error: null });
    try {
      const machine = await serviceJobService.removeMachineEntry(jobId, entryId);
      set(state => ({
        jobs: state.jobs.map(j => j.id === jobId ? { ...j, machine } : j),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove machine entry' });
    }
  },

  completeJob: async (jobId, completedBy) => {
    set({ error: null });
    try {
      const job = await serviceJobService.completeJob(jobId, completedBy);
      set(state => ({ jobs: state.jobs.map(j => j.id === jobId ? job : j) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to complete job' });
    }
  },

  deleteJob: async (id) => {
    set({ error: null });
    try {
      await serviceJobService.deleteJob(id);
      set(state => ({ jobs: state.jobs.filter(j => j.id !== id) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete job' });
    }
  },

  clearError: () => set({ error: null }),
}));
