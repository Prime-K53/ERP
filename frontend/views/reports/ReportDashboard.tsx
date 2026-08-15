import React, { useState, useEffect, useCallback } from 'react';
import { ReportDefinition, ReportResult, ReportCategory, ReportDashboard as ReportDashboardType, ReportWidget } from '../../types/reports';
import { reportService } from '../../services/reportService';
import { logger } from '../../services/logger';
import ReportViewer from '../../components/ReportViewer';
import ReportBuilder from './ReportBuilder';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { Trash2, Play, Save, X } from 'lucide-react';
import {
  modalOverlay, modalCard, accentBar, modalHeader, iconBox, modalTitle, modalSubtitle, closeBtn,
  labelStyle, inputStyle, selectStyle, btnGhostStyle, tealBtn, modalBody, modalFooter, sectionTitle, sectionSubtitle, formGrid
} from './reportModalStyles';

interface ReportDashboardProps {
  initialCategory?: ReportCategory;
}

const ReportDashboard: React.FC<ReportDashboardProps> = ({ initialCategory }) => {
  const [definitions, setDefinitions] = useState<ReportDefinition[]>([]);
  const [dashboards, setDashboards] = useState<ReportDashboardType[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // View states
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'dashboard'>('list');
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedDashboard, setSelectedDashboard] = useState<ReportDashboardType | null>(null);
  
  // Parameter dialog
  const [showParameterDialog, setShowParameterDialog] = useState(false);
  const [reportParameters, setReportParameters] = useState<Record<string, any>>({});

  // Load definitions and dashboards
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await reportService.initialize();
      
      const allDefinitions = reportService.getDefinitions();
      setDefinitions(allDefinitions);
      
      const allDashboards = reportService.getDashboards();
      setDashboards(allDashboards);
      
      if (initialCategory) {
        setSelectedCategory(initialCategory);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load reports';
      setError(message);
      logger.error('Failed to load reports', err as Error);
    } finally {
      setLoading(false);
    }
  };

  // Filter definitions based on category and search
  const filteredDefinitions = React.useMemo(() => {
    let filtered = definitions;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(def => def.category === selectedCategory);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(def =>
        def.name.toLowerCase().includes(query) ||
        def.description?.toLowerCase().includes(query) ||
        def.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [definitions, selectedCategory, searchQuery]);

  // Group definitions by category
  const groupedDefinitions = React.useMemo(() => {
    const groups: Record<string, ReportDefinition[]> = {};
    
    filteredDefinitions.forEach(def => {
      const category = def.category || 'custom';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(def);
    });
    
    return groups;
  }, [filteredDefinitions]);

  // Run a report
  const handleRunReport = async (definition: ReportDefinition, parameters?: Record<string, any>) => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if report has parameters that need values
      const requiredParams = definition.parameters?.filter(p => p.required);
      if (requiredParams && requiredParams.length > 0 && !parameters) {
        setSelectedReport(definition);
        setReportParameters({});
        setShowParameterDialog(true);
        return;
      }
      
      const result = await reportService.executeReport(definition.id, parameters, 'current-user');
      setReportResult(result);
      setSelectedReport(definition);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run report';
      setError(message);
      logger.error('Failed to run report', err as Error, { definitionId: definition.id });
    } finally {
      setLoading(false);
    }
  };

  // Handle parameter submission
  const handleParameterSubmit = async () => {
    if (!selectedReport) return;
    
    setShowParameterDialog(false);
    await handleRunReport(selectedReport, reportParameters);
  };

  // Create new report
  const handleCreateReport = () => {
    setEditingDefinition(null);
    setShowBuilder(true);
  };

  // Edit existing report
  const handleEditReport = (definition: ReportDefinition) => {
    setEditingDefinition(definition.id);
    setShowBuilder(true);
  };

  // Delete report
  const handleDeleteReport = async (id: string) => {
    try {
      await reportService.deleteDefinition(id);
      setDefinitions(prev => prev.filter(def => def.id !== id));
      setShowDeleteConfirm(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete report';
      setError(message);
      logger.error('Failed to delete report', err as Error, { definitionId: id });
    }
  };

  // Handle save from builder
  const handleBuilderSave = (definition: ReportDefinition) => {
    setShowBuilder(false);
    setEditingDefinition(null);
    loadData(); // Refresh the list
  };

  // Duplicate report
  const handleDuplicateReport = async (definition: ReportDefinition) => {
    try {
      const newDefinition = await reportService.createDefinition({
        ...definition,
        name: `${definition.name} (Copy)`,
        isPublic: false,
      }, 'current-user');
      
      setDefinitions(prev => [...prev, newDefinition]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to duplicate report';
      setError(message);
      logger.error('Failed to duplicate report', err as Error);
    }
  };

  // Get category icon
  const getCategoryIcon = (category: ReportCategory): string => {
    const icons: Record<ReportCategory, string> = {
      financial: '💰',
      sales: '📈',
      inventory: '📦',
      purchasing: '🛒',
      hr: '👥',
      production: '🏭',
      banking: '🏦',
      tax: '📜',
      custom: '📊',
    };
    return icons[category] || '📊';
  };

  // Get category label
  const getCategoryLabel = (category: ReportCategory | string): string => {
    const labels: Record<string, string> = {
      financial: 'Financial Reports',
      sales: 'Sales Reports',
      inventory: 'Inventory Reports',
      purchasing: 'Purchasing Reports',
      hr: 'HR & Payroll',
      production: 'Production Reports',
      banking: 'Banking Reports',
      tax: 'Tax Reports',
      custom: 'Custom Reports',
    };
    return labels[category] || category;
  };

  // Render report list
  const renderReportList = () => (
    <div className="space-y-6">
      {Object.entries(groupedDefinitions).map(([category, reports]) => (
        <div key={category}>
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <span className="mr-2">{getCategoryIcon(category as ReportCategory)}</span>
            {getCategoryLabel(category)}
            <Badge variant="secondary" className="ml-2">{reports.length}</Badge>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 tablet-auto-fit-250 gap-4">
            {reports.map(report => (
              <Card key={report.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-blue-600">{report.name}</h4>
                  <Badge variant={report.isPublic ? 'success' : 'secondary'}>
                    {report.isPublic ? 'Public' : 'Private'}
                  </Badge>
                </div>
                {report.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{report.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mb-3">
                  {report.tags?.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
                <div className="flex justify-between items-center text-sm text-gray-500 mb-3">
                  <span>Type: {report.type}</span>
                  <span>{report.columns?.length || 0} columns</span>
                </div>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => handleRunReport(report)}
                    disabled={loading}
                  >
                    Run
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditReport(report)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDuplicateReport(report)}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(report.id)}
                    className="text-red-600"
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
      
      {filteredDefinitions.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No reports found</div>
          <Button onClick={handleCreateReport}>Create Your First Report</Button>
        </div>
      )}
    </div>
  );

  // Render report grid
  const renderReportGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 tablet-auto-fit-220 gap-4">
      {filteredDefinitions.map(report => (
        <Card key={report.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleRunReport(report)}>
          <div className="text-3xl mb-2">{getCategoryIcon(report.category)}</div>
          <h4 className="font-medium mb-1">{report.name}</h4>
          <p className="text-sm text-gray-500 line-clamp-2">{report.description || 'No description'}</p>
          <div className="mt-3 flex items-center justify-between">
            <Badge variant="outline">{report.type}</Badge>
            <span className="text-xs text-gray-400">{report.columns?.length || 0} cols</span>
          </div>
        </Card>
      ))}
    </div>
  );

  // Render dashboard view
  const renderDashboardView = () => {
    if (!selectedDashboard) {
      return (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Select a Dashboard</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 tablet-auto-fit-250 gap-4">
            {dashboards.map(dashboard => (
              <Card
                key={dashboard.id}
                className="p-4 cursor-pointer hover:shadow-md"
                onClick={() => setSelectedDashboard(dashboard)}
              >
                <h4 className="font-medium">{dashboard.name}</h4>
                <p className="text-sm text-gray-500">{dashboard.description}</p>
                <div className="mt-2 text-xs text-gray-400">
                  {dashboard.widgets?.length || 0} widgets
                </div>
              </Card>
            ))}
          </div>
          {dashboards.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No dashboards configured
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">{selectedDashboard.name}</h3>
          <Button variant="outline" size="sm" onClick={() => setSelectedDashboard(null)}>
            Back to Dashboards
          </Button>
        </div>
        <div className="grid grid-cols-12 tablet-auto-fit-250 tablet-auto-fit-reset gap-4">
          {selectedDashboard.widgets?.map(widget => (
            <div
              key={widget.id}
              className={`col-span-${widget.width || 6} row-span-${widget.height || 1}`}
            >
              <Card className="p-4 h-full">
                <h4 className="font-medium mb-2">{widget.title}</h4>
                {/* Widget content would be rendered here */}
                <div className="text-gray-500 text-sm">
                  Widget content placeholder
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // If showing report builder
  if (showBuilder) {
    return (
      <ReportBuilder
        definitionId={editingDefinition || undefined}
        onSave={handleBuilderSave}
        onCancel={() => { setShowBuilder(false); setEditingDefinition(null); }}
      />
    );
  }

  // If showing report result
  if (reportResult) {
    return (
      <ReportViewer
        result={reportResult}
        onClose={() => { setReportResult(null); setSelectedReport(null); }}
        onRefresh={() => selectedReport && handleRunReport(selectedReport)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-semibold">Reports</h2>
        <div className="flex items-center space-x-2">
          <Button onClick={handleCreateReport}>
            + New Report
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* Filters and Controls */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex flex-wrap items-center gap-4">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports..."
            className="max-w-xs"
          />
          
          <Select
            value={selectedCategory}
            onChange={(value) => setSelectedCategory(value as ReportCategory | 'all')}
            options={[
              { value: 'all', label: 'All Categories' },
              { value: 'financial', label: '💰 Financial' },
              { value: 'sales', label: '📈 Sales' },
              { value: 'inventory', label: '📦 Inventory' },
              { value: 'purchasing', label: '🛒 Purchasing' },
              { value: 'hr', label: '👥 HR & Payroll' },
              { value: 'production', label: '🏭 Production' },
              { value: 'banking', label: '🏦 Banking' },
              { value: 'custom', label: '📊 Custom' },
            ]}
            className="w-48"
          />
          
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-white'}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 text-sm ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-white'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('dashboard')}
              className={`px-3 py-2 text-sm ${viewMode === 'dashboard' ? 'bg-blue-500 text-white' : 'bg-white'}`}
            >
              Dashboard
            </button>
          </div>
          
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            ↻ Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading reports...</div>
          </div>
        ) : (
          <>
            {viewMode === 'list' && renderReportList()}
            {viewMode === 'grid' && renderReportGrid()}
            {viewMode === 'dashboard' && renderDashboardView()}
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div style={modalOverlay} onClick={() => setShowDeleteConfirm(null)}>
          <div style={{ ...modalCard, width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={accentBar} />
            <div style={modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ ...iconBox, background: `linear-gradient(155deg, ${danger}, #8b2c22)` }}><Trash2 size={19} color="#fff" /></div>
                <div>
                  <h1 style={modalTitle}>Delete Report</h1>
                  <p style={modalSubtitle}>This action cannot be undone</p>
                </div>
              </div>
              <button onClick={() => setShowDeleteConfirm(null)} aria-label="Close" style={closeBtn}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
              ><X size={15} /></button>
            </div>
            <div style={{ ...modalBody, padding: '24px 28px' }}>
              <p style={{ fontSize: 14, color: ink, lineHeight: 1.6, margin: 0 }}>
                Are you sure you want to delete <strong>{showDeleteConfirm}</strong>? This action cannot be undone.
              </p>
            </div>
            <div style={modalFooter}>
              <button type="button" onClick={() => setShowDeleteConfirm(null)} style={btnGhostStyle}>Cancel</button>
              <button type="button" onClick={() => handleDeleteReport(showDeleteConfirm)} style={{ ...tealBtn, background: `linear-gradient(155deg, ${danger}, #8b2c22)`, boxShadow: `0 6px 16px -6px rgba(180,57,49,.55)` }}>
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parameter Dialog */}
      {showParameterDialog && selectedReport && (
        <div style={modalOverlay} onClick={() => setShowParameterDialog(false)}>
          <div style={{ ...modalCard, width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={accentBar} />
            <div style={modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={iconBox}><Play size={19} color="#fff" /></div>
                <div>
                  <h1 style={modalTitle}>Report Parameters</h1>
                  <p style={modalSubtitle}>Configure filters before running the report</p>
                </div>
              </div>
              <button onClick={() => setShowParameterDialog(false)} aria-label="Close" style={closeBtn}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
              ><X size={15} /></button>
            </div>
            <div style={modalBody}>
              {selectedReport.parameters?.map(param => (
                <div key={param.id} style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>
                    {param.label}
                    {param.required && <span style={{ color: danger }}>*</span>}
                  </label>

                  {param.type === 'date' && (
                    <Input
                      type="date"
                      value={reportParameters[param.name] || ''}
                      onChange={(e) => setReportParameters(prev => ({
                        ...prev,
                        [param.name]: e.target.value,
                      }))}
                    />
                  )}

                  {(param.type as string) === 'dateRange' && (
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Input
                        type="date"
                        placeholder="Start date"
                        value={reportParameters[`${param.name}_start`] || ''}
                        onChange={(e) => setReportParameters(prev => ({
                          ...prev,
                          [`${param.name}_start`]: e.target.value,
                        }))}
                      />
                      <Input
                        type="date"
                        placeholder="End date"
                        value={reportParameters[`${param.name}_end`] || ''}
                        onChange={(e) => setReportParameters(prev => ({
                          ...prev,
                          [`${param.name}_end`]: e.target.value,
                        }))}
                      />
                    </div>
                  )}

                  {param.type === 'number' && (
                    <Input
                      type="number"
                      value={reportParameters[param.name] || ''}
                      onChange={(e) => setReportParameters(prev => ({
                        ...prev,
                        [param.name]: parseFloat(e.target.value),
                      }))}
                    />
                  )}

                  {param.type === 'boolean' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={reportParameters[param.name] || false}
                        onChange={(e) => setReportParameters(prev => ({
                          ...prev,
                          [param.name]: e.target.checked,
                        }))}
                        style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, color: ink }}>Yes</span>
                    </label>
                  )}

                  {param.type === 'select' && param.options && (
                    <Select
                      value={reportParameters[param.name] || ''}
                      onChange={(value) => setReportParameters(prev => ({
                        ...prev,
                        [param.name]: value,
                      }))}
                      options={param.options.map(opt => ({
                        value: opt.value,
                        label: opt.label,
                      }))}
                    />
                  )}

                  {param.type === 'string' && (
                    <Input
                      value={reportParameters[param.name] || ''}
                      onChange={(e) => setReportParameters(prev => ({
                        ...prev,
                        [param.name]: e.target.value,
                      }))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={modalFooter}>
              <button type="button" onClick={() => setShowParameterDialog(false)} style={btnGhostStyle}>Cancel</button>
              <button type="button" onClick={handleParameterSubmit} style={tealBtn}>
                <Play size={14} />
                Run Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportDashboard;
