/**
 * Report Service for Prime ERP
 * Handles report definition management, generation, and execution
 */

import {
  ReportDefinition,
  ReportResult,
  ReportRow,
  ReportColumn,
  ReportFilter,
  ReportGrouping,
  ReportSorting,
  ReportChart,
  ReportParameter,
  ReportSchedule,
  ReportSavedView,
  ReportDashboard,
  ReportWidget,
  AggregationType,
  FilterOperator,
  ExportFormat,
  ReportCategory,
  ReportType,
  DEFAULT_REPORT_DEFINITIONS,
} from '../types/reports';
import { logger } from './logger';
import { dbService } from './db';
import { extractProfitMargin } from '@/utils/financial/extractors';



// Storage keys
const REPORT_DEFINITIONS_KEY = 'nexus_report_definitions';
const REPORT_SCHEDULES_KEY = 'nexus_report_schedules';
const REPORT_SAVED_VIEWS_KEY = 'nexus_report_saved_views';
const REPORT_DASHBOARDS_KEY = 'nexus_report_dashboards';
const REPORT_HISTORY_KEY = 'nexus_report_history';

class ReportService {
  private definitions: Map<string, ReportDefinition> = new Map();
  private schedules: Map<string, ReportSchedule> = new Map();
  private savedViews: Map<string, ReportSavedView> = new Map();
  private dashboards: Map<string, ReportDashboard> = new Map();
  private reportHistory: Map<string, ReportResult> = new Map();
  private initialized: boolean = false;
  private scheduleInterval: ReturnType<typeof setTimeout> | null = null;

  private async loadStoredArray<T>(key: string): Promise<T[]> {
    const stored = await dbService.getSetting<T[]>(key);
    return Array.isArray(stored) ? stored : [];
  }

  private async saveStoredArray<T>(key: string, value: T[]): Promise<void> {
    await dbService.saveSetting(key, value);
  }

  /**
   * Initialize the report service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadDefinitions();
      await this.loadSchedules();
      await this.loadSavedViews();
      await this.loadDashboards();
      await this.loadHistory();
      
      // Initialize default reports if none exist
      if (this.definitions.size === 0) {
        await this.initializeDefaultReports();
      }
      
      this.initialized = true;
      
      // Start schedule checker
      this.startScheduleChecker();
      
      logger.info('Report service initialized', {
        definitions: this.definitions.size,
        schedules: this.schedules.size,
        dashboards: this.dashboards.size,
      });
    } catch (error) {
      logger.error('Failed to initialize report service', error as Error);
      throw error;
    }
  }

  /**
   * Load definitions from storage
   */
  private async loadDefinitions(): Promise<void> {
    try {
      const definitions = await this.loadStoredArray<ReportDefinition>(REPORT_DEFINITIONS_KEY);
      definitions.forEach(def => this.definitions.set(def.id, def));
    } catch (error) {
      logger.error('Failed to load report definitions', error as Error);
    }
  }

  /**
   * Save definitions to storage
   */
  private async saveDefinitions(): Promise<void> {
    try {
      const definitions = Array.from(this.definitions.values());
      await this.saveStoredArray(REPORT_DEFINITIONS_KEY, definitions);
    } catch (error) {
      logger.error('Failed to save report definitions', error as Error);
    }
  }

  /**
   * Load schedules from storage
   */
  private async loadSchedules(): Promise<void> {
    try {
      const schedules = await this.loadStoredArray<ReportSchedule>(REPORT_SCHEDULES_KEY);
      schedules.forEach(sched => this.schedules.set(sched.id, sched));
    } catch (error) {
      logger.error('Failed to load report schedules', error as Error);
    }
  }

  /**
   * Save schedules to storage
   */
  private async saveSchedules(): Promise<void> {
    try {
      const schedules = Array.from(this.schedules.values());
      await this.saveStoredArray(REPORT_SCHEDULES_KEY, schedules);
    } catch (error) {
      logger.error('Failed to save report schedules', error as Error);
    }
  }

  /**
   * Load saved views from storage
   */
  private async loadSavedViews(): Promise<void> {
    try {
      const views = await this.loadStoredArray<ReportSavedView>(REPORT_SAVED_VIEWS_KEY);
      views.forEach(view => this.savedViews.set(view.id, view));
    } catch (error) {
      logger.error('Failed to load saved views', error as Error);
    }
  }

  /**
   * Save views to storage
   */
  private async saveSavedViews(): Promise<void> {
    try {
      const views = Array.from(this.savedViews.values());
      await this.saveStoredArray(REPORT_SAVED_VIEWS_KEY, views);
    } catch (error) {
      logger.error('Failed to save saved views', error as Error);
    }
  }

  /**
   * Load dashboards from storage
   */
  private async loadDashboards(): Promise<void> {
    try {
      const dashboards = await this.loadStoredArray<ReportDashboard>(REPORT_DASHBOARDS_KEY);
      dashboards.forEach(dash => this.dashboards.set(dash.id, dash));
    } catch (error) {
      logger.error('Failed to load report dashboards', error as Error);
    }
  }

  /**
   * Save dashboards to storage
   */
  private async saveDashboards(): Promise<void> {
    try {
      const dashboards = Array.from(this.dashboards.values());
      await this.saveStoredArray(REPORT_DASHBOARDS_KEY, dashboards);
    } catch (error) {
      logger.error('Failed to save report dashboards', error as Error);
    }
  }

  /**
   * Load history from storage
   */
  private async loadHistory(): Promise<void> {
    try {
      const history = await this.loadStoredArray<ReportResult>(REPORT_HISTORY_KEY);
      history.forEach(result => this.reportHistory.set(result.id, result));
    } catch (error) {
      logger.error('Failed to load report history', error as Error);
    }
  }

  /**
   * Save history to storage
   */
  private async saveHistory(): Promise<void> {
    try {
      const history = Array.from(this.reportHistory.values());
      // Keep only last 100 reports
      const trimmed = history.slice(-100);
      await this.saveStoredArray(REPORT_HISTORY_KEY, trimmed);
    } catch (error) {
      logger.error('Failed to save report history', error as Error);
    }
  }

  /**
   * Initialize default reports
   */
  private async initializeDefaultReports(): Promise<void> {
    for (const reportDef of DEFAULT_REPORT_DEFINITIONS) {
      const definition: ReportDefinition = {
        ...reportDef,
        id: `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        isPublic: true,
        allowedRoles: ['Admin', 'Accountant', 'Manager'],
      } as ReportDefinition;
      
      this.definitions.set(definition.id, definition);
    }
    await this.saveDefinitions();
  }

  /**
   * Start schedule checker
   */
  private startScheduleChecker(): void {
    // Check every minute for scheduled reports
    this.scheduleInterval = setInterval(() => {
      this.checkScheduledReports().catch(err => {
        logger.error('Schedule check failed', err as Error);
      });
    }, 60 * 1000);
  }

  /**
   * Stop schedule checker
   */
  stopScheduleChecker(): void {
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = null;
    }
  }

  // ==================== DEFINITION MANAGEMENT ====================

  /**
   * Create a new report definition
   */
  async createDefinition(
    definition: Omit<ReportDefinition, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<ReportDefinition> {
    const newDefinition: ReportDefinition = {
      ...definition,
      id: `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      version: 1,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.validateDefinition(newDefinition);
    this.definitions.set(newDefinition.id, newDefinition);
    await this.saveDefinitions();

    logger.info('Report definition created', { id: newDefinition.id, name: newDefinition.name });
    return newDefinition;
  }

  /**
   * Update a report definition
   */
  async updateDefinition(
    id: string,
    updates: Partial<ReportDefinition>,
    userId: string
  ): Promise<ReportDefinition> {
    const existing = this.definitions.get(id);
    if (!existing) {
      throw new Error(`Report definition not found: ${id}`);
    }

    const updated: ReportDefinition = {
      ...existing,
      ...updates,
      id: existing.id,
      version: existing.version + 1,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    this.validateDefinition(updated);
    this.definitions.set(id, updated);
    await this.saveDefinitions();

    logger.info('Report definition updated', { id, version: updated.version });
    return updated;
  }

  /**
   * Delete a report definition
   */
  async deleteDefinition(id: string): Promise<void> {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`Report definition not found: ${id}`);
    }

    this.definitions.delete(id);
    await this.saveDefinitions();

    logger.info('Report definition deleted', { id });
  }

  /**
   * Get a report definition
   */
  getDefinition(id: string): ReportDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Get all report definitions
   */
  getDefinitions(category?: ReportCategory): ReportDefinition[] {
    const definitions = Array.from(this.definitions.values());
    if (category) {
      return definitions.filter(def => def.category === category);
    }
    return definitions;
  }

  /**
   * Get definitions by type
   */
  getDefinitionsByType(type: ReportType): ReportDefinition[] {
    return Array.from(this.definitions.values()).filter(def => def.type === type);
  }

  /**
   * Search definitions
   */
  searchDefinitions(query: string): ReportDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.definitions.values()).filter(def =>
      def.name.toLowerCase().includes(lowerQuery) ||
      def.description?.toLowerCase().includes(lowerQuery) ||
      def.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Validate a report definition
   */
  private validateDefinition(definition: ReportDefinition): void {
    if (!definition.name || definition.name.trim().length === 0) {
      throw new Error('Report definition must have a name');
    }
    if (!definition.dataSource) {
      throw new Error('Report definition must have a data source');
    }
    if (!definition.columns || definition.columns.length === 0) {
      throw new Error('Report definition must have at least one column');
    }
  }

  // ==================== REPORT EXECUTION ====================

  /**
   * Execute a report
   */
  async executeReport(
    definitionId: string,
    parameters?: Record<string, any>,
    userId?: string
  ): Promise<ReportResult> {
    const definition = this.definitions.get(definitionId);
    if (!definition) {
      throw new Error(`Report definition not found: ${definitionId}`);
    }

    const startTime = Date.now();

    try {
      // Get data from data source
      const rawData = await this.fetchData(definition.dataSource, definition.filters, parameters);

      // Apply filters
      const filteredData = this.applyFilters(rawData, definition.filters, parameters);

      // Apply sorting
      const sortedData = this.applySorting(filteredData, definition.sortBy);

      // Apply grouping
      const { groupedData, flatData } = this.applyGrouping(sortedData, definition.groupBy);

      // Calculate aggregations
      const summary = this.calculateSummary(flatData, definition.columns);

      // Generate chart data
      const chartData = this.generateChartData(flatData, definition.charts);

      // Apply pagination
      const page = parameters?._page || 1;
      const pageSize = parameters?._pageSize || definition.pageSize || 50;
      const paginatedData = this.applyPagination(flatData, page, pageSize);

      const result: ReportResult = {
        id: `RPT-RESULT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        reportDefinitionId: definitionId,
        reportName: definition.name,
        rows: paginatedData,
        columns: definition.columns.filter(c => !c.hidden),
        summary,
        groupedData,
        chartData,
        generatedAt: new Date(),
        generatedBy: userId || 'system',
        parameters,
        executionTimeMs: Date.now() - startTime,
        totalRows: flatData.length,
        page,
        pageSize,
        totalPages: Math.ceil(flatData.length / pageSize),
      };

      // Save to history
      this.reportHistory.set(result.id, result);
      await this.saveHistory();

      logger.info('Report executed', {
        definitionId,
        resultId: result.id,
        rows: result.totalRows,
        executionTime: result.executionTimeMs,
      });

      return result;
    } catch (error) {
      logger.error('Report execution failed', error as Error, { definitionId });
      throw error;
    }
  }

  /**
   * Fetch data from data source
   */
  private async fetchData(
    dataSource: string,
    filters: ReportFilter[],
    parameters?: Record<string, any>
  ): Promise<ReportRow[]> {
    // Map data source to storage store
    const storeMapping: Record<string, string> = {
      ledger: 'ledger',
      invoices: 'invoices',
      inventory: 'inventory',
      sales: 'sales',
      purchases: 'purchases',
      customers: 'customers',
      suppliers: 'suppliers',
      expenses: 'expenses',
      income: 'income',
      employees: 'employees',
      payroll: 'payrollRuns',
      workOrders: 'workOrders',
      bankTransactions: 'bankTransactions',
    };

    const storeName = storeMapping[dataSource];
    if (!storeName) {
      throw new Error(`Unknown data source: ${dataSource}`);
    }

    try {
      const data = await dbService.getAll(storeName);
      return data as ReportRow[];
    } catch (error) {
      logger.error('Failed to fetch data', error as Error, { dataSource });
      return [];
    }
  }

  /**
   * Apply filters to data
   */
  private applyFilters(
    data: ReportRow[],
    filters: ReportFilter[],
    parameters?: Record<string, any>
  ): ReportRow[] {
    if (!filters || filters.length === 0) return data;

    return data.filter(row => {
      return filters.every(filter => {
        // Skip parameter filters without values
        if (filter.isParameter) {
          const paramValue = parameters?.[filter.field];
          if (paramValue === undefined || paramValue === null) {
            return true; // Skip this filter
          }
          return this.evaluateFilter({ ...filter, value: paramValue }, row);
        }
        return this.evaluateFilter(filter, row);
      });
    });
  }

  /**
   * Evaluate a single filter
   */
  private evaluateFilter(filter: ReportFilter, row: ReportRow): boolean {
    const value = row[filter.field];
    const filterValue = filter.value;

    switch (filter.operator) {
      case 'equals':
        return value === filterValue;
      case 'not_equals':
        return value !== filterValue;
      case 'contains':
        return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'not_contains':
        return !String(value).toLowerCase().includes(String(filterValue).toLowerCase());
      case 'starts_with':
        return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
      case 'ends_with':
        return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
      case 'gt':
        return Number(value) > Number(filterValue);
      case 'gte':
        return Number(value) >= Number(filterValue);
      case 'lt':
        return Number(value) < Number(filterValue);
      case 'lte':
        return Number(value) <= Number(filterValue);
      case 'between':
        return Number(value) >= Number(filterValue) && Number(value) <= Number(filter.value2);
      case 'in':
        return Array.isArray(filterValue) && filterValue.includes(value);
      case 'not_in':
        return Array.isArray(filterValue) && !filterValue.includes(value);
      case 'is_null':
        return value === null || value === undefined;
      case 'is_not_null':
        return value !== null && value !== undefined;
      case 'today':
        const today = new Date().toISOString().split('T')[0];
        return String(value).split('T')[0] === today;
      case 'this_month':
        const thisMonth = new Date().toISOString().slice(0, 7);
        return String(value).slice(0, 7) === thisMonth;
      case 'this_year':
        const thisYear = new Date().getFullYear();
        return new Date(value).getFullYear() === thisYear;
      case 'last_n_days':
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - Number(filterValue));
        return new Date(value) >= daysAgo;
      default:
        return true;
    }
  }

  /**
   * Apply sorting to data
   */
  private applySorting(data: ReportRow[], sortBy?: ReportSorting[]): ReportRow[] {
    if (!sortBy || sortBy.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const sort of sortBy) {
        const aVal = a[sort.field];
        const bVal = b[sort.field];
        
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else if (aVal instanceof Date && bVal instanceof Date) {
          comparison = aVal.getTime() - bVal.getTime();
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        
        if (comparison !== 0) {
          return sort.direction === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Apply grouping to data
   */
  private applyGrouping(
    data: ReportRow[],
    groupBy?: ReportGrouping[]
  ): { groupedData: ReportResult['groupedData']; flatData: ReportRow[] } {
    if (!groupBy || groupBy.length === 0) {
      return { groupedData: undefined, flatData: data };
    }

    const primaryGroup = groupBy[0];
    const groups = new Map<any, ReportRow[]>();

    // Group data
    data.forEach(row => {
      const groupValue = row[primaryGroup.field];
      const existing = groups.get(groupValue) || [];
      existing.push(row);
      groups.set(groupValue, existing);
    });

    // Calculate subtotals for each group
    const groupedData = Array.from(groups.entries()).map(([groupValue, rows]) => {
      const subtotal: Record<string, any> = {};
      
      // Calculate aggregations for numeric columns
      rows.forEach(row => {
        Object.keys(row).forEach(key => {
          if (typeof row[key] === 'number') {
            subtotal[key] = (subtotal[key] || 0) + row[key];
          }
        });
      });

      return {
        groupValue,
        groupLabel: String(groupValue),
        rows,
        subtotal,
      };
    });

    // Sort groups if specified
    if (primaryGroup.sortBy) {
      groupedData.sort((a, b) => {
        const comparison = String(a.groupValue).localeCompare(String(b.groupValue));
        return primaryGroup.sortBy === 'desc' ? -comparison : comparison;
      });
    }

    return { groupedData, flatData: data };
  }

  /**
   * Calculate summary aggregations
   */
  private calculateSummary(data: ReportRow[], columns: ReportColumn[]): Record<string, any> {
    const summary: Record<string, any> = {};

    columns.forEach(column => {
      if (column.aggregation) {
        const values = data.map(row => row[column.field]).filter(v => v !== null && v !== undefined);
        
        switch (column.aggregation) {
          case 'sum':
            summary[column.id] = values.reduce((sum, v) => sum + Number(v), 0);
            break;
          case 'avg':
            summary[column.id] = values.length > 0 
              ? values.reduce((sum, v) => sum + Number(v), 0) / values.length 
              : 0;
            break;
          case 'count':
            summary[column.id] = values.length;
            break;
          case 'count_distinct':
            summary[column.id] = new Set(values).size;
            break;
          case 'min':
            summary[column.id] = Math.min(...values.map(Number));
            break;
          case 'max':
            summary[column.id] = Math.max(...values.map(Number));
            break;
          case 'median':
            const sorted = values.map(Number).sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            summary[column.id] = sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
            break;
          case 'std_dev':
            const nums = values.map(Number);
            const mean = nums.reduce((sum, v) => sum + v, 0) / nums.length;
            const squaredDiffs = nums.map(v => Math.pow(v - mean, 2));
            summary[column.id] = Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / nums.length);
            break;
        }
      }
    });

    // Add total row count
    summary._totalRows = data.length;

    return summary;
  }

  /**
   * Generate chart data
   */
  private generateChartData(data: ReportRow[], charts?: ReportChart[]): Record<string, any[]> {
    if (!charts || charts.length === 0) return {};

    const chartData: Record<string, any[]> = {};

    charts.forEach(chart => {
      const seriesData: any[] = [];

      if (chart.type === 'pie' || chart.type === 'doughnut') {
        // Group by x-axis field and aggregate y-axis field
        const groups = new Map<string, number>();
        data.forEach(row => {
          const key = String(row[chart.xAxisField || ''] || 'Other');
          const value = Number(row[chart.yAxisField] || 0);
          groups.set(key, (groups.get(key) || 0) + value);
        });
        
        groups.forEach((value, name) => {
          seriesData.push({ name, value });
        });
      } else {
        // For bar/line/area charts
        if (chart.seriesField) {
          // Multiple series
          const seriesMap = new Map<string, Map<string, number>>();
          data.forEach(row => {
            const xValue = String(row[chart.xAxisField || ''] || '');
            const series = String(row[chart.seriesField!] || 'Default');
            const yValue = Number(row[chart.yAxisField] || 0);
            
            if (!seriesMap.has(series)) {
              seriesMap.set(series, new Map());
            }
            const seriesData = seriesMap.get(series)!;
            seriesData.set(xValue, (seriesData.get(xValue) || 0) + yValue);
          });
          
          seriesMap.forEach((xData, seriesName) => {
            const points = Array.from(xData.entries()).map(([x, y]) => ({
              x,
              y,
              series: seriesName,
            }));
            seriesData.push(...points);
          });
        } else {
          // Single series
          const groups = new Map<string, number>();
          data.forEach(row => {
            const key = String(row[chart.xAxisField || ''] || '');
            const value = Number(row[chart.yAxisField] || 0);
            groups.set(key, (groups.get(key) || 0) + value);
          });
          
          groups.forEach((y, x) => {
            seriesData.push({ x, y });
          });
        }
      }

      chartData[chart.id] = seriesData;
    });

    return chartData;
  }

  /**
   * Apply pagination
   */
  private applyPagination(data: ReportRow[], page: number, pageSize: number): ReportRow[] {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return data.slice(start, end);
  }

  // ==================== SCHEDULE MANAGEMENT ====================

  /**
   * Create a report schedule
   */
  async createSchedule(
    schedule: Omit<ReportSchedule, 'id' | 'createdAt'>,
    userId: string
  ): Promise<ReportSchedule> {
    const newSchedule: ReportSchedule = {
      ...schedule,
      id: `SCHED-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdBy: userId,
      createdAt: new Date(),
      nextRun: this.calculateNextRun(schedule),
    };

    this.schedules.set(newSchedule.id, newSchedule);
    await this.saveSchedules();

    logger.info('Report schedule created', { id: newSchedule.id, reportId: schedule.reportDefinitionId });
    return newSchedule;
  }

  /**
   * Update a schedule
   */
  async updateSchedule(id: string, updates: Partial<ReportSchedule>): Promise<ReportSchedule> {
    const existing = this.schedules.get(id);
    if (!existing) {
      throw new Error(`Schedule not found: ${id}`);
    }

    const updated: ReportSchedule = {
      ...existing,
      ...updates,
      id: existing.id,
      nextRun: updates.frequency ? this.calculateNextRun({ ...existing, ...updates }) : existing.nextRun,
    };

    this.schedules.set(id, updated);
    await this.saveSchedules();

    return updated;
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(id: string): Promise<void> {
    this.schedules.delete(id);
    await this.saveSchedules();
  }

  /**
   * Get all schedules
   */
  getSchedules(reportDefinitionId?: string): ReportSchedule[] {
    const schedules = Array.from(this.schedules.values());
    if (reportDefinitionId) {
      return schedules.filter(s => s.reportDefinitionId === reportDefinitionId);
    }
    return schedules;
  }

  /**
   * Calculate next run time
   */
  private calculateNextRun(schedule: Partial<ReportSchedule>): Date {
    const now = new Date();
    const [hours, minutes] = (schedule.time || '00:00').split(':').map(Number);
    
    const nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);

    switch (schedule.frequency) {
      case 'daily':
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;
      case 'weekly':
        const dayOfWeek = schedule.dayOfWeek || 1;
        const currentDay = nextRun.getDay();
        const daysUntil = (dayOfWeek - currentDay + 7) % 7;
        nextRun.setDate(nextRun.getDate() + (daysUntil === 0 && nextRun <= now ? 7 : daysUntil));
        break;
      case 'monthly':
        const dayOfMonth = schedule.dayOfMonth || 1;
        nextRun.setDate(dayOfMonth);
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        break;
      case 'quarterly':
        nextRun.setMonth(nextRun.getMonth() + 3);
        break;
      case 'yearly':
        nextRun.setFullYear(nextRun.getFullYear() + 1);
        break;
    }

    return nextRun;
  }

  /**
   * Check for scheduled reports to run
   */
  private async checkScheduledReports(): Promise<void> {
    const now = new Date();
    const schedules = Array.from(this.schedules.values()).filter(
      s => s.isActive && s.nextRun && new Date(s.nextRun) <= now
    );

    for (const schedule of schedules) {
      try {
        // Execute the report
        const result = await this.executeReport(schedule.reportDefinitionId, schedule.parameters);
        
        // Update schedule
        schedule.lastRun = now;
        schedule.nextRun = this.calculateNextRun(schedule);
        await this.saveSchedules();

        // In a full implementation, would send to recipients
        logger.info('Scheduled report executed', { scheduleId: schedule.id, reportId: result.id });
      } catch (error) {
        logger.error('Scheduled report failed', error as Error, { scheduleId: schedule.id });
      }
    }
  }

  // ==================== SAVED VIEWS ====================

  /**
   * Create a saved view
   */
  async createSavedView(
    view: Omit<ReportSavedView, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<ReportSavedView> {
    const newView: ReportSavedView = {
      ...view,
      id: `VIEW-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // If this is the default view, unset other defaults for this report
    if (view.isDefault) {
      Array.from(this.savedViews.values())
        .filter(v => v.reportDefinitionId === view.reportDefinitionId && v.userId === userId)
        .forEach(v => {
          v.isDefault = false;
        });
    }

    this.savedViews.set(newView.id, newView);
    await this.saveSavedViews();

    return newView;
  }

  /**
   * Update a saved view
   */
  async updateSavedView(id: string, updates: Partial<ReportSavedView>): Promise<ReportSavedView> {
    const existing = this.savedViews.get(id);
    if (!existing) {
      throw new Error(`Saved view not found: ${id}`);
    }

    const updated: ReportSavedView = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date(),
    };

    this.savedViews.set(id, updated);
    await this.saveSavedViews();

    return updated;
  }

  /**
   * Delete a saved view
   */
  async deleteSavedView(id: string): Promise<void> {
    this.savedViews.delete(id);
    await this.saveSavedViews();
  }

  /**
   * Get saved views for a report
   */
  getSavedViews(reportDefinitionId: string, userId?: string): ReportSavedView[] {
    return Array.from(this.savedViews.values()).filter(v => 
      v.reportDefinitionId === reportDefinitionId &&
      (userId ? v.userId === userId : true)
    );
  }

  /**
   * Get default view for a report
   */
  getDefaultView(reportDefinitionId: string, userId: string): ReportSavedView | undefined {
    return Array.from(this.savedViews.values()).find(v =>
      v.reportDefinitionId === reportDefinitionId &&
      v.userId === userId &&
      v.isDefault
    );
  }

  // ==================== DASHBOARD MANAGEMENT ====================

  /**
   * Create a dashboard
   */
  async createDashboard(
    dashboard: Omit<ReportDashboard, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<ReportDashboard> {
    const newDashboard: ReportDashboard = {
      ...dashboard,
      id: `DASH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.dashboards.set(newDashboard.id, newDashboard);
    await this.saveDashboards();

    logger.info('Dashboard created', { id: newDashboard.id, name: newDashboard.name });
    return newDashboard;
  }

  /**
   * Update a dashboard
   */
  async updateDashboard(id: string, updates: Partial<ReportDashboard>, userId: string): Promise<ReportDashboard> {
    const existing = this.dashboards.get(id);
    if (!existing) {
      throw new Error(`Dashboard not found: ${id}`);
    }

    const updated: ReportDashboard = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    this.dashboards.set(id, updated);
    await this.saveDashboards();

    return updated;
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(id: string): Promise<void> {
    this.dashboards.delete(id);
    await this.saveDashboards();
  }

  /**
   * Get all dashboards
   */
  getDashboards(): ReportDashboard[] {
    return Array.from(this.dashboards.values());
  }

  /**
   * Get a dashboard
   */
  getDashboard(id: string): ReportDashboard | undefined {
    return this.dashboards.get(id);
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get available data sources
   */
  getDataSources(): Array<{ id: string; name: string; description: string }> {
    return [
      { id: 'ledger', name: 'General Ledger', description: 'Journal entries and account balances' },
      { id: 'invoices', name: 'Invoices', description: 'Customer invoices and billing' },
      { id: 'inventory', name: 'Inventory', description: 'Stock items and movements' },
      { id: 'sales', name: 'Sales', description: 'Sales transactions and orders' },
      { id: 'purchases', name: 'Purchases', description: 'Purchase orders and receipts' },
      { id: 'customers', name: 'Customers', description: 'Customer master data' },
      { id: 'suppliers', name: 'Suppliers', description: 'Supplier master data' },
      { id: 'expenses', name: 'Expenses', description: 'Expense records' },
      { id: 'income', name: 'Income', description: 'Income records' },
      { id: 'employees', name: 'Employees', description: 'Employee master data' },
      { id: 'payroll', name: 'Payroll', description: 'Payroll runs and payslips' },
      { id: 'workOrders', name: 'Work Orders', description: 'Production work orders' },
      { id: 'bankTransactions', name: 'Bank Transactions', description: 'Bank account transactions' },
    ];
  }

  /**
   * Get available fields for a data source
   */
  getFieldsForDataSource(dataSource: string): Array<{ field: string; type: string; label: string }> {
    const fieldMappings: Record<string, Array<{ field: string; type: string; label: string }>> = {
      ledger: [
        { field: 'date', type: 'date', label: 'Date' },
        { field: 'description', type: 'string', label: 'Description' },
        { field: 'debitAccountId', type: 'string', label: 'Debit Account' },
        { field: 'creditAccountId', type: 'string', label: 'Credit Account' },
        { field: 'amount', type: 'currency', label: 'Amount' },
        { field: 'referenceId', type: 'string', label: 'Reference' },
        { field: 'reconciled', type: 'boolean', label: 'Reconciled' },
      ],
      invoices: [
        { field: 'id', type: 'string', label: 'Invoice ID' },
        { field: 'date', type: 'date', label: 'Invoice Date' },
        { field: 'dueDate', type: 'date', label: 'Due Date' },
        { field: 'customerId', type: 'string', label: 'Customer ID' },
        { field: 'customerName', type: 'string', label: 'Customer Name' },
        { field: 'subtotal', type: 'currency', label: 'Subtotal' },
        { field: 'taxAmount', type: 'currency', label: 'Tax' },
        { field: 'totalAmount', type: 'currency', label: 'Total' },
        { field: 'paidAmount', type: 'currency', label: 'Paid' },
        { field: 'status', type: 'string', label: 'Status' },
      ],
      inventory: [
        { field: 'id', type: 'string', label: 'Item ID' },
        { field: 'name', type: 'string', label: 'Item Name' },
        { field: 'sku', type: 'string', label: 'SKU' },
        { field: 'category', type: 'string', label: 'Category' },
        { field: 'type', type: 'string', label: 'Type' },
        { field: 'stock', type: 'number', label: 'Quantity' },
        { field: 'cost', type: 'currency', label: 'Unit Cost' },
        { field: 'price', type: 'currency', label: 'Unit Price' },
        { field: 'minStockLevel', type: 'number', label: 'Min Stock Level' },
      ],
      sales: [
        { field: 'id', type: 'string', label: 'Sale ID' },
        { field: 'date', type: 'date', label: 'Sale Date' },
        { field: 'customerId', type: 'string', label: 'Customer ID' },
        { field: 'customerName', type: 'string', label: 'Customer Name' },
        { field: 'itemCount', type: 'number', label: 'Items' },
        { field: 'subtotal', type: 'currency', label: 'Subtotal' },
        { field: 'taxAmount', type: 'currency', label: 'Tax' },
        { field: 'totalAmount', type: 'currency', label: 'Total' },
        { field: 'paymentMethod', type: 'string', label: 'Payment Method' },
      ],
    };

    return fieldMappings[dataSource] || [];
  }

  /**
   * Get report history
   */
  getReportHistory(limit: number = 20): ReportResult[] {
    return Array.from(this.reportHistory.values())
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get a report result from history
   */
  getReportResult(resultId: string): ReportResult | undefined {
    return this.reportHistory.get(resultId);
  }

  /**
   * Clear report history
   */
  async clearHistory(): Promise<void> {
    this.reportHistory.clear();
    await this.saveHistory();
  }
}

// ==================== STANDALONE UTILITY FUNCTIONS ====================

/**
 * Calculate account balances for a date range
 */
export function calculateAccountBalances(
  accounts: any[],
  ledger: any[],
  dateRange: { start: string; end: string },
  compareWithPrevious: boolean = false
): { current: Record<string, number>; previous: Record<string, number> } {
  const current: Record<string, number> = {};
  const previous: Record<string, number> = {};

  if (!accounts || !ledger) {
    return { current, previous };
  }

  // Initialize all accounts
  accounts.forEach((acc: any) => {
    current[acc.id] = 0;
    previous[acc.id] = 0;
  });

  // Parse dates
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  const yearBefore = new Date(startDate);
  yearBefore.setFullYear(yearBefore.getFullYear() - 1);

  // Process ledger entries
  ledger.forEach((entry: any) => {
    if (!entry.date || !entry.debitAccountId || !entry.creditAccountId || entry.amount == null) {
      return;
    }

    const entryDate = new Date(entry.date);

    // Current period
    if (entryDate >= startDate && entryDate <= endDate) {
      if (entry.debitAccountId) current[entry.debitAccountId] = (current[entry.debitAccountId] || 0) + entry.amount;
      if (entry.creditAccountId) current[entry.creditAccountId] = (current[entry.creditAccountId] || 0) - entry.amount;
    }

    // Previous period (for comparison)
    if (compareWithPrevious && entryDate >= yearBefore && entryDate < startDate) {
      if (entry.debitAccountId) previous[entry.debitAccountId] = (previous[entry.debitAccountId] || 0) + entry.amount;
      if (entry.creditAccountId) previous[entry.creditAccountId] = (previous[entry.creditAccountId] || 0) - entry.amount;
    }
  });

  return { current, previous };
}

/**
 * Calculate aged receivables/payables data
 */
export function getAgedData(
  invoices: any[] = [],
  purchases: any[] = []
): { ar: any; ap: any } {
  const now = new Date();

  const buckets = {
    '0-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };

  // Aged Receivables (AR) from invoices
  const arItems: any[] = [];
  invoices.forEach((inv: any) => {
    if (!inv.dueDate || !inv.status) return;
    const due = new Date(inv.dueDate);
    const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const balance = (inv.totalAmount || 0) - (inv.paidAmount || 0);

    if (balance > 0) {
      if (daysOverdue <= 0) buckets['0-30'] += balance;
      else if (daysOverdue <= 30) buckets['0-30'] += balance;
      else if (daysOverdue <= 60) buckets['31-60'] += balance;
      else if (daysOverdue <= 90) buckets['61-90'] += balance;
      else buckets['90+'] += balance;

      arItems.push({
        date: inv.date || inv.dueDate,
        customerName: inv.customerName || 'Unknown',
        invoiceId: inv.id,
        balance,
        daysOverdue: Math.max(0, daysOverdue),
      });
    }
  });

  // Aged Payables (AP) from purchases
  const apBuckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  const apItems: any[] = [];
  purchases.forEach((po: any) => {
    if (!po.dueDate) return;
    const due = new Date(po.dueDate);
    const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const balance = (po.totalAmount || 0) - (po.paidAmount || 0);

    if (balance > 0) {
      if (daysOverdue <= 0) apBuckets['0-30'] += balance;
      else if (daysOverdue <= 30) apBuckets['0-30'] += balance;
      else if (daysOverdue <= 60) apBuckets['31-60'] += balance;
      else if (daysOverdue <= 90) apBuckets['61-90'] += balance;
      else apBuckets['90+'] += balance;

      apItems.push({
        date: po.date || po.dueDate,
        supplierId: po.supplierId || 'Unknown',
        poId: po.id,
        balance,
        daysOverdue: Math.max(0, daysOverdue),
      });
    }
  });

  return {
    ar: { buckets, items: arItems },
    ap: { buckets: apBuckets, items: apItems },
  };
}

/**
 * Calculate markup analysis for sales transactions
 */
export function calculateMarkupAnalysis(transactions: any[] = []): any[] {
  return transactions.map((trans: any) => {
    const totalCost = (trans.items || []).reduce((sum: number, item: any) => sum + (item.cost || 0), 0);
    // NOTE: wastageAdjustment is never written to the DB.
    // Defaults to 0 until persistence is added. See Phase 3+.
    const totalWastage = trans.wastageAdjustment || 0;
    // NOTE: transportAdjustment is never written to the DB.
    // Defaults to 0 until persistence is added. See Phase 3+.
    const totalTransport = trans.transportAdjustment || 0;
    // Use adjustmentTotal which is actually stored in the database
    const totalAdjustments = trans.adjustmentTotal || trans.adjustmentSnapshots?.reduce((sum: number, s: any) => sum + (s.calculatedAmount || 0), 0) || 0;
    // Get profit margin from the stored adjustmentTotal if no other profit data
    const profitMargin = trans.profitMargin || trans.adjustmentTotal || 0;
    // Keep totalProfit for backward compatibility
    const totalProfit = extractProfitMargin(trans) || profitMargin;

    const costBeforeWastage = totalCost;
    const costBeforeTransport = costBeforeWastage + totalWastage;
    const costBeforeProfit = costBeforeTransport + totalTransport;
    const netMarginPerSale = totalProfit;
    const finalPrice = (trans.totalAmount || 0);
    const grossMargin = finalPrice - totalCost;
    const marginPercent = finalPrice > 0 ? (grossMargin / finalPrice) * 100 : 0;

    return {
      saleId: trans.id,
      date: trans.date,
      customerName: trans.customerName || 'Unknown',
      totalCost,
      costBeforeWastage,
      costBeforeTransport,
      costBeforeProfit,
      netMarginPerSale,
      finalPrice,
      grossMargin,
      marginPercent: Math.max(-100, Math.min(100, marginPercent)),
      totalAdjustments,
      adjustmentBreakdown: trans.adjustmentSnapshots || trans.transactionAdjustments || [],
      profitMargin: extractProfitMargin(trans),
    };
  });
}

/**
 * Calculate adjustment statistics
 */
export function calculateAdjustmentStatistics(transactions: any[] = []): any[] {
  const stats: Record<string, any> = {};

  transactions.forEach((trans: any) => {
    const adjustments = trans.adjustmentSnapshots || trans.transactionAdjustments || trans.adjustmentSummary || [];

    adjustments.forEach((adj: any) => {
      const name = adj.name || adj.type || 'Unknown';

      if (!stats[name]) {
        stats[name] = {
          adjustmentName: name,
          totalAmount: 0,
          transactionCount: 0,
          itemCount: 0,
          transactions: new Set(),
        };
      }

      stats[name].totalAmount += adj.amount || 0;
      stats[name].transactionCount += 1;
      stats[name].itemCount += (trans.items || []).length;
      stats[name].transactions.add(trans.id);
    });
  });

  return Object.values(stats).map((stat: any) => ({
    adjustmentName: stat.adjustmentName,
    totalAmount: stat.totalAmount,
    transactionCount: stat.transactions.size,
    itemCount: stat.itemCount,
    avgPerTransaction: stat.transactions.size > 0 ? stat.totalAmount / stat.transactions.size : 0,
  }));
}

// Export singleton instance
export const reportService = new ReportService();

// Export class for testing
export { ReportService };
