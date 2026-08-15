import type {
  ServiceResource, ServiceResourceType, CapacitySnapshot, ServiceJob
} from '../types';
import { dbService } from './db';
import { productionDb } from './productionDb';

const generateId = (): string =>
  'SRC_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substring(2, 7).toUpperCase();

class ServiceResourceService {
  // ─── CRUD ─────────────────────────────────────

  async getAllResources(type?: ServiceResourceType, workCenterId?: string): Promise<ServiceResource[]> {
    try {
      let all = await productionDb.serviceResources.toArray() as ServiceResource[];
      if (type) all = all.filter(r => r.type === type);
      if (workCenterId) all = all.filter(r => r.workCenterId === workCenterId);
      return all;
    } catch {
      let all = await dbService.getAll<ServiceResource>('serviceResources');
      if (type) all = all.filter(r => r.type === type);
      if (workCenterId) all = all.filter(r => r.workCenterId === workCenterId);
      return all;
    }
  }

  async getResource(id: string): Promise<ServiceResource | undefined> {
    try { return await productionDb.serviceResources.get(id); }
    catch { return dbService.get<ServiceResource>('serviceResources', id); }
  }

  async saveResource(resource: ServiceResource): Promise<ServiceResource> {
    const now = new Date().toISOString();
    const toSave: ServiceResource = {
      ...resource,
      id: resource.id || generateId(),
      active: resource.active ?? true,
    };
    try { await productionDb.serviceResources.put(toSave); }
    catch { await dbService.put('serviceResources', toSave); }
    return toSave;
  }

  async deleteResource(id: string): Promise<void> {
    try { await productionDb.serviceResources.delete(id); }
    catch { await dbService.delete('serviceResources', id); }
  }

  // ─── Capacity Planning ────────────────────────

  /**
   * Calculate capacity snapshots for a set of resources.
   * Uses job assignments to compute used vs remaining capacity.
   */
  async calculateCapacity(
    resources: ServiceResource[],
    jobs: ServiceJob[],
    periodStart: string,
    periodEnd: string
  ): Promise<CapacitySnapshot[]> {
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    const periodHours = (end - start) / 3600000;

    return resources.map(resource => {
      let totalCapacity = 0;
      let usedCapacity = 0;

      if (resource.type === 'machine' && resource.capacityPerHour) {
        totalCapacity = resource.capacityPerHour * periodHours;
      } else if (resource.type === 'labor') {
        // Assume 8-hour workdays for labor
        const workDays = Math.max(1, periodHours / 8);
        totalCapacity = workDays * 8; // hours
      } else {
        totalCapacity = periodHours;
      }

      // Sum up job load for this resource
      for (const job of jobs) {
        if (['Closed', 'Cancelled', 'Delivered'].includes(job.status)) continue;

        const isAssigned =
          (resource.type === 'machine' && job.assignedMachineId === resource.id) ||
          (resource.type === 'labor' && job.assignedEmployeeId === resource.id);

        if (!isAssigned) continue;

        // Estimate load from recipe total cost (proxy for effort)
        const recipeLines = job.recipeSnapshot.filter(
          l => l.resourceId === resource.id || l.resourceType === resource.type
        );
        const lineLoad = recipeLines.reduce((sum, l) => sum + l.quantity * job.quantity, 0);
        usedCapacity += lineLoad;
      }

      const remainingCapacity = Math.max(0, totalCapacity - usedCapacity);

      return {
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.type,
        totalCapacity: Math.round(totalCapacity * 100) / 100,
        usedCapacity: Math.round(usedCapacity * 100) / 100,
        remainingCapacity: Math.round(remainingCapacity * 100) / 100,
        unit: resource.unit,
        periodStart,
        periodEnd,
      };
    });
  }

  /**
   * Get available time slots for a resource within a date range.
   */
  async getAvailableSlots(
    resourceId: string,
    date: string,
    jobs: ServiceJob[]
  ): Promise<{ start: string; end: string; available: boolean }[]> {
    const dayStart = new Date(date);
    dayStart.setHours(8, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(17, 0, 0, 0);

    const slots: { start: string; end: string; available: boolean }[] = [];
    const slotDuration = 60; // 1-hour slots

    let cursor = new Date(dayStart);
    while (cursor < dayEnd) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + slotDuration * 60000);

      // Check if any active job occupies this resource during this slot
      const conflicting = jobs.some(job => {
        if (['Closed', 'Cancelled', 'Delivered', 'Completed'].includes(job.status)) return false;
        const isAssigned =
          job.assignedMachineId === resourceId || job.assignedEmployeeId === resourceId;
        if (!isAssigned) return false;
        if (!job.scheduledDate) return false;
        const jobDate = new Date(job.scheduledDate).toDateString();
        return jobDate === cursor.toDateString();
      });

      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        available: !conflicting,
      });

      cursor = slotEnd;
    }

    return slots;
  }

  // ─── Resource Types ───────────────────────────

  async getResourcesByType(): Promise<Record<ServiceResourceType, ServiceResource[]>> {
    const all = await this.getAllResources();
    return {
      inventory: all.filter(r => r.type === 'inventory'),
      labor: all.filter(r => r.type === 'labor'),
      machine: all.filter(r => r.type === 'machine'),
      expense: all.filter(r => r.type === 'expense'),
      service: all.filter(r => r.type === 'service'),
    };
  }
}

export const serviceResourceService = new ServiceResourceService();
