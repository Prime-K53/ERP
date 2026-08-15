import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workflowService } from '../services/workflowService';
import { 
  WorkflowInstance, 
  WorkflowApproval,
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_PRIORITY_COLORS
} from '../types/workflow';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { useAuth } from '../context/AuthContext';
import { logger } from '../services/logger';

interface ApprovalQueueProps {
  userId?: string;
  userRole?: string;
  limit?: number;
  showHeader?: boolean;
}

export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({
  userId,
  userRole,
  limit = 10,
  showHeader = true,
}) => {
  const navigate = useNavigate();
  const { user: currentUser, notify } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [pendingInstances, setPendingInstances] = useState<WorkflowInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<WorkflowApproval[]>([]);
  const [approvalComment, setApprovalComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | 'return' | null>(null);

  useEffect(() => {
    initializeService();
  }, [userId, userRole]);

  const initializeService = async () => {
    try {
      await workflowService.initialize();
      loadPendingApprovals();
    } catch (error) {
      logger.error('Failed to initialize workflow service', error as Error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingApprovals = () => {
    const id = userId || currentUser?.id;
    const role = userRole || currentUser?.role;
    
    if (!id && !role) return;
    
    const pending = workflowService.getPendingInstancesForUser(id || '', role || '');
    setPendingInstances(pending.slice(0, limit));
  };

  const handleSelectInstance = (instance: WorkflowInstance) => {
    setSelectedInstance(instance);
    const history = workflowService.getApprovalsForInstance(instance.id);
    setApprovalHistory(history);
  };

  const handleApprovalAction = (action: 'approve' | 'reject' | 'return') => {
    setApprovalAction(action);
    setShowApprovalModal(true);
  };

  const handleSubmitApproval = async () => {
    if (!selectedInstance || !approvalAction || !currentUser) return;

    try {
      setProcessing(true);
      
      await workflowService.processApproval(
        selectedInstance.id,
        selectedInstance.currentStepId,
        currentUser.id,
        approvalAction,
        approvalComment || undefined
      );

      notify(
        approvalAction === 'approve' ? 'Approved successfully' :
        approvalAction === 'reject' ? 'Rejected successfully' :
        'Returned to requester',
        'success'
      );

      // Reset and reload
      setShowApprovalModal(false);
      setApprovalComment('');
      setSelectedInstance(null);
      setApprovalAction(null);
      loadPendingApprovals();
    } catch (error) {
      logger.error('Failed to process approval', error as Error);
      notify(error instanceof Error ? error.message : 'Failed to process approval', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelegate = async (delegateTo: string) => {
    if (!selectedInstance || !currentUser) return;

    try {
      // In a full implementation, this would create a delegation record
      notify('Delegation feature coming soon', 'info');
    } catch (error) {
      logger.error('Failed to delegate', error as Error);
      notify('Failed to delegate', 'error');
    }
  };

  const getPriorityColor = (priority: string) => {
    return WORKFLOW_PRIORITY_COLORS[priority] || 'bg-gray-100 text-gray-800';
  };

  const getEntityIcon = (entityType: string) => {
    const icons: Record<string, string> = {
      expense: '💰',
      purchase_order: '📦',
      invoice: '📄',
      quotation: '📋',
      work_order: '🔧',
      leave_request: '🏖️',
      expense_claim: '💵',
      payment_request: '💳',
      refund_request: '↩️',
      inventory_adjustment: '📊',
      user_access_request: '🔑',
    };
    return icons[entityType] || '📝';
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">Loading approvals...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            Pending Approvals ({pendingInstances.length})
          </h2>
          {pendingInstances.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/workflows/approvals')}
            >
              View All
            </Button>
          )}
        </div>
      )}

      {pendingInstances.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          <div className="text-4xl mb-2">✅</div>
          <div className="font-medium">All caught up!</div>
          <div className="text-sm">No pending approvals at the moment.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pending List */}
          <div className="space-y-2">
            {pendingInstances.map((instance) => (
              <Card
                key={instance.id}
                className={`p-4 cursor-pointer transition-colors ${
                  selectedInstance?.id === instance.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'hover:border-gray-300'
                }`}
                onClick={() => handleSelectInstance(instance)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{getEntityIcon(instance.entityType)}</span>
                    <div>
                      <div className="font-medium">{instance.workflowDefinitionName}</div>
                      <div className="text-sm text-gray-500">
                        {instance.entityType.replace('_', ' ')} - {instance.entityReference || instance.entityId}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Step: {instance.currentStepName}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(instance.priority)}`}>
                      {instance.priority}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(instance.requestedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                {instance.contextData && (
                  <div className="mt-3 pt-3 border-t text-sm">
                    {instance.entityType === 'expense' && instance.contextData.amount && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Amount:</span>
                        <span className="font-medium">${instance.contextData.amount.toFixed(2)}</span>
                      </div>
                    )}
                    {instance.contextData.description && (
                      <div className="text-gray-500 truncate mt-1">
                        {instance.contextData.description}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Detail Panel */}
          <div>
            {selectedInstance ? (
              <Card className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {selectedInstance.workflowDefinitionName}
                    </h3>
                    <div className="text-sm text-gray-500">
                      {selectedInstance.entityType.replace('_', ' ')} - {selectedInstance.entityReference || selectedInstance.entityId}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${getPriorityColor(selectedInstance.priority)}`}>
                    {selectedInstance.priority}
                  </span>
                </div>

                {/* Context Data */}
                {selectedInstance.contextData && (
                  <div className="mb-4 p-3 bg-gray-50 rounded">
                    <h4 className="font-medium text-sm mb-2">Details</h4>
                    <div className="space-y-2 text-sm">
                      {selectedInstance.contextData.requesterName && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Requested by:</span>
                          <span>{selectedInstance.contextData.requesterName}</span>
                        </div>
                      )}
                      {selectedInstance.contextData.amount !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Amount:</span>
                          <span className="font-medium">${selectedInstance.contextData.amount.toFixed(2)}</span>
                        </div>
                      )}
                      {selectedInstance.contextData.description && (
                        <div>
                          <span className="text-gray-500">Description:</span>
                          <div className="mt-1">{selectedInstance.contextData.description}</div>
                        </div>
                      )}
                      {selectedInstance.contextData.category && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Category:</span>
                          <span>{selectedInstance.contextData.category}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Approval History */}
                {approvalHistory.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-sm mb-2">Approval History</h4>
                    <div className="space-y-2">
                      {approvalHistory.map((approval) => (
                        <div key={approval.id} className="text-sm p-2 bg-gray-50 rounded">
                          <div className="flex justify-between">
                            <span className="font-medium">{approval.stepName}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              approval.action === 'approve' ? 'bg-green-100 text-green-800' :
                              approval.action === 'reject' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {approval.action}
                            </span>
                          </div>
                          {approval.comments && (
                            <div className="text-gray-500 mt-1">{approval.comments}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            {approval.actionedAt 
                              ? new Date(approval.actionedAt).toLocaleString()
                              : 'Pending'
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => handleApprovalAction('approve')}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleApprovalAction('reject')}
                    variant="outline"
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleApprovalAction('return')}
                    variant="outline"
                    className="flex-1"
                  >
                    Return
                  </Button>
                </div>

                <div className="mt-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(`/workflows/${selectedInstance.id}`)}
                  >
                    View Full Details
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center text-gray-500">
                <div className="text-lg mb-2">Select an item</div>
                <p>Click on a pending approval to view details and take action.</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {approvalAction === 'approve' ? 'Approve' :
               approvalAction === 'reject' ? 'Reject' :
               'Return'} Workflow
            </h2>
            
            <p className="text-gray-600 mb-4">
              {approvalAction === 'approve' 
                ? 'Are you sure you want to approve this request?'
                : approvalAction === 'reject'
                ? 'Are you sure you want to reject this request?'
                : 'Return this request to the requester for revision.'}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Comments {approvalAction !== 'approve' && '(Required)'}
              </label>
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                className="w-full border rounded-md p-2"
                rows={3}
                placeholder="Add your comments..."
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowApprovalModal(false);
                  setApprovalComment('');
                  setApprovalAction(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmitApproval}
                disabled={processing || (approvalAction !== 'approve' && !approvalComment.trim())}
              >
                {processing ? 'Processing...' : 
                 approvalAction === 'approve' ? 'Approve' :
                 approvalAction === 'reject' ? 'Reject' :
                 'Return'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact version for sidebar/dashboard
export const ApprovalQueueCompact: React.FC = () => {
  return <ApprovalQueue limit={5} showHeader={true} />;
};

// Full page version
export const ApprovalQueueFull: React.FC = () => {
  return <ApprovalQueue limit={100} showHeader={false} />;
};

export default ApprovalQueue;
