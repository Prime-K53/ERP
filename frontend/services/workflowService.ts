/**
 * Workflow Service for Prime ERP
 * Handles workflow definitions, instances, approvals, and automation
 */

import {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowApproval,
  WorkflowHistoryEntry,
  WorkflowNotification,
  WorkflowStatus,
  WorkflowActionType,
  WorkflowStep,
  WorkflowEntityType,
  WorkflowStats,
  WorkflowFilter,
  WorkflowTemplate,
  DEFAULT_WORKFLOW_TEMPLATES,
  WorkflowCondition,
} from '../types/workflow';
import { logger } from './logger';
import { dbService } from './db';
import { notify } from './notificationService';

// Storage keys
const WORKFLOW_DEFINITIONS_KEY = 'nexus_workflow_definitions';
const WORKFLOW_INSTANCES_KEY = 'nexus_workflow_instances';
const WORKFLOW_APPROVALS_KEY = 'nexus_workflow_approvals';
const WORKFLOW_HISTORY_KEY = 'nexus_workflow_history';
const WORKFLOW_NOTIFICATIONS_KEY = 'nexus_workflow_notifications';
const WORKFLOW_TEMPLATES_KEY = 'nexus_workflow_templates';

class WorkflowService {
  private definitions: Map<string, WorkflowDefinition> = new Map();
  private instances: Map<string, WorkflowInstance> = new Map();
  private approvals: Map<string, WorkflowApproval> = new Map();
  private history: Map<string, WorkflowHistoryEntry[]> = new Map();
  private notifications: Map<string, WorkflowNotification> = new Map();
  private templates: Map<string, WorkflowTemplate> = new Map();
  private initialized: boolean = false;
  private checkInterval: ReturnType<typeof setTimeout> | null = null;

  /**
   * Initialize the workflow service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadDefinitions();
      await this.loadInstances();
      await this.loadApprovals();
      await this.loadHistory();
      await this.loadNotifications();
      await this.loadTemplates();
      
      this.initialized = true;
      
      // Start periodic checks for timeouts
      this.startTimeoutChecker();
      
      logger.info('Workflow service initialized', {
        definitions: this.definitions.size,
        instances: this.instances.size,
        pendingApprovals: this.getPendingApprovals().length,
      });
    } catch (error) {
      logger.error('Failed to initialize workflow service', error as Error);
      throw error;
    }
  }

  /**
   * Load definitions from storage
   */
  private async loadDefinitions(): Promise<void> {
    try {
      const saved = await dbService.getSetting<WorkflowDefinition[]>(WORKFLOW_DEFINITIONS_KEY);
      if (saved && saved.length > 0) {
        saved.forEach(def => this.definitions.set(def.id, def));
      } else {
        const local = localStorage.getItem(WORKFLOW_DEFINITIONS_KEY);
        if (local) {
          const definitions: WorkflowDefinition[] = JSON.parse(local);
          definitions.forEach(def => this.definitions.set(def.id, def));
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow definitions', error as Error);
    }
  }

  /**
   * Save definitions to storage
   */
  private async saveDefinitions(): Promise<void> {
    try {
      const definitions = Array.from(this.definitions.values());
      await dbService.saveSetting(WORKFLOW_DEFINITIONS_KEY, definitions);
    } catch (error) {
      logger.error('Failed to save workflow definitions', error as Error);
    }
  }

  /**
   * Load instances from storage
   */
  private async loadInstances(): Promise<void> {
    try {
      const saved = await dbService.getSetting<WorkflowInstance[]>(WORKFLOW_INSTANCES_KEY);
      if (saved && saved.length > 0) {
        saved.forEach(inst => this.instances.set(inst.id, inst));
      } else {
        const local = localStorage.getItem(WORKFLOW_INSTANCES_KEY);
        if (local) {
          const instances: WorkflowInstance[] = JSON.parse(local);
          instances.forEach(inst => this.instances.set(inst.id, inst));
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow instances', error as Error);
    }
  }

  /**
   * Save instances to storage
   */
  private async saveInstances(): Promise<void> {
    try {
      const instances = Array.from(this.instances.values());
      await dbService.saveSetting(WORKFLOW_INSTANCES_KEY, instances);
    } catch (error) {
      logger.error('Failed to save workflow instances', error as Error);
    }
  }

  /**
   * Load approvals from storage
   */
  private async loadApprovals(): Promise<void> {
    try {
      const saved = await dbService.getSetting<WorkflowApproval[]>(WORKFLOW_APPROVALS_KEY);
      if (saved && saved.length > 0) {
        saved.forEach(app => this.approvals.set(app.id, app));
      } else {
        const local = localStorage.getItem(WORKFLOW_APPROVALS_KEY);
        if (local) {
          const approvals: WorkflowApproval[] = JSON.parse(local);
          approvals.forEach(app => this.approvals.set(app.id, app));
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow approvals', error as Error);
    }
  }

  /**
   * Save approvals to storage
   */
  private async saveApprovals(): Promise<void> {
    try {
      const approvals = Array.from(this.approvals.values());
      await dbService.saveSetting(WORKFLOW_APPROVALS_KEY, approvals);
    } catch (error) {
      logger.error('Failed to save workflow approvals', error as Error);
    }
  }

  /**
   * Load history from storage
   */
  private async loadHistory(): Promise<void> {
    try {
      const saved = await dbService.getSetting<Record<string, WorkflowHistoryEntry[]>>(WORKFLOW_HISTORY_KEY);
      if (saved) {
        Object.entries(saved).forEach(([key, entries]) => {
          this.history.set(key, entries);
        });
      } else {
        const local = localStorage.getItem(WORKFLOW_HISTORY_KEY);
        if (local) {
          const historyData: Record<string, WorkflowHistoryEntry[]> = JSON.parse(local);
          Object.entries(historyData).forEach(([key, entries]) => {
            this.history.set(key, entries);
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow history', error as Error);
    }
  }

  /**
   * Save history to storage
   */
  private async saveHistory(): Promise<void> {
    try {
      const historyData: Record<string, WorkflowHistoryEntry[]> = {};
      this.history.forEach((entries, key) => {
        historyData[key] = entries;
      });
      await dbService.saveSetting(WORKFLOW_HISTORY_KEY, historyData);
    } catch (error) {
      logger.error('Failed to save workflow history', error as Error);
    }
  }

  /**
   * Load notifications from storage
   */
  private async loadNotifications(): Promise<void> {
    try {
      const saved = await dbService.getSetting<WorkflowNotification[]>(WORKFLOW_NOTIFICATIONS_KEY);
      if (saved && saved.length > 0) {
        saved.forEach(notif => this.notifications.set(notif.id, notif));
      } else {
        const local = localStorage.getItem(WORKFLOW_NOTIFICATIONS_KEY);
        if (local) {
          const notifications: WorkflowNotification[] = JSON.parse(local);
          notifications.forEach(notif => this.notifications.set(notif.id, notif));
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow notifications', error as Error);
    }
  }

  /**
   * Save notifications to storage
   */
  private async saveNotifications(): Promise<void> {
    try {
      const notifications = Array.from(this.notifications.values());
      await dbService.saveSetting(WORKFLOW_NOTIFICATIONS_KEY, notifications);
    } catch (error) {
      logger.error('Failed to save workflow notifications', error as Error);
    }
  }

  /**
   * Load templates from storage
   */
  private async loadTemplates(): Promise<void> {
    try {
      const saved = await dbService.getSetting<WorkflowTemplate[]>(WORKFLOW_TEMPLATES_KEY);
      if (saved && saved.length > 0) {
        saved.forEach(tpl => this.templates.set(tpl.id, tpl));
      } else {
        const local = localStorage.getItem(WORKFLOW_TEMPLATES_KEY);
        if (local) {
          const templates: WorkflowTemplate[] = JSON.parse(local);
          templates.forEach(tpl => this.templates.set(tpl.id, tpl));
        } else {
          // Load default templates
          DEFAULT_WORKFLOW_TEMPLATES.forEach(tpl => {
            this.templates.set(tpl.id, tpl);
          });
          await this.saveTemplates();
        }
      }
    } catch (error) {
      logger.error('Failed to load workflow templates', error as Error);
    }
  }

  /**
   * Save templates to storage
   */
  private async saveTemplates(): Promise<void> {
    try {
      const templates = Array.from(this.templates.values());
      await dbService.saveSetting(WORKFLOW_TEMPLATES_KEY, templates);
    } catch (error) {
      logger.error('Failed to save workflow templates', error as Error);
    }
  }

  /**
   * Start periodic timeout checker
   */
  private startTimeoutChecker(): void {
    // Check every 15 minutes
    this.checkInterval = setInterval(() => {
      this.checkTimeouts().catch(err => {
        logger.error('Timeout check failed', err as Error);
      });
    }, 15 * 60 * 1000);
  }

  /**
   * Stop timeout checker
   */
  stopTimeoutChecker(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // ==================== DEFINITION MANAGEMENT ====================

  /**
   * Create a new workflow definition
   */
  async createDefinition(
    definition: Omit<WorkflowDefinition, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'createdBy'>,
    userId: string
  ): Promise<WorkflowDefinition> {
    const newDefinition: WorkflowDefinition = {
      ...definition,
      id: `WF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      version: 1,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate the definition
    this.validateDefinition(newDefinition);

    this.definitions.set(newDefinition.id, newDefinition);
    await this.saveDefinitions();

    logger.info('Workflow definition created', { id: newDefinition.id, name: newDefinition.name });
    return newDefinition;
  }

  /**
   * Update a workflow definition
   */
  async updateDefinition(
    id: string,
    updates: Partial<WorkflowDefinition>,
    userId: string
  ): Promise<WorkflowDefinition> {
    const existing = this.definitions.get(id);
    if (!existing) {
      throw new Error(`Workflow definition not found: ${id}`);
    }

    const updated: WorkflowDefinition = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      version: existing.version + 1,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    // Validate the definition
    this.validateDefinition(updated);

    this.definitions.set(id, updated);
    await this.saveDefinitions();

    logger.info('Workflow definition updated', { id, version: updated.version });
    return updated;
  }

  /**
   * Delete a workflow definition
   */
  async deleteDefinition(id: string): Promise<void> {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${id}`);
    }

    // Check for active instances
    const activeInstances = Array.from(this.instances.values()).filter(
      inst => inst.workflowDefinitionId === id && inst.status === 'pending'
    );
    if (activeInstances.length > 0) {
      throw new Error(`Cannot delete workflow with ${activeInstances.length} active instances`);
    }

    this.definitions.delete(id);
    await this.saveDefinitions();

    logger.info('Workflow definition deleted', { id });
  }

  /**
   * Get a workflow definition
   */
  getDefinition(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Get all workflow definitions
   */
  getDefinitions(entityType?: WorkflowEntityType): WorkflowDefinition[] {
    const definitions = Array.from(this.definitions.values());
    if (entityType) {
      return definitions.filter(def => def.entityType === entityType);
    }
    return definitions;
  }

  /**
   * Get active workflow definitions
   */
  getActiveDefinitions(entityType?: WorkflowEntityType): WorkflowDefinition[] {
    return this.getDefinitions(entityType).filter(def => def.isActive);
  }

  /**
   * Validate a workflow definition
   */
  private validateDefinition(definition: WorkflowDefinition): void {
    if (!definition.name || definition.name.trim().length === 0) {
      throw new Error('Workflow definition must have a name');
    }
    if (!definition.steps || definition.steps.length === 0) {
      throw new Error('Workflow definition must have at least one step');
    }
    if (!definition.initialStepId) {
      throw new Error('Workflow definition must have an initial step');
    }

    // Validate steps
    const stepIds = new Set(definition.steps.map(s => s.id));
    if (!stepIds.has(definition.initialStepId)) {
      throw new Error('Initial step not found in steps list');
    }
    if (definition.finalStepId && !stepIds.has(definition.finalStepId)) {
      throw new Error('Final step not found in steps list');
    }

    // Validate step order
    const orders = definition.steps.map(s => s.order);
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      throw new Error('Step orders must be unique');
    }
  }

  // ==================== INSTANCE MANAGEMENT ====================

  /**
   * Start a new workflow instance
   */
  async startWorkflow(
    workflowDefinitionId: string,
    entityType: WorkflowEntityType,
    entityId: string,
    requestedBy: string,
    contextData?: Record<string, any>,
    priority: WorkflowInstance['priority'] = 'normal'
  ): Promise<WorkflowInstance> {
    const definition = this.definitions.get(workflowDefinitionId);
    if (!definition || !definition.isActive) {
      throw new Error('Workflow definition not found or inactive');
    }

    // Check for existing active instance for this entity
    if (!definition.allowParallelInstances) {
      const existing = Array.from(this.instances.values()).find(
        inst => inst.workflowDefinitionId === workflowDefinitionId &&
                inst.entityId === entityId &&
                inst.status === 'pending'
      );
      if (existing) {
        throw new Error('An active workflow already exists for this entity');
      }
    }

    // Get initial step
    const initialStep = definition.steps.find(s => s.id === definition.initialStepId);
    if (!initialStep) {
      throw new Error('Initial step not found');
    }

    const now = new Date();
    const instance: WorkflowInstance = {
      id: `WI-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      workflowDefinitionId,
      workflowDefinitionName: definition.name,
      entityType,
      entityId,
      entityReference: contextData?.reference,
      currentStepId: initialStep.id,
      currentStepName: initialStep.name,
      status: 'pending',
      requestedBy,
      requestedByName: contextData?.requesterName,
      requestedAt: now,
      startedAt: now,
      dueDate: definition.totalTimeoutHours 
        ? new Date(now.getTime() + definition.totalTimeoutHours * 60 * 60 * 1000)
        : undefined,
      contextData,
      priority,
      createdAt: now,
      updatedAt: now,
    };

    this.instances.set(instance.id, instance);
    await this.saveInstances();

    // Add history entry
    await this.addHistoryEntry({
      workflowInstanceId: instance.id,
      eventType: 'started',
      actorId: requestedBy,
      actorName: contextData?.requesterName,
      details: `Workflow started for ${entityType} ${entityId}`,
    });

    // Process initial step
    await this.processStep(instance.id, initialStep);

    logger.info('Workflow instance started', { 
      instanceId: instance.id, 
      definitionId: workflowDefinitionId,
      entityType,
      entityId 
    });

    return instance;
  }

  /**
   * Process a workflow step
   */
  private async processStep(instanceId: string, step: WorkflowStep): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    // Check for auto-approval
    if (step.autoApprove && step.autoApproveCondition) {
      const shouldAutoApprove = this.evaluateCondition(
        step.autoApproveCondition,
        instance.contextData || {}
      );
      if (shouldAutoApprove) {
        await this.processApproval(instanceId, step.id, 'system', 'approve', 'Auto-approved based on conditions');
        return;
      }
    }

    // Create approval record
    const approval: WorkflowApproval = {
      id: `APR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      workflowInstanceId: instanceId,
      stepId: step.id,
      stepName: step.name,
      approverId: step.approverId || step.approverRole,
      approverRole: step.approverRole,
      assignedAt: new Date(),
      createdAt: new Date(),
    };

    this.approvals.set(approval.id, approval);
    await this.saveApprovals();

    // Add history entry
    await this.addHistoryEntry({
      workflowInstanceId: instanceId,
      eventType: 'step_started',
      stepId: step.id,
      stepName: step.name,
      actorId: 'system',
      details: `Step "${step.name}" started, awaiting approval from ${step.approverRole}`,
    });

    // Send notification
    if (step.notifyRequester) {
      await this.createNotification({
        workflowInstanceId: instanceId,
        type: 'approval_required',
        recipientId: instance.requestedBy,
        recipientName: instance.requestedByName,
        title: 'Approval Required',
        message: `Your ${instance.entityType} requires approval: ${step.name}`,
        actionUrl: `/workflows/${instanceId}`,
      });
    }

    // Set timeout reminder
    if (step.timeoutHours) {
      const timeoutAt = new Date(Date.now() + step.timeoutHours * 60 * 60 * 1000);
      setTimeout(() => {
        this.checkStepTimeout(instanceId, step.id).catch(err => {
          logger.error('Step timeout check failed', err as Error);
        });
      }, step.timeoutHours * 60 * 60 * 1000);
    }
  }

  /**
   * Process an approval action
   */
  async processApproval(
    instanceId: string,
    stepId: string,
    approverId: string,
    action: WorkflowActionType,
    comments?: string
  ): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    if (instance.status !== 'pending') {
      throw new Error(`Workflow instance is not pending (status: ${instance.status})`);
    }

    const definition = this.definitions.get(instance.workflowDefinitionId);
    if (!definition) {
      throw new Error('Workflow definition not found');
    }

    const step = definition.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    // Find and update approval record
    const approval = Array.from(this.approvals.values()).find(
      a => a.workflowInstanceId === instanceId && a.stepId === stepId && !a.actionedAt
    );
    if (approval) {
      approval.action = action;
      approval.comments = comments;
      approval.approverId = approverId;
      approval.actionedAt = new Date();
      await this.saveApprovals();
    }

    // Add history entry
    await this.addHistoryEntry({
      workflowInstanceId: instanceId,
      eventType: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action as 'started' | 'step_started' | 'step_completed' | 'approved' | 'rejected' | 'escalated' | 'cancelled' | 'returned' | 'delegated' | 'timeout' | 'completed',
      stepId: step.id,
      stepName: step.name,
      actorId: approverId,
      details: `${action.charAt(0).toUpperCase() + action.slice(1)}: ${comments || 'No comments'}`,
    });

    // Handle action
    switch (action) {
      case 'approve':
        return await this.handleApproval(instance, step);
      case 'reject':
        return await this.handleRejection(instance, step, approverId, comments);
      case 'escalate':
        return await this.handleEscalation(instance, step, approverId, comments);
      case 'return':
        return await this.handleReturn(instance, step, approverId, comments);
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }

  /**
   * Handle approval action
   */
  private async handleApproval(
    instance: WorkflowInstance,
    currentStep: WorkflowStep
  ): Promise<WorkflowInstance> {
    const definition = this.definitions.get(instance.workflowDefinitionId);
    if (!definition) throw new Error('Workflow definition not found');

    // Find next step
    const currentStepIndex = definition.steps.findIndex(s => s.id === currentStep.id);
    const nextStep = definition.steps
      .filter(s => s.order > currentStep.order)
      .sort((a, b) => a.order - b.order)[0];

    if (!nextStep || currentStep.id === definition.finalStepId) {
      // Workflow completed
      instance.status = 'completed';
      instance.completedAt = new Date();
      instance.completionAction = 'approve';
      instance.updatedAt = new Date();

      await this.addHistoryEntry({
        workflowInstanceId: instance.id,
        eventType: 'completed',
        actorId: 'system',
        details: 'Workflow completed successfully',
      });

      await this.createNotification({
        workflowInstanceId: instance.id,
        type: 'completed',
        recipientId: instance.requestedBy,
        recipientName: instance.requestedByName,
        title: 'Workflow Completed',
        message: `Your ${instance.entityType} has been approved`,
        actionUrl: `/workflows/${instance.id}`,
      });
    } else {
      // Move to next step
      instance.currentStepId = nextStep.id;
      instance.currentStepName = nextStep.name;
      instance.updatedAt = new Date();

      await this.processStep(instance.id, nextStep);
    }

    this.instances.set(instance.id, instance);
    await this.saveInstances();

    return instance;
  }

  /**
   * Handle rejection action
   */
  private async handleRejection(
    instance: WorkflowInstance,
    currentStep: WorkflowStep,
    approverId: string,
    comments?: string
  ): Promise<WorkflowInstance> {
    instance.status = 'rejected';
    instance.completedAt = new Date();
    instance.completedBy = approverId;
    instance.completionAction = 'reject';
    instance.updatedAt = new Date();

    this.instances.set(instance.id, instance);
    await this.saveInstances();

    await this.addHistoryEntry({
      workflowInstanceId: instance.id,
      eventType: 'rejected',
      stepId: currentStep.id,
      stepName: currentStep.name,
      actorId: approverId,
      details: `Rejected: ${comments || 'No comments'}`,
    });

    await this.createNotification({
      workflowInstanceId: instance.id,
      type: 'rejected',
      recipientId: instance.requestedBy,
      recipientName: instance.requestedByName,
      title: 'Workflow Rejected',
      message: `Your ${instance.entityType} was rejected: ${comments || 'No comments'}`,
      actionUrl: `/workflows/${instance.id}`,
    });

    return instance;
  }

  /**
   * Handle escalation action
   */
  private async handleEscalation(
    instance: WorkflowInstance,
    currentStep: WorkflowStep,
    approverId: string,
    comments?: string
  ): Promise<WorkflowInstance> {
    instance.status = 'escalated';
    instance.escalatedAt = new Date();
    instance.updatedAt = new Date();

    this.instances.set(instance.id, instance);
    await this.saveInstances();

    await this.addHistoryEntry({
      workflowInstanceId: instance.id,
      eventType: 'escalated',
      stepId: currentStep.id,
      stepName: currentStep.name,
      actorId: approverId,
      details: `Escalated: ${comments || 'No comments'}`,
    });

    await this.createNotification({
      workflowInstanceId: instance.id,
      type: 'escalated',
      recipientId: instance.requestedBy,
      recipientName: instance.requestedByName,
      title: 'Workflow Escalated',
      message: `Your ${instance.entityType} has been escalated`,
      actionUrl: `/workflows/${instance.id}`,
    });

    return instance;
  }

  /**
   * Handle return action (send back to requester)
   */
  private async handleReturn(
    instance: WorkflowInstance,
    currentStep: WorkflowStep,
    approverId: string,
    comments?: string
  ): Promise<WorkflowInstance> {
    // Return to initial step
    const definition = this.definitions.get(instance.workflowDefinitionId);
    if (!definition) throw new Error('Workflow definition not found');

    const initialStep = definition.steps.find(s => s.id === definition.initialStepId);
    if (!initialStep) throw new Error('Initial step not found');

    instance.currentStepId = initialStep.id;
    instance.currentStepName = initialStep.name;
    instance.updatedAt = new Date();

    this.instances.set(instance.id, instance);
    await this.saveInstances();

    await this.addHistoryEntry({
      workflowInstanceId: instance.id,
      eventType: 'returned',
      stepId: currentStep.id,
      stepName: currentStep.name,
      actorId: approverId,
      details: `Returned to requester: ${comments || 'No comments'}`,
    });

    await this.createNotification({
      workflowInstanceId: instance.id,
      type: 'approval_required',
      recipientId: instance.requestedBy,
      recipientName: instance.requestedByName,
      title: 'Workflow Returned',
      message: `Your ${instance.entityType} was returned for revision: ${comments || 'No comments'}`,
      actionUrl: `/workflows/${instance.id}`,
    });

    // Re-process initial step
    await this.processStep(instance.id, initialStep);

    return instance;
  }

  /**
   * Cancel a workflow instance
   */
  async cancelWorkflow(
    instanceId: string,
    cancelledBy: string,
    reason?: string
  ): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    if (instance.status !== 'pending' && instance.status !== 'escalated') {
      throw new Error(`Cannot cancel workflow with status: ${instance.status}`);
    }

    instance.status = 'cancelled';
    instance.completedAt = new Date();
    instance.completedBy = cancelledBy;
    instance.completionAction = 'reject';
    instance.updatedAt = new Date();

    this.instances.set(instance.id, instance);
    await this.saveInstances();

    await this.addHistoryEntry({
      workflowInstanceId: instanceId,
      eventType: 'cancelled',
      actorId: cancelledBy,
      details: `Cancelled: ${reason || 'No reason provided'}`,
    });

    return instance;
  }

  /**
   * Get a workflow instance
   */
  getInstance(id: string): WorkflowInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * Get workflow instances with filtering
   */
  getInstances(filter?: WorkflowFilter): WorkflowInstance[] {
    let instances = Array.from(this.instances.values());

    if (filter) {
      if (filter.status && filter.status.length > 0) {
        instances = instances.filter(i => filter.status!.includes(i.status));
      }
      if (filter.entityType && filter.entityType.length > 0) {
        instances = instances.filter(i => filter.entityType!.includes(i.entityType));
      }
      if (filter.priority && filter.priority.length > 0) {
        instances = instances.filter(i => filter.priority!.includes(i.priority));
      }
      if (filter.requestedBy) {
        instances = instances.filter(i => i.requestedBy === filter.requestedBy);
      }
      if (filter.dateFrom) {
        instances = instances.filter(i => new Date(i.createdAt) >= filter.dateFrom!);
      }
      if (filter.dateTo) {
        instances = instances.filter(i => new Date(i.createdAt) <= filter.dateTo!);
      }
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        instances = instances.filter(i => 
          i.entityId.toLowerCase().includes(query) ||
          i.entityReference?.toLowerCase().includes(query) ||
          i.workflowDefinitionName?.toLowerCase().includes(query)
        );
      }
    }

    return instances.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Get pending instances for a user
   */
  getPendingInstancesForUser(userId: string, userRole: string): WorkflowInstance[] {
    return Array.from(this.instances.values()).filter(instance => {
      if (instance.status !== 'pending') return false;
      
      const definition = this.definitions.get(instance.workflowDefinitionId);
      if (!definition) return false;
      
      const currentStep = definition.steps.find(s => s.id === instance.currentStepId);
      if (!currentStep) return false;
      
      // Check if user is assigned or has the required role
      return currentStep.approverId === userId || 
             currentStep.approverIds?.includes(userId) ||
             currentStep.approverRole === userRole ||
             currentStep.approverRole === 'Admin';
    });
  }

  // ==================== APPROVAL MANAGEMENT ====================

  /**
   * Get all pending approvals
   */
  getPendingApprovals(): WorkflowApproval[] {
    return Array.from(this.approvals.values()).filter(a => !a.actionedAt);
  }

  /**
   * Get approvals for a workflow instance
   */
  getApprovalsForInstance(instanceId: string): WorkflowApproval[] {
    return Array.from(this.approvals.values())
      .filter(a => a.workflowInstanceId === instanceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // ==================== HISTORY MANAGEMENT ====================

  /**
   * Add a history entry
   */
  private async addHistoryEntry(
    entry: Omit<WorkflowHistoryEntry, 'id' | 'timestamp'>
  ): Promise<void> {
    const historyEntry: WorkflowHistoryEntry = {
      ...entry,
      id: `WH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date(),
    };

    const existing = this.history.get(entry.workflowInstanceId) || [];
    existing.push(historyEntry);
    this.history.set(entry.workflowInstanceId, existing);
    await this.saveHistory();
  }

  /**
   * Get history for a workflow instance
   */
  getHistory(instanceId: string): WorkflowHistoryEntry[] {
    return this.history.get(instanceId) || [];
  }

  // ==================== NOTIFICATION MANAGEMENT ====================

  /**
   * Create a notification
   */
  private async createNotification(
    data: Omit<WorkflowNotification, 'id' | 'read' | 'createdAt'>
  ): Promise<void> {
    const notification: WorkflowNotification = {
      ...data,
      id: `WN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      read: false,
      createdAt: new Date(),
    };

    this.notifications.set(notification.id, notification);
    await this.saveNotifications();

    // Also trigger in-app notification
    notify({
      type: data.type === 'rejected' ? 'error' : data.type === 'completed' ? 'success' : 'info',
      title: data.title,
      message: data.message,
    });
  }

  /**
   * Get notifications for a user
   */
  getNotifications(userId: string, unreadOnly: boolean = false): WorkflowNotification[] {
    return Array.from(this.notifications.values())
      .filter(n => n.recipientId === userId && (!unreadOnly || !n.read))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.read = true;
      notification.readAt = new Date();
      await this.saveNotifications();
    }
  }

  // ==================== TEMPLATE MANAGEMENT ====================

  /**
   * Get all templates
   */
  getTemplates(entityType?: WorkflowEntityType): WorkflowTemplate[] {
    const templates = Array.from(this.templates.values());
    if (entityType) {
      return templates.filter(t => t.entityType === entityType);
    }
    return templates;
  }

  /**
   * Create a workflow from a template
   */
  async createFromTemplate(
    templateId: string,
    userId: string,
    customizations?: Partial<WorkflowDefinition>
  ): Promise<WorkflowDefinition> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const definition = await this.createDefinition(
      {
        ...template.definition,
        ...customizations,
        name: customizations?.name || template.name,
        description: customizations?.description || template.description,
      },
      userId
    );

    // Update template usage count
    template.usageCount++;
    await this.saveTemplates();

    return definition;
  }

  // ==================== TIMEOUT MANAGEMENT ====================

  /**
   * Check for timed out steps
   */
  private async checkTimeouts(): Promise<void> {
    const now = new Date();
    const pendingInstances = Array.from(this.instances.values()).filter(
      i => i.status === 'pending'
    );

    for (const instance of pendingInstances) {
      const definition = this.definitions.get(instance.workflowDefinitionId);
      if (!definition) continue;

      const currentStep = definition.steps.find(s => s.id === instance.currentStepId);
      if (!currentStep || !currentStep.timeoutHours) continue;

      // Find the approval for this step
      const approval = Array.from(this.approvals.values()).find(
        a => a.workflowInstanceId === instance.id && 
             a.stepId === currentStep.id && 
             !a.actionedAt
      );

      if (approval) {
        const assignedAt = new Date(approval.assignedAt);
        const timeoutAt = new Date(assignedAt.getTime() + currentStep.timeoutHours * 60 * 60 * 1000);

        if (now > timeoutAt) {
          await this.handleStepTimeout(instance, currentStep);
        } else if (currentStep.escalationAfterHours) {
          // Check for escalation
          const escalationAt = new Date(assignedAt.getTime() + currentStep.escalationAfterHours * 60 * 60 * 1000);
          if (now > escalationAt && !instance.escalatedAt) {
            await this.handleEscalation(instance, currentStep, 'system', 'Auto-escalated due to timeout');
          }
        }
      }
    }
  }

  /**
   * Check specific step timeout
   */
  private async checkStepTimeout(instanceId: string, stepId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== 'pending') return;

    const definition = this.definitions.get(instance.workflowDefinitionId);
    if (!definition) return;

    const step = definition.steps.find(s => s.id === stepId);
    if (!step || step.id !== instance.currentStepId) return;

    await this.handleStepTimeout(instance, step);
  }

  /**
   * Handle step timeout
   */
  private async handleStepTimeout(
    instance: WorkflowInstance,
    step: WorkflowStep
  ): Promise<void> {
    // Check for escalation step
    if (step.escalationStepId) {
      const escalationStep = this.definitions
        .get(instance.workflowDefinitionId)
        ?.steps.find(s => s.id === step.escalationStepId);

      if (escalationStep) {
        instance.currentStepId = escalationStep.id;
        instance.currentStepName = escalationStep.name;
        instance.escalatedAt = new Date();
        instance.updatedAt = new Date();

        this.instances.set(instance.id, instance);
        await this.saveInstances();

        await this.addHistoryEntry({
          workflowInstanceId: instance.id,
          eventType: 'timeout',
          stepId: step.id,
          stepName: step.name,
          actorId: 'system',
          details: `Step timed out, escalated to ${escalationStep.name}`,
        });

        await this.processStep(instance.id, escalationStep);
        return;
      }
    }

    // No escalation step, send reminder
    await this.createNotification({
      workflowInstanceId: instance.id,
      type: 'timeout_warning',
      recipientId: step.approverId || step.approverRole,
      title: 'Approval Overdue',
      message: `Approval for ${instance.entityType} is overdue: ${step.name}`,
      actionUrl: `/workflows/${instance.id}`,
    });
  }

  // ==================== CONDITION EVALUATION ====================

  /**
   * Evaluate a condition against context data
   */
  private evaluateCondition(condition: WorkflowCondition, contextData: Record<string, any>): boolean {
    const value = contextData[condition.field || ''];
    
    switch (condition.operator) {
      case 'gt':
        return Number(value) > Number(condition.value);
      case 'lt':
        return Number(value) < Number(condition.value);
      case 'eq':
        return value === condition.value;
      case 'neq':
        return value !== condition.value;
      case 'gte':
        return Number(value) >= Number(condition.value);
      case 'lte':
        return Number(value) <= Number(condition.value);
      case 'contains':
        return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
      default:
        return false;
    }
  }

  // ==================== STATISTICS ====================

  /**
   * Get workflow statistics
   */
  getStats(): WorkflowStats {
    const instances = Array.from(this.instances.values());
    const now = new Date();

    const stats: WorkflowStats = {
      totalInstances: instances.length,
      pendingInstances: instances.filter(i => i.status === 'pending').length,
      completedInstances: instances.filter(i => i.status === 'completed').length,
      rejectedInstances: instances.filter(i => i.status === 'rejected').length,
      averageCompletionTime: 0,
      overdueInstances: instances.filter(i => 
        i.status === 'pending' && i.dueDate && new Date(i.dueDate) < now
      ).length,
      byEntityType: {} as WorkflowStats['byEntityType'],
      byPriority: { low: 0, normal: 0, high: 0, urgent: 0 },
      averageApprovalTime: 0,
      escalationRate: 0,
    };

    // Calculate by entity type
    const entityTypes: WorkflowEntityType[] = [
      'expense', 'purchase_order', 'invoice', 'quotation', 'work_order',
      'leave_request', 'expense_claim', 'payment_request', 'refund_request',
      'inventory_adjustment', 'user_access_request'
    ];
    
    entityTypes.forEach(type => {
      const typeInstances = instances.filter(i => i.entityType === type);
      stats.byEntityType[type] = {
        pending: typeInstances.filter(i => i.status === 'pending').length,
        completed: typeInstances.filter(i => i.status === 'completed').length,
        rejected: typeInstances.filter(i => i.status === 'rejected').length,
      };
    });

    // Calculate by priority
    stats.byPriority = {
      low: instances.filter(i => i.priority === 'low').length,
      normal: instances.filter(i => i.priority === 'normal').length,
      high: instances.filter(i => i.priority === 'high').length,
      urgent: instances.filter(i => i.priority === 'urgent').length,
    };

    // Calculate average completion time
    const completedInstances = instances.filter(i => i.status === 'completed' && i.completedAt);
    if (completedInstances.length > 0) {
      const totalTime = completedInstances.reduce((sum, i) => {
        const start = new Date(i.startedAt).getTime();
        const end = new Date(i.completedAt!).getTime();
        return sum + (end - start);
      }, 0);
      stats.averageCompletionTime = totalTime / completedInstances.length / (1000 * 60 * 60); // Convert to hours
    }

    // Calculate escalation rate
    const escalatedCount = instances.filter(i => i.escalatedAt).length;
    stats.escalationRate = instances.length > 0 ? (escalatedCount / instances.length) * 100 : 0;

    return stats;
  }
}

// Export singleton instance
export const workflowService = new WorkflowService();

// Export class for testing
export { WorkflowService };
