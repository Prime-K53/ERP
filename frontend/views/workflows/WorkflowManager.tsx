import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workflowService } from '../../services/workflowService';
import { 
  WorkflowDefinition, 
  WorkflowInstance, 
  WorkflowStats,
  WorkflowStatus,
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_PRIORITY_COLORS
} from '../../types/workflow';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card } from '../../components/Card';
import { useAuth } from '../../context/AuthContext';
import { logger } from '../../services/logger';

export const WorkflowManager: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser, notify } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'definitions' | 'instances' | 'stats'>('definitions');
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | ''>('');

  useEffect(() => {
    initializeService();
  }, []);

  const initializeService = async () => {
    try {
      await workflowService.initialize();
      loadData();
    } catch (error) {
      logger.error('Failed to initialize workflow service', error as Error);
      notify('Failed to load workflows', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadData = () => {
    setDefinitions(workflowService.getDefinitions());
    setInstances(workflowService.getInstances());
    setStats(workflowService.getStats());
  };

  const handleToggleDefinition = async (id: string, isActive: boolean) => {
    if (!currentUser) return;
    
    try {
      await workflowService.updateDefinition(id, { isActive }, currentUser.id);
      loadData();
      notify(`Workflow ${isActive ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
      logger.error('Failed to toggle workflow', error as Error);
      notify('Failed to update workflow', 'error');
    }
  };

  const handleDeleteDefinition = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow definition?')) return;
    
    try {
      await workflowService.deleteDefinition(id);
      loadData();
      notify('Workflow deleted', 'success');
    } catch (error) {
      logger.error('Failed to delete workflow', error as Error);
      notify(error instanceof Error ? error.message : 'Failed to delete workflow', 'error');
    }
  };

  const handleCancelInstance = async (instanceId: string) => {
    if (!currentUser || !confirm('Are you sure you want to cancel this workflow?')) return;
    
    try {
      await workflowService.cancelWorkflow(instanceId, currentUser.id, 'Cancelled by user');
      loadData();
      notify('Workflow cancelled', 'success');
    } catch (error) {
      logger.error('Failed to cancel workflow', error as Error);
      notify('Failed to cancel workflow', 'error');
    }
  };

  const filteredInstances = instances.filter(instance => {
    if (statusFilter && instance.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        instance.entityId.toLowerCase().includes(query) ||
        instance.entityReference?.toLowerCase().includes(query) ||
        instance.workflowDefinitionName?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getStatusColor = (status: WorkflowStatus) => {
    return WORKFLOW_STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    return WORKFLOW_PRIORITY_COLORS[priority] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading workflows...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Workflow Management</h1>
        <Button onClick={() => navigate('/workflows/designer')}>
          Create Workflow
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-500">Total Workflows</div>
            <div className="text-3xl font-bold">{stats.totalInstances}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500">Pending Approval</div>
            <div className="text-3xl font-bold text-yellow-600">{stats.pendingInstances}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500">Completed</div>
            <div className="text-3xl font-bold text-green-600">{stats.completedInstances}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-500">Overdue</div>
            <div className="text-3xl font-bold text-red-600">{stats.overdueInstances}</div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex space-x-8">
          <button
            className={`py-4 px-1 border-b-2 font-medium ${
              activeTab === 'definitions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('definitions')}
          >
            Workflow Definitions ({definitions.length})
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium ${
              activeTab === 'instances'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('instances')}
          >
            Active Instances ({instances.filter(i => i.status === 'pending').length})
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium ${
              activeTab === 'stats'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('stats')}
          >
            Statistics
          </button>
        </nav>
      </div>

      {/* Definitions Tab */}
      {activeTab === 'definitions' && (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Steps</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {definitions.map((def) => (
                <tr key={def.id}>
                  <td className="px-6 py-4">
                    <div className="font-medium">{def.name}</div>
                    <div className="text-sm text-gray-500">{def.description}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 rounded text-sm">
                      {def.entityType.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">{def.steps.length}</td>
                  <td className="px-6 py-4">v{def.version}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      def.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {def.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/workflows/designer/${def.id}`)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleDefinition(def.id, !def.isActive)}
                        className="text-yellow-600 hover:text-yellow-800 text-sm"
                      >
                        {def.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteDefinition(def.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {definitions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No workflow definitions found. Create your first workflow to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Instances Tab */}
      {activeTab === 'instances' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <Input
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WorkflowStatus | '')}
              className="border rounded-md p-2"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="escalated">Escalated</option>
            </select>
          </div>

          <Card className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workflow</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Step</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInstances.map((instance) => (
                  <tr key={instance.id}>
                    <td className="px-6 py-4">
                      <div className="font-medium">{instance.workflowDefinitionName}</div>
                      <div className="text-sm text-gray-500">{instance.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{instance.entityType.replace('_', ' ')}</div>
                      <div className="text-sm text-gray-500">
                        {instance.entityReference || instance.entityId}
                      </div>
                    </td>
                    <td className="px-6 py-4">{instance.currentStepName}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(instance.priority)}`}>
                        {instance.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(instance.status)}`}>
                        {instance.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(instance.startedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/workflows/${instance.id}`)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          View
                        </button>
                        {instance.status === 'pending' && (
                          <button
                            onClick={() => handleCancelInstance(instance.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredInstances.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No workflow instances found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {/* By Entity Type */}
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Workflows by Entity Type</h3>
              <div className="space-y-2">
                {Object.entries(stats.byEntityType).map(([type, data]) => (
                  <div key={type} className="flex justify-between items-center">
                    <span className="text-sm">{type.replace('_', ' ')}</span>
                    <div className="flex gap-2 text-xs">
                      <span className="text-yellow-600">{data.pending} pending</span>
                      <span className="text-green-600">{data.completed} completed</span>
                      <span className="text-red-600">{data.rejected} rejected</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* By Priority */}
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Workflows by Priority</h3>
              <div className="space-y-2">
                {Object.entries(stats.byPriority).map(([priority, count]) => (
                  <div key={priority} className="flex justify-between items-center">
                    <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(priority)}`}>
                      {priority}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Performance Metrics */}
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Performance Metrics</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Avg. Completion Time</span>
                  <span className="font-medium">{stats.averageCompletionTime.toFixed(1)} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Escalation Rate</span>
                  <span className="font-medium">{stats.escalationRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Overdue Instances</span>
                  <span className="font-medium text-red-600">{stats.overdueInstances}</span>
                </div>
              </div>
            </Card>

            {/* Summary */}
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Total Instances</span>
                  <span className="font-medium">{stats.totalInstances}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Pending</span>
                  <span className="font-medium text-yellow-600">{stats.pendingInstances}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Completed</span>
                  <span className="font-medium text-green-600">{stats.completedInstances}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Rejected</span>
                  <span className="font-medium text-red-600">{stats.rejectedInstances}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowManager;
