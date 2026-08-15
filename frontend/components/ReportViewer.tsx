import React, { useState, useEffect, useCallback } from 'react';
import { ReportResult, ReportRow, ReportColumn, ReportChart, ExportFormat } from '../types/reports';
import { reportService } from '../services/reportService';
import { logger } from '../services/logger';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import Card from './Card';
import Badge from './Badge';
import Pagination from './Pagination';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ReportViewerProps {
  result: ReportResult;
  onClose?: () => void;
  onRefresh?: () => void;
  onExport?: (format: ExportFormat) => void;
  showControls?: boolean;
  showCharts?: boolean;
  showSummary?: boolean;
  showGrouping?: boolean;
  currency?: string;
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const ReportViewer: React.FC<ReportViewerProps> = ({
  result,
  onClose,
  onRefresh,
  onExport,
  showControls = true,
  showCharts = true,
  showSummary = true,
  showGrouping = true,
  currency = '$',
}) => {
  const [currentPage, setCurrentPage] = useState(result.page || 1);
  const [pageSize, setPageSize] = useState(result.pageSize || 50);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');
  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);
  const [activeView, setActiveView] = useState<'table' | 'charts' | 'summary'>('table');

  // Filter data based on search text
  const filteredData = React.useMemo(() => {
    if (!filterText) return result.rows;
    
    const lowerFilter = filterText.toLowerCase();
    return result.rows.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(lowerFilter)
      )
    );
  }, [result.rows, filterText]);

  // Sort data
  const sortedData = React.useMemo(() => {
    if (!sortField) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [filteredData, sortField, sortDirection]);

  // Paginate data
  const paginatedData = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Handle sort
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Handle export
  const handleExport = (format: ExportFormat) => {
    if (onExport) {
      onExport(format);
    } else {
      // Default export behavior
      exportReport(format);
    }
  };

  // Export report
  const exportReport = (format: ExportFormat) => {
    try {
      switch (format) {
        case 'csv':
          exportToCSV();
          break;
        case 'json':
          exportToJSON();
          break;
        case 'print':
          window.print();
          break;
        default:
          logger.warn('Export format not supported', { format });
      }
    } catch (error) {
      logger.error('Export failed', error as Error);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const columns = result.columns.filter(c => !c.hidden);
    const headers = columns.map(c => c.label).join(',');
    const rows = sortedData.map(row =>
      columns.map(c => {
        const value = row[c.field];
        // Escape quotes and wrap in quotes if contains comma
        const strValue = String(value ?? '');
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    downloadFile(csv, `${result.reportName}.csv`, 'text/csv');
  };

  // Export to JSON
  const exportToJSON = () => {
    const data = {
      reportName: result.reportName,
      generatedAt: result.generatedAt,
      totalRows: result.totalRows,
      summary: result.summary,
      data: sortedData,
    };
    
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `${result.reportName}.json`, 'application/json');
  };

  // Download file helper
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Background: Save to local workspace if available
    (async () => {
      try {
        const { api } = await import('../services/api');
        await api.system.saveToWorkspace('Exports', filename, content);
      } catch (err) {
        // Silent fail if workspace not configured
      }
    })();
  };

  // Format cell value
  const formatCellValue = (value: any, column: ReportColumn): string => {
    if (value === null || value === undefined) return '-';
    
    switch (column.type) {
      case 'currency':
        return `${currency}${Number(value).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
      case 'percentage':
        return `${(Number(value) * 100).toFixed(2)}%`;
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'boolean':
        return value ? 'Yes' : 'No';
      case 'number':
        return new Intl.NumberFormat('en-US').format(Number(value));
      default:
        return String(value);
    }
  };

  // Render chart
  const renderChart = (chart: ReportChart) => {
    const chartData = result.chartData?.[chart.id] || [];
    
    switch (chart.type) {
      case 'bar':
        return (
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="y" fill={CHART_COLORS[0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      
      case 'line':
        return (
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="y" stroke={CHART_COLORS[1]} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      
      case 'pie':
        return (
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      
      case 'doughnut':
        return (
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      
      case 'area':
        return (
          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={300} minWidth={0}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="y" fill={CHART_COLORS[2]} stroke={CHART_COLORS[2]} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      
      default:
        return <div className="text-gray-500">Unsupported chart type</div>;
    }
  };

  // Render summary section
  const renderSummary = () => {
    if (!result.summary || Object.keys(result.summary).length === 0) {
      return <div className="text-gray-500">No summary data available</div>;
    }

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {result.columns
          .filter(col => col.aggregation)
          .map(col => {
            const value = result.summary[col.id];
            if (value === undefined) return null;
            
            return (
              <Card key={col.id} className="p-4">
                <div className="text-sm text-gray-500">{col.label}</div>
                <div className="text-2xl font-semibold">
                  {formatCellValue(value, col)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {col.aggregation?.toUpperCase()}
                </div>
              </Card>
            );
          })}
        
        <Card className="p-4">
          <div className="text-sm text-gray-500">Total Rows</div>
          <div className="text-2xl font-semibold">{result.totalRows}</div>
        </Card>
        
        <Card className="p-4">
          <div className="text-sm text-gray-500">Execution Time</div>
          <div className="text-2xl font-semibold">{result.executionTimeMs}ms</div>
        </Card>
      </div>
    );
  };

  // Render grouped data
  const renderGroupedData = () => {
    if (!result.groupedData || result.groupedData.length === 0) {
      return renderTable();
    }

    return (
      <div className="space-y-6">
        {result.groupedData.map((group, groupIndex) => (
          <div key={groupIndex} className="border rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 font-medium">
              {group.groupLabel}
              <span className="text-sm text-gray-500 ml-2">({group.rows.length} items)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {result.columns.filter(c => !c.hidden).map(column => (
                      <th
                        key={column.id}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        style={{ width: column.width }}
                        onClick={() => column.sortable && handleSort(column.field)}
                      >
                        <div className="flex items-center space-x-1">
                          <span>{column.label}</span>
                          {sortField === column.field && (
                            <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {group.rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className={`hover:bg-gray-50 cursor-pointer ${selectedRow === row ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedRow(row)}
                    >
                      {result.columns.filter(c => !c.hidden).map(column => (
                        <td key={column.id} className="px-4 py-2 text-sm whitespace-nowrap">
                          {formatCellValue(row[column.field], column)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Group subtotal */}
            {group.subtotal && (
              <div className="bg-gray-50 px-4 py-2 text-sm font-medium">
                Subtotal:
                {result.columns
                  .filter(c => c.aggregation && !c.hidden)
                  .map(column => (
                    <span key={column.id} className="ml-4">
                      {column.label}: {formatCellValue(group.subtotal[column.field], column)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render table
  const renderTable = () => {
    const columns = result.columns.filter(c => !c.hidden);
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(column => (
                <th
                  key={column.id}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(column.field)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {sortField === column.field && (
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                    {column.aggregation && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {column.aggregation}
                      </Badge>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  No data available
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`hover:bg-gray-50 cursor-pointer ${selectedRow === row ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedRow(row)}
                >
                  {columns.map(column => (
                    <td key={column.id} className="px-4 py-2 text-sm whitespace-nowrap">
                      {formatCellValue(row[column.field], column)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          
          {/* Footer with totals */}
          {result.summary && columns.some(c => c.aggregation) && (
            <tfoot className="bg-gray-50 font-medium">
              <tr>
                {columns.map(column => (
                  <td key={column.id} className="px-4 py-2 text-sm">
                    {column.aggregation && result.summary[column.id] !== undefined
                      ? formatCellValue(result.summary[column.id], column)
                      : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b">
        <div>
          <h2 className="text-xl font-semibold">{result.reportName}</h2>
          <div className="text-sm text-gray-500">
            Generated on {new Date(result.generatedAt).toLocaleString()}
            {result.generatedBy && ` by ${result.generatedBy}`}
          </div>
        </div>
        
        {showControls && (
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={onRefresh}>
              ↻ Refresh
            </Button>
            <Select
              value=""
              onChange={(value) => handleExport(value as ExportFormat)}
              options={[
                { value: '', label: 'Export...' },
                { value: 'csv', label: 'Export to CSV' },
                { value: 'json', label: 'Export to JSON' },
                { value: 'print', label: 'Print' },
              ]}
              className="w-32"
            />
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                ✕
              </Button>
            )}
          </div>
        )}
      </div>

      {/* View Tabs */}
      <div className="border-b px-4">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveView('table')}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeView === 'table'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Data Table
          </button>
          {showCharts && result.charts && result.charts.length > 0 && (
            <button
              onClick={() => setActiveView('charts')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeView === 'charts'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Charts
            </button>
          )}
          {showSummary && (
            <button
              onClick={() => setActiveView('summary')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeView === 'summary'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Summary
            </button>
          )}
        </nav>
      </div>

      {/* Filter Bar */}
      {activeView === 'table' && (
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-4">
            <Input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search in results..."
              className="max-w-md"
            />
            <div className="text-sm text-gray-500">
              Showing {paginatedData.length} of {sortedData.length} rows
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeView === 'table' && (
          showGrouping && result.groupedData ? renderGroupedData() : renderTable()
        )}
        
        {activeView === 'charts' && (
          <div className="space-y-6">
            {result.charts?.map((chart, index) => (
              <Card key={index} className="p-4">
                <h3 className="text-lg font-medium mb-4">{chart.title}</h3>
                {renderChart(chart)}
              </Card>
            ))}
          </div>
        )}
        
        {activeView === 'summary' && renderSummary()}
      </div>

      {/* Pagination */}
      {activeView === 'table' && totalPages > 1 && (
        <div className="border-t p-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="px-4">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </Button>
              <Select
                value={pageSize.toString()}
                onChange={(value) => {
                  setPageSize(parseInt(value));
                  setCurrentPage(1);
                }}
                options={[
                  { value: '10', label: '10 / page' },
                  { value: '25', label: '25 / page' },
                  { value: '50', label: '50 / page' },
                  { value: '100', label: '100 / page' },
                ]}
                className="w-32"
              />
            </div>
          </div>
        </div>
      )}

      {/* Row Detail Panel */}
      {selectedRow && (
        <div className="border-t p-4 bg-gray-50">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium">Row Details</h4>
            <Button variant="ghost" size="sm" onClick={() => setSelectedRow(null)}>
              ✕
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {result.columns.filter(c => !c.hidden).map(column => (
              <div key={column.id}>
                <div className="text-xs text-gray-500">{column.label}</div>
                <div className="font-medium">{formatCellValue(selectedRow[column.field], column)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportViewer;
