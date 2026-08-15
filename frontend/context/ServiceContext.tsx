import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { logger } from '@/services/logger';
import type {
  ServiceJob, ServiceJobStatus, ServiceRecipe, ServiceRecipeLine,
  ServiceResource, ServiceResourceType, ServiceMetrics, CapacitySnapshot,
  ServiceLaborEntry, ServiceMachineEntry, ServiceMaterialConsumption,
} from '../types';
import { serviceJobService } from '../services/serviceJobService';
import { serviceRecipeService, type RecipeCostBreakdown } from '../services/serviceRecipeService';
import { serviceResourceService } from '../services/serviceResourceService';

interface ServiceContextValue {
  // Jobs
  jobs: ServiceJob[];
  jobsLoading: boolean;
  jobsError: string | null;
  fetchJobs: (filters?: Parameters<typeof serviceJobService.getAllJobs>[0]) => Promise<void>;
  createJob: (input: Parameters<typeof serviceJobService.createJob>[0]) => Promise<ServiceJob | null>;
  transitionJob: (jobId: string, status: ServiceJobStatus) => Promise<boolean>;
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

  // Recipes
  getRecipes: (variantId?: string) => Promise<ServiceRecipe[]>;
  getActiveRecipe: (variantId: string) => Promise<ServiceRecipe | undefined>;
  saveRecipe: (recipe: ServiceRecipe) => Promise<ServiceRecipe>;
  calculateRecipeCost: (recipe: ServiceRecipe, resources?: ServiceResource[]) => RecipeCostBreakdown;

  // Resources
  resources: ServiceResource[];
  fetchResources: (type?: ServiceResourceType, workCenterId?: string) => Promise<void>;
  saveResource: (resource: ServiceResource) => Promise<ServiceResource>;
  deleteResource: (id: string) => Promise<void>;

  // Capacity
  calculateCapacity: (
    resources: ServiceResource[],
    jobs: ServiceJob[],
    periodStart: string,
    periodEnd: string
  ) => Promise<CapacitySnapshot[]>;

  // Metrics
  metrics: ServiceMetrics | null;
  refreshMetrics: () => Promise<void>;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

export const useService = (): ServiceContextValue => {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useService must be used within ServiceProvider');
  return ctx;
};

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [resources, setResources] = useState<ServiceResource[]>([]);
  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const fetchJobs = useCallback(async (filters?: Parameters<typeof serviceJobService.getAllJobs>[0]) => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const result = await serviceJobService.getAllJobs(filters);
      setJobs(result);
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const createJob = useCallback(async (
    input: Parameters<typeof serviceJobService.createJob>[0]
  ): Promise<ServiceJob | null> => {
    try {
      const job = await serviceJobService.createJob(input);
      setJobs(prev => [...prev, job]);
      return job;
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to create job');
      return null;
    }
  }, []);

  const transitionJob = useCallback(async (
    jobId: string, status: ServiceJobStatus
  ): Promise<boolean> => {
    const result = await serviceJobService.transitionStatus(jobId, status);
    if (result.success) {
      const updated = await serviceJobService.getJob(jobId);
      if (updated) setJobs(prev => prev.map(j => j.id === jobId ? updated : j));
    } else {
      setJobsError(result.error || 'Transition failed');
    }
    return result.success;
  }, []);

  const assignEmployee = useCallback(async (
    jobId: string, employeeId: string, employeeName: string
  ) => {
    const updated = await serviceJobService.assignEmployee(jobId, employeeId, employeeName);
    if (updated) setJobs(prev => prev.map(j => j.id === jobId ? updated : j));
  }, []);

  const assignMachine = useCallback(async (
    jobId: string, machineId: string, machineName: string
  ) => {
    const updated = await serviceJobService.assignMachine(jobId, machineId, machineName);
    if (updated) setJobs(prev => prev.map(j => j.id === jobId ? updated : j));
  }, []);

  const reserveMaterials = useCallback(async (jobId: string) => {
    try {
      const materials = await serviceJobService.reserveMaterials(jobId);
      const updated = await serviceJobService.getJob(jobId);
      if (updated) setJobs(prev => prev.map(j => j.id === jobId ? updated : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to reserve materials');
    }
  }, []);

  const updateMaterialActual = useCallback(async (jobId: string, materialId: string, actualQuantity: number) => {
    try {
      const materials = await serviceJobService.updateMaterialActual(jobId, materialId, actualQuantity);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, materials } : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to update material');
    }
  }, []);

  const addLaborEntry = useCallback(async (jobId: string, entry: ServiceLaborEntry) => {
    try {
      const labor = await serviceJobService.addLaborEntry(jobId, entry);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, labor } : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to add labor entry');
    }
  }, []);

  const updateLaborEntry = useCallback(async (jobId: string, entryId: string, patch: Partial<ServiceLaborEntry>) => {
    try {
      const labor = await serviceJobService.updateLaborEntry(jobId, entryId, patch);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, labor } : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to update labor entry');
    }
  }, []);

  const removeLaborEntry = useCallback(async (jobId: string, entryId: string) => {
    try {
      const labor = await serviceJobService.removeLaborEntry(jobId, entryId);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, labor } : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to remove labor entry');
    }
  }, []);

  const addMachineEntry = useCallback(async (jobId: string, entry: ServiceMachineEntry) => {
    try {
      const machine = await serviceJobService.addMachineEntry(jobId, entry);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, machine } : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to add machine entry');
    }
  }, []);

  const updateMachineEntry = useCallback(async (jobId: string, entryId: string, patch: Partial<ServiceMachineEntry>) => {
    try {
      const machine = await serviceJobService.updateMachineEntry(jobId, entryId, patch);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, machine } : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to update machine entry');
    }
  }, []);

  const removeMachineEntry = useCallback(async (jobId: string, entryId: string) => {
    try {
      const machine = await serviceJobService.removeMachineEntry(jobId, entryId);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, machine } : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to remove machine entry');
    }
  }, []);

  const completeJob = useCallback(async (jobId: string, completedBy: string) => {
    try {
      const job = await serviceJobService.completeJob(jobId, completedBy);
      setJobs(prev => prev.map(j => j.id === jobId ? job : j));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to complete job');
    }
  }, []);

  const deleteJob = useCallback(async (id: string) => {
    try {
      await serviceJobService.deleteJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  }, []);

  // Recipes
  const getRecipes = useCallback(async (variantId?: string) => {
    return serviceRecipeService.getAllRecipes(variantId);
  }, []);

  const getActiveRecipe = useCallback(async (variantId: string) => {
    return serviceRecipeService.getActiveRecipe(variantId);
  }, []);

  const saveRecipe = useCallback(async (recipe: ServiceRecipe) => {
    return serviceRecipeService.saveRecipe(recipe);
  }, []);

  const calculateRecipeCost = useCallback((
    recipe: ServiceRecipe, resources?: ServiceResource[]
  ): RecipeCostBreakdown => {
    return serviceRecipeService.calculateRecipeCost(recipe, resources);
  }, []);

  // Resources
  const fetchResources = useCallback(async (type?: ServiceResourceType, workCenterId?: string) => {
    const result = await serviceResourceService.getAllResources(type, workCenterId);
    setResources(result);
  }, []);

  const saveResource = useCallback(async (resource: ServiceResource) => {
    const saved = await serviceResourceService.saveResource(resource);
    setResources(prev => {
      const idx = prev.findIndex(r => r.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    return saved;
  }, []);

  const deleteResource = useCallback(async (id: string) => {
    await serviceResourceService.deleteResource(id);
    setResources(prev => prev.filter(r => r.id !== id));
  }, []);

  const calculateCapacity = useCallback(async (
    resources: ServiceResource[],
    jobs: ServiceJob[],
    periodStart: string,
    periodEnd: string
  ) => {
    return serviceResourceService.calculateCapacity(resources, jobs, periodStart, periodEnd);
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const raw = await serviceJobService.getServiceMetrics();
      setMetrics({
        activeJobs: raw.activeJobs,
        pendingJobs: raw.pendingJobs,
        completedToday: raw.completedToday,
        overdueJobs: raw.overdueJobs,
        totalRevenue: raw.totalRevenue,
        totalCost: raw.totalCost,
        totalProfit: raw.totalProfit,
        averageMargin: raw.averageMargin,
        jobsByStatus: raw.jobsByStatus,
      });
    } catch (err) {
      logger.error('[ServiceContext] Failed to refresh metrics:', err);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchJobs();
    fetchResources();
  }, [fetchJobs, fetchResources]);

  const value = useMemo<ServiceContextValue>(() => ({
    jobs, jobsLoading, jobsError,
    fetchJobs, createJob, transitionJob,
    assignEmployee, assignMachine,
    reserveMaterials, updateMaterialActual,
    addLaborEntry, updateLaborEntry, removeLaborEntry,
    addMachineEntry, updateMachineEntry, removeMachineEntry,
    completeJob, deleteJob,
    getRecipes, getActiveRecipe, saveRecipe, calculateRecipeCost,
    resources, fetchResources, saveResource, deleteResource,
    calculateCapacity,
    metrics, refreshMetrics,
  }), [
    jobs, jobsLoading, jobsError, resources, metrics,
    fetchJobs, createJob, transitionJob,
    assignEmployee, assignMachine,
    reserveMaterials, updateMaterialActual,
    addLaborEntry, updateLaborEntry, removeLaborEntry,
    addMachineEntry, updateMachineEntry, removeMachineEntry,
    completeJob, deleteJob,
    getRecipes, getActiveRecipe, saveRecipe, calculateRecipeCost,
    fetchResources, saveResource, deleteResource,
    calculateCapacity, refreshMetrics,
  ]);

  return (
    <ServiceContext.Provider value={value}>
      {children}
    </ServiceContext.Provider>
  );
};
