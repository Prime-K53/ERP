/**
 * Production Cost Snapshot Service
 * 
 * Persists production cost snapshots at the time of examination completion
 * to enable accurate historical costing and reporting
 */

import { ProductionCostSnapshot } from '../types';
import { logger } from '../services/logger';
import { dbService } from './db';

export interface ConsumptionSnapshot {
  id: string;
  examId: string;
  subject: string;
  schoolName: string;
  class: string;
  candidateCount: number;
  totalSheets: number;
  paperCost: number;
  tonerCost: number;
  wasteSheets: number;
  wasteCost: number;
  totalProductionCost: number;
  costPerSheet: number;
  timestamp: string;
  performedBy: string;
  snapshot: ProductionCostSnapshot;
}

class ProductionCostSnapshotService {
  private readonly STORAGE_KEY = 'productionCostSnapshots';

  /**
   * Save a production cost snapshot for an exam
   */
  async saveSnapshot(
    examId: string,
    snapshot: ProductionCostSnapshot,
    examDetails: {
      subject: string;
      schoolName: string;
      class: string;
      candidateCount: number;
      totalSheets: number;
      wasteSheets: number;
    },
    performedBy: string
  ): Promise<ConsumptionSnapshot> {
    // Extract costs from components
    const paperComponent = snapshot.components?.find(c =>
      c.name?.toLowerCase()?.includes('paper')
    );
    const tonerComponent = snapshot.components?.find(c =>
      c.name?.toLowerCase()?.includes('toner') || c.name?.toLowerCase()?.includes('ink')
    );

    const paperCost = paperComponent?.totalCost || 0;
    const tonerCost = tonerComponent?.totalCost || 0;
    const wasteCost = (examDetails.wasteSheets * (paperComponent?.unitCost || 0)) || 0;
    const totalProductionCost = snapshot.baseProductionCost || (paperCost + tonerCost + wasteCost);

    const consumptionSnapshot: ConsumptionSnapshot = {
      id: `SNAP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      examId,
      subject: examDetails.subject,
      schoolName: examDetails.schoolName,
      class: examDetails.class,
      candidateCount: examDetails.candidateCount,
      totalSheets: examDetails.totalSheets,
      paperCost,
      tonerCost,
      wasteSheets: examDetails.wasteSheets,
      wasteCost,
      totalProductionCost,
      costPerSheet: examDetails.totalSheets > 0 ? totalProductionCost / examDetails.totalSheets : 0,
      timestamp: new Date().toISOString(),
      performedBy,
      snapshot
    };

    // Get existing snapshots
    const existing = await this.getAllSnapshots();
    existing.push(consumptionSnapshot);

    // Save via cloud-synced settings store
    await dbService.saveSetting(this.STORAGE_KEY, existing);

    return consumptionSnapshot;
  }

  /**
   * Get all production cost snapshots
   */
  async getAllSnapshots(): Promise<ConsumptionSnapshot[]> {
    try {
      const saved = await dbService.getSetting<ConsumptionSnapshot[]>(this.STORAGE_KEY);
      if (saved && saved.length > 0) return saved;
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      logger.error('[ProductionCostSnapshotService] Error loading snapshots:', error);
    }
    return [];
  }

  /**
   * Get snapshots for a specific exam
   */
  async getSnapshotsForExam(examId: string): Promise<ConsumptionSnapshot[]> {
    const all = await this.getAllSnapshots();
    return all.filter(s => s.examId === examId);
  }

  /**
   * Get snapshots for a specific school
   */
  async getSnapshotsForSchool(schoolName: string): Promise<ConsumptionSnapshot[]> {
    const all = await this.getAllSnapshots();
    return all.filter(s =>
      s.schoolName?.toLowerCase() === schoolName?.toLowerCase()
    );
  }

  /**
   * Get snapshots within a date range
   */
  async getSnapshotsByDateRange(startDate: string, endDate: string): Promise<ConsumptionSnapshot[]> {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const all = await this.getAllSnapshots();

    return all.filter(s => {
      const snapshotDate = new Date(s.timestamp).getTime();
      return snapshotDate >= start && snapshotDate <= end;
    });
  }

  /**
   * Get total production costs for a period
   */
  async getTotalCosts(startDate?: string, endDate?: string): Promise<{
    totalPaperCost: number;
    totalTonerCost: number;
    totalWasteCost: number;
    totalProductionCost: number;
    totalSheets: number;
    averageCostPerSheet: number;
  }> {
    let snapshots = await this.getAllSnapshots();

    if (startDate && endDate) {
      snapshots = await this.getSnapshotsByDateRange(startDate, endDate);
    }

    const totals = snapshots.reduce((acc, s) => ({
      totalPaperCost: acc.totalPaperCost + s.paperCost,
      totalTonerCost: acc.totalTonerCost + s.tonerCost,
      totalWasteCost: acc.totalWasteCost + s.wasteCost,
      totalProductionCost: acc.totalProductionCost + s.totalProductionCost,
      totalSheets: acc.totalSheets + s.totalSheets
    }), {
      totalPaperCost: 0,
      totalTonerCost: 0,
      totalWasteCost: 0,
      totalProductionCost: 0,
      totalSheets: 0
    });

    return {
      ...totals,
      averageCostPerSheet: totals.totalSheets > 0
        ? totals.totalProductionCost / totals.totalSheets
        : 0
    };
  }

  /**
   * Get cost breakdown by school
   */
  async getCostsBySchool(startDate?: string, endDate?: string): Promise<Array<{
    schoolName: string;
    totalCost: number;
    totalSheets: number;
    examCount: number;
  }>> {
    let snapshots = await this.getAllSnapshots();

    if (startDate && endDate) {
      snapshots = await this.getSnapshotsByDateRange(startDate, endDate);
    }

    const schoolMap = new Map<string, {
      schoolName: string;
      totalCost: number;
      totalSheets: number;
      examCount: number;
    }>();

    snapshots.forEach(s => {
      const key = s.schoolName?.toLowerCase() || 'unknown';
      const existing = schoolMap.get(key) || {
        schoolName: s.schoolName,
        totalCost: 0,
        totalSheets: 0,
        examCount: 0
      };

      existing.totalCost += s.totalProductionCost;
      existing.totalSheets += s.totalSheets;
      existing.examCount += 1;

      schoolMap.set(key, existing);
    });

    return Array.from(schoolMap.values()).sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Clear all snapshots (for testing/reset)
   */
  async clearAllSnapshots(): Promise<void> {
    await dbService.saveSetting(this.STORAGE_KEY, []);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Export snapshots to CSV
   */
  async exportToCSV(snapshots?: ConsumptionSnapshot[]): Promise<string> {
    const data = snapshots || await this.getAllSnapshots();

    const headers = [
      'ID', 'Exam ID', 'Subject', 'School', 'Class', 'Candidates',
      'Total Sheets', 'Paper Cost', 'Toner Cost', 'Waste Sheets', 'Waste Cost',
      'Total Cost', 'Cost Per Sheet', 'Performed By', 'Timestamp'
    ];

    const rows = data.map(s => [
      s.id,
      s.examId,
      `"${s.subject}"`,
      `"${s.schoolName}"`,
      s.class,
      s.candidateCount,
      s.totalSheets,
      s.paperCost.toFixed(2),
      s.tonerCost.toFixed(2),
      s.wasteSheets,
      s.wasteCost.toFixed(2),
      s.totalProductionCost.toFixed(2),
      s.costPerSheet.toFixed(4),
      s.performedBy,
      s.timestamp
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

export const productionCostSnapshotService = new ProductionCostSnapshotService();
export default productionCostSnapshotService;
