import type { WorkOrder, BOMTemplate, BillOfMaterial } from '../types';
import { dbService } from './db';
import { productionDb } from './productionDb';
import { transactionService } from './transactionService';
import { bomService } from './bomService';
import { inventoryReservationService } from './inventoryTransactionService';
import { inventoryResourceService } from './inventoryResourceService';

export type OrderStatus = 'Draft' | 'Scheduled' | 'In Progress' | 'On Hold' | 'Completed' | 'Closed' | 'Cancelled';

export interface MaterialRequirement {
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  available: number;
  canFulfill: boolean;
}

export interface MaterialConsumption {
  materialId: string;
  quantity: number;
  cost: number;
}

export interface WorkOrderResult {
  success: boolean;
  workOrder?: WorkOrder;
  error?: string;
  materialRequirements?: MaterialRequirement[];
}

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'Draft': ['Scheduled', 'Cancelled'],
  'Scheduled': ['In Progress', 'Draft', 'Cancelled'],
  'In Progress': ['On Hold', 'Completed', 'Cancelled'],
  'On Hold': ['In Progress', 'Cancelled'],
  'Completed': ['Closed'],
  'Closed': [],
  'Cancelled': [],
};

const generateId = (): string =>
  'WO-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();

class ProductionService {
  // ─── CRUD ─────────────────────────────────────

  async getAllWorkOrders(): Promise<WorkOrder[]> {
    try {
      return await productionDb.workOrders.toArray() as WorkOrder[];
    } catch {
      return await dbService.getAll<WorkOrder>('workOrders');
    }
  }

  async getWorkOrder(id: string): Promise<WorkOrder | undefined> {
    try {
      return await productionDb.workOrders.get(id) as WorkOrder | undefined;
    } catch {
      return dbService.get<WorkOrder>('workOrders', id);
    }
  }

  async saveWorkOrder(wo: WorkOrder): Promise<WorkOrder> {
    const now = new Date().toISOString();
    const toSave = {
      ...wo,
      id: wo.id || generateId(),
      createdAt: wo.createdAt || now,
      updatedAt: now,
    };
    try {
      await productionDb.workOrders.put(toSave);
    } catch {
      await dbService.put('workOrders', toSave);
    }
    return toSave;
  }

  async deleteWorkOrder(id: string): Promise<void> {
    try {
      await productionDb.workOrders.delete(id);
    } catch {
      await dbService.delete('workOrders', id);
    }
  }

  // ─── BOM Explosion ────────────────────────────

  async calculateMaterialRequirements(
    productId: string,
    quantity: number,
    bomId?: string,
    attributes?: Record<string, any>,
  ): Promise<MaterialRequirement[]> {
    const boms = await bomService.getBOMs();
    const templates = await bomService.getBOMTemplates();
    const inventory = await dbService.getAll<any>('inventory');

    let bom: BillOfMaterial | undefined;
    let template: BOMTemplate | undefined;

    if (bomId) {
      bom = boms.find(b => b.id === bomId);
      template = templates.find(t => t.id === bomId);
    } else {
      bom = boms.find(b => b.productId === productId);
    }

    const components = bom?.components || template?.components || [];
    const requirements: MaterialRequirement[] = [];

    for (const comp of components) {
      const materialId = comp.materialId || comp.itemId || '';
      const material = inventory.find((i: any) => i.id === materialId);
      let unitQty = comp.quantity || 1;

      const formula = comp.formula || comp.quantityFormula;
      if (formula && attributes) {
        unitQty = bomService.resolveFormula(formula, { ...attributes, quantity });
      }

      const totalQty = unitQty * quantity;
      const available = material?.stock || 0;
      const unitCost = material?.normalizedCP ?? material?.costPrice ?? material?.cost ?? 0;

      requirements.push({
        materialId,
        materialName: material?.name || comp.name || 'Unknown',
        quantity: totalQty,
        unit: material?.unit || comp.unit || 'pcs',
        unitCost,
        available,
        canFulfill: available >= totalQty,
      });
    }

    return requirements;
  }

  // ─── Status Transitions ───────────────────────

  validateTransition(current: OrderStatus, next: OrderStatus): boolean {
    const allowed = VALID_TRANSITIONS[current];
    return allowed ? allowed.includes(next) : false;
  }

  async transitionStatus(id: string, newStatus: OrderStatus): Promise<WorkOrderResult> {
    const wo = await this.getWorkOrder(id);
    if (!wo) return { success: false, error: 'Work order not found' };

    const current = (wo.status || 'Draft') as OrderStatus;
    if (!this.validateTransition(current, newStatus)) {
      return { success: false, error: `Invalid transition: ${current} → ${newStatus}` };
    }

    const updated = { ...wo, status: newStatus, updatedAt: new Date().toISOString() };
    await this.saveWorkOrder(updated);
    return { success: true, workOrder: updated };
  }

  // ─── Lifecycle ────────────────────────────────

  async createWorkOrder(input: {
    productId: string;
    productName: string;
    quantityPlanned: number;
    bomId?: string;
    dueDate?: string;
    customerName?: string;
    attributes?: Record<string, any>;
    notes?: string;
  }): Promise<WorkOrderResult> {
    const requirements = await this.calculateMaterialRequirements(
      input.productId, input.quantityPlanned, input.bomId, input.attributes,
    );

    const allFulfilled = requirements.every(r => r.canFulfill);

    const wo: WorkOrder = {
      id: generateId(),
      productId: input.productId,
      productName: input.productName,
      quantityPlanned: input.quantityPlanned,
      quantityCompleted: 0,
      quantityWaste: 0,
      bomId: input.bomId || '',
      status: allFulfilled ? 'Scheduled' : 'Draft',
      dueDate: input.dueDate || new Date(Date.now() + 7 * 86400000).toISOString(),
      customerName: input.customerName || '',
      attributes: input.attributes || {},
      notes: input.notes || '',
      logs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.saveWorkOrder(wo);

    if (allFulfilled && requirements.length > 0) {
      await this.reserveMaterials(saved.id, requirements);
    }

    return {
      success: true,
      workOrder: saved,
      materialRequirements: requirements,
    };
  }

  async reserveMaterials(workOrderId: string, requirements: MaterialRequirement[]): Promise<void> {
    const requests = requirements.map(r => ({
      workOrderId,
      materialId: r.materialId,
      materialName: r.materialName,
      quantity: r.quantity,
      unitCost: r.unitCost,
    }));

    await inventoryReservationService.createReservations(requests);
  }

  async startWorkOrder(id: string): Promise<WorkOrderResult> {
    const wo = await this.getWorkOrder(id);
    if (!wo) return { success: false, error: 'Work order not found' };

    const current = (wo.status || 'Draft') as OrderStatus;
    if (!this.validateTransition(current, 'In Progress')) {
      return { success: false, error: `Cannot start: invalid transition from ${current}` };
    }

    const requirements = await this.calculateMaterialRequirements(
      wo.productId, wo.quantityPlanned, wo.bomId, wo.attributes,
    );

    const unfulfilled = requirements.filter(r => !r.canFulfill);
    if (unfulfilled.length > 0) {
      return {
        success: false,
        error: `Insufficient materials: ${unfulfilled.map(r => r.materialName).join(', ')}`,
        materialRequirements: requirements,
      };
    }

    await this.reserveMaterials(id, requirements);

    const updated = {
      ...wo,
      status: 'In Progress' as const,
      startDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveWorkOrder(updated);

    return { success: true, workOrder: updated, materialRequirements: requirements };
  }

  async recordMaterialConsumption(
    id: string,
    materialId: string,
    quantity: number,
  ): Promise<WorkOrderResult> {
    const wo = await this.getWorkOrder(id);
    if (!wo) return { success: false, error: 'Work order not found' };
    if (wo.status !== 'In Progress') {
      return { success: false, error: 'Work order must be In Progress to consume materials' };
    }

    const inventory = await dbService.getAll<any>('inventory');
    const material = inventory.find((i: any) => i.id === materialId);
    const cost = (material?.normalizedCP ?? material?.costPrice ?? material?.cost ?? 0) * quantity;

    await inventoryReservationService.consumeReservation(id, materialId, quantity);

    const updated = {
      ...wo,
      updatedAt: new Date().toISOString(),
    };
    await this.saveWorkOrder(updated);

    return { success: true, workOrder: updated };
  }

  async completeWorkOrder(
    id: string,
    actualWaste?: number,
  ): Promise<WorkOrderResult> {
    const wo = await this.getWorkOrder(id);
    if (!wo) return { success: false, error: 'Work order not found' };

    const current = (wo.status || 'Draft') as OrderStatus;
    if (!this.validateTransition(current, 'Completed')) {
      return { success: false, error: `Cannot complete: invalid transition from ${current}` };
    }

    const inventory = await dbService.getAll<any>('inventory');
    const product = inventory.find((i: any) => i.id === wo.productId);

    const requirements = await this.calculateMaterialRequirements(
      wo.productId, wo.quantityPlanned, wo.bomId, wo.attributes,
    );

    const consumedMaterials: MaterialConsumption[] = requirements.map(r => {
      const material = inventory.find((i: any) => i.id === r.materialId);
      const isPaper = material?.name?.toLowerCase().includes('paper');
      const actualQty = isPaper && actualWaste ? r.quantity + actualWaste : r.quantity;
      const unitCost = material?.normalizedCP ?? material?.costPrice ?? material?.cost ?? 0;
      return {
        materialId: r.materialId,
        quantity: actualQty,
        cost: actualQty * unitCost,
      };
    });

    for (const mat of consumedMaterials) {
      await inventoryReservationService.consumeReservation(id, mat.materialId, mat.quantity);
    }

    await transactionService.completeWorkOrder(id, consumedMaterials);

    const updatedWo = {
      ...wo,
      status: 'Completed' as const,
      quantityCompleted: wo.quantityPlanned,
      quantityWaste: actualWaste || 0,
      endDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveWorkOrder(updatedWo);

    return { success: true, workOrder: updatedWo };
  }

  async cancelWorkOrder(id: string): Promise<WorkOrderResult> {
    const wo = await this.getWorkOrder(id);
    if (!wo) return { success: false, error: 'Work order not found' };

    const current = (wo.status || 'Draft') as OrderStatus;
    if (!this.validateTransition(current, 'Cancelled')) {
      return { success: false, error: `Cannot cancel: invalid transition from ${current}` };
    }

    const requirements = await this.calculateMaterialRequirements(
      wo.productId, wo.quantityPlanned, wo.bomId, wo.attributes,
    );

    const reservations = requirements.map(r => ({
      materialId: r.materialId,
      quantity: r.quantity,
    }));

    await transactionService.cancelWorkOrder(id, reservations);

    const updated = {
      ...wo,
      status: 'Cancelled' as const,
      endDate: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.saveWorkOrder(updated);

    return { success: true, workOrder: updated };
  }
}

export const productionService = new ProductionService();
