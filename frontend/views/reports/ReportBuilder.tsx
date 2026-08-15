import React, { useState, useEffect, useCallback } from 'react';
import { ReportDefinition, ReportColumn, ReportFilter, ReportSorting, ReportGrouping, ReportChart, ReportParameter, ReportCategory, ReportType, AggregationType, DEFAULT_REPORT_DEFINITIONS, FilterOperator } from '../../types/reports';
import { reportService } from '../../services/reportService';
import { logger } from '../../services/logger';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Card from '../../components/Card';
import { Settings2, SlidersHorizontal, X } from 'lucide-react';
import {
  modalOverlay, modalCard, accentBar, modalHeader, iconBox, modalTitle, modalSubtitle, closeBtn,
  labelStyle, inputStyle, selectStyle, btnGhostStyle, tealBtn, modalBody, modalFooter, sectionTitle, sectionSubtitle, formGrid, emptyStateIcon
} from './reportModalStyles';
import Badge from '../../components/Badge';

interface ReportBuilderProps {
  definitionId?: string;
  onSave?: (definition: ReportDefinition) => void;
  onCancel?: () => void;
}

interface DataSourceField {
  field: string;
  type: string;
  label: string;
}

const ReportBuilder: React.FC<ReportBuilderProps> = ({ definitionId, onSave, onCancel }) => {
  const [definition, setDefinition] = useState<Partial<ReportDefinition>>({
    name: '',
    description: '',
    type: 'tabular',
    category: 'financial',
    dataSource: 'ledger',
    columns: [],
    filters: [],
    sortBy: [],
    groupBy: [],
    charts: [],
    parameters: [],
    isPublic: false,
    allowedRoles: ['Admin', 'Accountant', 'Manager'],
    pageSize: 50,
    tags: [],
  });

  const [availableFields, setAvailableFields] = useState<DataSourceField[]>([]);
  const [dataSources, setDataSources] = useState<Array<{ id: string; name: string }>>([]);
  const [activeTab, setActiveTab] = useState<'general' | 'columns' | 'filters' | 'sorting' | 'grouping' | 'charts' | 'parameters'>('general');
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [editingColumn, setEditingColumn] = useState<ReportColumn | null>(null);
  const [editingFilter, setEditingFilter] = useState<ReportFilter | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing definition if editing
  useEffect(() => {
    if (definitionId) {
      const existing = reportService.getDefinition(definitionId);
      if (existing) {
        setDefinition(existing);
      }
    }
  }, [definitionId]);

  // Load data sources
  useEffect(() => {
    const sources = reportService.getDataSources();
    setDataSources(sources);
  }, []);

  // Load fields when data source changes
  useEffect(() => {
    if (definition.dataSource) {
      const fields = reportService.getFieldsForDataSource(definition.dataSource);
      setAvailableFields(fields);
    }
  }, [definition.dataSource]);

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!definition.name) {
        throw new Error('Report name is required');
      }

      if (!definition.dataSource) {
        throw new Error('Data source is required');
      }

      if (!definition.columns || definition.columns.length === 0) {
        throw new Error('At least one column is required');
      }

      let savedDefinition: ReportDefinition;

      if (definitionId) {
        savedDefinition = await reportService.updateDefinition(
          definitionId,
          definition as Partial<ReportDefinition>,
          'current-user'
        );
      } else {
        savedDefinition = await reportService.createDefinition(
          definition as Omit<ReportDefinition, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
          'current-user'
        );
      }

      onSave?.(savedDefinition);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save report';
      setError(message);
      logger.error('Failed to save report', err as Error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddColumn = (column: ReportColumn) => {
    setDefinition(prev => ({
      ...prev,
      columns: [...(prev.columns || []), column],
    }));
    setShowColumnDialog(false);
    setEditingColumn(null);
  };

  const handleUpdateColumn = (index: number, column: ReportColumn) => {
    setDefinition(prev => {
      const columns = [...(prev.columns || [])];
      columns[index] = column;
      return { ...prev, columns };
    });
    setShowColumnDialog(false);
    setEditingColumn(null);
  };

  const handleRemoveColumn = (index: number) => {
    setDefinition(prev => {
      const columns = [...(prev.columns || [])];
      columns.splice(index, 1);
      return { ...prev, columns };
    });
  };

  const handleAddFilter = (filter: ReportFilter) => {
    setDefinition(prev => ({
      ...prev,
      filters: [...(prev.filters || []), filter],
    }));
    setShowFilterDialog(false);
    setEditingFilter(null);
  };

  const handleRemoveFilter = (index: number) => {
    setDefinition(prev => {
      const filters = [...(prev.filters || [])];
      filters.splice(index, 1);
      return { ...prev, filters };
    });
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    setDefinition(prev => {
      const columns = [...(prev.columns || [])];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= columns.length) return prev;
      [columns[index], columns[newIndex]] = [columns[newIndex], columns[index]];
      return { ...prev, columns };
    });
  };

  const renderGeneralTab = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Report Name *</label>
        <Input
          value={definition.name || ''}
          onChange={(e) => setDefinition(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter report name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={definition.description || ''}
          onChange={(e) => setDefinition(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter report description"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
          <Select
            value={definition.type || 'tabular'}
            onChange={(value) => setDefinition(prev => ({ ...prev, type: value as ReportType }))}
            options={[
              { value: 'tabular', label: 'Tabular' },
              { value: 'summary', label: 'Summary' },
              { value: 'detailed', label: 'Detailed' },
              { value: 'comparison', label: 'Comparison' },
              { value: 'trend', label: 'Trend Analysis' },
              { value: 'dashboard', label: 'Dashboard' },
            ]}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <Select
            value={definition.category || 'financial'}
            onChange={(value) => setDefinition(prev => ({ ...prev, category: value as ReportCategory }))}
            options={[
              { value: 'financial', label: 'Financial' },
              { value: 'sales', label: 'Sales' },
              { value: 'inventory', label: 'Inventory' },
              { value: 'purchasing', label: 'Purchasing' },
              { value: 'hr', label: 'HR & Payroll' },
              { value: 'production', label: 'Production' },
              { value: 'banking', label: 'Banking' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Data Source *</label>
        <Select
          value={definition.dataSource || 'ledger'}
          onChange={(value) => setDefinition(prev => ({ ...prev, dataSource: value }))}
          options={dataSources.map(ds => ({ value: ds.id, label: ds.name }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Page Size</label>
          <Input
            type="number"
            value={definition.pageSize || 50}
            onChange={(e) => setDefinition(prev => ({ ...prev, pageSize: parseInt(e.target.value) || 50 }))}
            min={1}
            max={1000}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
          <Input
            value={(definition.tags || []).join(', ')}
            onChange={(e) => setDefinition(prev => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
            placeholder="tag1, tag2, tag3"
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={definition.isPublic || false}
            onChange={(e) => setDefinition(prev => ({ ...prev, isPublic: e.target.checked }))}
            className="mr-2"
          />
          <span className="text-sm text-gray-700">Public Report</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Allowed Roles</label>
        <div className="flex flex-wrap gap-2">
          {['Admin', 'Accountant', 'Manager', 'Employee', 'Viewer'].map(role => (
            <label key={role} className="flex items-center">
              <input
                type="checkbox"
                checked={(definition.allowedRoles || []).includes(role)}
                onChange={(e) => {
                  const roles = definition.allowedRoles || [];
                  setDefinition(prev => ({
                    ...prev,
                    allowedRoles: e.target.checked
                      ? [...roles, role]
                      : roles.filter(r => r !== role),
                  }));
                }}
                className="mr-1"
              />
              <span className="text-sm">{role}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderColumnsTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Report Columns</h3>
        <Button onClick={() => { setEditingColumn(null); setShowColumnDialog(true); }}>
          Add Column
        </Button>
      </div>

      {(definition.columns || []).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No columns added yet. Click "Add Column" to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {(definition.columns || []).map((column, index) => (
            <div key={column.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center space-x-4">
                <div className="flex flex-col space-y-1">
                  <button
                    onClick={() => handleMoveColumn(index, 'up')}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMoveColumn(index, 'down')}
                    disabled={index === (definition.columns || []).length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </div>
                <div>
                  <div className="font-medium">{column.label}</div>
                  <div className="text-sm text-gray-500">
                    {column.field} • {column.type}
                    {column.aggregation && ` • ${column.aggregation}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {column.hidden && <Badge variant="secondary">Hidden</Badge>}
                {column.sortable && <Badge variant="outline">Sortable</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditingColumn(column); setShowColumnDialog(true); }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveColumn(index)}
                  className="text-red-600"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderFiltersTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Report Filters</h3>
        <Button onClick={() => { setEditingFilter(null); setShowFilterDialog(true); }}>
          Add Filter
        </Button>
      </div>

      {(definition.filters || []).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No filters added yet. Click "Add Filter" to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {(definition.filters || []).map((filter, index) => (
            <div key={filter.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
              <div>
                <div className="font-medium">{filter.field}</div>
                <div className="text-sm text-gray-500">
                  {filter.operator} {filter.value !== undefined ? `= ${filter.value}` : ''}
                  {filter.isParameter && ' (Parameter)'}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFilter(index)}
                  className="text-red-600"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSortingTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Sort Order</h3>
        <Button
          onClick={() => {
            setDefinition(prev => ({
              ...prev,
              sortBy: [...(prev.sortBy || []), { field: '', direction: 'asc' }],
            }));
          }}
        >
          Add Sort
        </Button>
      </div>

      {(definition.sortBy || []).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No sorting configured. Data will be displayed in default order.
        </div>
      ) : (
        <div className="space-y-2">
          {(definition.sortBy || []).map((sort, index) => (
            <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg border">
              <Select
                value={sort.field}
                onChange={(value) => {
                  setDefinition(prev => {
                    const sortBy = [...(prev.sortBy || [])];
                    sortBy[index] = { ...sortBy[index], field: value };
                    return { ...prev, sortBy };
                  });
                }}
                options={availableFields.map(f => ({ value: f.field, label: f.label }))}
                placeholder="Select field"
              />
              <Select
                value={sort.direction}
                onChange={(value) => {
                  setDefinition(prev => {
                    const sortBy = [...(prev.sortBy || [])];
                    sortBy[index] = { ...sortBy[index], direction: value as 'asc' | 'desc' };
                    return { ...prev, sortBy };
                  });
                }}
                options={[
                  { value: 'asc', label: 'Ascending' },
                  { value: 'desc', label: 'Descending' },
                ]}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDefinition(prev => {
                    const sortBy = [...(prev.sortBy || [])];
                    sortBy.splice(index, 1);
                    return { ...prev, sortBy };
                  });
                }}
                className="text-red-600"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderGroupingTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Grouping</h3>
        <Button
          onClick={() => {
            setDefinition(prev => ({
              ...prev,
              groupBy: [...(prev.groupBy || []), { field: '', label: '', showSubtotals: true }],
            }));
          }}
        >
          Add Group
        </Button>
      </div>

      {(definition.groupBy || []).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No grouping configured. Data will be displayed as a flat list.
        </div>
      ) : (
        <div className="space-y-2">
          {(definition.groupBy || []).map((group, index) => (
            <div key={index} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg border">
              <Select
                value={group.field}
                onChange={(value) => {
                  setDefinition(prev => {
                    const groupBy = [...(prev.groupBy || [])];
                    groupBy[index] = { ...groupBy[index], field: value };
                    return { ...prev, groupBy };
                  });
                }}
                options={availableFields.map(f => ({ value: f.field, label: f.label }))}
                placeholder="Select field"
              />
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={group.showSubtotals}
                  onChange={(e) => {
                    setDefinition(prev => {
                      const groupBy = [...(prev.groupBy || [])];
                      groupBy[index] = { ...groupBy[index], showSubtotals: e.target.checked };
                      return { ...prev, groupBy };
                    });
                  }}
                  className="mr-1"
                />
                <span className="text-sm">Show Subtotals</span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDefinition(prev => {
                    const groupBy = [...(prev.groupBy || [])];
                    groupBy.splice(index, 1);
                    return { ...prev, groupBy };
                  });
                }}
                className="text-red-600"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderChartsTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Charts</h3>
        <Button
          onClick={() => {
            setDefinition(prev => ({
              ...prev,
              charts: [...(prev.charts || []), {
                id: `chart-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                type: 'bar',
                title: 'New Chart',
                xAxisField: '',
                yAxisField: '',
              }],
            }));
          }}
        >
          Add Chart
        </Button>
      </div>

      {(definition.charts || []).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No charts configured. Add charts to visualize your report data.
        </div>
      ) : (
        <div className="space-y-4">
          {(definition.charts || []).map((chart, index) => (
            <div key={chart.id || index} className="p-4 bg-gray-50 rounded-lg border space-y-3">
              <div className="flex justify-between items-center">
                <Input
                  value={chart.title}
                  onChange={(e) => {
                    setDefinition(prev => {
                      const charts = [...(prev.charts || [])];
                      charts[index] = { ...charts[index], title: e.target.value };
                      return { ...prev, charts };
                    });
                  }}
                  placeholder="Chart title"
                  className="flex-1 mr-4"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDefinition(prev => {
                      const charts = [...(prev.charts || [])];
                      charts.splice(index, 1);
                      return { ...prev, charts };
                    });
                  }}
                  className="text-red-600"
                >
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Select
                  value={chart.type}
                  onChange={(value) => {
                    setDefinition(prev => {
                      const charts = [...(prev.charts || [])];
                      charts[index] = { ...charts[index], type: value as ReportChart['type'] };
                      return { ...prev, charts };
                    });
                  }}
                  options={[
                    { value: 'bar', label: 'Bar Chart' },
                    { value: 'line', label: 'Line Chart' },
                    { value: 'pie', label: 'Pie Chart' },
                    { value: 'doughnut', label: 'Doughnut Chart' },
                    { value: 'area', label: 'Area Chart' },
                  ]}
                />
                <Select
                  value={chart.xAxisField || ''}
                  onChange={(value) => {
                    setDefinition(prev => {
                      const charts = [...(prev.charts || [])];
                      charts[index] = { ...charts[index], xAxisField: value };
                      return { ...prev, charts };
                    });
                  }}
                  options={availableFields.map(f => ({ value: f.field, label: f.label }))}
                  placeholder="X-Axis Field"
                />
                <Select
                  value={chart.yAxisField || ''}
                  onChange={(value) => {
                    setDefinition(prev => {
                      const charts = [...(prev.charts || [])];
                      charts[index] = { ...charts[index], yAxisField: value };
                      return { ...prev, charts };
                    });
                  }}
                  options={availableFields.filter(f => f.type === 'number' || f.type === 'currency').map(f => ({ value: f.field, label: f.label }))}
                  placeholder="Y-Axis Field"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderParametersTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Report Parameters</h3>
        <Button
          onClick={() => {
            setDefinition(prev => ({
              ...prev,
 parameters: [...(prev.parameters || []), {
                id: `param-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: '',
                label: '',
                type: 'string',
                required: false,
                order: 0,
              }],
            }));
          }}
        >
          Add Parameter
        </Button>
      </div>

      {(definition.parameters || []).length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No parameters defined. Parameters allow users to customize report output.
        </div>
      ) : (
        <div className="space-y-2">
          {(definition.parameters || []).map((param, index) => (
            <div key={param.id || index} className="p-3 bg-gray-50 rounded-lg border space-y-2">
              <div className="grid grid-cols-4 gap-4">
                <Input
                  value={param.name}
                  onChange={(e) => {
                    setDefinition(prev => {
                      const parameters = [...(prev.parameters || [])];
                      parameters[index] = { ...parameters[index], name: e.target.value };
                      return { ...prev, parameters };
                    });
                  }}
                  placeholder="Parameter name"
                />
                <Input
                  value={param.label}
                  onChange={(e) => {
                    setDefinition(prev => {
                      const parameters = [...(prev.parameters || [])];
                      parameters[index] = { ...parameters[index], label: e.target.value };
                      return { ...prev, parameters };
                    });
                  }}
                  placeholder="Display label"
                />
                <Select
                  value={param.type}
                  onChange={(value) => {
                    setDefinition(prev => {
                      const parameters = [...(prev.parameters || [])];
                      parameters[index] = { ...parameters[index], type: value as ReportParameter['type'] };
                      return { ...prev, parameters };
                    });
                  }}
                  options={[
                    { value: 'string', label: 'Text' },
                    { value: 'number', label: 'Number' },
                    { value: 'date', label: 'Date' },
                    { value: 'dateRange', label: 'Date Range' },
                    { value: 'boolean', label: 'Yes/No' },
                    { value: 'select', label: 'Select' },
                  ]}
                />
                <div className="flex items-center space-x-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={param.required}
                      onChange={(e) => {
                        setDefinition(prev => {
                          const parameters = [...(prev.parameters || [])];
                          parameters[index] = { ...parameters[index], required: e.target.checked };
                          return { ...prev, parameters };
                        });
                      }}
                      className="mr-1"
                    />
                    <span className="text-sm">Required</span>
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDefinition(prev => {
                        const parameters = [...(prev.parameters || [])];
                        parameters.splice(index, 1);
                        return { ...prev, parameters };
                      });
                    }}
                    className="text-red-600"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralTab();
      case 'columns':
        return renderColumnsTab();
      case 'filters':
        return renderFiltersTab();
      case 'sorting':
        return renderSortingTab();
      case 'grouping':
        return renderGroupingTab();
      case 'charts':
        return renderChartsTab();
      case 'parameters':
        return renderParametersTab();
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-semibold">
          {definitionId ? 'Edit Report' : 'Create Report'}
        </h2>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Report'}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b px-4">
        <nav className="flex space-x-4">
          {[
            { id: 'general', label: 'General' },
            { id: 'columns', label: 'Columns' },
            { id: 'filters', label: 'Filters' },
            { id: 'sorting', label: 'Sorting' },
            { id: 'grouping', label: 'Grouping' },
            { id: 'charts', label: 'Charts' },
            { id: 'parameters', label: 'Parameters' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {renderTabContent()}
      </div>

      {/* Column Dialog */}
      {showColumnDialog && (
        <ColumnDialog
          column={editingColumn}
          fields={availableFields}
          onSave={editingColumn ? 
            (col) => handleUpdateColumn(definition.columns!.findIndex(c => c.id === editingColumn.id), col) :
            handleAddColumn
          }
          onClose={() => { setShowColumnDialog(false); setEditingColumn(null); }}
        />
      )}

      {/* Filter Dialog */}
      {showFilterDialog && (
        <FilterDialog
          filter={editingFilter}
          fields={availableFields}
          onSave={handleAddFilter}
          onClose={() => { setShowFilterDialog(false); setEditingFilter(null); }}
        />
      )}
    </div>
  );
};

// Column Dialog Component
interface ColumnDialogProps {
  column: ReportColumn | null;
  fields: DataSourceField[];
  onSave: (column: ReportColumn) => void;
  onClose: () => void;
}

const ColumnDialog: React.FC<ColumnDialogProps> = ({ column, fields, onSave, onClose }) => {
  const [formData, setFormData] = useState<ReportColumn>(column || {
    id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    field: '',
    label: '',
    type: 'string',
    sortable: true,
    filterable: false,
    hidden: false,
    width: 150,
  });

  const handleSave = () => {
    if (!formData.field || !formData.label) {
      return;
    }
    onSave(formData);
  };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalCard, width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={accentBar} />
        <div style={modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={iconBox}><Settings2 size={19} color="#fff" /></div>
            <div>
              <h1 style={modalTitle}>{column ? 'Edit Column' : 'Add Column'}</h1>
              <p style={modalSubtitle}>Configure column display and aggregation</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          ><X size={15} /></button>
        </div>
        <div style={modalBody}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Field <span style={{ color: danger }}>*</span></label>
            <Select
              value={formData.field}
              onChange={(value) => {
                const field = fields.find(f => f.field === value);
                setFormData(prev => ({
                  ...prev,
                  field: value,
                  label: field?.label || value,
                  type: (field?.type as ReportColumn['type']) || 'string',
                }));
              }}
              options={fields.map(f => ({ value: f.field, label: `${f.label} (${f.field})` }))}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Label <span style={{ color: danger }}>*</span></label>
            <Input
              value={formData.label}
              onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
              placeholder="Column display label"
            />
          </div>

          <div style={formGrid}>
            <div>
              <label style={labelStyle}>Type</label>
              <Select
                value={formData.type}
                onChange={(value) => setFormData(prev => ({ ...prev, type: value as ReportColumn['type'] }))}
                options={[
                  { value: 'string', label: 'Text' },
                  { value: 'number', label: 'Number' },
                  { value: 'currency', label: 'Currency' },
                  { value: 'percentage', label: 'Percentage' },
                  { value: 'date', label: 'Date' },
                  { value: 'boolean', label: 'Yes/No' },
                ]}
              />
            </div>

            <div>
              <label style={labelStyle}>Aggregation</label>
              <Select
                value={formData.aggregation || ''}
                onChange={(value) => setFormData(prev => ({ ...prev, aggregation: (value as AggregationType) || undefined }))}
                options={[
                  { value: '', label: 'None' },
                  { value: 'sum', label: 'Sum' },
                  { value: 'avg', label: 'Average' },
                  { value: 'count', label: 'Count' },
                  { value: 'min', label: 'Minimum' },
                  { value: 'max', label: 'Maximum' },
                ]}
              />
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Width (px)</label>
            <Input
              type="number"
              value={formData.width || 150}
              onChange={(e) => setFormData(prev => ({ ...prev, width: parseInt(e.target.value) || 150 }))}
              min={50}
              max={500}
            />
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.sortable}
                onChange={(e) => setFormData(prev => ({ ...prev, sortable: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: ink }}>Sortable</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.filterable}
                onChange={(e) => setFormData(prev => ({ ...prev, filterable: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: ink }}>Filterable</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.hidden}
                onChange={(e) => setFormData(prev => ({ ...prev, hidden: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: ink }}>Hidden</span>
            </label>
          </div>
        </div>
        <div style={modalFooter}>
          <button type="button" onClick={onClose} style={btnGhostStyle}>Cancel</button>
          <button type="button" onClick={handleSave} style={tealBtn}>
            <Save size={14} />
            {column ? 'Update' : 'Add'} Column
          </button>
        </div>
      </div>
    </div>
  );
};

// Filter Dialog Component
interface FilterDialogProps {
  filter: ReportFilter | null;
  fields: DataSourceField[];
  onSave: (filter: ReportFilter) => void;
  onClose: () => void;
}

const FilterDialog: React.FC<FilterDialogProps> = ({ filter, fields, onSave, onClose }) => {
  const [formData, setFormData] = useState<ReportFilter>(filter || {
    id: `filter-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    field: '',
    operator: 'equals',
    value: undefined,
    isParameter: false,
  });

  const handleSave = () => {
    if (!formData.field) {
      return;
    }
    onSave(formData);
  };

  const operators: Array<{ value: FilterOperator; label: string }> = [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Not Contains' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'ends_with', label: 'Ends With' },
    { value: 'gt', label: 'Greater Than' },
    { value: 'gte', label: 'Greater Than or Equal' },
    { value: 'lt', label: 'Less Than' },
    { value: 'lte', label: 'Less Than or Equal' },
    { value: 'between', label: 'Between' },
    { value: 'in', label: 'In List' },
    { value: 'not_in', label: 'Not In List' },
    { value: 'is_null', label: 'Is Empty' },
    { value: 'is_not_null', label: 'Is Not Empty' },
    { value: 'today', label: 'Is Today' },
    { value: 'this_month', label: 'This Month' },
    { value: 'this_year', label: 'This Year' },
    { value: 'last_n_days', label: 'Last N Days' },
  ];

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={{ ...modalCard, width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={accentBar} />
        <div style={modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={iconBox}><SlidersHorizontal size={19} color="#fff" /></div>
            <div>
              <h1 style={modalTitle}>{filter ? 'Edit Filter' : 'Add Filter'}</h1>
              <p style={modalSubtitle}>Define filtering rules for this report</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          ><X size={15} /></button>
        </div>
        <div style={modalBody}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Field <span style={{ color: danger }}>*</span></label>
            <Select
              value={formData.field}
              onChange={(value) => setFormData(prev => ({ ...prev, field: value }))}
              options={fields.map(f => ({ value: f.field, label: `${f.label} (${f.field})` }))}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Operator</label>
            <Select
              value={formData.operator}
              onChange={(value) => setFormData(prev => ({ ...prev, operator: value as FilterOperator }))}
              options={operators.map(o => ({ value: o.value, label: o.label }))}
            />
          </div>

          {!['is_null', 'is_not_null', 'today', 'this_month', 'this_year'].includes(formData.operator) && (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Value</label>
              <Input
                value={formData.value?.toString() || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
                placeholder="Filter value"
              />
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.isParameter}
              onChange={(e) => setFormData(prev => ({ ...prev, isParameter: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: ink }}>Use as parameter (user provides value at runtime)</span>
          </label>
        </div>
        <div style={modalFooter}>
          <button type="button" onClick={onClose} style={btnGhostStyle}>Cancel</button>
          <button type="button" onClick={handleSave} style={tealBtn}>
            <Save size={14} />
            {filter ? 'Update' : 'Add'} Filter
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportBuilder;
