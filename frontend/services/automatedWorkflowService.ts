import { logger } from '@/services/logger';

export interface WorkflowTrigger {
  id: string;
  event: string;
  module: string;
  action: string;
  condition?: string;
  enabled: boolean;
}

const TRIGGER_EVENTS = {
  INVOICE_CREATED: 'invoice.created',
  INVOICE_PAID: 'invoice.paid',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_FULFILLED: 'order.fulfilled',
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',
  PURCHASE_ORDER_APPROVED: 'purchase_order.approved',
  PRODUCTION_COMPLETED: 'production.completed',
  CUSTOMER_CREATED: 'customer.created',
  PAYMENT_RECEIVED: 'payment.received',
};

const AUTOMATED_ACTIONS = {
  SEND_EMAIL: 'send_email',
  CREATE_TASK: 'create_task',
  SEND_NOTIFICATION: 'send_notification',
  UPDATE_INVENTORY: 'update_inventory',
  CALL_WEBHOOK: 'call_webhook',
  GENERATE_REPORT: 'generate_report',
  UPDATE_RECORD: 'update_record',
};

class AutomatedWorkflowService {
  private triggers: Map<string, WorkflowTrigger> = new Map();

  registerTrigger(trigger: WorkflowTrigger) {
    this.triggers.set(trigger.id, trigger);
    logger.info(`[Workflow] Registered trigger: ${trigger.event} → ${trigger.action}`);
  }

  getTriggersForEvent(event: string): WorkflowTrigger[] {
    return Array.from(this.triggers.values()).filter(t => t.event === event && t.enabled);
  }

  async fireEvent(event: string, payload: Record<string, any>) {
    const matchingTriggers = this.getTriggersForEvent(event);
    if (matchingTriggers.length === 0) return;

    for (const trigger of matchingTriggers) {
      try {
        logger.info(`[Workflow] Firing trigger ${trigger.id}: ${event} → ${trigger.action}`);
        if (trigger.action === 'send_notification') {
          const { notificationService } = await import('./notificationService');
          notificationService.addNotification({
            id: `wf-${Date.now()}`,
            type: 'info',
            title: `Workflow: ${event}`,
            message: `Automated trigger fired for ${event}`,
            timestamp: new Date(),
            read: false,
          });
        }
      } catch (err) {
        console.error(`[Workflow] Error firing trigger ${trigger.id}:`, err);
      }
    }
  }

  getRegisteredTriggers(): WorkflowTrigger[] {
    return Array.from(this.triggers.values());
  }
}

export const workflowService = new AutomatedWorkflowService();
export { TRIGGER_EVENTS, AUTOMATED_ACTIONS };
