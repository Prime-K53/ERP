/**
 * Workflow types for Prime ERP Workflow Automation
 */

/**
 * Entity types that can have workflows
 */
export type WorkflowEntityType = 
  | 'expense' 
  | 'purchase_order' 
  | 'invoice' 
  | 'quotation'
  | 'work_order'
  | 'leave_request'
  | 'expense_claim'
  | 'payment_request'
  | 'refund_request'
  | 'inventory_adjustment'
  | 'user_access_request';

/**
 * Action types for workflow steps
 */
export type WorkflowActionType = 
  | 'approve' 
  | 'reject' 
  | 'escalate' 
  | 'notify' 
  | 'assign'
  | 'return'
  | 'delegate';

/**
 * Workflow instance status
 */
export type WorkflowStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'escalated'
  | 'cancelled'
  | 'completed'
  | 'returned';

/**
 * Step condition types for conditional routing
 */
export type StepConditionType =
  | 'amount_greater_than'
  | 'amount_less_than'
  | 'amount_equals'
  | 'field_equals'
  | 'field_contains'
  | 'custom';

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  order: number;
  
  // Approver configuration
  approverRole: string;
  approverId?: string; // Specific user ID (optional)
  approverIds?: string[]; // Multiple specific users (optional)
  requiredApprovals: number; // Number of approvals needed (for parallel approvals)
  
  // Timeout and escalation
  timeoutHours?: number;
  escalationStepId?: string;
  escalationAfterHours?: number;
  
  // Conditions for conditional routing
  conditions?: WorkflowCondition[];
  
  // Actions to perform on this step
  actions?: WorkflowStepAction[];
  
  // Auto-approval settings
  autoApprove?: boolean;
  autoApproveCondition?: WorkflowCondition;
  
  // Notifications
  notifyRequester?: boolean;
  notifyOnApproval?: boolean;
  notifyOnRejection?: boolean;
  
  // UI settings
  requireComments?: boolean;
  requireAttachments?: boolean;
  allowedAttachmentTypes?: string[];
  maxAttachments?: number;
}

/**
 * Workflow condition for conditional routing
 */
export interface WorkflowCondition {
  id: string;
  type: StepConditionType;
  field?: string;
  operator: 'gt' | 'lt' | 'eq' | 'neq' | 'contains' | 'gte' | 'lte';
  value: any;
  logicalOperator?: 'AND' | 'OR';
  nextConditions?: WorkflowCondition[];
}

/**
 * Workflow step action
 */
export interface WorkflowStepAction {
  id: string;
  type: 'update_field' | 'send_email' | 'send_notification' | 'create_task' | 'call_webhook' | 'update_status';
  config: Record<string, any>;
  executeOn: 'step_start' | 'step_complete' | 'step_timeout';
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  entityType: WorkflowEntityType;
  version: number;
  
  // Steps in the workflow
  steps: WorkflowStep[];
  
  // Initial step
  initialStepId: string;
  
  // Final step (for completion)
  finalStepId?: string;
  
  // Settings
  isActive: boolean;
  allowParallelInstances: boolean;
  maxParallelInstances?: number;
  
  // Default timeout for the entire workflow
  totalTimeoutHours?: number;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt: Date;
  
  // Tags for organization
  tags?: string[];
}

/**
 * Workflow instance (running workflow)
 */
export interface WorkflowInstance {
  id: string;
  workflowDefinitionId: string;
  workflowDefinitionName?: string;
  entityType: WorkflowEntityType;
  entityId: string;
  entityReference?: string; // e.g., "EXP-001", "PO-002"
  
  // Current state
  currentStepId: string;
  currentStepName?: string;
  status: WorkflowStatus;
  
  // Requester
  requestedBy: string;
  requestedByName?: string;
  requestedAt: Date;
  
  // Completion
  completedAt?: Date;
  completedBy?: string;
  completionAction?: WorkflowActionType;
  
  // Time tracking
  startedAt: Date;
  dueDate?: Date;
  escalatedAt?: Date;
  
  // Context data (snapshot of entity at workflow start)
  contextData?: Record<string, any>;
  
  // Comments/notes
  notes?: string;
  
  // Priority
  priority: 'low' | 'normal' | 'high' | 'urgent';
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workflow approval record
 */
export interface WorkflowApproval {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  stepName?: string;
  
  // Approver
  approverId: string;
  approverName?: string;
  approverRole?: string;
  
  // Action
  action?: WorkflowActionType;
  comments?: string;
  attachments?: WorkflowAttachment[];
  
  // Timestamps
  assignedAt: Date;
  actionedAt?: Date;
  
  // For delegation
  delegatedFrom?: string;
  delegatedTo?: string;
  delegatedAt?: Date;
  
  // Metadata
  createdAt: Date;
}

/**
 * Workflow attachment
 */
export interface WorkflowAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
}

/**
 * Workflow history entry
 */
export interface WorkflowHistoryEntry {
  id: string;
  workflowInstanceId: string;
  
  // Event
  eventType: 'started' | 'step_started' | 'step_completed' | 'approved' | 'rejected' | 
            'escalated' | 'cancelled' | 'returned' | 'delegated' | 'timeout' | 'completed';
  stepId?: string;
  stepName?: string;
  
  // Actor
  actorId: string;
  actorName?: string;
  
  // Details
  details?: string;
  previousValue?: any;
  newValue?: any;
  
  // Timestamp
  timestamp: Date;
}

/**
 * Workflow notification
 */
export interface WorkflowNotification {
  id: string;
  workflowInstanceId: string;
  type: 'approval_required' | 'approved' | 'rejected' | 'escalated' | 'completed' | 'reminder' | 'timeout_warning';
  recipientId: string;
  recipientName?: string;
  
  // Content
  title: string;
  message: string;
  actionUrl?: string;
  
  // Status
  read: boolean;
  readAt?: Date;
  
  // Timestamps
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Workflow template (predefined workflows)
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  entityType: WorkflowEntityType;
  category: string;
  
  // Template definition
  definition: Omit<WorkflowDefinition, 'id' | 'version' | 'createdBy' | 'createdAt' | 'updatedAt'>;
  
  // Metadata
  isSystem: boolean;
  usageCount: number;
  tags: string[];
}

/**
 * Workflow dashboard statistics
 */
export interface WorkflowStats {
  totalInstances: number;
  pendingInstances: number;
  completedInstances: number;
  rejectedInstances: number;
  averageCompletionTime: number; // in hours
  overdueInstances: number;
  
  // By entity type
  byEntityType: Record<WorkflowEntityType, {
    pending: number;
    completed: number;
    rejected: number;
  }>;
  
  // By priority
  byPriority: {
    low: number;
    normal: number;
    high: number;
    urgent: number;
  };
  
  // Performance metrics
  averageApprovalTime: number; // in hours
  escalationRate: number; // percentage
}

/**
 * Workflow filter options
 */
export interface WorkflowFilter {
  status?: WorkflowStatus[];
  entityType?: WorkflowEntityType[];
  priority?: string[];
  requestedBy?: string;
  assignedTo?: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchQuery?: string;
}

/**
 * Default workflow templates
 */
export const DEFAULT_WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'TPL-EXPENSE-APPROVAL',
    name: 'Expense Approval',
    description: 'Standard expense approval workflow with manager and finance review',
    entityType: 'expense',
    category: 'Finance',
    isSystem: true,
    usageCount: 0,
    tags: ['expense', 'approval', 'finance'],
    definition: {
      name: 'Expense Approval',
      entityType: 'expense',
      steps: [
        {
          id: 'STEP-1',
          name: 'Manager Approval',
          order: 1,
          approverRole: 'Manager',
          requiredApprovals: 1,
          timeoutHours: 48,
          notifyRequester: true,
          requireComments: true,
        },
        {
          id: 'STEP-2',
          name: 'Finance Review',
          order: 2,
          approverRole: 'Accountant',
          requiredApprovals: 1,
          timeoutHours: 24,
          conditions: [{
            id: 'COND-1',
            type: 'amount_greater_than',
            field: 'amount',
            operator: 'gt',
            value: 1000,
          }],
          notifyRequester: true,
        },
        {
          id: 'STEP-3',
          name: 'Final Approval',
          order: 3,
          approverRole: 'Admin',
          requiredApprovals: 1,
          timeoutHours: 24,
          conditions: [{
            id: 'COND-2',
            type: 'amount_greater_than',
            field: 'amount',
            operator: 'gt',
            value: 5000,
          }],
        },
      ],
      initialStepId: 'STEP-1',
      finalStepId: 'STEP-3',
      isActive: true,
      allowParallelInstances: true,
    },
  },
  {
    id: 'TPL-PO-APPROVAL',
    name: 'Purchase Order Approval',
    description: 'Purchase order approval based on amount thresholds',
    entityType: 'purchase_order',
    category: 'Procurement',
    isSystem: true,
    usageCount: 0,
    tags: ['purchase', 'approval', 'procurement'],
    definition: {
      name: 'Purchase Order Approval',
      entityType: 'purchase_order',
      steps: [
        {
          id: 'STEP-1',
          name: 'Procurement Review',
          order: 1,
          approverRole: 'Clerk',
          requiredApprovals: 1,
          timeoutHours: 24,
          requireComments: true,
        },
        {
          id: 'STEP-2',
          name: 'Manager Approval',
          order: 2,
          approverRole: 'Manager',
          requiredApprovals: 1,
          timeoutHours: 48,
          conditions: [{
            id: 'COND-1',
            type: 'amount_greater_than',
            field: 'totalAmount',
            operator: 'gt',
            value: 500,
          }],
        },
        {
          id: 'STEP-3',
          name: 'Finance Approval',
          order: 3,
          approverRole: 'Accountant',
          requiredApprovals: 1,
          timeoutHours: 24,
          conditions: [{
            id: 'COND-2',
            type: 'amount_greater_than',
            field: 'totalAmount',
            operator: 'gt',
            value: 2000,
          }],
        },
      ],
      initialStepId: 'STEP-1',
      finalStepId: 'STEP-3',
      isActive: true,
      allowParallelInstances: true,
    },
  },
  {
    id: 'TPL-LEAVE-REQUEST',
    name: 'Leave Request',
    description: 'Employee leave request approval',
    entityType: 'leave_request',
    category: 'HR',
    isSystem: true,
    usageCount: 0,
    tags: ['leave', 'hr', 'approval'],
    definition: {
      name: 'Leave Request',
      entityType: 'leave_request',
      steps: [
        {
          id: 'STEP-1',
          name: 'Manager Approval',
          order: 1,
          approverRole: 'Manager',
          requiredApprovals: 1,
          timeoutHours: 72,
          notifyRequester: true,
          requireComments: false,
        },
      ],
      initialStepId: 'STEP-1',
      finalStepId: 'STEP-1',
      isActive: true,
      allowParallelInstances: true,
    },
  },
];

/**
 * Workflow status colors for UI
 */
export const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  escalated: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-gray-100 text-gray-800',
  completed: 'bg-blue-100 text-blue-800',
  returned: 'bg-purple-100 text-purple-800',
};

/**
 * Priority colors for UI
 */
export const WORKFLOW_PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};
