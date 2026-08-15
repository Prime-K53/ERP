import type {
  ServiceJob, ServiceJobStatus, ServiceJobPriority,
  ServicePricingSnapshot, ServiceMaterialConsumption, MaterialState,
  ServiceLaborEntry, ServiceMachineEntry, ServiceExecutionSnapshot,
  ServiceRecipe,
} from '../types';
import { dbService } from './db';
import { productionDb } from './productionDb';
import { serviceRecipeService } from './serviceRecipeService';

// ─── Lazy-loaded dependencies ───
let _inventoryService: any = null;
async function getInvService(): Promise<any> {
  if (!_inventoryService) {
    const mod = await import('./inventoryTransactionService');
    _inventoryService = mod.inventoryTransactionService;
  }
  return _inventoryService;
}

let _reservationService: any = null;
async function getReservationService(): Promise<any> {
  if (!_reservationService) {
    const mod = await import('./inventoryTransactionService');
    _reservationService = mod.inventoryReservationService;
  }
  return _reservationService;
}

let _pricingService: any = null;
async function getPricingService(): Promise<any> {
  if (!_pricingService) {
    const mod = await import('./pricingService');
    _pricingService = mod.pricingService;
  }
  return _pricingService;
}

let _masterPricingService: any = null;
async function getMasterPricingService(): Promise<any> {
  if (!_masterPricingService) {
    const mod = await import('./masterInventoryPricingService');
    _masterPricingService = mod.masterInventoryPricingService;
  }
  return _masterPricingService;
}

let _inventoryItems: any[] | null = null;
async function ensureInventoryCache(): Promise<any[]> {
  if (!_inventoryItems) {
    try {
      _inventoryItems = await dbService.getAll('inventory');
    } catch {
      _inventoryItems = [];
    }
  }
  return _inventoryItems;
}

// ─── ID generation ───
const generateId = (): string =>
  'SJ_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substring(2, 7).toUpperCase();

const generateJobNumber = (): string =>
  'SVC-' + Date.now().toString(36).toUpperCase();

// ─── Allowed status transitions ───
const STATUS_TRANSITIONS: Record<ServiceJobStatus, ServiceJobStatus[]> = {
  'Draft': ['Quoted', 'Closed'],
  'Quoted': ['Approved', 'Draft', 'Closed'],
  'Approved': ['Materials Reserved', 'Closed'],
  'Materials Reserved': ['In Progress', 'Approved', 'Closed'],
  'In Progress': ['Quality Check', 'Completed', 'Materials Reserved', 'Closed'],
  'Quality Check': ['Completed', 'In Progress', 'Closed'],
  'Completed': ['Invoiced', 'In Progress'],
  'Invoiced': ['Closed', 'Completed'],
  'Closed': [],
};

export interface StatusTransitionResult {
  success: boolean;
  error?: string;
}

export interface JobCreationInput {
  variantId: string;
  variantName: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  customerId?: string;
  customerName?: string;
  quantity: number;
  priority?: ServiceJobPriority;
  sourceType?: ServiceJob['sourceType'];
  sourceId?: string;
  dueDate?: string;
  notes?: string;
  createdBy: string;
}

class ServiceJobService {
  // ─── Status machinery ───

  canTransition(from: ServiceJobStatus, to: ServiceJobStatus): StatusTransitionResult {
    const allowed = STATUS_TRANSITIONS[from];
    if (!allowed) {
      return { success: false, error: `Unknown status: ${from}` };
    }
    if (!allowed.includes(to)) {
      return {
        success: false,
        error: `Cannot transition from '${from}' to '${to}'. Allowed: ${allowed.join(', ') || 'none'}`,
      };
    }
    return { success: true };
  }

  async transitionStatus(jobId: string, newStatus: ServiceJobStatus): Promise<StatusTransitionResult> {
    const job = await this.getJob(jobId);
    if (!job) return { success: false, error: 'Job not found' };

    const validation = this.canTransition(job.status, newStatus);
    if (!validation.success) return validation;

    const now = new Date().toISOString();
    const patch: Partial<ServiceJob> = { status: newStatus, updatedAt: now };

    switch (newStatus) {
      case 'In Progress':
        if (!job.assignedEmployeeId) {
          return { success: false, error: 'Job must have an assigned employee before starting' };
        }
        break;
      case 'Completed':
        patch.completedAt = now;
        break;
    }

    const updated = { ...job, ...patch };

    // Auto-trigger: reserve materials when moving to 'Materials Reserved'
    if (newStatus === 'Materials Reserved' && !job.pricingSnapshot) {
      return { success: false, error: 'Pricing snapshot must exist before reserving materials' };
    }

    await this.saveJob(updated);

    return { success: true };
  }

  // ─── Create job with catalog integration ───

  async createJob(input: JobCreationInput): Promise<ServiceJob> {
    const now = new Date().toISOString();
    let recipe: ServiceRecipe | undefined;
    let pricingSnapshot: ServicePricingSnapshot | undefined;

    // 1. Load active recipe for cost structure
    try {
      recipe = await serviceRecipeService.getActiveRecipe(input.variantId);
    } catch { /* recipe is optional */ }

    // 2. Build pricing snapshot from centralized pricing services
    pricingSnapshot = await this.createPricingSnapshot(input, recipe);

    // 3. Build initial material entries from recipe
    const materials: ServiceMaterialConsumption[] = [];

    if (recipe) {
      const inventoryLines = recipe.lines.filter(l => l.resourceType === 'inventory');
      for (const line of inventoryLines) {
        materials.push({
          materialId: line.resourceId,
          materialName: line.resourceName,
          estimatedQuantity: line.quantity * (input.quantity || 1),
          actualQuantity: 0,
          unit: line.unit,
          unitCost: line.costPerUnit,
          estimatedCost: line.totalCost * (input.quantity || 1),
          actualCost: 0,
          variance: 0,
          state: 'Available',
        });
      }
    }

    const job: ServiceJob = {
      id: generateId(),
      jobNumber: generateJobNumber(),
      status: 'Draft',
      itemId: input.itemId,
      variantId: input.variantId,
      itemName: input.itemName,
      variantName: input.variantName,
      itemSku: input.itemSku,
      pricingSnapshot,
      materials,
      labor: [],
      machine: [],
      customerId: input.customerId,
      customerName: input.customerName,
      priority: input.priority || 'Normal',
      dueDate: input.dueDate,
      quantity: input.quantity || 1,
      createdAt: now,
      updatedAt: now,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      notes: input.notes,
    };

    await this.saveJob(job);
    return job;
  }

  // ─── Immutable Pricing Snapshot ───

  private async createPricingSnapshot(
    input: JobCreationInput,
    recipe?: ServiceRecipe,
  ): Promise<ServicePricingSnapshot> {
    const now = new Date().toISOString();
    let costPrice = 0;
    let sellingPrice = 0;
    let profitAmount = 0;
    let profitMargin = 0;
    let minimumMargin = 0;
    let pricingSource: ServicePricingSnapshot['pricingSource'] = 'manual';
    let recipeCostBreakdown = {
      totalMaterialCost: 0,
      totalLaborCost: 0,
      totalMachineCost: 0,
      totalOverheadCost: 0,
      totalCost: 0,
      lines: [] as ServicePricingSnapshot['recipeCostBreakdown']['lines'],
    };

    // Attempt to load pricing from centralized services
    try {
      const masterPricing = await getMasterPricingService();
      const inventory = await ensureInventoryCache();

      // Find the variant and item in inventory
      const item = inventory.find((i: any) => i.id === input.itemId);
      const variant = item?.variants?.find((v: any) => v.id === input.variantId);

      if (item && variant) {
        const result = await masterPricing.repriceVariant(item, variant, inventory, []);
        if (result) {
          costPrice = result.cost ?? result.costPrice ?? 0;
          sellingPrice = result.price ?? result.sellingPrice ?? 0;
          profitAmount = sellingPrice - costPrice;
          profitMargin = costPrice > 0 ? (profitAmount / costPrice) * 100 : 0;
          minimumMargin = variant.minimumMargin ?? item.minimumMargin ?? 0;
          pricingSource = result.pricingSource ?? 'smart_pricing';
        }
      }
    } catch { /* fall through */ }

    // Fallback: try direct pricing service
    if (costPrice === 0 && sellingPrice === 0) {
      try {
        const pricingService = await getPricingService();
        const inventory = await ensureInventoryCache();
        const item = inventory.find((i: any) => i.id === input.itemId);

        if (item) {
          const dynamicResult = await pricingService.calculateDynamicServicePrice(
            item, item.pages || 1, input.quantity || 1, inventory, [], []
          );
          if (dynamicResult) {
            costPrice = dynamicResult.totalCost ?? 0;
            sellingPrice = dynamicResult.totalPrice ?? 0;
            profitAmount = sellingPrice - costPrice;
            profitMargin = costPrice > 0 ? (profitAmount / costPrice) * 100 : 0;
            pricingSource = item.smartPricing?.bomTemplateId ? 'bom' : 'smart_pricing';
          }
        }
      } catch { /* fall through */ }
    }

    // Fallback: use recipe cost
    if (costPrice === 0 && recipe) {
      const costed = await serviceRecipeService.recalculateCosts(recipe);
      const totalCost = costed.totalCost * (input.quantity || 1);
      costPrice = totalCost;
      pricingSource = 'recipe';
      recipeCostBreakdown = {
        totalMaterialCost: costed.totalMaterialCost * (input.quantity || 1),
        totalLaborCost: costed.totalLaborCost * (input.quantity || 1),
        totalMachineCost: costed.totalMachineCost * (input.quantity || 1),
        totalOverheadCost: costed.totalOverheadCost * (input.quantity || 1),
        totalCost,
        lines: costed.lines.map(l => ({
          resourceId: l.resourceId,
          resourceName: l.resourceName,
          resourceType: l.resourceType,
          quantity: l.quantity * (input.quantity || 1),
          unitCost: l.costPerUnit,
          totalCost: l.totalCost * (input.quantity || 1),
        })),
      };
    }

    // Fallback: zero pricing
    return {
      id: generateId(),
      jobId: '',
      itemId: input.itemId,
      variantId: input.variantId,
      variantName: input.variantName,
      itemName: input.itemName,
      itemSku: input.itemSku,
      costPrice: Math.round(costPrice * 100) / 100,
      sellingPrice: Math.round(sellingPrice * 100) / 100,
      profitAmount: Math.round(profitAmount * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      minimumMargin,
      marginValidated: profitMargin >= minimumMargin,
      pricingSource,
      recipeCostBreakdown,
      createdAt: now,
    };
  }

  // ─── Material Reservation & Consumption ───

  async reserveMaterials(jobId: string): Promise<ServiceMaterialConsumption[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    if (job.status !== 'Approved' && job.status !== 'Materials Reserved') {
      throw new Error(`Cannot reserve materials in status '${job.status}'`);
    }

    const now = new Date().toISOString();
    const updatedMaterials = [...(job.materials || [])];
    const invService = await getInvService();
    const reservationService = await getReservationService();

    for (let i = 0; i < updatedMaterials.length; i++) {
      const mat = updatedMaterials[i];
      if (mat.state !== 'Available') continue;

      try {
        await reservationService.createReservations([{
          materialId: mat.materialId,
          warehouseId: '',
          quantity: mat.estimatedQuantity,
          workOrderId: job.id,
        }]);

        updatedMaterials[i] = {
          ...mat,
          state: 'Reserved',
          reservedAt: now,
        };
      } catch (err) {
        console.warn(`[ServiceJobService] Reservation failed for ${mat.materialName}:`, err);
      }
    }

    const updated = { ...job, materials: updatedMaterials, status: 'Materials Reserved' as ServiceJobStatus, updatedAt: now };
    await this.saveJob(updated);
    return updatedMaterials;
  }

  async consumeMaterials(jobId: string): Promise<ServiceMaterialConsumption[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    if (job.status !== 'Completed' && job.status !== 'Quality Check') {
      throw new Error(`Cannot consume materials in status '${job.status}'`);
    }

    const now = new Date().toISOString();
    const updatedMaterials = [...(job.materials || [])];
    const invService = await getInvService();

    for (let i = 0; i < updatedMaterials.length; i++) {
      const mat = updatedMaterials[i];
      if (mat.state === 'Consumed') continue;

      const actualQty = mat.actualQuantity > 0 ? mat.actualQuantity : mat.estimatedQuantity;
      const actualCost = mat.unitCost * actualQty;

      try {
        await invService.deductInventory({
          itemId: mat.materialId,
          warehouseId: '',
          quantity: actualQty,
          reason: `Service consumption: ${job.jobNumber} - ${job.variantName}`,
          reference: 'service_job',
          referenceId: job.id,
          performedBy: 'system',
        });

        updatedMaterials[i] = {
          ...mat,
          actualQuantity: actualQty,
          actualCost,
          variance: actualCost - mat.estimatedCost,
          state: 'Consumed',
          consumedAt: now,
        };
      } catch (err) {
        console.warn(`[ServiceJobService] Consumption failed for ${mat.materialName}:`, err);
      }
    }

    const updated = { ...job, materials: updatedMaterials, updatedAt: now };
    await this.saveJob(updated);
    return updatedMaterials;
  }

  async updateMaterialActual(jobId: string, materialId: string, actualQuantity: number): Promise<ServiceMaterialConsumption[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const updatedMaterials = (job.materials || []).map(mat => {
      if (mat.materialId !== materialId) return mat;
      const actualCost = mat.unitCost * actualQuantity;
      return {
        ...mat,
        actualQuantity,
        actualCost,
        variance: actualCost - mat.estimatedCost,
      };
    });

    const updated = { ...job, materials: updatedMaterials, updatedAt: new Date().toISOString() };
    await this.saveJob(updated);
    return updatedMaterials;
  }

  // ─── Labor Tracking ───

  async addLaborEntry(jobId: string, entry: ServiceLaborEntry): Promise<ServiceLaborEntry[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const newEntry: ServiceLaborEntry = {
      ...entry,
      id: generateId(),
      totalCost: entry.hoursWorked * entry.hourlyRate,
    };

    const updated = {
      ...job,
      labor: [...(job.labor || []), newEntry],
      updatedAt: new Date().toISOString(),
    };
    await this.saveJob(updated);
    return updated.labor;
  }

  async updateLaborEntry(jobId: string, entryId: string, patch: Partial<ServiceLaborEntry>): Promise<ServiceLaborEntry[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const updatedLabor = (job.labor || []).map(e => {
      if (e.id !== entryId) return e;
      const merged = { ...e, ...patch };
      merged.totalCost = merged.hoursWorked * merged.hourlyRate;
      return merged;
    });

    const updated = { ...job, labor: updatedLabor, updatedAt: new Date().toISOString() };
    await this.saveJob(updated);
    return updatedLabor;
  }

  async removeLaborEntry(jobId: string, entryId: string): Promise<ServiceLaborEntry[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const updatedLabor = (job.labor || []).filter(e => e.id !== entryId);
    const updated = { ...job, labor: updatedLabor, updatedAt: new Date().toISOString() };
    await this.saveJob(updated);
    return updatedLabor;
  }

  // ─── Machine Tracking ───

  async addMachineEntry(jobId: string, entry: ServiceMachineEntry): Promise<ServiceMachineEntry[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const runtimeMinutes = entry.endTime
      ? Math.round((new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000)
      : entry.runtimeMinutes;

    const newEntry: ServiceMachineEntry = {
      ...entry,
      id: generateId(),
      runtimeMinutes,
      operatingCost: (entry.costPerHour / 60) * runtimeMinutes,
    };

    const updated = {
      ...job,
      machine: [...(job.machine || []), newEntry],
      assignedMachineId: newEntry.machineId,
      assignedMachineName: newEntry.machineName,
      updatedAt: new Date().toISOString(),
    };
    await this.saveJob(updated);
    return updated.machine;
  }

  async updateMachineEntry(jobId: string, entryId: string, patch: Partial<ServiceMachineEntry>): Promise<ServiceMachineEntry[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const updatedMachine = (job.machine || []).map(e => {
      if (e.id !== entryId) return e;
      const merged = { ...e, ...patch };
      if (merged.endTime) {
        merged.runtimeMinutes = Math.round((new Date(merged.endTime).getTime() - new Date(merged.startTime).getTime()) / 60000);
      }
      merged.operatingCost = (merged.costPerHour / 60) * merged.runtimeMinutes;
      return merged;
    });

    const updated = { ...job, machine: updatedMachine, updatedAt: new Date().toISOString() };
    await this.saveJob(updated);
    return updatedMachine;
  }

  async removeMachineEntry(jobId: string, entryId: string): Promise<ServiceMachineEntry[]> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    const updatedMachine = (job.machine || []).filter(e => e.id !== entryId);
    const updated = { ...job, machine: updatedMachine, updatedAt: new Date().toISOString() };
    await this.saveJob(updated);
    return updatedMachine;
  }

  // ─── Completion Snapshot ───

  async completeJob(jobId: string, completedBy: string): Promise<ServiceJob> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    if (job.status !== 'Quality Check' && job.status !== 'Completed') {
      throw new Error(`Cannot complete job in status '${job.status}'`);
    }

    const now = new Date().toISOString();

    // Ensure materials are consumed
    const materials = await this.consumeMaterials(jobId);

    // Calculate actual costs
    const actualMaterialCost = materials.reduce((s, m) => s + (m.state === 'Consumed' ? m.actualCost : 0), 0);
    const actualLaborCost = (job.labor || []).reduce((s, l) => s + l.totalCost, 0);
    const actualMachineCost = (job.machine || []).reduce((s, m) => s + m.operatingCost, 0);
    const actualCostPrice = actualMaterialCost + actualLaborCost + actualMachineCost;

    // Estimated cost from pricing snapshot
    const estimatedCostPrice = job.pricingSnapshot?.costPrice ?? 0;
    const sellingPrice = job.pricingSnapshot?.sellingPrice ?? 0;
    const costVariance = actualCostPrice - estimatedCostPrice;
    const costVariancePercent = estimatedCostPrice > 0 ? (costVariance / estimatedCostPrice) * 100 : 0;
    const profitAmount = sellingPrice - actualCostPrice;
    const profitMargin = actualCostPrice > 0 ? (profitAmount / actualCostPrice) * 100 : 0;

    // Build immutable execution snapshot
    const executionSnapshot: ServiceExecutionSnapshot = {
      id: generateId(),
      jobId: job.id,
      materials: materials.filter(m => m.state === 'Consumed'),
      labor: [...(job.labor || [])],
      machine: [...(job.machine || [])],
      estimatedCostPrice,
      actualCostPrice,
      sellingPrice,
      profitAmount,
      profitMargin,
      costVariance,
      costVariancePercent,
      assignedEmployeeIds: job.assignedEmployeeId ? [job.assignedEmployeeId] : [],
      assignedEmployeeNames: job.assignedEmployeeName ? [job.assignedEmployeeName] : [],
      completedAt: now,
      completedBy,
    };

    const updated: ServiceJob = {
      ...job,
      status: 'Completed',
      materials,
      executionSnapshot,
      executionSnapshotId: executionSnapshot.id,
      completedAt: now,
      updatedAt: now,
    };

    await this.saveJob(updated);
    return updated;
  }

  // ─── Assignments ───

  async assignEmployee(jobId: string, employeeId: string, employeeName: string): Promise<ServiceJob | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const updated = {
      ...job,
      assignedEmployeeId: employeeId,
      assignedEmployeeName: employeeName,
      updatedAt: new Date().toISOString(),
    };
    await this.saveJob(updated);
    return updated;
  }

  async assignMachine(jobId: string, machineId: string, machineName: string): Promise<ServiceJob | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const updated = {
      ...job,
      assignedMachineId: machineId,
      assignedMachineName: machineName,
      updatedAt: new Date().toISOString(),
    };
    await this.saveJob(updated);
    return updated;
  }

  // ─── CRUD ───

  async getAllJobs(filters?: {
    status?: ServiceJobStatus;
    variantId?: string;
    itemId?: string;
    assignedEmployeeId?: string;
    assignedMachineId?: string;
    sourceId?: string;
  }): Promise<ServiceJob[]> {
    try {
      let jobs = await productionDb.serviceJobs.toArray() as ServiceJob[];
      return this.applyFilters(jobs, filters);
    } catch {
      let jobs = await dbService.getAll<ServiceJob>('serviceJobs');
      return this.applyFilters(jobs, filters);
    }
  }

  private applyFilters(jobs: ServiceJob[], filters?: Record<string, any>): ServiceJob[] {
    if (!filters) return jobs;
    let result = jobs;
    if (filters.status) result = result.filter(j => j.status === filters.status);
    if (filters.variantId) result = result.filter(j => j.variantId === filters.variantId);
    if (filters.itemId) result = result.filter(j => j.itemId === filters.itemId);
    if (filters.assignedEmployeeId) result = result.filter(j => j.assignedEmployeeId === filters.assignedEmployeeId);
    if (filters.assignedMachineId) result = result.filter(j => j.assignedMachineId === filters.assignedMachineId);
    if (filters.sourceId) result = result.filter(j => j.sourceId === filters.sourceId);
    return result;
  }

  async getJob(id: string): Promise<ServiceJob | undefined> {
    try { return await productionDb.serviceJobs.get(id); }
    catch { return dbService.get<ServiceJob>('serviceJobs', id); }
  }

  async saveJob(job: ServiceJob): Promise<void> {
    try { await productionDb.serviceJobs.put(job); }
    catch { await dbService.put('serviceJobs', job); }
  }

  async deleteJob(id: string): Promise<void> {
    try { await productionDb.serviceJobs.delete(id); }
    catch { await dbService.delete('serviceJobs', id); }
  }

  // ─── Metrics & Reporting ───

  async getServiceMetrics(): Promise<{
    activeJobs: number;
    pendingJobs: number;
    completedToday: number;
    overdueJobs: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    averageMargin: number;
    jobsByStatus: Record<string, number>;
  }> {
    const all = await this.getAllJobs();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const jobsByStatus: Record<string, number> = {};
    let activeJobs = 0;
    let pendingJobs = 0;
    let completedToday = 0;
    let overdueJobs = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfitSum = 0;
    let marginCount = 0;

    for (const job of all) {
      jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;

      const isTerminal = job.status === 'Closed' || job.status === 'Invoiced';
      const isActive = !isTerminal && job.status !== 'Completed';
      if (isActive) activeJobs++;
      if (job.status === 'Draft' || job.status === 'Quoted') pendingJobs++;

      if (job.completedAt && job.completedAt >= todayStart) completedToday++;

      if (!isTerminal && job.status !== 'Completed') {
        if (job.dueDate && job.dueDate < now.toISOString()) overdueJobs++;
      }

      const sp = job.executionSnapshot?.sellingPrice ?? job.pricingSnapshot?.sellingPrice ?? 0;
      const cp = job.executionSnapshot?.actualCostPrice ?? job.pricingSnapshot?.costPrice ?? 0;
      totalRevenue += sp;
      totalCost += cp;
      if (sp > 0 && cp > 0) {
        totalProfitSum += sp - cp;
        marginCount++;
      }
    }

    return {
      activeJobs,
      pendingJobs,
      completedToday,
      overdueJobs,
      totalRevenue,
      totalCost,
      totalProfit: totalProfitSum,
      averageMargin: marginCount > 0 ? totalProfitSum / marginCount : 0,
      jobsByStatus,
    };
  }

  async getJobsForReporting(dateFrom?: string, dateTo?: string): Promise<ServiceJob[]> {
    const all = await this.getAllJobs();
    return all.filter(j => {
      if (j.status !== 'Completed' && j.status !== 'Invoiced' && j.status !== 'Closed') return false;
      const completedAt = j.completedAt || j.updatedAt;
      if (dateFrom && completedAt < dateFrom) return false;
      if (dateTo && completedAt > dateTo) return false;
      return true;
    });
  }
}

export const serviceJobService = new ServiceJobService();
