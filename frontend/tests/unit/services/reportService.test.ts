import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ReportService, reportService } from '../../../services/reportService';
import { ReportDefinition, ReportResult, ReportCategory, ReportType } from '../../../types/reports';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Mock logger
vi.mock('../../../services/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock dbService
vi.mock('../../../services/db', () => ({
  dbService: {
    getAll: vi.fn().mockResolvedValue([
      { id: '1', date: '2024-01-15', amount: 100, description: 'Test Entry 1' },
      { id: '2', date: '2024-01-16', amount: 200, description: 'Test Entry 2' },
      { id: '3', date: '2024-01-17', amount: 150, description: 'Test Entry 3' },
    ]),
  },
}));

describe('ReportService', () => {
  let service: ReportService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    service = new ReportService();
  });

  afterEach(() => {
    service.stopScheduleChecker();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      
      // Should have loaded default reports
      const definitions = service.getDefinitions();
      expect(definitions.length).toBeGreaterThan(0);
    });

    it('should not initialize twice', async () => {
      await service.initialize();
      await service.initialize();
      
      // Should only initialize once
      const definitions = service.getDefinitions();
      expect(definitions.length).toBeGreaterThan(0);
    });
  });

  describe('createDefinition', () => {
    it('should create a new report definition', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Test Report',
        description: 'A test report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          {
            id: 'col-1',
            field: 'date',
            label: 'Date',
            type: 'date',
            sortable: true,
          },
          {
            id: 'col-2',
            field: 'amount',
            label: 'Amount',
            type: 'currency',
            sortable: true,
            aggregation: 'sum',
          },
        ],
        filters: [],
        sortBy: [],
        isPublic: false,
        allowedRoles: ['Admin'],
      }, 'test-user');

      expect(definition).toBeDefined();
      expect(definition.id).toBeDefined();
      expect(definition.name).toBe('Test Report');
      expect(definition.version).toBe(1);
      expect(definition.createdBy).toBe('test-user');
    });

    it('should throw error if name is missing', async () => {
      await service.initialize();
      
      await expect(
        service.createDefinition({
          name: '',
          type: 'tabular',
          category: 'financial',
          dataSource: 'ledger',
          columns: [],
          filters: [],
          sortBy: [],
        }, 'test-user')
      ).rejects.toThrow('Report definition must have a name');
    });

    it('should throw error if columns are empty', async () => {
      await service.initialize();
      
      await expect(
        service.createDefinition({
          name: 'Test Report',
          type: 'tabular',
          category: 'financial',
          dataSource: 'ledger',
          columns: [],
          filters: [],
          sortBy: [],
        }, 'test-user')
      ).rejects.toThrow('Report definition must have at least one column');
    });
  });

  describe('updateDefinition', () => {
    it('should update an existing definition', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Original Name',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      const updated = await service.updateDefinition(
        definition.id,
        { name: 'Updated Name' },
        'test-user'
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.version).toBe(2);
    });

    it('should throw error if definition not found', async () => {
      await service.initialize();
      
      await expect(
        service.updateDefinition('non-existent-id', { name: 'Test' }, 'test-user')
      ).rejects.toThrow('Report definition not found');
    });
  });

  describe('deleteDefinition', () => {
    it('should delete a definition', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'To Delete',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      await service.deleteDefinition(definition.id);
      
      const retrieved = service.getDefinition(definition.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getDefinitions', () => {
    it('should get all definitions', async () => {
      await service.initialize();
      
      const definitions = service.getDefinitions();
      expect(Array.isArray(definitions)).toBe(true);
    });

    it('should filter by category', async () => {
      await service.initialize();
      
      const financialReports = service.getDefinitions('financial');
      financialReports.forEach(report => {
        expect(report.category).toBe('financial');
      });
    });
  });

  describe('searchDefinitions', () => {
    it('should search definitions by name', async () => {
      await service.initialize();
      
      await service.createDefinition({
        name: 'Unique Searchable Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      const results = service.searchDefinitions('Unique Searchable');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('Unique Searchable');
    });
  });

  describe('executeReport', () => {
    it('should execute a report and return results', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Execution Test Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
          { id: 'col-2', field: 'amount', label: 'Amount', type: 'currency', sortable: true, aggregation: 'sum' },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      const result = await service.executeReport(definition.id, {}, 'test-user');

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.reportDefinitionId).toBe(definition.id);
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
      expect(result.columns).toBeDefined();
      expect(result.generatedAt).toBeDefined();
    });

    it('should throw error if definition not found', async () => {
      await service.initialize();
      
      await expect(
        service.executeReport('non-existent-id')
      ).rejects.toThrow('Report definition not found');
    });

    it('should apply filters correctly', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Filtered Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'amount', label: 'Amount', type: 'number', sortable: true },
        ],
        filters: [
          { id: 'f1', field: 'amount', operator: 'gt', value: 100 },
        ],
        sortBy: [],
      }, 'test-user');

      const result = await service.executeReport(definition.id);
      
      // All rows should have amount > 100
      result.rows.forEach(row => {
        expect(row.amount).toBeGreaterThan(100);
      });
    });

    it('should apply sorting correctly', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Sorted Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'amount', label: 'Amount', type: 'number', sortable: true },
        ],
        filters: [],
        sortBy: [{ field: 'amount', direction: 'desc' }],
      }, 'test-user');

      const result = await service.executeReport(definition.id);
      
      // Check that rows are sorted descending
      for (let i = 1; i < result.rows.length; i++) {
        expect(result.rows[i].amount).toBeLessThanOrEqual(result.rows[i - 1].amount);
      }
    });

    it('should calculate summary aggregations', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Summary Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'amount', label: 'Amount', type: 'number', sortable: true, aggregation: 'sum' },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      const result = await service.executeReport(definition.id);
      
      expect(result.summary).toBeDefined();
      expect(result.summary['col-1']).toBeDefined();
    });
  });

  describe('schedule management', () => {
    it('should create a schedule', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Scheduled Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      const schedule = await service.createSchedule({
        reportDefinitionId: definition.id,
        frequency: 'daily',
        time: '09:00',
        isActive: true,
        recipients: ['test@example.com'],
      }, 'test-user');

      expect(schedule).toBeDefined();
      expect(schedule.id).toBeDefined();
      expect(schedule.frequency).toBe('daily');
      expect(schedule.nextRun).toBeDefined();
    });

    it('should get schedules for a report', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Multi-Schedule Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      await service.createSchedule({
        reportDefinitionId: definition.id,
        frequency: 'daily',
        time: '09:00',
        isActive: true,
        recipients: [],
      }, 'test-user');

      await service.createSchedule({
        reportDefinitionId: definition.id,
        frequency: 'weekly',
        time: '10:00',
        dayOfWeek: 1,
        isActive: true,
        recipients: [],
      }, 'test-user');

      const schedules = service.getSchedules(definition.id);
      expect(schedules.length).toBe(2);
    });

    it('should delete a schedule', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Delete Schedule Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      const schedule = await service.createSchedule({
        reportDefinitionId: definition.id,
        frequency: 'daily',
        time: '09:00',
        isActive: true,
        recipients: [],
      }, 'test-user');

      await service.deleteSchedule(schedule.id);
      
      const schedules = service.getSchedules(definition.id);
      expect(schedules.length).toBe(0);
    });
  });

  describe('saved views', () => {
    it('should create a saved view', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'View Test Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      const view = await service.createSavedView({
        reportDefinitionId: definition.id,
        name: 'My View',
        filters: [],
        sortBy: [],
        columnOrder: ['col-1'],
        isDefault: true,
      }, 'test-user');

      expect(view).toBeDefined();
      expect(view.id).toBeDefined();
      expect(view.name).toBe('My View');
      expect(view.isDefault).toBe(true);
    });

    it('should get saved views for a report', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'Multi-View Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      await service.createSavedView({
        reportDefinitionId: definition.id,
        name: 'View 1',
        filters: [],
        sortBy: [],
        columnOrder: [],
      }, 'test-user');

      await service.createSavedView({
        reportDefinitionId: definition.id,
        name: 'View 2',
        filters: [],
        sortBy: [],
        columnOrder: [],
      }, 'test-user');

      const views = service.getSavedViews(definition.id);
      expect(views.length).toBe(2);
    });
  });

  describe('dashboard management', () => {
    it('should create a dashboard', async () => {
      await service.initialize();
      
      const dashboard = await service.createDashboard({
        name: 'Test Dashboard',
        description: 'A test dashboard',
        widgets: [
          {
            id: 'widget-1',
            title: 'Widget 1',
            reportDefinitionId: 'report-1',
            width: 6,
            height: 1,
          },
        ],
        isDefault: false,
      }, 'test-user');

      expect(dashboard).toBeDefined();
      expect(dashboard.id).toBeDefined();
      expect(dashboard.name).toBe('Test Dashboard');
      expect(dashboard.widgets.length).toBe(1);
    });

    it('should get all dashboards', async () => {
      await service.initialize();
      
      await service.createDashboard({
        name: 'Dashboard 1',
        widgets: [],
        isDefault: false,
      }, 'test-user');

      await service.createDashboard({
        name: 'Dashboard 2',
        widgets: [],
        isDefault: false,
      }, 'test-user');

      const dashboards = service.getDashboards();
      expect(dashboards.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete a dashboard', async () => {
      await service.initialize();
      
      const dashboard = await service.createDashboard({
        name: 'To Delete Dashboard',
        widgets: [],
        isDefault: false,
      }, 'test-user');

      await service.deleteDashboard(dashboard.id);
      
      const retrieved = service.getDashboard(dashboard.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('utility methods', () => {
    it('should get available data sources', () => {
      const dataSources = service.getDataSources();
      
      expect(Array.isArray(dataSources)).toBe(true);
      expect(dataSources.length).toBeGreaterThan(0);
      expect(dataSources[0]).toHaveProperty('id');
      expect(dataSources[0]).toHaveProperty('name');
      expect(dataSources[0]).toHaveProperty('description');
    });

    it('should get fields for a data source', () => {
      const fields = service.getFieldsForDataSource('ledger');
      
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
      expect(fields[0]).toHaveProperty('field');
      expect(fields[0]).toHaveProperty('type');
      expect(fields[0]).toHaveProperty('label');
    });

    it('should return empty array for unknown data source', () => {
      const fields = service.getFieldsForDataSource('unknown-source');
      expect(fields).toEqual([]);
    });

    it('should get report history', async () => {
      await service.initialize();
      
      const definition = await service.createDefinition({
        name: 'History Test Report',
        type: 'tabular',
        category: 'financial',
        dataSource: 'ledger',
        columns: [
          { id: 'col-1', field: 'date', label: 'Date', type: 'date', sortable: true },
        ],
        filters: [],
        sortBy: [],
      }, 'test-user');

      await service.executeReport(definition.id);
      await service.executeReport(definition.id);
      
      const history = service.getReportHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should clear report history', async () => {
      await service.initialize();
      
      await service.clearHistory();
      
      const history = service.getReportHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(reportService).toBeDefined();
      expect(reportService).toBeInstanceOf(ReportService);
    });
  });
});
