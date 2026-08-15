/**
 * Examination Analytics & Reporting Service
 * 
 * Provides comprehensive analytics for examination printing operations:
 * - Cost analysis by school, subject, period
 * - Production efficiency metrics
 * - Material consumption trends
 * - Comparative period analysis
 * - Export capabilities (PDF, CSV)
 */

import { ProductionCostSnapshot } from '../types';
import { logger } from '../services/logger';

interface ConsumptionSnapshot {
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

interface CostBySchool {
  schoolName: string;
  totalCost: number;
  totalSheets: number;
  examCount: number;
  avgCostPerSheet: number;
  paperCost: number;
  tonerCost: number;
  wasteCost: number;
}

interface CostBySubject {
  subject: string;
  totalCost: number;
  totalSheets: number;
  examCount: number;
  avgCostPerSheet: number;
}

interface CostByPeriod {
  period: string;
  periodType: 'day' | 'week' | 'month' | 'term';
  totalCost: number;
  totalSheets: number;
  examCount: number;
  avgCostPerSheet: number;
}

interface EfficiencyMetrics {
  totalExams: number;
  totalCandidates: number;
  totalSheets: number;
  totalPaperCost: number;
  totalTonerCost: number;
  totalWasteCost: number;
  totalProductionCost: number;
  averageWastePercent: number;
  averageCostPerSheet: number;
  averageCostPerCandidate: number;
  mostExpensiveSubject: string;
  mostEfficientSubject: string;
  topSchoolByVolume: string;
  topSchoolByCost: string;
}

interface TrendData {
  date: string;
  cost: number;
  sheets: number;
  exams: number;
}

interface comparisonResult {
  metric: string;
  currentPeriod: number;
  previousPeriod: number;
  absoluteChange: number;
  percentChange: number;
  trend: 'up' | 'down' | 'stable';
}

class ExaminationAnalyticsService {
  private readonly SNAPSHOTS_KEY = 'productionCostSnapshots';

  /**
   * Get all production snapshots
   */
  private getSnapshots(): ConsumptionSnapshot[] {
    try {
      const stored = localStorage.getItem(this.SNAPSHOTS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      logger.error('[ExaminationAnalytics] Error loading snapshots:', error);
    }
    return [];
  }

  /**
   * Filter snapshots by date range
   */
  private filterByDateRange(snapshots: ConsumptionSnapshot[], startDate?: string, endDate?: string): ConsumptionSnapshot[] {
    if (!startDate && !endDate) return snapshots;

    return snapshots.filter(s => {
      const timestamp = new Date(s.timestamp).getTime();
      const start = startDate ? new Date(startDate).getTime() : 0;
      const end = endDate ? new Date(endDate).getTime() : Infinity;
      return timestamp >= start && timestamp <= end;
    });
  }

  /**
   * Get cost breakdown by school
   */
  getCostBySchool(startDate?: string, endDate?: string): CostBySchool[] {
    const snapshots = this.filterByDateRange(this.getSnapshots(), startDate, endDate);
    const schoolMap = new Map<string, CostBySchool>();

    snapshots.forEach(s => {
      const key = s.schoolName?.toLowerCase() || 'unknown';
      const existing = schoolMap.get(key) || {
        schoolName: s.schoolName || 'Unknown',
        totalCost: 0,
        totalSheets: 0,
        examCount: 0,
        avgCostPerSheet: 0,
        paperCost: 0,
        tonerCost: 0,
        wasteCost: 0
      };

      existing.totalCost += s.totalProductionCost;
      existing.totalSheets += s.totalSheets;
      existing.examCount += 1;
      existing.paperCost += s.paperCost;
      existing.tonerCost += s.tonerCost;
      existing.wasteCost += s.wasteCost;

      schoolMap.set(key, existing);
    });

    // Calculate averages
    const result = Array.from(schoolMap.values()).map(s => ({
      ...s,
      avgCostPerSheet: s.totalSheets > 0 ? s.totalCost / s.totalSheets : 0
    }));

    return result.sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Get cost breakdown by subject
   */
  getCostBySubject(startDate?: string, endDate?: string): CostBySubject[] {
    const snapshots = this.filterByDateRange(this.getSnapshots(), startDate, endDate);
    const subjectMap = new Map<string, CostBySubject>();

    snapshots.forEach(s => {
      const key = s.subject?.toLowerCase() || 'unknown';
      const existing = subjectMap.get(key) || {
        subject: s.subject || 'Unknown',
        totalCost: 0,
        totalSheets: 0,
        examCount: 0,
        avgCostPerSheet: 0
      };

      existing.totalCost += s.totalProductionCost;
      existing.totalSheets += s.totalSheets;
      existing.examCount += 1;

      subjectMap.set(key, existing);
    });

    // Calculate averages
    const result = Array.from(subjectMap.values()).map(s => ({
      ...s,
      avgCostPerSheet: s.totalSheets > 0 ? s.totalCost / s.totalSheets : 0
    }));

    return result.sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Get cost breakdown by period
   */
  getCostByPeriod(
    startDate?: string,
    endDate?: string,
    periodType: 'day' | 'week' | 'month' | 'term' = 'month'
  ): CostByPeriod[] {
    const snapshots = this.filterByDateRange(this.getSnapshots(), startDate, endDate);
    const periodMap = new Map<string, CostByPeriod>();

    snapshots.forEach(s => {
      const date = new Date(s.timestamp);
      let periodKey: string;

      switch (periodType) {
        case 'day':
          periodKey = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'term':
          const term = this.getTerm(date);
          periodKey = `${date.getFullYear()}-${term}`;
          break;
        default:
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      const existing = periodMap.get(periodKey) || {
        period: periodKey,
        periodType,
        totalCost: 0,
        totalSheets: 0,
        examCount: 0,
        avgCostPerSheet: 0
      };

      existing.totalCost += s.totalProductionCost;
      existing.totalSheets += s.totalSheets;
      existing.examCount += 1;

      periodMap.set(periodKey, existing);
    });

    // Calculate averages and sort
    const result = Array.from(periodMap.values()).map(p => ({
      ...p,
      avgCostPerSheet: p.totalSheets > 0 ? p.totalCost / p.totalSheets : 0
    }));

    return result.sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Determine term from date (Malawi academic calendar)
   */
  private getTerm(date: Date): string {
    const month = date.getMonth();
    if (month >= 0 && month <= 3) return 'Term1';
    if (month >= 4 && month <= 7) return 'Term2';
    return 'Term3';
  }

  /**
   * Get comprehensive efficiency metrics
   */
  getEfficiencyMetrics(startDate?: string, endDate?: string): EfficiencyMetrics {
    const snapshots = this.filterByDateRange(this.getSnapshots(), startDate, endDate);

    if (snapshots.length === 0) {
      return {
        totalExams: 0,
        totalCandidates: 0,
        totalSheets: 0,
        totalPaperCost: 0,
        totalTonerCost: 0,
        totalWasteCost: 0,
        totalProductionCost: 0,
        averageWastePercent: 0,
        averageCostPerSheet: 0,
        averageCostPerCandidate: 0,
        mostExpensiveSubject: 'N/A',
        mostEfficientSubject: 'N/A',
        topSchoolByVolume: 'N/A',
        topSchoolByCost: 'N/A'
      };
    }

    const totals = snapshots.reduce((acc, s) => ({
      totalExams: acc.totalExams + 1,
      totalCandidates: acc.totalCandidates + s.candidateCount,
      totalSheets: acc.totalSheets + s.totalSheets,
      totalPaperCost: acc.totalPaperCost + s.paperCost,
      totalTonerCost: acc.totalTonerCost + s.tonerCost,
      totalWasteCost: acc.totalWasteCost + s.wasteCost,
      totalProductionCost: acc.totalProductionCost + s.totalProductionCost,
      totalWasteSheets: acc.totalWasteSheets + s.wasteSheets
    }), {
      totalExams: 0,
      totalCandidates: 0,
      totalSheets: 0,
      totalPaperCost: 0,
      totalTonerCost: 0,
      totalWasteCost: 0,
      totalProductionCost: 0,
      totalWasteSheets: 0
    });

    // Find most expensive and efficient subjects
    const bySubject = this.getCostBySubject(startDate, endDate);
    const mostExpensiveSubject = bySubject[0]?.subject || 'N/A';
    const mostEfficientSubject = bySubject[bySubject.length - 1]?.subject || 'N/A';

    // Find top schools
    const bySchool = this.getCostBySchool(startDate, endDate);
    const topSchoolByVolume = bySchool.sort((a, b) => b.totalSheets - a.totalSheets)[0]?.schoolName || 'N/A';
    const topSchoolByCost = bySchool[0]?.schoolName || 'N/A';

    return {
      ...totals,
      averageWastePercent: totals.totalSheets > 0 
        ? (totals.totalWasteSheets / totals.totalSheets) * 100 
        : 0,
      averageCostPerSheet: totals.totalSheets > 0 
        ? totals.totalProductionCost / totals.totalSheets 
        : 0,
      averageCostPerCandidate: totals.totalCandidates > 0 
        ? totals.totalProductionCost / totals.totalCandidates 
        : 0,
      mostExpensiveSubject,
      mostEfficientSubject,
      topSchoolByVolume,
      topSchoolByCost
    };
  }

  /**
   * Get trend data for charts
   */
  getTrendData(
    startDate?: string,
    endDate?: string,
    periodType: 'day' | 'week' | 'month' = 'week'
  ): TrendData[] {
    const snapshots = this.filterByDateRange(this.getSnapshots(), startDate, endDate);
    const trendMap = new Map<string, TrendData>();

    snapshots.forEach(s => {
      const date = new Date(s.timestamp);
      let periodKey: string;

      switch (periodType) {
        case 'day':
          periodKey = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          periodKey = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
        default:
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      const existing = trendMap.get(periodKey) || {
        date: periodKey,
        cost: 0,
        sheets: 0,
        exams: 0
      };

      existing.cost += s.totalProductionCost;
      existing.sheets += s.totalSheets;
      existing.exams += 1;

      trendMap.set(periodKey, existing);
    });

    return Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Compare current period with previous period
   */
  comparePeriods(
    currentStart: string,
    currentEnd: string,
    previousStart: string,
    previousEnd: string
  ): comparisonResult[] {
    const current = this.getEfficiencyMetrics(currentStart, currentEnd);
    const previous = this.getEfficiencyMetrics(previousStart, previousEnd);

    const metrics = [
      { name: 'Total Cost', current: current.totalProductionCost, previous: previous.totalProductionCost },
      { name: 'Total Sheets', current: current.totalSheets, previous: previous.totalSheets },
      { name: 'Exam Count', current: current.totalExams, previous: previous.totalExams },
      { name: 'Average Cost Per Sheet', current: current.averageCostPerSheet, previous: previous.averageCostPerSheet },
      { name: 'Waste Percentage', current: current.averageWastePercent, previous: previous.averageWastePercent }
    ];

    return metrics.map(m => {
      const absoluteChange = m.current - m.previous;
      const percentChange = m.previous !== 0 ? ((absoluteChange / m.previous) * 100) : 0;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      
      if (Math.abs(percentChange) > 1) {
        trend = percentChange > 0 ? 'up' : 'down';
      }

      return {
        metric: m.name,
        currentPeriod: m.current,
        previousPeriod: m.previous,
        absoluteChange,
        percentChange,
        trend
      };
    });
  }

  /**
   * Export analytics to CSV
   */
  exportToCSV(type: 'school' | 'subject' | 'period' | 'trends', startDate?: string, endDate?: string): string {
    let data: any[] = [];
    let headers: string[] = [];

    switch (type) {
      case 'school':
        const schoolData = this.getCostBySchool(startDate, endDate);
        headers = ['School', 'Total Cost', 'Total Sheets', 'Exam Count', 'Avg Cost/Sheet', 'Paper Cost', 'Toner Cost', 'Waste Cost'];
        data = schoolData.map(s => [
          `"${s.schoolName}"`,
          s.totalCost.toFixed(2),
          s.totalSheets,
          s.examCount,
          s.avgCostPerSheet.toFixed(4),
          s.paperCost.toFixed(2),
          s.tonerCost.toFixed(2),
          s.wasteCost.toFixed(2)
        ]);
        break;
      case 'subject':
        const subjectData = this.getCostBySubject(startDate, endDate);
        headers = ['Subject', 'Total Cost', 'Total Sheets', 'Exam Count', 'Avg Cost/Sheet'];
        data = subjectData.map(s => [
          `"${s.subject}"`,
          s.totalCost.toFixed(2),
          s.totalSheets,
          s.examCount,
          s.avgCostPerSheet.toFixed(4)
        ]);
        break;
      case 'period':
        const periodData = this.getCostByPeriod(startDate, endDate);
        headers = ['Period', 'Type', 'Total Cost', 'Total Sheets', 'Exam Count', 'Avg Cost/Sheet'];
        data = periodData.map(p => [
          p.period,
          p.periodType,
          p.totalCost.toFixed(2),
          p.totalSheets,
          p.examCount,
          p.avgCostPerSheet.toFixed(4)
        ]);
        break;
      case 'trends':
        const trendData = this.getTrendData(startDate, endDate);
        headers = ['Date', 'Cost', 'Sheets', 'Exams'];
        data = trendData.map(t => [
          t.date,
          t.cost.toFixed(2),
          t.sheets,
          t.exams
        ]);
        break;
    }

    return [headers.join(','), ...data.map(r => r.join(','))].join('\n');
  }

  /**
   * Generate summary report
   */
  generateReport(startDate?: string, endDate?: string): {
    period: { start: string; end: string };
    metrics: EfficiencyMetrics;
    bySchool: CostBySchool[];
    bySubject: CostBySubject[];
    generatedAt: string;
  } {
    const metrics = this.getEfficiencyMetrics(startDate, endDate);
    
    return {
      period: {
        start: startDate || 'All time',
        end: endDate || 'All time'
      },
      metrics,
      bySchool: this.getCostBySchool(startDate, endDate).slice(0, 10),
      bySubject: this.getCostBySubject(startDate, endDate).slice(0, 10),
      generatedAt: new Date().toISOString()
    };
  }
}

export const examinationAnalyticsService = new ExaminationAnalyticsService();
export default examinationAnalyticsService;
