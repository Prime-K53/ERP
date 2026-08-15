
import React, { createContext, useContext, useEffect } from 'react';
import { ProductionBatch, WorkOrder, WorkCenter, ProductionResource, ProductionLog, ResourceAllocation, BillOfMaterial, BOMComponent, MaintenanceLog, MaterialReservation, BOMTemplate, QACheck } from '../types';
import { useAuth } from './AuthContext';
import { useInventoryStore } from '../stores/inventoryStore';
import { useFinance } from './FinanceContext';
import { useProductionStore } from '../stores/productionStore';
import { roundFinancial } from '../utils/helpers';
import { bomService } from '../services/bomService';
import { transactionService } from '../services/transactionService';
import { inventoryReservationService, inventoryTransactionService } from '../services/inventoryTransactionService';
import { api } from '../services/api';
import { logger } from '../services/logger';

interface ProductionContextType {
    batches: ProductionBatch[];
    workOrders: WorkOrder[];
    workCenters: WorkCenter[];
    resources: ProductionResource[];
    allocations: ResourceAllocation[];
    maintenanceLogs: MaintenanceLog[];
    fetchProductionData: () => Promise<void>;

    createWorkOrder: (wo: WorkOrder) => void;
    updateWorkOrder: (wo: WorkOrder, reason?: string) => void;
    updateWorkOrderStatus: (id: string, status: WorkOrder['status']) => Promise<void>;
    logProductionStep: (log: ProductionLog & { materialId?: string, wasteDestroyed?: boolean }) => Promise<void>;
    completeWorkOrder: (id: string, actualWaste?: number) => Promise<void>;
    deleteWorkOrder: (id: string, reason?: string) => Promise<void>;
    produceBatch: (batch: ProductionBatch, components?: BOMComponent[]) => Promise<void>;
    addMaintenanceLog: (log: MaintenanceLog) => Promise<void>;
    deleteMaintenanceLog: (id: string) => Promise<void>;
    // Lifecycle Management
    putWorkOrderOnHold: (id: string, reason: string) => Promise<void>;
    resumeWorkOrder: (id: string) => Promise<void>;
    startWorkOrder: (id: string) => Promise<void>;
    updateProgress: (id: string, completed: number, notes?: string) => Promise<void>;
    addDependency: (workOrderId: string, dependsOnId: string) => Promise<void>;
    removeDependency: (workOrderId: string, dependsOnId: string) => Promise<void>;
    checkDependencies: (workOrderId: string) => { canStart: boolean; blocking: string[] };
    assignWorkOrder: (id: string, userId: string) => Promise<void>;
    // QA Workflow
    startQA: (id: string, inspector: string) => Promise<void>;
    submitQACheck: (workOrderId: string, checkId: string, status: 'Pass' | 'Fail' | 'N/A', notes?: string, actualValue?: number) => Promise<void>;
    completeQA: (id: string, finalStatus: 'Passed' | 'Failed' | 'Rework Required', notes?: string) => Promise<void>;
    getQATemplate: (productType: string) => Promise<QACheck[]>;
    allocateResource: (allocation: ResourceAllocation) => void;
    moveAllocation: (id: string, newStart: string, newEnd: string, resourceId: string) => void;
    removeAllocation: (id: string) => void;

    boms: BillOfMaterial[];
    addBOM: (bom: BillOfMaterial) => Promise<void>;
    updateBOM: (bom: BillOfMaterial) => Promise<void>;
    deleteBOM: (id: string) => Promise<void>;
}

const ProductionContext = createContext<ProductionContextType | undefined>(undefined);

export const ProductionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { notify, addAuditLog, user, isInitialized } = useAuth();
    const inventory = useInventoryStore(s => s.inventory);
    const { postJournalEntry } = useFinance();

    const {
        batches, workOrders, workCenters, resources, allocations, boms, maintenanceLogs,
        fetchProductionData,
        addBatch: storeAddBatch,
        addWorkOrder: storeAddWorkOrder, updateWorkOrder: storeUpdateWorkOrder, deleteWorkOrder: storeDeleteWorkOrder,
        addAllocation: storeAddAllocation, updateAllocation: storeUpdateAllocation, deleteAllocation: storeDeleteAllocation,
        addBOM, updateBOM, deleteBOM, addMaintenanceLog: storeAddMaintenanceLog, deleteMaintenanceLog: storeDeleteMaintenanceLog
    } = useProductionStore();

    useEffect(() => {
        if (!isInitialized) return;

        // Auth initialized, fetching production data
        fetchProductionData();
    }, [isInitialized]);

    // Listen for examination batch to production events
    useEffect(() => {
        if (typeof window === 'undefined') return;

 const handleExaminationBatchToProduction = async (event: CustomEvent) => {
            const { workOrder, batch } = event.detail;
            if (workOrder) {
                const exists = workOrders.some(wo => wo.id === workOrder.id);
                if (exists) {
                    logger.warn(`[Production] Skipping duplicate work order creation: ${workOrder.id}`);
                    return;
                }
                try {
                    await storeAddWorkOrder({ ...workOrder, source: 'examination' as const });
                    
                    // Clean up product name: replace "Unknown School" or "Unknown Customer" with actual customer name
                    let productName = workOrder.productName;
                    const customerName = batch?.schoolName 
                        || batch?.school_name 
                        || batch?.customer_name 
                        || batch?.customerName 
                        || workOrder.customerName;
                        
                    if (customerName) {
                        if (productName.includes('Unknown School')) {
                            productName = productName.replace('Unknown School', customerName);
                        }
                        if (productName.includes('Unknown Customer')) {
                            productName = productName.replace('Unknown Customer', customerName);
                        }
                    }
                    
                    notify(`Examination work order created: ${productName}`, 'success');
                    addAuditLog({
                        action: 'CREATE',
                        entityType: 'WorkOrder',
                        entityId: workOrder.id,
                        details: `Examination batch work order created: ${productName}`,
                        newValue: workOrder
                    });
                } catch (error) {
                    logger.error('[Production] Failed to create examination work order:', error);
                    notify('Failed to create examination work order', 'error');
                }
            }
        };

        window.addEventListener('examination-batch-to-production', handleExaminationBatchToProduction as EventListener);
        return () => {
            window.removeEventListener('examination-batch-to-production', handleExaminationBatchToProduction as EventListener);
        };
    }, [storeAddWorkOrder, notify, addAuditLog]);

    const createWorkOrder = async (wo: WorkOrder) => {
        try {
            let reservationRequests: { workOrderId: string; materialId: string; materialName: string; quantity: number; unitCost: number }[] = [];
            let materialReservations: MaterialReservation[] = [];

            // Find BOM for this work order to reserve materials
            if (wo.bomId) {
                // First, try to find a BOM instance
                const bom = await bomService.getBOMs().then(boms => boms.find(b => b.id === wo.bomId));

                if (bom && bom.components) {
                    // Create reservation requests from BOM instance
                    reservationRequests = bom.components.map(comp => {
                        const material = inventory.find(i => i.id === comp.materialId || i.id === comp.itemId);
                        return {
                            workOrderId: wo.id,
                            materialId: comp.materialId || comp.itemId || '',
                            materialName: material?.name || comp.name || 'Unknown Material',
                            quantity: comp.quantity * wo.quantityPlanned,
                            unitCost: material?.cost || 0
                        };
                    });

                    // Create MaterialReservation objects for work order
                    materialReservations = reservationRequests.map(req => ({
                        id: `RES-${req.workOrderId}-${req.materialId}`,
                        workOrderId: req.workOrderId,
                        materialId: req.materialId,
                        materialName: req.materialName,
                        quantityReserved: req.quantity,
                        quantityConsumed: 0,
                        unitCost: req.unitCost,
                        status: 'Reserved' as const,
                        reservedAt: new Date().toISOString()
                    }));
                } else {
                    // Try to find a BOM template (for examination printing)
                    const templates = await bomService.getBOMTemplates();
                    const template = templates.find(t => t.id === wo.bomId);

                    if (template && template.components) {
                        // Create reservations from BOM template
                        // Use attributes from work order for formula resolution
                        const attributes = wo.attributes || {};

                        reservationRequests = template.components.map(comp => {
                            const material = inventory.find(i => i.id === comp.itemId || i.name === comp.name);
                            let qty = 1;
                            const plannedTotalSheets = Number(attributes.total_sheets || 0);
                            const plannedTotalPages = Number(attributes.total_pages || (plannedTotalSheets * 2));

                            // Resolve formula if present
                            const f = comp.formula ?? comp.quantityFormula;
                            if (f) {
                                qty = bomService.resolveFormula(f, {
                                    ...attributes,
                                    total_pages: plannedTotalPages,
                                    quantity: wo.quantityPlanned
                                });
                            }

                            return {
                                workOrderId: wo.id,
                                materialId: comp.itemId,
                                materialName: material?.name || comp.name || 'Unknown Material',
                                quantity: qty,
                                unitCost: material?.cost || 0
                            };
                        });

                        // Create MaterialReservation objects for work order
                        materialReservations = reservationRequests.map(req => ({
                            id: `RES-${req.workOrderId}-${req.materialId}`,
                            workOrderId: req.workOrderId,
                            materialId: req.materialId,
                            materialName: req.materialName,
                            quantityReserved: req.quantity,
                            quantityConsumed: 0,
                            unitCost: req.unitCost,
                            status: 'Reserved' as const,
                            reservedAt: new Date().toISOString()
                        }));
                    }
                }
            }

            // Check availability and create reservations using the reservation service
            if (reservationRequests.length > 0) {
                const reservationResults = await inventoryReservationService.createReservations(reservationRequests);

                // Check if any reservations failed
                const failedReservations = reservationResults.filter(r => !r.success);
                if (failedReservations.length > 0) {
                    const errorMsg = failedReservations.map(r => r.error).join('; ');
                    notify(`Material reservation failed: ${errorMsg}`, 'error');
                    return; // Don't create work order if reservations fail
                }
            }

            // Create work order with material reservations attached
            // Note: inventoryReservationService.createReservations() above already handles
            // the reserved field update. We skip transactionService.processWorkOrderCreation()
            // to avoid double-reserving the same materials.
            const woWithReservations = {
                ...wo,
                materialReservations
            };
            await storeAddWorkOrder(woWithReservations as WorkOrder);

            // Refresh local state
            await fetchProductionData();

            addAuditLog({
                action: 'CREATE',
                entityType: 'WorkOrder',
                entityId: wo.id,
                details: `Initial release of Work Order ${wo.id} for ${wo.productName}. Materials reserved: ${materialReservations.length}`,
                newValue: woWithReservations
            });
            notify(`Work Order Created and Materials Reserved`, 'success');
        } catch (err: any) {
            notify(`Failed to create work order: ${err.message}`, 'error');
        }
    };

    const updateWorkOrder = (wo: WorkOrder, reason?: string) => {
        const oldVal = workOrders.find(w => w.id === wo.id);
        storeUpdateWorkOrder(wo);
        addAuditLog({
            action: 'UPDATE',
            entityType: 'WorkOrder',
            entityId: wo.id,
            details: `Modified Work Order ${wo.id} parameters. Status: ${wo.status}`,
            oldValue: oldVal,
            newValue: wo,
            reason: reason
        });
        notify(`Work Order Updated`, 'success');
    };

    const updateWorkOrderStatus = async (id: string, status: WorkOrder['status']) => {
        const wo = workOrders.find(w => w.id === id);
        if (wo) {
            const config = await transactionService.getCompanyConfig();
            const requireQA = config?.productionSettings?.requireQAApproval ?? false;

            if (status === 'Completed' && wo.status !== 'Completed') {
                if (requireQA && wo.status !== 'QA') {
                    // Redirect to QA instead of Completed if configured
                    status = 'QA';
                } else {
                    // Redirect to completeWorkOrder for atomic stock/ledger processing
                    await completeWorkOrder(id);
                    return;
                }
            }

            const oldVal = { ...wo };
            const newVal = { ...wo, status };
            storeUpdateWorkOrder(newVal);
            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `Work Order ${id} changed phase from ${wo.status} to ${status}`,
                oldValue: oldVal,
                newValue: newVal
            });
        }
    };

    const logProductionStep = async (log: ProductionLog & { materialId?: string, wasteDestroyed?: boolean }) => {
        const wo = workOrders.find(w => w.id === log.workOrderId);
        if (!wo) return;

        const config = await transactionService.getCompanyConfig();
        const allowOverproduction = config?.productionSettings?.allowOverproduction ?? true;

        const updatedLogs = [...(wo.logs || []), { ...log, id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` }];
        const qtyProcessed = log.qtyProcessed || 0;

        if (log.action === 'Complete' && !allowOverproduction) {
            if ((wo.quantityCompleted + qtyProcessed) > wo.quantityPlanned) {
                notify(`Overproduction not allowed. Maximum remaining: ${wo.quantityPlanned - wo.quantityCompleted}`, "error");
                return;
            }
        }

        const qtyCompleted = log.action === 'Complete' ? (wo.quantityCompleted + qtyProcessed) : wo.quantityCompleted;
        const qtyWaste = log.action === 'Log Waste' ? ((wo.quantityWaste || 0) + qtyProcessed) : (wo.quantityWaste || 0);

        // Atomic stock deduction for waste
        if (log.action === 'Log Waste' && log.materialId) {
            const material = inventory.find(i => i.id === log.materialId);
            const wasteQty = log.qtyProcessed || 0;
            const wasteCost = roundFinancial(wasteQty * (material?.cost || 0));

            try {
                await transactionService.processProductionWaste(
                    log.materialId,
                    wasteQty,
                    wasteCost,
                    `WASTE-${wo.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    `Production Waste: ${material?.name} (WO: ${wo.id})`
                );
            } catch (err: any) {
                notify(`Failed to log waste: ${err.message}`, 'error');
                return;
            }
        }

        storeUpdateWorkOrder({
            ...wo,
            logs: updatedLogs,
            quantityCompleted: qtyCompleted,
            quantityWaste: qtyWaste
        });
    };

    const completeWorkOrder = async (id: string, actualWaste?: number) => {
        const wo = workOrders.find(w => w.id === id);
        if (!wo) return;

        // Determine actual waste (from parameter or logs)
        let totalWaste = actualWaste || 0;
        if (!actualWaste) {
            totalWaste = wo.logs
                .filter(l => l.action === 'Log Waste')
                .reduce((sum, l) => sum + (l.qtyProcessed || 0), 0);
        }

        // Handle Examination Sync
        if (wo.id.startsWith('WO-EXAM-')) {
            try {
                const allExams = await api.production.getExaminations();
                const matchingExam = allExams.find((e: any) =>
                    e.status === 'pending' &&
                    wo.id === e.workOrderId
                );

                if (matchingExam) {
                    // Complete the exam subject in the Examination module
                    await api.production.completeExamSubject(matchingExam.id, totalWaste);
                }
            } catch (err) {
                logger.error("Failed to sync examination completion:", err);
            }
        }

        // Check if this results in adding stock
        try {
            let consumedMaterials: { materialId: string, quantity: number, cost: number }[] = [];
            let consumptionBreakdown: { materialId: string; materialName: string; plannedQty: number; actualQty: number; unitCost: number; variance: number }[] = [];

            // Find BOM for this work order
            const bom = await bomService.getBOMs().then(boms => boms.find(b => b.id === wo.bomId));
            const templates = await bomService.getBOMTemplates();
            const template = templates.find(t => t.id === wo.bomId);

            if (bom && bom.components) {
                // BOM instance path
                consumedMaterials = bom.components.map(comp => {
                    const material = inventory.find(i => i.id === comp.materialId || i.id === comp.itemId);
                    const plannedQty = comp.quantity * wo.quantityPlanned;
                    const actualQty = plannedQty + (comp.materialId?.toLowerCase().includes('paper') ? totalWaste : 0);
                    const unitCost = material?.cost || 0;
                    const variance = ((actualQty - plannedQty) / plannedQty) * 100;

                    // Track variance for alerts
                    consumptionBreakdown.push({
                        materialId: comp.materialId || comp.itemId || '',
                        materialName: material?.name || comp.name || 'Unknown',
                        plannedQty,
                        actualQty,
                        unitCost,
                        variance
                    });

                    return {
                        materialId: comp.materialId || comp.itemId || '',
                        quantity: actualQty,
                        cost: roundFinancial(actualQty * unitCost)
                    };
                });
            } else if (template && template.components) {
                // BOM template path (for examination printing)
                const attributes = wo.attributes || {};
                const isExamWorkOrder = wo.id.startsWith('WO-EXAM-');
                const plannedTotalSheets = Number(attributes.total_sheets || 0);
                const baseSheets = Number(attributes.base_sheets || 0);
                const actualTotalSheets = isExamWorkOrder
                    ? (baseSheets > 0 ? (baseSheets + totalWaste) : (plannedTotalSheets + totalWaste))
                    : plannedTotalSheets;
                const plannedTotalPages = Number(attributes.total_pages || (plannedTotalSheets * 2));
                const actualTotalPages = actualTotalSheets * 2;

                consumedMaterials = template.components.map(comp => {
                    const material = inventory.find(i => i.id === comp.itemId || i.name === comp.name);
                    let plannedQty = 1;
                    let actualQty = plannedQty;
                    const formula = comp.formula ?? comp.quantityFormula;

                    // Resolve formula if present
                    if (formula) {
                        const plannedContext = {
                            ...attributes,
                            total_pages: plannedTotalPages,
                            quantity: wo.quantityPlanned
                        };
                        plannedQty = bomService.resolveFormula(formula, plannedContext);

                        if (isExamWorkOrder) {
                            const actualContext = {
                                ...plannedContext,
                                total_sheets: actualTotalSheets,
                                total_pages: actualTotalPages
                            };
                            actualQty = bomService.resolveFormula(formula, actualContext);
                        } else {
                            actualQty = plannedQty;
                        }
                    } else {
                        actualQty = plannedQty;
                    }

                    // Add waste for paper materials
                    const isPaper = material?.name?.toLowerCase().includes('paper') ||
                        comp.name?.toLowerCase().includes('paper');

                    if (!formula) {
                        actualQty = isPaper ? plannedQty + totalWaste : plannedQty;
                    } else if (!isExamWorkOrder && isPaper) {
                        actualQty = plannedQty + totalWaste;
                    }

                    const unitCost = material?.cost || 0;
                    const variance = plannedQty > 0 ? ((actualQty - plannedQty) / plannedQty) * 100 : 0;

                    // Track variance for alerts
                    consumptionBreakdown.push({
                        materialId: comp.itemId,
                        materialName: material?.name || comp.name || 'Unknown',
                        plannedQty,
                        actualQty,
                        unitCost,
                        variance
                    });

                    return {
                        materialId: comp.itemId,
                        quantity: actualQty,
                        cost: roundFinancial(actualQty * unitCost)
                    };
                });
            }

            // Check for significant variances (>10%) and alert
            const significantVariances = consumptionBreakdown.filter(c => Math.abs(c.variance) > 10);
            if (significantVariances.length > 0) {
                const varianceMsg = significantVariances
                    .map(c => `${c.materialName}: ${c.variance > 0 ? '+' : ''}${c.variance.toFixed(1)}% (${c.plannedQty} → ${c.actualQty})`)
                    .join(', ');
                notify(`Consumption variance detected: ${varianceMsg}`, 'info');
            }

            // Consume reservations and deduct inventory
            for (const material of consumedMaterials) {
                await inventoryReservationService.consumeReservation(id, material.materialId, material.quantity);
            }

            const oldVal = { ...wo };
            await transactionService.completeWorkOrder(id, consumedMaterials);

            // Create consumption snapshot (as any to bypass strict type checking for extended snapshot)
            const consumptionSnapshot: any = {
                workOrderId: id,
                timestamp: new Date().toISOString(),
                totalPlannedCost: consumptionBreakdown.reduce((sum, c) => sum + (c.plannedQty * c.unitCost), 0),
                totalActualCost: consumptionBreakdown.reduce((sum, c) => sum + (c.actualQty * c.unitCost), 0),
                breakdown: consumptionBreakdown,
                wasteAmount: totalWaste
            };

            // Refresh local state
            await fetchProductionData();

            const newVal = {
                ...wo,
                status: 'Completed',
                quantityWaste: totalWaste,
                consumptionSnapshot
            } as WorkOrder;

            // Update work order with consumption data
            storeUpdateWorkOrder(newVal);

            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `Work Order ${id} completed. Materials consumed: ${consumedMaterials.length}. Variance alerts: ${significantVariances.length}`,
                oldValue: oldVal,
                newValue: newVal
            });

            notify(`Work Order ${id} finalized and stock updated.`, "success");
        } catch (err: any) {
            notify(`Failed to complete work order: ${err.message}`, "error");
        }
    };

    const deleteWorkOrder = async (id: string, reason?: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            // Release material reservations using actual reservation records (not re-read from BOM)
            if (wo.status !== 'Completed') {
                const releaseResults = await inventoryReservationService.releaseReservations(id);
                const releasedCount = releaseResults.filter(r => r.success).length;

                // Get actual reserved quantities from the reservation service
                const actualReservations = await inventoryReservationService.getReservationsForWorkOrder(id);
                const actualReservationQty = actualReservations.map((r: any) => ({
                    materialId: r.materialId,
                    quantity: r.quantityReserved - r.quantityConsumed
                }));

                await transactionService.cancelWorkOrder(id, actualReservationQty);
            }

            // Refresh production data
            await fetchProductionData();

            addAuditLog({
                action: 'DELETE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `Terminated Work Order ${id} for ${wo.productName}. Material reservations released.`,
                oldValue: wo,
                reason: reason
            });
            notify('Order cancelled and reservations released', 'info');
        } catch (err: any) {
            notify(`Failed to cancel order: ${err.message}`, 'error');
        }
    };

    const allocateResource = (a: ResourceAllocation) => {
        // VALIDATION: Check if resource is active
        const resource = resources.find(r => r.id === a.resourceId);
        if (!resource || resource.status !== 'Active') {
            notify(`Resource ${resource?.name || a.resourceId} is not available (Status: ${resource?.status || 'Unknown'})`, "error");
            return;
        }

        // VALIDATION: Check for overlaps
        const hasOverlap = allocations.some(existing => {
            if (existing.resourceId !== a.resourceId) return false;
            if (existing.id === a.id) return false;

            const start = new Date(a.startTime).getTime();
            const end = new Date(a.endTime).getTime();
            const exStart = new Date(existing.startTime).getTime();
            const exEnd = new Date(existing.endTime).getTime();

            return (start < exEnd && end > exStart);
        });

        if (hasOverlap) {
            notify("Resource is already booked for this time slot", "error");
            return;
        }

        const id = a.id || `ALC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        storeAddAllocation({ ...a, id });
        notify("Resource scheduled", "success");
    };

    const moveAllocation = (id: string, s: string, e: string, r: string) => {
        const alloc = allocations.find(a => a.id === id);
        if (alloc) {
            // VALIDATION: Check if target resource is active
            const resource = resources.find(res => res.id === r);
            if (!resource || resource.status !== 'Active') {
                notify(`Target resource ${resource?.name || r} is not available (Status: ${resource?.status || 'Unknown'})`, "error");
                return;
            }

            // VALIDATION: Check for overlaps in new position
            const hasOverlap = allocations.some(existing => {
                if (existing.resourceId !== r) return false;
                if (existing.id === id) return false;

                const start = new Date(s).getTime();
                const end = new Date(e).getTime();
                const exStart = new Date(existing.startTime).getTime();
                const exEnd = new Date(existing.endTime).getTime();

                return (start < exEnd && end > exStart);
            });

            if (hasOverlap) {
                notify("Cannot move: Resource overlap detected", "error");
                return;
            }

            storeUpdateAllocation({ ...alloc, startTime: s, endTime: e, resourceId: r });
        }
    };

    const removeAllocation = (id: string) => {
        storeDeleteAllocation(id);
    };

    // Lifecycle Management Functions
    const putWorkOrderOnHold = async (id: string, reason: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            if (wo.status === 'Completed' || wo.status === 'Cancelled') {
                notify('Cannot put completed or cancelled work orders on hold', 'error');
                return;
            }

            const updated: WorkOrder = {
                ...wo,
                status: 'On Hold',
                holdReason: reason,
                holdStartedAt: new Date().toISOString(),
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: id,
                    timestamp: new Date().toISOString(),
                    action: 'Put On Hold',
                    user: user?.username || 'system',
                    notes: reason
                }]
            };

            await storeUpdateWorkOrder(updated);

            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `Work Order ${id} put on hold. Reason: ${reason}`,
                oldValue: wo,
                newValue: updated
            });

            notify(`Work Order ${id} put on hold`, 'info');
        } catch (err: any) {
            notify(`Failed to put work order on hold: ${err.message}`, 'error');
        }
    };

    const resumeWorkOrder = async (id: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            if (wo.status !== 'On Hold') {
                notify('Work order is not on hold', 'error');
                return;
            }

            const holdEndedAt = new Date().toISOString();
            const holdStartedAt = wo.holdStartedAt ? new Date(wo.holdStartedAt) : new Date();
            const holdDuration = Math.round((new Date(holdEndedAt).getTime() - holdStartedAt.getTime()) / 60000);
            const totalHoldTime = (wo.totalHoldTime || 0) + holdDuration;

            const updated: WorkOrder = {
                ...wo,
                status: 'In Progress',
                holdEndedAt,
                totalHoldTime,
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: id,
                    timestamp: new Date().toISOString(),
                    action: 'Resumed',
                    user: user?.username || 'system',
                    notes: `Resumed after ${holdDuration} minutes on hold`
                }]
            };

            await storeUpdateWorkOrder(updated);

            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `Work Order ${id} resumed. Hold time: ${holdDuration} minutes. Total hold: ${totalHoldTime} minutes`,
                oldValue: wo,
                newValue: updated
            });

            notify(`Work Order ${id} resumed`, 'success');
        } catch (err: any) {
            notify(`Failed to resume work order: ${err.message}`, 'error');
        }
    };

    const startWorkOrder = async (id: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            if (wo.status !== 'Scheduled') {
                notify('Work order must be scheduled before starting', 'error');
                return;
            }

            // Check dependencies
            const depCheck = checkDependencies(id);
            if (!depCheck.canStart) {
                notify(`Cannot start: Blocked by ${depCheck.blocking.length} work order(s)`, 'error');
                return;
            }

            const updated: WorkOrder = {
                ...wo,
                status: 'In Progress',
                actualStartTime: new Date().toISOString(),
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: id,
                    timestamp: new Date().toISOString(),
                    action: 'Started',
                    user: user?.username || 'system'
                }]
            };

            await storeUpdateWorkOrder(updated);

            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `Work Order ${id} started`,
                oldValue: wo,
                newValue: updated
            });

            notify(`Work Order ${id} started`, 'success');
        } catch (err: any) {
            notify(`Failed to start work order: ${err.message}`, 'error');
        }
    };

    const updateProgress = async (id: string, completed: number, notes?: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            if (wo.status !== 'In Progress' && wo.status !== 'On Hold') {
                notify('Can only update progress for active work orders', 'error');
                return;
            }

            const progressPercentage = Math.min(100, Math.max(0, (completed / wo.quantityPlanned) * 100));

            const updated: WorkOrder = {
                ...wo,
                quantityCompleted: completed,
                progressPercentage,
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: id,
                    timestamp: new Date().toISOString(),
                    action: 'Progress Update',
                    user: user?.username || 'system',
                    qtyProcessed: completed,
                    notes
                }]
            };

            await storeUpdateWorkOrder(updated);

            notify(`Progress updated: ${progressPercentage.toFixed(1)}%`, 'success');
        } catch (err: any) {
            notify(`Failed to update progress: ${err.message}`, 'error');
        }
    };

    const addDependency = async (workOrderId: string, dependsOnId: string) => {
        try {
            const wo = workOrders.find(w => w.id === workOrderId);
            const dependsOn = workOrders.find(w => w.id === dependsOnId);

            if (!wo || !dependsOn) {
                notify('Work order not found', 'error');
                return;
            }

            if (workOrderId === dependsOnId) {
                notify('Cannot add dependency on self', 'error');
                return;
            }

            // Check for circular dependency
            if (dependsOn.dependencies?.includes(workOrderId)) {
                notify('Circular dependency detected', 'error');
                return;
            }

            const updatedWo: WorkOrder = {
                ...wo,
                dependencies: [...(wo.dependencies || []), dependsOnId]
            };

            const updatedDependsOn: WorkOrder = {
                ...dependsOn,
                dependents: [...(dependsOn.dependents || []), workOrderId]
            };

            await storeUpdateWorkOrder(updatedWo);
            await storeUpdateWorkOrder(updatedDependsOn);

            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: workOrderId,
                details: `Added dependency on ${dependsOnId}`,
                oldValue: wo,
                newValue: updatedWo
            });

            notify('Dependency added', 'success');
        } catch (err: any) {
            notify(`Failed to add dependency: ${err.message}`, 'error');
        }
    };

    const removeDependency = async (workOrderId: string, dependsOnId: string) => {
        try {
            const wo = workOrders.find(w => w.id === workOrderId);
            const dependsOn = workOrders.find(w => w.id === dependsOnId);

            if (!wo) return;

            const updatedWo: WorkOrder = {
                ...wo,
                dependencies: (wo.dependencies || []).filter(id => id !== dependsOnId)
            };

            await storeUpdateWorkOrder(updatedWo);

            if (dependsOn) {
                const updatedDependsOn: WorkOrder = {
                    ...dependsOn,
                    dependents: (dependsOn.dependents || []).filter(id => id !== workOrderId)
                };
                await storeUpdateWorkOrder(updatedDependsOn);
            }

            notify('Dependency removed', 'success');
        } catch (err: any) {
            notify(`Failed to remove dependency: ${err.message}`, 'error');
        }
    };

    const checkDependencies = (workOrderId: string): { canStart: boolean; blocking: string[] } => {
        const wo = workOrders.find(w => w.id === workOrderId);
        if (!wo || !wo.dependencies || wo.dependencies.length === 0) {
            return { canStart: true, blocking: [] };
        }

        const blocking = wo.dependencies.filter(depId => {
            const dep = workOrders.find(w => w.id === depId);
            return dep && dep.status !== 'Completed' && dep.status !== 'Cancelled';
        });

        return { canStart: blocking.length === 0, blocking };
    };

    const assignWorkOrder = async (id: string, userId: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            const updated: WorkOrder = {
                ...wo,
                assignedTo: userId,
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: id,
                    timestamp: new Date().toISOString(),
                    action: 'Assigned',
                    user: user?.username || 'system',
                    notes: `Assigned to ${userId}`
                }]
            };

            await storeUpdateWorkOrder(updated);

            notify('Work order assigned', 'success');
        } catch (err: any) {
            notify(`Failed to assign work order: ${err.message}`, 'error');
        }
    };

    // QA Workflow Functions
    const startQA = async (id: string, inspector: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            if (wo.status !== 'In Progress' && wo.status !== 'QA') {
                notify('Work order must be in progress before QA', 'error');
                return;
            }

            // Get default QA checks based on product type
            const defaultChecks = await getQATemplate(wo.productName);

            const updated: WorkOrder = {
                ...wo,
                status: 'QA',
                qaStatus: 'In Progress',
                qaInspector: inspector,
                qaChecks: defaultChecks.length > 0 ? defaultChecks : [
                    { id: 'QA-1', name: 'Visual Inspection', category: 'Visual', status: 'Pending' },
                    { id: 'QA-2', name: 'Quantity Check', category: 'Dimensional', status: 'Pending' },
                    { id: 'QA-3', name: 'Quality Standards', category: 'Functional', status: 'Pending' }
                ],
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: id,
                    timestamp: new Date().toISOString(),
                    action: 'QA Pass',
                    user: inspector,
                    notes: 'QA inspection started'
                }]
            };

            await storeUpdateWorkOrder(updated);

            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `QA started by ${inspector}`,
                oldValue: wo,
                newValue: updated
            });

            notify('QA inspection started', 'success');
        } catch (err: any) {
            notify(`Failed to start QA: ${err.message}`, 'error');
        }
    };

    const submitQACheck = async (workOrderId: string, checkId: string, status: 'Pass' | 'Fail' | 'N/A', notes?: string, actualValue?: number) => {
        try {
            const wo = workOrders.find(w => w.id === workOrderId);
            if (!wo) return;

            if (wo.status !== 'QA') {
                notify('Work order is not in QA status', 'error');
                return;
            }

            const updatedChecks = (wo.qaChecks || []).map(check =>
                check.id === checkId
                    ? { ...check, status, notes, actualValue, checkedAt: new Date().toISOString(), checkedBy: user?.username || 'system' }
                    : check
            );

            const updated: WorkOrder = {
                ...wo,
                qaChecks: updatedChecks,
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: workOrderId,
                    timestamp: new Date().toISOString(),
                    action: status === 'Fail' ? 'QA Fail' : 'QA Pass',
                    user: user?.username || 'system',
                    notes: `${checkId}: ${status}${notes ? ' - ' + notes : ''}`
                }]
            };

            await storeUpdateWorkOrder(updated);

            notify(`QA check ${(status || '').toLowerCase()}ed`, status === 'Fail' ? 'error' : 'success');
        } catch (err: any) {
            notify(`Failed to submit QA check: ${err.message}`, 'error');
        }
    };

    const completeQA = async (id: string, finalStatus: 'Passed' | 'Failed' | 'Rework Required', notes?: string) => {
        try {
            const wo = workOrders.find(w => w.id === id);
            if (!wo) return;

            if (wo.status !== 'QA') {
                notify('Work order is not in QA status', 'error');
                return;
            }

            const hasFailedChecks = (wo.qaChecks || []).some(c => c.status === 'Fail');

            if (finalStatus === 'Passed' && hasFailedChecks) {
                notify('Cannot pass QA with failed checks', 'error');
                return;
            }

            if (finalStatus === 'Passed') {
                // QA passed — consume materials and complete work order
                await completeWorkOrder(id);
                return;
            }

            // Failed or Rework Required — update status without consuming materials
            const updated: WorkOrder = {
                ...wo,
                qaStatus: finalStatus,
                qaNotes: notes,
                qaCompletedAt: new Date().toISOString(),
                status: finalStatus === 'Rework Required' ? 'In Progress' : 'QA',
                logs: [...wo.logs, {
                    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    workOrderId: id,
                    timestamp: new Date().toISOString(),
                    action: finalStatus === 'Failed' ? 'QA Fail' : 'QA Pass',
                    user: user?.username || 'system',
                    notes: `QA ${finalStatus}${notes ? ': ' + notes : ''}`
                }]
            };

            await storeUpdateWorkOrder(updated);

            addAuditLog({
                action: 'UPDATE',
                entityType: 'WorkOrder',
                entityId: id,
                details: `QA completed with status: ${finalStatus}`,
                oldValue: wo,
                newValue: updated
            });

            notify(`QA ${(finalStatus || '').toLowerCase()}`, finalStatus === 'Failed' ? 'error' : 'info');
        } catch (err: any) {
            notify(`Failed to complete QA: ${err.message}`, 'error');
        }
    };

    const getQATemplate = async (productType: string): Promise<QACheck[]> => {
        // Default QA checks for examination printing
        if ((productType || '').toLowerCase().includes('exam')) {
            return [
                { id: 'QA-EXAM-1', name: 'Print Quality', category: 'Visual', status: 'Pending', description: 'Check for smudges, clarity' },
                { id: 'QA-EXAM-2', name: 'Page Count', category: 'Dimensional', status: 'Pending', description: 'Verify correct number of pages' },
                { id: 'QA-EXAM-3', name: 'Paper Quality', category: 'Visual', status: 'Pending', description: 'Check paper type and condition' },
                { id: 'QA-EXAM-4', name: 'Binding', category: 'Functional', status: 'Pending', description: 'Check staple/binding quality' }
            ];
        }

        // Default checks for general products
        return [
            { id: 'QA-GEN-1', name: 'Visual Inspection', category: 'Visual', status: 'Pending' },
            { id: 'QA-GEN-2', name: 'Quantity Check', category: 'Dimensional', status: 'Pending' },
            { id: 'QA-GEN-3', name: 'Functionality Test', category: 'Functional', status: 'Pending' }
        ];
    };

    const produceBatch = async (batch: ProductionBatch, components?: BOMComponent[]) => {
        try {
            // Deduct raw materials from inventory
            if (components && components.length > 0) {
                for (const comp of components) {
                    const material = inventory.find(i => i.id === comp.itemId || i.id === comp.materialId);
                    if (!material) {
                        notify(`Material not found: ${comp.name}`, 'error');
                        continue;
                    }
                    const qty = comp.quantity * (batch.totalAmount || 1);
                    const deduction = await inventoryTransactionService.deductInventory({
                        itemId: comp.itemId || comp.materialId || '',
                        warehouseId: '',
                        quantity: qty,
                        reason: `Batch production: ${batch.name || batch.id}`,
                        reference: batch.id,
                        referenceId: batch.id,
                        performedBy: user?.username || 'system'
                    });
                    if (!deduction.success) {
                        notify(`Failed to deduct ${comp.name}: ${deduction.error}`, 'error');
                    }
                }
            }

            // Add finished goods to inventory
            const product = inventory.find(i =>
                i.id === batch.productId ||
                i.name === batch.productName
            );
            const qtyProduced = batch.quantityProduced || batch.totalAmount || 0;
            if (product && qtyProduced > 0) {
                await inventoryTransactionService.addInventory({
                    itemId: product.id,
                    warehouseId: '',
                    quantity: qtyProduced,
                    unitCost: batch.unitCost || 0,
                    reason: `Batch production output: ${batch.name || batch.id}`,
                    reference: batch.id,
                    referenceId: batch.id,
                    performedBy: user?.username || 'system'
                });
            }

            await storeAddBatch(batch);
            await fetchProductionData();
            notify(`Batch ${batch.id} completed`, 'success');
        } catch (err: any) {
            notify(`Failed to produce batch: ${err.message}`, 'error');
        }
    };

    const addMaintenanceLog = async (log: MaintenanceLog) => {
        await storeAddMaintenanceLog(log);
    };

    const deleteMaintenanceLog = async (id: string) => {
        await storeDeleteMaintenanceLog(id);
    };

    return (
        <ProductionContext.Provider value={{
            batches, workOrders, workCenters, resources, allocations, maintenanceLogs,
            fetchProductionData,
            createWorkOrder, updateWorkOrder, updateWorkOrderStatus, logProductionStep, completeWorkOrder, deleteWorkOrder,
            produceBatch,
            putWorkOrderOnHold, resumeWorkOrder, startWorkOrder, updateProgress,
            addDependency, removeDependency, checkDependencies, assignWorkOrder,
            startQA, submitQACheck, completeQA, getQATemplate,
            allocateResource, moveAllocation, removeAllocation,
            boms, addBOM, updateBOM, deleteBOM,
            addMaintenanceLog, deleteMaintenanceLog
        }}>
            {children}
        </ProductionContext.Provider>
    );
};

export const useProduction = () => {
    const context = useContext(ProductionContext);
    if (!context) throw new Error('useProduction must be used within ProductionProvider');
    return context;
};
