export type ProductType = 'INVENTORY' | 'MANUFACTURED' | 'SERVICE';

export type ServiceResourceType = 'inventory' | 'labor' | 'machine' | 'expense' | 'service';

export interface ServiceResource {
  id: string;
  name: string;
  type: ServiceResourceType;
  unit: string;
  costPerUnit: number;
  category?: string;
  description?: string;
  active: boolean;
  capacityPerHour?: number;
  workCenterId?: string;
  employeeId?: string;
  skillLevel?: string;
  itemId?: string;
  variantId?: string;
  [key: string]: any;
}

export interface ServiceRecipeLine {
  id: string;
  recipeId: string;
  lineIndex: number;
  resourceType: ServiceResourceType;
  resourceId: string;
  resourceName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  formula?: string;
  notes?: string;
}

export type ServiceCostMethod = 'fixed' | 'material_based' | 'labor_based' | 'mixed';

export interface ServiceRecipe {
  id: string;
  variantId: string;
  version: number;
  name: string;
  active: boolean;
  costMethod: ServiceCostMethod;
  bomTemplateId?: string;
  lines: ServiceRecipeLine[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalMachineCost: number;
  totalOverheadCost: number;
  totalCost: number;
  lastCalculatedAt: string | null;
  lastCalculatedBy?: string;
  validFrom: string;
  validTo?: string;
  changeLog?: string;
  createdAt: string;
  updatedAt: string;
}

export type ServiceJobStatus =
  | 'Draft'
  | 'Quoted'
  | 'Approved'
  | 'Materials Reserved'
  | 'In Progress'
  | 'Quality Check'
  | 'Completed'
  | 'Invoiced'
  | 'Closed';

export type ServiceJobPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type MaterialState = 'Available' | 'Reserved' | 'Consumed';

export interface ServicePricingSnapshot {
  id: string;
  jobId: string;
  itemId: string;
  variantId: string;
  variantName: string;
  itemName: string;
  itemSku: string;
  costPrice: number;
  sellingPrice: number;
  profitAmount: number;
  profitMargin: number;
  minimumMargin: number;
  marginValidated: boolean;
  pricingSource: 'recipe' | 'bom' | 'smart_pricing' | 'manual' | 'static';
  recipeCostBreakdown: {
    totalMaterialCost: number;
    totalLaborCost: number;
    totalMachineCost: number;
    totalOverheadCost: number;
    totalCost: number;
    lines: Array<{
      resourceId: string;
      resourceName: string;
      resourceType: ServiceResourceType;
      quantity: number;
      unitCost: number;
      totalCost: number;
    }>;
  };
  serviceRecipeId?: string;
  serviceRecipeVersion?: number;
  pricingVersion?: number;
  createdAt: string;
}

export interface ServiceMaterialConsumption {
  id?: string;
  materialId: string;
  materialName: string;
  materialSku?: string;
  estimatedQuantity: number;
  actualQuantity: number;
  unit: string;
  unitCost: number;
  estimatedCost: number;
  actualCost: number;
  variance: number;
  state: MaterialState;
  reservedAt?: string;
  consumedAt?: string;
}

export interface ServiceLaborEntry {
  id?: string;
  employeeId: string;
  employeeName: string;
  hoursWorked: number;
  hourlyRate: number;
  totalCost: number;
  startedAt?: string;
  endedAt?: string;
}

export interface ServiceMachineEntry {
  id?: string;
  machineId: string;
  machineName: string;
  startTime: string;
  endTime?: string;
  runtimeMinutes: number;
  costPerHour: number;
  operatingCost: number;
}

export interface ServiceExecutionSnapshot {
  id: string;
  jobId: string;
  materials: ServiceMaterialConsumption[];
  labor: ServiceLaborEntry[];
  machine: ServiceMachineEntry[];
  estimatedCostPrice: number;
  actualCostPrice: number;
  sellingPrice: number;
  profitAmount: number;
  profitMargin: number;
  costVariance: number;
  costVariancePercent: number;
  assignedEmployeeIds: string[];
  assignedEmployeeNames: string[];
  completedAt: string;
  completedBy: string;
}

export interface ServiceJob {
  id: string;
  jobNumber: string;
  status: ServiceJobStatus;
  itemId: string;
  variantId: string;
  itemName: string;
  variantName: string;
  itemSku: string;
  pricingSnapshot?: ServicePricingSnapshot;
  pricingSnapshotId?: string;
  materials: ServiceMaterialConsumption[];
  labor: ServiceLaborEntry[];
  machine: ServiceMachineEntry[];
  executionSnapshot?: ServiceExecutionSnapshot;
  executionSnapshotId?: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedMachineId?: string;
  assignedMachineName?: string;
  customerId?: string;
  customerName?: string;
  priority: ServiceJobPriority;
  dueDate?: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  notes?: string;
  sourceId?: string;
  sourceType?: 'sales_order' | 'quotation' | 'direct' | 'recurring';
  tags?: string[];
  [key: string]: any;
}

export interface ServiceConsumptionRecord {
  id: string;
  jobId: string;
  lineId: string;
  resourceId: string;
  resourceName: string;
  resourceType: ServiceResourceType;
  plannedQuantity: number;
  actualQuantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  inventoryTransactionId?: string;
  consumedAt: string;
}

export interface CapacitySnapshot {
  resourceId: string;
  resourceName: string;
  resourceType: ServiceResourceType;
  totalCapacity: number;
  usedCapacity: number;
  remainingCapacity: number;
  unit: string;
  periodStart: string;
  periodEnd: string;
}

export interface ServiceMetrics {
  activeJobs: number;
  pendingJobs: number;
  completedToday: number;
  overdueJobs: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageMargin: number;
  jobsByStatus: Record<ServiceJobStatus, number>;
}
