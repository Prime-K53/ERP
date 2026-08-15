import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowService } from '../../../services/workflowService';
import { WorkflowDefinition, WorkflowEntityType, WorkflowStep } from '../../../types/workflow';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock db service
vi.mock('../../../services/db', () => ({
  dbService: {
    getSetting: vi.fn(async () => undefined),
    saveSetting: vi.fn(async () => undefined),
  },
}));

// Mock notification service
vi.mock('../../../services/notificationService', () => ({
  notify: vi.fn(),
}));

describe('WorkflowService', () => {
  let service: WorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    service = new WorkflowService();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should load default templates', async () => {
      await service.initialize();
      const templates = service.getTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.name === 'Expense Approval')).toBe(true);
    });
  });

  describe('Definition Management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create a workflow definition', async () => {
      const definition = await service.createDefinition(
        {
          name: 'Test Workflow',
          description: 'A test workflow',
          entityType: 'expense',
          steps: [
            {
              id: 'STEP-1',
              name: 'Manager Approval',
              order: 1,
              approverRole: 'Manager',
              requiredApprovals: 1,
            },
          ],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      expect(definition.id).toBeDefined();
      expect(definition.name).toBe('Test Workflow');
      expect(definition.version).toBe(1);
    });

    it('should get a workflow definition', async () => {
      const created = await service.createDefinition(
        {
          name: 'Test Workflow',
          entityType: 'expense',
          steps: [
            {
              id: 'STEP-1',
              name: 'Manager Approval',
              order: 1,
              approverRole: 'Manager',
              requiredApprovals: 1,
            },
          ],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      const retrieved = service.getDefinition(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Workflow');
    });

    it('should get all definitions', async () => {
      await service.createDefinition(
        {
          name: 'Workflow 1',
          entityType: 'expense',
          steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      await service.createDefinition(
        {
          name: 'Workflow 2',
          entityType: 'purchase_order',
          steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      const all = service.getDefinitions();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter definitions by entity type', async () => {
      await service.createDefinition(
        {
          name: 'Expense Workflow',
          entityType: 'expense',
          steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      await service.createDefinition(
        {
          name: 'PO Workflow',
          entityType: 'purchase_order',
          steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      const expenseWorkflows = service.getDefinitions('expense');
      expect(expenseWorkflows.every(w => w.entityType === 'expense')).toBe(true);
    });

    it('should update a workflow definition', async () => {
      const created = await service.createDefinition(
        {
          name: 'Original Name',
          entityType: 'expense',
          steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      const updated = await service.updateDefinition(
        created.id,
        { name: 'Updated Name' },
        'user-1'
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.version).toBe(2);
    });

    it('should delete a workflow definition', async () => {
      const created = await service.createDefinition(
        {
          name: 'To Delete',
          entityType: 'expense',
          steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
          initialStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );

      await service.deleteDefinition(created.id);
      const retrieved = service.getDefinition(created.id);
      expect(retrieved).toBeUndefined();
    });

    it('should validate definition - require name', async () => {
      await expect(
        service.createDefinition(
          {
            name: '',
            entityType: 'expense',
            steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
            initialStepId: 'STEP-1',
            isActive: true,
            allowParallelInstances: true,
          },
          'user-1'
        )
      ).rejects.toThrow('name');
    });

    it('should validate definition - require steps', async () => {
      await expect(
        service.createDefinition(
          {
            name: 'Test',
            entityType: 'expense',
            steps: [],
            initialStepId: 'STEP-1',
            isActive: true,
            allowParallelInstances: true,
          },
          'user-1'
        )
      ).rejects.toThrow('step');
    });

    it('should validate definition - initial step must exist', async () => {
      await expect(
        service.createDefinition(
          {
            name: 'Test',
            entityType: 'expense',
            steps: [{ id: 'STEP-1', name: 'Step 1', order: 1, approverRole: 'Manager', requiredApprovals: 1 }],
            initialStepId: 'STEP-2', // Doesn't exist
            isActive: true,
            allowParallelInstances: true,
          },
          'user-1'
        )
      ).rejects.toThrow('Initial step');
    });
  });

  describe('Instance Management', () => {
    let definitionId: string;

    beforeEach(async () => {
      await service.initialize();
      const definition = await service.createDefinition(
        {
          name: 'Test Workflow',
          entityType: 'expense',
          steps: [
            { id: 'STEP-1', name: 'Manager Approval', order: 1, approverRole: 'Manager', requiredApprovals: 1 },
            { id: 'STEP-2', name: 'Finance Approval', order: 2, approverRole: 'Accountant', requiredApprovals: 1 },
          ],
          initialStepId: 'STEP-1',
          finalStepId: 'STEP-2',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );
      definitionId = definition.id;
    });

    it('should start a workflow instance', async () => {
      const instance = await service.startWorkflow(
        definitionId,
        'expense',
        'EXP-001',
        'user-1',
        { amount: 500, description: 'Test expense' }
      );

      expect(instance.id).toBeDefined();
      expect(instance.status).toBe('pending');
      expect(instance.currentStepId).toBe('STEP-1');
    });

    it('should get a workflow instance', async () => {
      const started = await service.startWorkflow(
        definitionId,
        'expense',
        'EXP-001',
        'user-1',
        { amount: 500 }
      );

      const retrieved = service.getInstance(started.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(started.id);
    });

    it('should get all instances', async () => {
      await service.startWorkflow(definitionId, 'expense', 'EXP-001', 'user-1');
      await service.startWorkflow(definitionId, 'expense', 'EXP-002', 'user-1');

      const instances = service.getInstances();
      expect(instances.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter instances by status', async () => {
      await service.startWorkflow(definitionId, 'expense', 'EXP-001', 'user-1');
      
      const pendingInstances = service.getInstances({ status: ['pending'] });
      expect(pendingInstances.every(i => i.status === 'pending')).toBe(true);
    });

    it('should prevent parallel instances when not allowed', async () => {
      // Update definition to not allow parallel instances
      await service.updateDefinition(
        definitionId,
        { allowParallelInstances: false },
        'user-1'
      );

      await service.startWorkflow(definitionId, 'expense', 'EXP-001', 'user-1');

      await expect(
        service.startWorkflow(definitionId, 'expense', 'EXP-001', 'user-1')
      ).rejects.toThrow('active workflow');
    });
  });

  describe('Approval Processing', () => {
    let definitionId: string;
    let instanceId: string;

    beforeEach(async () => {
      await service.initialize();
      const definition = await service.createDefinition(
        {
          name: 'Test Workflow',
          entityType: 'expense',
          steps: [
            { id: 'STEP-1', name: 'Manager Approval', order: 1, approverRole: 'Manager', requiredApprovals: 1 },
            { id: 'STEP-2', name: 'Finance Approval', order: 2, approverRole: 'Accountant', requiredApprovals: 1 },
          ],
          initialStepId: 'STEP-1',
          finalStepId: 'STEP-2',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );
      definitionId = definition.id;

      const instance = await service.startWorkflow(
        definitionId,
        'expense',
        'EXP-001',
        'user-1',
        { amount: 500 }
      );
      instanceId = instance.id;
    });

    it('should approve and move to next step', async () => {
      const updated = await service.processApproval(
        instanceId,
        'STEP-1',
        'manager-1',
        'approve',
        'Approved'
      );

      expect(updated.currentStepId).toBe('STEP-2');
      expect(updated.status).toBe('pending');
    });

    it('should complete workflow after final approval', async () => {
      // Approve first step
      await service.processApproval(instanceId, 'STEP-1', 'manager-1', 'approve');
      
      // Approve second (final) step
      const completed = await service.processApproval(
        instanceId,
        'STEP-2',
        'accountant-1',
        'approve',
        'Final approval'
      );

      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeDefined();
    });

    it('should reject workflow', async () => {
      const rejected = await service.processApproval(
        instanceId,
        'STEP-1',
        'manager-1',
        'reject',
        'Not enough details'
      );

      expect(rejected.status).toBe('rejected');
      expect(rejected.completedAt).toBeDefined();
    });

    it('should return workflow to requester', async () => {
      const returned = await service.processApproval(
        instanceId,
        'STEP-1',
        'manager-1',
        'return',
        'Please add more details'
      );

      // Should be back at initial step
      expect(returned.currentStepId).toBe('STEP-1');
      expect(returned.status).toBe('pending');
    });

    it('should get approval history', async () => {
      await service.processApproval(instanceId, 'STEP-1', 'manager-1', 'approve', 'OK');
      
      const history = service.getHistory(instanceId);
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(h => h.eventType === 'approved')).toBe(true);
    });
  });

  describe('Condition Evaluation', () => {
    let definitionId: string;

    beforeEach(async () => {
      await service.initialize();
      const definition = await service.createDefinition(
        {
          name: 'Conditional Workflow',
          entityType: 'expense',
          steps: [
            { 
              id: 'STEP-1', 
              name: 'Quick Approval', 
              order: 1, 
              approverRole: 'Clerk', 
              requiredApprovals: 1,
              autoApprove: true,
              autoApproveCondition: {
                id: 'COND-1',
                type: 'amount_less_than',
                field: 'amount',
                operator: 'lt',
                value: 100,
              },
            },
            { id: 'STEP-2', name: 'Manager Approval', order: 2, approverRole: 'Manager', requiredApprovals: 1 },
          ],
          initialStepId: 'STEP-1',
          finalStepId: 'STEP-2',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );
      definitionId = definition.id;
    });

    it('should auto-approve when condition is met', async () => {
      const instance = await service.startWorkflow(
        definitionId,
        'expense',
        'EXP-001',
        'user-1',
        { amount: 50 } // Less than 100
      );

      // Should have moved to step 2 (but step 2 still requires approval)
      expect(instance.currentStepId).toBe('STEP-2');
    });

    it('should not auto-approve when condition is not met', async () => {
      const instance = await service.startWorkflow(
        definitionId,
        'expense',
        'EXP-002',
        'user-1',
        { amount: 500 } // More than 100
      );

      // Should still be pending at step 1
      expect(instance.status).toBe('pending');
      expect(instance.currentStepId).toBe('STEP-1');
    });
  });

  describe('Template Management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should get all templates', () => {
      const templates = service.getTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should filter templates by entity type', () => {
      const expenseTemplates = service.getTemplates('expense');
      expect(expenseTemplates.every(t => t.entityType === 'expense')).toBe(true);
    });

    it('should create workflow from template', async () => {
      const templates = service.getTemplates('expense');
      const template = templates[0];

      const definition = await service.createFromTemplate(template.id, 'user-1');

      expect(definition.name).toBe(template.name);
      expect(definition.entityType).toBe(template.entityType);
      expect(definition.steps.length).toBe(template.definition.steps.length);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should get workflow statistics', async () => {
      const stats = service.getStats();
      
      expect(stats).toHaveProperty('totalInstances');
      expect(stats).toHaveProperty('pendingInstances');
      expect(stats).toHaveProperty('completedInstances');
      expect(stats).toHaveProperty('rejectedInstances');
      expect(stats).toHaveProperty('byEntityType');
      expect(stats).toHaveProperty('byPriority');
    });
  });

  describe('Notification Management', () => {
    let definitionId: string;
    let instanceId: string;

    beforeEach(async () => {
      await service.initialize();
      const definition = await service.createDefinition(
        {
          name: 'Test Workflow',
          entityType: 'expense',
          steps: [
            { 
              id: 'STEP-1', 
              name: 'Manager Approval', 
              order: 1, 
              approverRole: 'Manager', 
              requiredApprovals: 1,
              notifyRequester: true,
            },
          ],
          initialStepId: 'STEP-1',
          finalStepId: 'STEP-1',
          isActive: true,
          allowParallelInstances: true,
        },
        'user-1'
      );
      definitionId = definition.id;

      const instance = await service.startWorkflow(
        definitionId,
        'expense',
        'EXP-001',
        'user-1',
        { amount: 500 }
      );
      instanceId = instance.id;
    });

    it('should create notifications', () => {
      const notifications = service.getNotifications('user-1');
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('should get unread notifications', () => {
      const unread = service.getNotifications('user-1', true);
      expect(unread.every(n => !n.read)).toBe(true);
    });

    it('should mark notification as read', async () => {
      const notifications = service.getNotifications('user-1');
      const notification = notifications[0];

      await service.markNotificationRead(notification.id);
      
      const updated = service.getNotifications('user-1', true);
      expect(updated.every(n => n.id !== notification.id)).toBe(true);
    });
  });
});
