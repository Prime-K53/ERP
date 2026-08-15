import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { workflowService } from '../../services/workflowService';
import { 
  WorkflowDefinition, 
  WorkflowStep, 
  WorkflowEntityType,
  WorkflowCondition,
  DEFAULT_WORKFLOW_TEMPLATES
} from '../../types/workflow';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card } from '../../components/Card';
import { useAuth } from '../../context/AuthContext';
import { logger } from '../../services/logger';

export const WorkflowDesigner: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user: currentUser, notify } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflow, setWorkflow] = useState<Partial<WorkflowDefinition>>({
    name: '',
    description: '',
    entityType: 'expense',
    steps: [],
    isActive: true,
    allowParallelInstances: true,
  });
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  useEffect(() => {
    initializeService();
  }, [id]);

  const initializeService = async () => {
    try {
      await workflowService.initialize();
      
      if (id) {
        const existing = workflowService.getDefinition(id);
        if (existing) {
          setWorkflow(existing);
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow', error as Error);
      notify('Failed to load workflow', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!workflow.name || !workflow.entityType || !workflow.steps?.length) {
      notify('Please fill in all required fields', 'error');
      return;
    }

    if (!currentUser) {
      notify('User not authenticated', 'error');
      return;
    }

    try {
      setSaving(true);
      
      // Set initial step if not set
      if (!workflow.initialStepId && workflow.steps.length > 0) {
        workflow.initialStepId = workflow.steps[0].id;
      }
      
      // Set final step
      if (workflow.steps.length > 0) {
        const maxOrderStep = workflow.steps.reduce((max, step) => 
          step.order > max.order ? step : max
        );
        workflow.finalStepId = maxOrderStep.id;
      }

      if (id) {
        await workflowService.updateDefinition(id, workflow, currentUser.id);
        notify('Workflow updated successfully', 'success');
      } else {
        await workflowService.createDefinition(
          workflow as Omit<WorkflowDefinition, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
          currentUser.id
        );
        notify('Workflow created successfully', 'success');
      }
      
      navigate('/workflows');
    } catch (error) {
      logger.error('Failed to save workflow', error as Error);
      notify(error instanceof Error ? error.message : 'Failed to save workflow', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    const newStep: WorkflowStep = {
      id: `STEP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: `Step ${(workflow.steps?.length || 0) + 1}`,
      order: (workflow.steps?.length || 0) + 1,
      approverRole: '',
      requiredApprovals: 1,
      timeoutHours: 24,
      notifyRequester: true,
    };
    
    setWorkflow({
      ...workflow,
      steps: [...(workflow.steps || []), newStep],
    });
    setSelectedStep(newStep);
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    const updatedSteps = workflow.steps?.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    );
    setWorkflow({ ...workflow, steps: updatedSteps });
    
    if (selectedStep?.id === stepId) {
      setSelectedStep({ ...selectedStep, ...updates });
    }
  };

  const removeStep = (stepId: string) => {
    const filteredSteps = workflow.steps?.filter(step => step.id !== stepId);
    // Reorder remaining steps
    const reorderedSteps = filteredSteps?.map((step, index) => ({
      ...step,
      order: index + 1,
    }));
    setWorkflow({ ...workflow, steps: reorderedSteps });
    
    if (selectedStep?.id === stepId) {
      setSelectedStep(null);
    }
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    const steps = [...(workflow.steps || [])];
    const index = steps.findIndex(s => s.id === stepId);
    
    if (direction === 'up' && index > 0) {
      [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
    } else if (direction === 'down' && index < steps.length - 1) {
      [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
    }
    
    // Update order
    const reorderedSteps = steps.map((step, i) => ({ ...step, order: i + 1 }));
    setWorkflow({ ...workflow, steps: reorderedSteps });
  };

  const loadFromTemplate = async (templateId: string) => {
    try {
      const template = DEFAULT_WORKFLOW_TEMPLATES.find(t => t.id === templateId);
      if (template && currentUser) {
        setWorkflow({
          ...template.definition,
          name: template.name,
          description: template.description,
        });
        setShowTemplateModal(false);
        notify('Template loaded', 'success');
      }
    } catch (error) {
      logger.error('Failed to load template', error as Error);
      notify('Failed to load template', 'error');
    }
  };

  const addCondition = (stepId: string) => {
    const step = workflow.steps?.find(s => s.id === stepId);
    if (!step) return;

    const newCondition: WorkflowCondition = {
      id: `COND-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: 'amount_greater_than',
      field: 'amount',
      operator: 'gt',
      value: 1000,
    };

    updateStep(stepId, {
      conditions: [...(step.conditions || []), newCondition],
    });
  };

  const updateCondition = (stepId: string, conditionId: string, updates: Partial<WorkflowCondition>) => {
    const step = workflow.steps?.find(s => s.id === stepId);
    if (!step) return;

    const updatedConditions = step.conditions?.map(c =>
      c.id === conditionId ? { ...c, ...updates } : c
    );
    updateStep(stepId, { conditions: updatedConditions });
  };

  const removeCondition = (stepId: string, conditionId: string) => {
    const step = workflow.steps?.find(s => s.id === stepId);
    if (!step) return;

    const filteredConditions = step.conditions?.filter(c => c.id !== conditionId);
    updateStep(stepId, { conditions: filteredConditions });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading workflow designer...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">
          {id ? 'Edit Workflow' : 'Create Workflow'}
        </h1>
        <div className="flex gap-2">
          {!id && (
            <Button variant="outline" onClick={() => setShowTemplateModal(true)}>
              Load Template
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/workflows')}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Workflow'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Panel - Workflow Settings */}
        <div className="col-span-1 space-y-4">
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">Workflow Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <Input
                  id="workflow-name"
                  name="workflow_name"
                  value={workflow.name || ''}
                  onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
                  placeholder="Enter workflow name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  id="workflow-description"
                  name="workflow_description"
                  value={workflow.description || ''}
                  onChange={(e) => setWorkflow({ ...workflow, description: e.target.value })}
                  placeholder="Enter description"
                  className="w-full border rounded-md p-2"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Entity Type *</label>
                <select
                  id="entity-type"
                  name="entity_type"
                  value={workflow.entityType || 'expense'}
                  onChange={(e) => setWorkflow({ 
                    ...workflow, 
                    entityType: e.target.value as WorkflowEntityType 
                  })}
                  className="w-full border rounded-md p-2"
                >
                  <option value="expense">Expense</option>
                  <option value="purchase_order">Purchase Order</option>
                  <option value="invoice">Invoice</option>
                  <option value="quotation">Quotation</option>
                  <option value="work_order">Work Order</option>
                  <option value="leave_request">Leave Request</option>
                  <option value="expense_claim">Expense Claim</option>
                  <option value="payment_request">Payment Request</option>
                  <option value="refund_request">Refund Request</option>
                  <option value="inventory_adjustment">Inventory Adjustment</option>
                  <option value="user_access_request">User Access Request</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  name="is_active"
                  checked={workflow.isActive ?? true}
                  onChange={(e) => setWorkflow({ ...workflow, isActive: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="allowParallel"
                  name="allow_parallel"
                  checked={workflow.allowParallelInstances ?? true}
                  onChange={(e) => setWorkflow({ 
                    ...workflow, 
                    allowParallelInstances: e.target.checked 
                  })}
                  className="mr-2"
                />
                <label htmlFor="allowParallel" className="text-sm font-medium">
                  Allow Parallel Instances
                </label>
              </div>
            </div>
          </Card>

          {/* Steps List */}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Steps</h2>
              <Button size="sm" onClick={addStep}>Add Step</Button>
            </div>

            <div className="space-y-2">
              {workflow.steps?.sort((a, b) => a.order - b.order).map((step, index) => (
                <div
                  key={step.id}
                  className={`p-3 border rounded cursor-pointer ${
                    selectedStep?.id === step.id ? 'border-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedStep(step)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{step.order}. {step.name}</span>
                      <div className="text-xs text-gray-500">
                        {step.approverRole || 'No role assigned'}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStep(step.id, 'up'); }}
                        disabled={index === 0}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-50"
                      >
                        ↑
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStep(step.id, 'down'); }}
                        disabled={index === (workflow.steps?.length || 0) - 1}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-50"
                      >
                        ↓
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                        className="p-1 hover:bg-red-100 text-red-600 rounded"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {(!workflow.steps || workflow.steps.length === 0) && (
                <div className="text-center text-gray-500 py-4">
                  No steps added yet
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Panel - Step Configuration */}
        <div className="col-span-2">
          {selectedStep ? (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">
                Configure Step: {selectedStep.name}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Step Name</label>
                  <Input
                    id="step-name"
                    name="step_name"
                    value={selectedStep.name}
                    onChange={(e) => updateStep(selectedStep.id, { name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Approver Role *</label>
                  <select
                    id="approver-role"
                    name="approver_role"
                    value={selectedStep.approverRole}
                    onChange={(e) => updateStep(selectedStep.id, { approverRole: e.target.value })}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">Select role...</option>
                    <option value="Admin">Administrator</option>
                    <option value="Manager">Manager</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Clerk">Clerk</option>
                    <option value="Supervisor">Supervisor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Required Approvals</label>
                  <Input
                    id="required-approvals"
                    name="required_approvals"
                    type="number"
                    min={1}
                    value={selectedStep.requiredApprovals}
                    onChange={(e) => updateStep(selectedStep.id, { 
                      requiredApprovals: parseInt(e.target.value) || 1 
                    })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Timeout (hours)</label>
                  <Input
                    id="timeout-hours"
                    name="timeout_hours"
                    type="number"
                    min={1}
                    value={selectedStep.timeoutHours || ''}
                    onChange={(e) => updateStep(selectedStep.id, { 
                      timeoutHours: parseInt(e.target.value) || undefined 
                    })}
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Escalation After (hours)</label>
                  <Input
                    id="escalation-after-hours"
                    name="escalation_after_hours"
                    type="number"
                    min={1}
                    value={selectedStep.escalationAfterHours || ''}
                    onChange={(e) => updateStep(selectedStep.id, { 
                      escalationAfterHours: parseInt(e.target.value) || undefined 
                    })}
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Escalation Step</label>
                  <select
                    id="escalation-step"
                    name="escalation_step"
                    value={selectedStep.escalationStepId || ''}
                    onChange={(e) => updateStep(selectedStep.id, { 
                      escalationStepId: e.target.value || undefined 
                    })}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">None</option>
                    {workflow.steps
                      ?.filter(s => s.id !== selectedStep.id)
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="notifyRequester"
                    name="notify_requester"
                    checked={selectedStep.notifyRequester ?? false}
                    onChange={(e) => updateStep(selectedStep.id, { notifyRequester: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="notifyRequester" className="text-sm">Notify Requester</label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="requireComments"
                    name="require_comments"
                    checked={selectedStep.requireComments ?? false}
                    onChange={(e) => updateStep(selectedStep.id, { requireComments: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="requireComments" className="text-sm">Require Comments</label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="requireAttachments"
                    name="require_attachments"
                    checked={selectedStep.requireAttachments ?? false}
                    onChange={(e) => updateStep(selectedStep.id, { requireAttachments: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="requireAttachments" className="text-sm">Require Attachments</label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="autoApprove"
                    name="auto_approve"
                    checked={selectedStep.autoApprove ?? false}
                    onChange={(e) => updateStep(selectedStep.id, { autoApprove: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="autoApprove" className="text-sm">Auto-approve (with conditions)</label>
                </div>
              </div>

              {/* Conditions */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">Conditions (Optional)</h3>
                  <Button size="sm" variant="outline" onClick={() => addCondition(selectedStep.id)}>
                    Add Condition
                  </Button>
                </div>

                <p className="text-sm text-gray-500 mb-4">
                  Conditions determine when this step should be executed. If no conditions are set, the step always runs.
                </p>

                <div className="space-y-3">
                  {selectedStep.conditions?.map((condition) => (
                    <div key={condition.id} className="flex gap-2 items-center p-2 bg-gray-50 rounded">
                      <select
                        id="condition-field"
                        name="condition_field"
                        value={condition.field}
                        onChange={(e) => updateCondition(selectedStep.id, condition.id, { field: e.target.value })}
                        className="border rounded p-1"
                      >
                        <option value="amount">Amount</option>
                        <option value="totalAmount">Total Amount</option>
                        <option value="category">Category</option>
                        <option value="description">Description</option>
                      </select>

                      <select
                        id="condition-operator"
                        name="condition_operator"
                        value={condition.operator}
                        onChange={(e) => updateCondition(selectedStep.id, condition.id, { 
                          operator: e.target.value as WorkflowCondition['operator']
                        })}
                        className="border rounded p-1"
                      >
                        <option value="gt">Greater than</option>
                        <option value="lt">Less than</option>
                        <option value="eq">Equals</option>
                        <option value="gte">Greater or equal</option>
                        <option value="lte">Less or equal</option>
                        <option value="contains">Contains</option>
                      </select>

                      <Input
                        value={condition.value}
                        onChange={(e) => updateCondition(selectedStep.id, condition.id, { 
                          value: e.target.value 
                        })}
                        className="w-32"
                      />

                      <button
                        onClick={() => removeCondition(selectedStep.id, condition.id)}
                        className="p-1 hover:bg-red-100 text-red-600 rounded"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {(!selectedStep.conditions || selectedStep.conditions.length === 0) && (
                    <div className="text-sm text-gray-500 italic">
                      No conditions set. This step will always execute.
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-gray-500">
              <div className="text-lg mb-2">Select a step to configure</div>
              <p>Click on a step from the list on the left, or add a new step.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Load from Template</h2>
            
            <div className="grid grid-cols-2 gap-4">
              {DEFAULT_WORKFLOW_TEMPLATES.map((template) => (
                <Card
                  key={template.id}
                  className="p-4 cursor-pointer hover:border-blue-500"
                  onClick={() => loadFromTemplate(template.id)}
                >
                  <h3 className="font-semibold">{template.name}</h3>
                  <p className="text-sm text-gray-500">{template.description}</p>
                  <div className="mt-2">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {template.entityType.replace('_', ' ')}
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setShowTemplateModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowDesigner;
