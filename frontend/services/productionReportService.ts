/**
 * Production Report Service
 * 
 * Provides analytics and reporting for production operations.
 * Includes waste analysis, efficiency metrics, and cost reporting.
 */

import { WorkOrder, ConsumptionSnapshot, QACheck } from '../types';
import { dbService } from './db';
import { productionDb } from './productionDb';

const getWorkOrders = async (): Promise<WorkOrder[]> => {
  try { return await productionDb.workOrders.toArray(); } catch { return dbService.getAll<WorkOrder>('workOrders'); }
};

export interface WasteAnalysisReport {
  period: { start: string; end: string };
  summary: {
    totalWorkOrders: number;
    totalWasteSheets: number;
    totalWasteCost: number;
    averageWastePercentage: number;
  };
  byMaterial: {
    materialId: string;
    materialName: string;
    plannedQuantity: number;
    actualQuantity: number;
    wasteQuantity: number;
    wasteCost: number;
    wastePercentage: number;
  }[];
  byWorkOrder: {
    workOrderId: string;
    productName: string;
    plannedSheets: number;
    actualSheets: number;
    wasteSheets: number;
    wastePercentage: number;
    wasteReason?: string;
  }[];
  trends: {
    date: string;
    wasteSheets: number;
    wastePercentage: number;
  }[];
}

export interface EfficiencyReport {
  period: { start: string; end: string };
  summary: {
    totalWorkOrders: number;
    completedOnTime: number;
    completedLate: number;
    averageCompletionTime: number; // in hours
    onTimeRate: number;
  };
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  cycleTimeAnalysis: {
    averageScheduledToStart: number;
    averageStartToComplete: number;
    averageTotalCycle: number;
  };
  holdTimeAnalysis: {
    totalHoldIncidents: number;
    totalHoldHours: number;
    averageHoldDuration: number;
    topHoldReasons: { reason: string; count: number; totalHours: number }[];
  };
}

export interface CostAnalysisReport {
  period: { start: string; end: string };
  summary: {
    totalPlannedCost: number;
    totalActualCost: number;
    totalVariance: number;
    variancePercentage: number;
  };
  byCategory: {
    materials: { planned: number; actual: number; variance: number };
    labor: { planned: number; actual: number; variance: number };
    overhead: { planned: number; actual: number; variance: number };
  };
  byWorkOrder: {
    workOrderId: string;
    productName: string;
    plannedCost: number;
    actualCost: number;
    variance: number;
    variancePercentage: number;
  }[];
  topVariances: {
    workOrderId: string;
    productName: string;
    variance: number;
    reason?: string;
  }[];
}

export interface QAReport {
  period: { start: string; end: string };
  summary: {
    totalInspected: number;
    passed: number;
    failed: number;
    reworkRequired: number;
    passRate: number;
  };
  byCheck: {
    checkId: string;
    checkName: string;
    category: string;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }[];
  byInspector: {
    inspector: string;
    totalInspected: number;
    passed: number;
    failed: number;
    passRate: number;
  }[];
  failureAnalysis: {
    reason: string;
    count: number;
    workOrders: string[];
  }[];
}

export interface ProductionDashboardMetrics {
  activeWorkOrders: number;
  inQA: number;
  onHold: number;
  completedToday: number;
  averageEfficiency: number;
  wastePercentage: number;
  qaPassRate: number;
  upcomingDeadlines: {
    workOrderId: string;
    productName: string;
    dueDate: string;
    daysRemaining: number;
  }[];
}

class ProductionReportService {
  /**
   * Generate waste analysis report
   */
  async generateWasteReport(startDate: string, endDate: string): Promise<WasteAnalysisReport> {
    const workOrders = await getWorkOrders();
    const snapshots = await dbService.getAll<ConsumptionSnapshot>('consumptionSnapshots');
    
    const filteredWOs = workOrders.filter(wo => {
      const woDate = new Date(wo.date);
      return woDate >= new Date(startDate) && woDate <= new Date(endDate) && 
             (wo.status === 'Completed' || wo.status === 'QA');
    });
    
    // Calculate waste by material
    const materialMap = new Map<string, {
      materialId: string;
      materialName: string;
      plannedQuantity: number;
      actualQuantity: number;
      wasteQuantity: number;
      wasteCost: number;
    }>();
    
    // Calculate waste by work order
    const byWorkOrder = filteredWOs.map(wo => {
      const snapshot = wo.consumptionSnapshot;
      const plannedSheets = wo.attributes?.total_sheets || wo.quantityPlanned;
      const actualSheets = snapshot?.paperConsumed ? snapshot.paperConsumed * 500 : plannedSheets; // Convert reams to sheets
      const wasteSheets = wo.quantityWaste || 0;
      
      return {
        workOrderId: wo.id,
        productName: wo.productName,
        plannedSheets,
        actualSheets,
        wasteSheets,
        wastePercentage: plannedSheets > 0 ? (wasteSheets / plannedSheets) * 100 : 0,
        wasteReason: wo.wasteReason
      };
    });
    
    // Aggregate material data from snapshots
    filteredWOs.forEach(wo => {
      const snapshot = wo.consumptionSnapshot;
      if (snapshot?.bomBreakdown) {
        snapshot.bomBreakdown.forEach((item: any) => {
          const key = item.materialId;
          const existing = materialMap.get(key) || {
            materialId: item.materialId,
            materialName: item.materialName,
            plannedQuantity: 0,
            actualQuantity: 0,
            wasteQuantity: 0,
            wasteCost: 0
          };
          
          existing.actualQuantity += item.quantity || 0;
          existing.actualQuantity += item.quantity || 0;
          existing.wasteCost += item.cost || 0;
          
          materialMap.set(key, existing);
        });
      }
    });
    
    const byMaterial = Array.from(materialMap.values()).map(m => ({
      ...m,
      wastePercentage: m.plannedQuantity > 0 ? (m.wasteQuantity / m.plannedQuantity) * 100 : 0
    }));
    
    // Calculate trends (daily aggregation)
    const trendsMap = new Map<string, { wasteSheets: number; totalPlanned: number }>();
    byWorkOrder.forEach(wo => {
      const date = wo.workOrderId.split('-')[2] || new Date().toISOString().split('T')[0];
      const existing = trendsMap.get(date) || { wasteSheets: 0, totalPlanned: 0 };
      existing.wasteSheets += wo.wasteSheets;
      existing.totalPlanned += wo.plannedSheets;
      trendsMap.set(date, existing);
    });
    
    const trends = Array.from(trendsMap.entries()).map(([date, data]) => ({
      date,
      wasteSheets: data.wasteSheets,
      wastePercentage: data.totalPlanned > 0 ? (data.wasteSheets / data.totalPlanned) * 100 : 0
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    const totalWasteSheets = byWorkOrder.reduce((sum, wo) => sum + wo.wasteSheets, 0);
    const totalPlanned = byWorkOrder.reduce((sum, wo) => sum + wo.plannedSheets, 0);
    
    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalWorkOrders: filteredWOs.length,
        totalWasteSheets,
        totalWasteCost: byMaterial.reduce((sum, m) => sum + m.wasteCost, 0),
        averageWastePercentage: totalPlanned > 0 ? (totalWasteSheets / totalPlanned) * 100 : 0
      },
      byMaterial,
      byWorkOrder,
      trends
    };
  }
  
  /**
   * Generate efficiency report
   */
  async generateEfficiencyReport(startDate: string, endDate: string): Promise<EfficiencyReport> {
    const workOrders = await getWorkOrders();
    
    const filteredWOs = workOrders.filter(wo => {
      const woDate = new Date(wo.date);
      return woDate >= new Date(startDate) && woDate <= new Date(endDate);
    });
    
    // Status breakdown
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    
    filteredWOs.forEach(wo => {
      byStatus[wo.status] = (byStatus[wo.status] || 0) + 1;
      byPriority[wo.priority || 'Normal'] = (byPriority[wo.priority || 'Normal'] || 0) + 1;
    });
    
    // Completion analysis
    const completedWOs = filteredWOs.filter(wo => wo.status === 'Completed');
    let onTimeCount = 0;
    let totalCycleTime = 0;
    let scheduledToStartTime = 0;
    let startToCompleteTime = 0;
    
    completedWOs.forEach(wo => {
      const dueDate = new Date(wo.dueDate);
      const completedDate = wo.actualEndTime ? new Date(wo.actualEndTime) : new Date();
      
      if (completedDate <= dueDate) onTimeCount++;
      
      if (wo.actualStartTime && wo.actualEndTime) {
        const cycleTime = (new Date(wo.actualEndTime).getTime() - new Date(wo.actualStartTime).getTime()) / 3600000;
        startToCompleteTime += cycleTime;
        totalCycleTime += cycleTime;
      }
      
      if (wo.startDate && wo.actualStartTime) {
        const waitTime = (new Date(wo.actualStartTime).getTime() - new Date(wo.startDate).getTime()) / 3600000;
        scheduledToStartTime += waitTime;
      }
    });
    
    // Hold time analysis
    const holdIncidents = filteredWOs.filter(wo => wo.totalHoldTime && wo.totalHoldTime > 0);
    const totalHoldHours = holdIncidents.reduce((sum, wo) => sum + (wo.totalHoldTime || 0) / 60, 0);
    
    const holdReasons = new Map<string, { count: number; totalHours: number }>();
    holdIncidents.forEach(wo => {
      if (wo.holdReason) {
        const existing = holdReasons.get(wo.holdReason) || { count: 0, totalHours: 0 };
        existing.count++;
        existing.totalHours += (wo.totalHoldTime || 0) / 60;
        holdReasons.set(wo.holdReason, existing);
      }
    });
    
    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalWorkOrders: filteredWOs.length,
        completedOnTime: onTimeCount,
        completedLate: completedWOs.length - onTimeCount,
        averageCompletionTime: completedWOs.length > 0 ? totalCycleTime / completedWOs.length : 0,
        onTimeRate: completedWOs.length > 0 ? (onTimeCount / completedWOs.length) * 100 : 0
      },
      byStatus,
      byPriority,
      cycleTimeAnalysis: {
        averageScheduledToStart: completedWOs.length > 0 ? scheduledToStartTime / completedWOs.length : 0,
        averageStartToComplete: completedWOs.length > 0 ? startToCompleteTime / completedWOs.length : 0,
        averageTotalCycle: completedWOs.length > 0 ? totalCycleTime / completedWOs.length : 0
      },
      holdTimeAnalysis: {
        totalHoldIncidents: holdIncidents.length,
        totalHoldHours,
        averageHoldDuration: holdIncidents.length > 0 ? totalHoldHours / holdIncidents.length : 0,
        topHoldReasons: Array.from(holdReasons.entries())
          .map(([reason, data]) => ({ reason, count: data.count, totalHours: data.totalHours }))
          .sort((a, b) => b.count - a.count)
      }
    };
  }
  
  /**
   * Generate cost analysis report
   */
  async generateCostReport(startDate: string, endDate: string): Promise<CostAnalysisReport> {
    const workOrders = await getWorkOrders();
    
    const filteredWOs = workOrders.filter(wo => {
      const woDate = new Date(wo.date);
      return woDate >= new Date(startDate) && woDate <= new Date(endDate) &&
             (wo.status === 'Completed' || wo.status === 'QA');
    });
    
    let totalPlannedCost = 0;
    let totalActualCost = 0;
    
    const byWorkOrder = filteredWOs.map(wo => {
      const planned = wo.productionCostSnapshot?.baseProductionCost || 0;
      const actual = wo.productionCostSnapshot?.components.reduce((sum, c) => sum + c.totalCost, 0) || 0;
      const variance = actual - planned;
      
      totalPlannedCost += planned;
      totalActualCost += actual;
      
      return {
        workOrderId: wo.id,
        productName: wo.productName,
        plannedCost: planned,
        actualCost: actual,
        variance,
        variancePercentage: planned > 0 ? (variance / planned) * 100 : 0
      };
    });
    
    const topVariances = byWorkOrder
      .filter(wo => Math.abs(wo.variance) > 0)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 10);
    
    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalPlannedCost,
        totalActualCost,
        totalVariance: totalActualCost - totalPlannedCost,
        variancePercentage: totalPlannedCost > 0 ? ((totalActualCost - totalPlannedCost) / totalPlannedCost) * 100 : 0
      },
      byCategory: {
        materials: { planned: 0, actual: 0, variance: 0 }, // Would need detailed breakdown
        labor: { planned: 0, actual: 0, variance: 0 },
        overhead: { planned: 0, actual: 0, variance: 0 }
      },
      byWorkOrder,
      topVariances: topVariances.map(v => ({
        workOrderId: v.workOrderId,
        productName: v.productName,
        variance: v.variance,
        reason: undefined // Could be populated from notes
      }))
    };
  }
  
  /**
   * Generate QA report
   */
  async generateQAReport(startDate: string, endDate: string): Promise<QAReport> {
    const workOrders = await getWorkOrders();
    
    const filteredWOs = workOrders.filter(wo => {
      const woDate = new Date(wo.date);
      return woDate >= new Date(startDate) && woDate <= new Date(endDate) &&
             wo.qaStatus && wo.qaStatus !== 'Pending';
    });
    
    const passed = filteredWOs.filter(wo => wo.qaStatus === 'Passed').length;
    const failed = filteredWOs.filter(wo => wo.qaStatus === 'Failed').length;
    const rework = filteredWOs.filter(wo => wo.qaStatus === 'Rework Required').length;
    
    // Analyze QA checks
    const checkMap = new Map<string, { checkId: string; checkName: string; category: string; total: number; passed: number; failed: number }>();
    const inspectorMap = new Map<string, { inspector: string; total: number; passed: number; failed: number }>();
    
    filteredWOs.forEach(wo => {
      // Inspector stats
      if (wo.qaInspector) {
        const existing = inspectorMap.get(wo.qaInspector) || { inspector: wo.qaInspector, total: 0, passed: 0, failed: 0 };
        existing.total++;
        if (wo.qaStatus === 'Passed') existing.passed++;
        else if (wo.qaStatus === 'Failed') existing.failed++;
        inspectorMap.set(wo.qaInspector, existing);
      }
      
      // Check-level stats
      (wo.qaChecks || []).forEach((check: QACheck) => {
        const key = check.id;
        const existing = checkMap.get(key) || { checkId: check.id, checkName: check.name, category: check.category, total: 0, passed: 0, failed: 0 };
        existing.total++;
        if (check.status === 'Pass') existing.passed++;
        else if (check.status === 'Fail') existing.failed++;
        checkMap.set(key, existing);
      });
    });
    
    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalInspected: filteredWOs.length,
        passed,
        failed,
        reworkRequired: rework,
        passRate: filteredWOs.length > 0 ? (passed / filteredWOs.length) * 100 : 0
      },
      byCheck: Array.from(checkMap.values()).map(c => ({
        ...c,
        passRate: c.total > 0 ? (c.passed / c.total) * 100 : 0
      })),
      byInspector: Array.from(inspectorMap.values()).map(i => ({
        inspector: i.inspector,
        totalInspected: i.total,
        passed: i.passed,
        failed: i.failed,
        passRate: i.total > 0 ? (i.passed / i.total) * 100 : 0
      })),
      failureAnalysis: [] // Would need failure reason tracking
    };
  }
  
  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(): Promise<ProductionDashboardMetrics> {
    const workOrders = await getWorkOrders();
    
    const today = new Date().toISOString().split('T')[0];
    const activeStatuses = ['Scheduled', 'In Progress', 'On Hold', 'QA'];
    
    const activeWorkOrders = workOrders.filter(wo => activeStatuses.includes(wo.status)).length;
    const inQA = workOrders.filter(wo => wo.status === 'QA').length;
    const onHold = workOrders.filter(wo => wo.status === 'On Hold').length;
    const completedToday = workOrders.filter(wo => 
      wo.status === 'Completed' && wo.actualEndTime?.startsWith(today)
    ).length;
    
    // Calculate efficiency (completed on time / total completed)
    const completedWOs = workOrders.filter(wo => wo.status === 'Completed');
    const onTimeCount = completedWOs.filter(wo => {
      if (!wo.actualEndTime || !wo.dueDate) return false;
      return new Date(wo.actualEndTime) <= new Date(wo.dueDate);
    }).length;
    
    // Calculate waste percentage
    const wasteData = completedWOs.filter(wo => wo.quantityWaste !== undefined);
    const avgWaste = wasteData.length > 0 
      ? wasteData.reduce((sum, wo) => sum + (wo.quantityWaste || 0), 0) / wasteData.length 
      : 0;
    
    // QA pass rate
    const inspectedWOs = workOrders.filter(wo => wo.qaStatus && wo.qaStatus !== 'Pending');
    const qaPassed = inspectedWOs.filter(wo => wo.qaStatus === 'Passed').length;
    
    // Upcoming deadlines (next 7 days)
    const upcomingDeadlines = workOrders
      .filter(wo => activeStatuses.includes(wo.status))
      .map(wo => ({
        workOrderId: wo.id,
        productName: wo.productName,
        dueDate: wo.dueDate,
        daysRemaining: Math.ceil((new Date(wo.dueDate).getTime() - new Date().getTime()) / 86400000)
      }))
      .filter(wo => wo.daysRemaining >= 0 && wo.daysRemaining <= 7)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
    
    return {
      activeWorkOrders,
      inQA,
      onHold,
      completedToday,
      averageEfficiency: completedWOs.length > 0 ? (onTimeCount / completedWOs.length) * 100 : 0,
      wastePercentage: avgWaste,
      qaPassRate: inspectedWOs.length > 0 ? (qaPassed / inspectedWOs.length) * 100 : 0,
      upcomingDeadlines
    };
  }
}

export const productionReportService = new ProductionReportService();
export default productionReportService;
