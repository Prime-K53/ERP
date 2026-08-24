import { dbService } from './db';
import { generateNextId } from '../utils/helpers';
import { workflowService } from './workflowService';
import { JobTicket } from '../types';
import { examinationBatchService } from './examinationBatchService';
import { getProductionDb } from './productionDb';

type SourceType = 'quotation' | 'examination_batch' | 'order';

type ConversionOptions = {
  requestedBy?: string;
  requesterRole?: string;
  force?: boolean;
};

type ConversionResult = {
  success: boolean;
  sourceType: SourceType;
  sourceId: string;
  jobTicketId: string;
  workOrderId?: string;
  message: string;
  workflowStarted: boolean;
};

const nowIso = () => new Date().toISOString();

const toSafeString = (value: any) => String(value || '').trim();
const toSafeNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createAuditLog = (params: {
  sourceType: SourceType;
  sourceId: string;
  jobTicketId: string;
  requestedBy: string;
  requesterRole: string;
  details: string;
}) => ({
  id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  date: nowIso(),
  action: 'CREATE',
  entityType: 'JobTicketConversion',
  entityId: params.jobTicketId,
  details: params.details,
  userId: params.requestedBy,
  userRole: params.requesterRole,
  newValue: {
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    jobTicketId: params.jobTicketId
  }
});

const getLockId = (sourceType: SourceType, sourceId: string) => `CONV-${sourceType}-${sourceId}`;

const mergeBatchSnapshot = async (storedBatch: any, hydratedBatch: any) => {
  if (!storedBatch && !hydratedBatch) return null;

  const merged = {
    ...(storedBatch || {}),
    ...(hydratedBatch || {})
  };
  const hydratedClasses = Array.isArray(hydratedBatch?.classes) && hydratedBatch.classes.length > 0
    ? hydratedBatch.classes
    : null;
  const storedClasses = Array.isArray(storedBatch?.classes) ? storedBatch.classes : [];

  const schoolId = merged.customerId || merged.customer_id || merged.schoolId || merged.school_id;
  let customerName = merged.customerName || merged.customer_name || merged.schoolName || merged.school_name || merged.name;
  
  if (!customerName && schoolId) {
    try {
      const customers = await dbService.getAll<any>('customers');
      const customer = customers.find((c: any) => String(c.id) === String(schoolId));
      if (customer) {
        customerName = customer.name;
      }
    } catch (e) {
      console.warn('[jobTicketConversionService] Could not look up customer:', e);
    }
  }

  return {
    ...merged,
    classes: hydratedClasses || storedClasses,
    customer_name: customerName,
    valid_until: merged.validUntil || merged.valid_until || hydratedBatch?.validUntil || hydratedBatch?.valid_until || storedBatch?.validUntil || storedBatch?.valid_until
  };
};

const validateQuotationForConversion = (quotation: any) => {
  const errors: string[] = [];
  if (!toSafeString(quotation?.id)) errors.push('Quotation ID is required');
  if (!toSafeString(quotation?.customerName)) errors.push('Customer name is required');
  if (!Array.isArray(quotation?.items) || quotation.items.length === 0) errors.push('At least one quotation item is required');
  const quotationType = toSafeString(quotation?.quotationType || 'General').toLowerCase();
  if (quotationType !== 'general') errors.push('Only General quotations can be converted through this conversion flow');
  if (toSafeString(quotation?.status).toLowerCase() === 'converted') errors.push('Quotation already converted');
  if (toSafeString(quotation?.convertedJobTicketId)) errors.push('Quotation already linked to a job ticket');
  return errors;
};

const validateOrderForConversion = (order: any) => {
  const errors: string[] = [];
  if (!toSafeString(order?.id)) errors.push('Order ID is required');
  if (!toSafeString(order?.customerName)) errors.push('Customer name is required');
  if (!Array.isArray(order?.items) || order.items.length === 0) errors.push('At least one order item is required');
  if (toSafeString(order?.status).toLowerCase() === 'cancelled') errors.push('Cancelled order cannot be converted');
  if (toSafeString(order?.convertedJobTicketId)) errors.push('Order already linked to a job ticket');
  return errors;
};

const validateBatchForConversion = (batch: any) => {
  const errors: string[] = [];
  if (!toSafeString(batch?.id)) errors.push('Batch ID is required');
  if (!resolveBatchReference(batch)) errors.push('Batch reference is required');
  if (!Array.isArray(batch?.classes) || batch.classes.length === 0) errors.push('At least one class is required');
  if (toSafeString(batch?.status).toLowerCase() === 'cancelled') errors.push('Cancelled batch cannot be converted');
  if (toSafeString(batch?.convertedJobTicketId)) errors.push('Batch already linked to a job ticket');
  return errors;
};

const inferJobTicketType = (...values: any[]): JobTicket['type'] => {
  const haystack = values
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  if (haystack.includes('photocopy') || haystack.includes('copy')) return 'Photocopy';
  if (haystack.includes('binding')) return 'Binding';
  if (haystack.includes('scan')) return 'Scan';
  if (haystack.includes('lamination')) return 'Lamination';
  return 'Printing';
};

const resolveBatchReference = (batch: any) => (
  toSafeString(batch?.batch_number)
  || toSafeString(batch?.batchNumber)
  || toSafeString(batch?.name)
  || toSafeString(batch?.id)
);

const mapQuotationToWorkOrder = (quotation: any, workOrderId: string) => {
  const firstItem = Array.isArray(quotation.items) && quotation.items.length > 0 ? quotation.items[0] : {};
  const totalQuantity = (quotation.items || []).reduce((sum: number, item: any) => sum + toSafeNumber(item.quantity, 0), 0) || 1;
  return {
    id: workOrderId,
    status: 'Scheduled',
    sourceType: 'quotation',
    sourceId: quotation.id,
    customerId: quotation.customerId || undefined,
    customerName: quotation.customerName,
    productId: firstItem?.id || firstItem?.productId || '',
    productName: firstItem?.name || firstItem?.description || `Quotation ${quotation.id}`,
    quantityPlanned: totalQuantity,
    quantityCompleted: 0,
    dueDate: quotation.validUntil || nowIso(),
    startDate: nowIso(),
    notes: `Generated from quotation ${quotation.id}`,
    logs: [],
    priority: 'Normal',
    items: (quotation.items || []).map((item: any) => ({
      id: item.id || item.productId || `ITEM-${Math.random().toString(36).slice(2, 8)}`,
      desc: item.name || item.description || 'Item',
      qty: toSafeNumber(item.quantity, 1),
      price: toSafeNumber(item.price, 0),
      total: toSafeNumber(item.quantity, 1) * toSafeNumber(item.price, 0)
    }))
  };
};

const mapQuotationToTicket = (quotation: any, jobTicketId: string, linkedWorkOrderId?: string): JobTicket => {
  const items = Array.isArray(quotation.items) ? quotation.items : [];
  const firstItem = items[0] || {};
  const totalQuantity = items.reduce((sum: number, item: any) => sum + toSafeNumber(item.quantity, 0), 0) || 1;
  const totalAmount = toSafeNumber(quotation.totalAmount ?? quotation.total, 0);
  const unitPrice = totalQuantity > 0 ? totalAmount / totalQuantity : toSafeNumber(firstItem.price, 0);

  return {
    id: jobTicketId,
    ticketNumber: jobTicketId,
    type: inferJobTicketType(firstItem?.name, firstItem?.description, firstItem?.serviceDetails?.serviceType),
    customerId: quotation.customerId || undefined,
    customerName: quotation.customerName,
    customerPhone: quotation.customerPhone || quotation.phone || undefined,
    customerEmail: quotation.customerEmail || quotation.email || undefined,
    description: items.map((item: any) => item.name || item.description || 'Item').join(', ') || `Quotation ${quotation.id}`,
    quantity: Math.max(1, totalQuantity),
    priority: 'Normal',
    status: 'Received',
    paperSize: firstItem?.serviceDetails?.paperSize || firstItem?.paperSize || 'A4',
    paperType: firstItem?.serviceDetails?.paperType || firstItem?.paperType,
    colorMode: firstItem?.serviceDetails?.colorMode || firstItem?.colorMode || 'BlackWhite',
    sides: firstItem?.serviceDetails?.sides || firstItem?.sides || 'Single',
    finishing: firstItem?.serviceDetails?.finishing || firstItem?.finishing || {},
    unitPrice,
    rushFee: 0,
    finishingCost: 0,
    discount: toSafeNumber(quotation.discount, 0),
    subtotal: totalAmount,
    tax: toSafeNumber(quotation.tax, 0),
    total: totalAmount,
    dateReceived: nowIso(),
    dueDate: quotation.validUntil || quotation.dueDate || undefined,
    progressPercent: 0,
    notes: `Converted from quotation ${quotation.id}`,
    sourceType: 'quotation',
    sourceId: quotation.id,
    linkedWorkOrderId,
    createdBy: quotation.createdBy || 'System User',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
};

const mapOrderToWorkOrder = (order: any, workOrderId: string) => {
  const firstItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : {};
  const totalQuantity = (order.items || []).reduce((sum: number, item: any) => sum + toSafeNumber(item.quantity, 0), 0) || 1;
  return {
    id: workOrderId,
    status: 'Scheduled',
    sourceType: 'order' as const,
    sourceId: order.id,
    customerId: order.customerId || undefined,
    customerName: order.customerName,
    productId: firstItem?.id || firstItem?.productId || '',
    productName: firstItem?.name || firstItem?.description || `Order ${order.id}`,
    quantityPlanned: totalQuantity,
    quantityCompleted: 0,
    dueDate: order.dueDate || order.date || nowIso(),
    startDate: nowIso(),
    notes: `Generated from order ${order.id}`,
    logs: [],
    priority: order.priority || 'Normal',
    items: (order.items || []).map((item: any) => ({
      id: item.id || item.productId || `ITEM-${Math.random().toString(36).slice(2, 8)}`,
      desc: item.name || item.description || 'Item',
      qty: toSafeNumber(item.quantity, 1),
      price: toSafeNumber(item.price || item.unitPrice, 0),
      total: toSafeNumber(item.quantity, 1) * toSafeNumber(item.price || item.unitPrice, 0)
    }))
  };
};

const mapOrderToTicket = (order: any, jobTicketId: string, linkedWorkOrderId?: string): JobTicket => {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0] || {};
  const totalQuantity = items.reduce((sum: number, item: any) => sum + toSafeNumber(item.quantity, 0), 0) || 1;
  const totalAmount = toSafeNumber(order.totalAmount ?? order.total, 0);
  const unitPrice = totalQuantity > 0 ? totalAmount / totalQuantity : toSafeNumber(firstItem.price || firstItem.unitPrice, 0);

  return {
    id: jobTicketId,
    ticketNumber: jobTicketId,
    type: inferJobTicketType(firstItem?.name, firstItem?.description, firstItem?.serviceDetails?.serviceType),
    customerId: order.customerId || undefined,
    customerName: order.customerName,
    customerPhone: order.customerPhone || order.phone || undefined,
    customerEmail: order.customerEmail || order.email || undefined,
    description: items.map((item: any) => item.name || item.description || 'Item').join(', ') || `Order ${order.id}`,
    quantity: Math.max(1, totalQuantity),
    priority: order.priority || 'Normal',
    status: 'Received',
    paperSize: firstItem?.serviceDetails?.paperSize || firstItem?.paperSize || 'A4',
    paperType: firstItem?.serviceDetails?.paperType || firstItem?.paperType,
    colorMode: firstItem?.serviceDetails?.colorMode || firstItem?.colorMode || 'BlackWhite',
    sides: firstItem?.serviceDetails?.sides || firstItem?.sides || 'Single',
    finishing: firstItem?.serviceDetails?.finishing || firstItem?.finishing || {},
    unitPrice,
    rushFee: 0,
    finishingCost: 0,
    discount: toSafeNumber(order.discount, 0),
    subtotal: totalAmount,
    tax: toSafeNumber(order.tax, 0),
    total: totalAmount,
    dateReceived: nowIso(),
    dueDate: order.dueDate || order.date || undefined,
    progressPercent: 0,
    notes: `Converted from order ${order.id}`,
    sourceType: 'order',
    sourceId: order.id,
    linkedWorkOrderId,
    createdBy: order.createdBy || 'System User',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
};

const mapBatchToWorkOrder = async (batch: any, workOrderId: string) => {
  const classes = Array.isArray(batch.classes) ? batch.classes : [];
  const batchReference = resolveBatchReference(batch);
  const totalLearners = classes.reduce((sum: number, cls: any) => {
    const learners = toSafeNumber(cls.learners ?? cls.student_count ?? cls.number_of_learners, 0);
    return sum + learners;
  }, 0);

  const schoolId = batch.customerId || batch.customer_id || batch.schoolId || batch.school_id;
  let customerName = batch.customerName || batch.customer_name || batch.schoolName || batch.school_name || batch.name;
  if (!customerName && schoolId) {
    try {
      const customers = await dbService.getAll<any>('customers');
      const customer = customers.find((c: any) => String(c.id) === String(schoolId));
      if (customer) {
        customerName = customer.name;
      }
    } catch (e) {
      console.warn('[jobTicketConversionService] Could not look up customer for work order:', e);
    }
  }

  return {
    id: workOrderId,
    status: 'Scheduled',
    sourceType: 'examination_batch',
    sourceId: batch.id,
    customerId: schoolId || undefined,
    customerName,
    productId: batch.id,
    productName: batchReference,
    quantityPlanned: Math.max(1, totalLearners || classes.length),
    quantityCompleted: 0,
    dueDate: batch.validUntil || batch.valid_until || batch.dueDate || batch.due_date || batch.examinationDate || batch.examination_date || nowIso(),
    startDate: nowIso(),
    priority: batch.priority || 'Normal',
    notes: `Generated from examination batch ${batchReference}`,
    logs: [],
    examinationMeta: {
      batchNumber: batchReference,
      academicYear: batch.academic_year,
      term: batch.term,
      examType: batch.exam_type,
      classCount: classes.length
    },
    items: classes.map((cls: any, index: number) => ({
      id: cls.id || `CLS-${index + 1}`,
      desc: cls.class_name || cls.name || `Class ${index + 1}`,
      qty: toSafeNumber(cls.learners ?? cls.student_count ?? cls.number_of_learners, 0) || 1,
      price: toSafeNumber(cls.fee_per_learner ?? cls.price_per_learner ?? 0, 0),
      total: (toSafeNumber(cls.learners ?? cls.student_count ?? cls.number_of_learners, 0) || 1) * toSafeNumber(cls.fee_per_learner ?? cls.price_per_learner ?? 0, 0)
    }))
  };
};

const mapBatchToTicket = async (batch: any, jobTicketId: string, linkedWorkOrderId?: string): Promise<JobTicket> => {
  const classes = Array.isArray(batch.classes) ? batch.classes : [];
  const batchReference = resolveBatchReference(batch);
  const totalLearners = classes.reduce((sum: number, cls: any) => {
    const learners = toSafeNumber(cls.learners ?? cls.student_count ?? cls.number_of_learners, 0);
    return sum + learners;
  }, 0);
  const totalAmount = toSafeNumber(batch.total_amount ?? batch.totalAmount ?? batch.total, 0);
  const unitPrice = totalLearners > 0 ? totalAmount / totalLearners : 0;

  const schoolId = batch.customerId || batch.customer_id || batch.schoolId || batch.school_id;
  let customerName = batch.customerName || batch.customer_name || batch.schoolName || batch.school_name || batch.name;
  if (!customerName && schoolId) {
    try {
      const customers = await dbService.getAll<any>('customers');
      const customer = customers.find((c: any) => String(c.id) === String(schoolId));
      if (customer) {
        customerName = customer.name;
      }
    } catch (e) {
      console.warn('[jobTicketConversionService] Could not look up customer:', e);
    }
  }

  return {
    id: jobTicketId,
    ticketNumber: jobTicketId,
    type: 'Printing',
    customerId: schoolId || undefined,
    customerName,
    customerPhone: batch.customerPhone || batch.customer_phone || batch.schoolPhone || batch.school_phone || undefined,
    customerEmail: batch.customerEmail || batch.customer_email || batch.schoolEmail || batch.school_email || undefined,
    description: `Examination batch ${batchReference} - ${batch.academic_year || ''} Term ${batch.term || ''} (${batch.exam_type || ''})`,
    quantity: Math.max(1, totalLearners || classes.length),
    priority: 'Normal',
    status: 'Received',
    paperSize: 'A4',
    colorMode: 'BlackWhite',
    sides: 'Single',
    finishing: {},
    unitPrice,
    rushFee: 0,
    finishingCost: 0,
    discount: 0,
    subtotal: totalAmount,
    tax: 0,
    total: totalAmount,
    dateReceived: nowIso(),
    dueDate: batch.validUntil || batch.valid_until || batch.dueDate || batch.due_date || batch.examinationDate || batch.examination_date || undefined,
    progressPercent: 0,
    notes: `Converted from examination batch ${batchReference}`,
    sourceType: 'examination_batch',
    sourceId: batch.id,
    batchReference,
    linkedWorkOrderId,
    createdBy: 'System User',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
};

const startWorkflowForTicket = async (workflowEntityId: string, requestedBy: string, sourceType: SourceType, sourceId: string) => {
  try {
    await workflowService.initialize();
    const definitions = workflowService.getActiveDefinitions('work_order');
    if (!definitions.length) return false;
    await workflowService.startWorkflow(
      definitions[0].id,
      'work_order',
      workflowEntityId,
      requestedBy,
      {
        reference: workflowEntityId,
        sourceType,
        sourceId,
        requesterName: requestedBy
      }
    );
    return true;
  } catch {
    return false;
  }
};

const convertQuotationToJobTicket = async (quotationId: string, options: ConversionOptions = {}): Promise<ConversionResult> => {
  const requestedBy = toSafeString(options.requestedBy) || 'system';
  const requesterRole = toSafeString(options.requesterRole) || 'System';
  const force = Boolean(options.force);

  const conversion = await dbService.executeAtomicOperation(
    ['quotations', 'jobTickets', 'workOrders', 'auditLogs', 'idempotencyKeys'],
    async (tx) => {
      const quotationStore = tx.objectStore('quotations');
      const jobTicketStore = tx.objectStore('jobTickets');
      const workOrderStore = tx.objectStore('workOrders');
      const auditLogStore = tx.objectStore('auditLogs');
      const idempotencyStore = tx.objectStore('idempotencyKeys');

      const quotation = await quotationStore.get(quotationId);
      if (!quotation) {
        throw new Error('Quotation not found');
      }

      const validationErrors = validateQuotationForConversion(quotation);
      if (!force && validationErrors.length > 0) {
        throw new Error(validationErrors.join('; '));
      }

      const lockId = getLockId('quotation', quotationId);
      const existingLock = await idempotencyStore.get(lockId);
      if (existingLock && !force) {
        throw new Error('Conversion already in progress or completed for this quotation');
      }

      await idempotencyStore.put({
        id: lockId,
        scope: 'job_ticket_conversion',
        sourceId: quotationId,
        createdAt: nowIso(),
        metadata: { sourceType: 'quotation', requestedBy }
      });

      const existingJobTickets = await jobTicketStore.getAll();
      const existingWorkOrders = await workOrderStore.getAll();
      const jobTicketId = generateNextId('TKT', existingJobTickets || []);
      const workOrderId = generateNextId('WO', existingWorkOrders || []);
      const workOrder = mapQuotationToWorkOrder(quotation, workOrderId);
      const jobTicket = mapQuotationToTicket(quotation, jobTicketId, workOrderId);

      const updatedQuotation = {
        ...quotation,
        status: 'Converted',
        conversionStatus: 'Converted',
        convertedJobTicketId: jobTicketId,
        linkedWorkOrderId: workOrderId,
        convertedAt: nowIso()
      };

      await jobTicketStore.put(jobTicket);
      await workOrderStore.put(workOrder);
      await quotationStore.put(updatedQuotation);

      const auditEntry = createAuditLog({
        sourceType: 'quotation',
        sourceId: quotationId,
        jobTicketId,
        requestedBy,
        requesterRole,
        details: `Quotation ${quotationId} converted to job ticket ${jobTicketId} and work order ${workOrderId}`
      });
      await auditLogStore.put(auditEntry);

      return { jobTicketId, workOrderId, sourceId: quotationId, sourceType: 'quotation' as const };
    }
  );

  const workflowStarted = conversion.workOrderId
    ? await startWorkflowForTicket(conversion.workOrderId, requestedBy, 'quotation', quotationId)
    : false;
  try {
    const prodDb = getProductionDb();
    if (prodDb) {
      const ticket = await dbService.get<JobTicket>('jobTickets', conversion.jobTicketId);
      if (ticket) await prodDb.jobTickets.put(ticket);
    }
  } catch { /* non-critical sync to productionDb */ }
  return {
    success: true,
    sourceType: 'quotation',
    sourceId: conversion.sourceId,
    jobTicketId: conversion.jobTicketId,
    workOrderId: conversion.workOrderId,
    message: `Quotation ${quotationId} converted successfully`,
    workflowStarted
  };
};

const convertExaminationBatchToJobTicket = async (batchId: string, options: ConversionOptions = {}): Promise<ConversionResult> => {
  const requestedBy = toSafeString(options.requestedBy) || 'system';
  const requesterRole = toSafeString(options.requesterRole) || 'System';
  const force = Boolean(options.force);
  const hydratedBatch = await examinationBatchService.getBatch(batchId).catch(() => null);

  const conversion = await dbService.executeAtomicOperation(
    ['examinationBatches', 'jobTickets', 'workOrders', 'auditLogs', 'idempotencyKeys'],
    async (tx) => {
      const batchStore = tx.objectStore('examinationBatches');
      const jobTicketStore = tx.objectStore('jobTickets');
      const workOrderStore = tx.objectStore('workOrders');
      const auditLogStore = tx.objectStore('auditLogs');
      const idempotencyStore = tx.objectStore('idempotencyKeys');

      const storedBatch = await batchStore.get(batchId);
      const batch = await mergeBatchSnapshot(storedBatch, hydratedBatch);
      if (!batch) {
        throw new Error('Examination batch not found');
      }
      const batchReference = resolveBatchReference(batch);

      const validationErrors = validateBatchForConversion(batch);
      if (!force && validationErrors.length > 0) {
        throw new Error(validationErrors.join('; '));
      }

      const lockId = getLockId('examination_batch', batchId);
      const existingLock = await idempotencyStore.get(lockId);
      if (existingLock && !force) {
        throw new Error('Conversion already in progress or completed for this batch');
      }

      await idempotencyStore.put({
        id: lockId,
        scope: 'job_ticket_conversion',
        sourceId: batchId,
        createdAt: nowIso(),
        metadata: { sourceType: 'examination_batch', requestedBy }
      });

      const existingJobTickets = await jobTicketStore.getAll();
      const existingWorkOrders = await workOrderStore.getAll();
      const jobTicketId = generateNextId('TKT', existingJobTickets || []);
      const workOrderId = generateNextId('WO', existingWorkOrders || []);
      const workOrder = await mapBatchToWorkOrder(batch, workOrderId);
      const jobTicket = await mapBatchToTicket(batch, jobTicketId, workOrderId);

      const updatedBatch = {
        ...batch,
        conversionStatus: 'Converted',
        convertedJobTicketId: jobTicketId,
        linkedWorkOrderId: workOrderId,
        convertedAt: nowIso()
      };

      await jobTicketStore.put(jobTicket);
      await workOrderStore.put(workOrder);
      await batchStore.put(updatedBatch);

      const auditEntry = createAuditLog({
        sourceType: 'examination_batch',
        sourceId: batchId,
        jobTicketId,
        requestedBy,
        requesterRole,
        details: `Examination batch ${batchReference} converted to job ticket ${jobTicketId} and work order ${workOrderId}`
      });
      await auditLogStore.put(auditEntry);

      return { jobTicketId, workOrderId, sourceId: batchId, sourceType: 'examination_batch' as const };
    }
  );

  const workflowStarted = conversion.workOrderId
    ? await startWorkflowForTicket(conversion.workOrderId, requestedBy, 'examination_batch', batchId)
    : false;
  try {
    const prodDb = getProductionDb();
    if (prodDb) {
      const ticket = await dbService.get<JobTicket>('jobTickets', conversion.jobTicketId);
      if (ticket) await prodDb.jobTickets.put(ticket);
    }
  } catch { /* non-critical sync to productionDb */ }
  return {
    success: true,
    sourceType: 'examination_batch',
    sourceId: conversion.sourceId,
    jobTicketId: conversion.jobTicketId,
    workOrderId: conversion.workOrderId,
    message: `Examination batch ${batchId} converted successfully`,
    workflowStarted
  };
};

const convertOrderToJobTicket = async (orderId: string, options: ConversionOptions = {}): Promise<ConversionResult> => {
  const requestedBy = toSafeString(options.requestedBy) || 'system';
  const requesterRole = toSafeString(options.requesterRole) || 'System';
  const force = Boolean(options.force);

  const conversion = await dbService.executeAtomicOperation(
    ['orders', 'jobTickets', 'workOrders', 'auditLogs', 'idempotencyKeys'],
    async (tx) => {
      const orderStore = tx.objectStore('orders');
      const jobTicketStore = tx.objectStore('jobTickets');
      const workOrderStore = tx.objectStore('workOrders');
      const auditLogStore = tx.objectStore('auditLogs');
      const idempotencyStore = tx.objectStore('idempotencyKeys');

      const order = await orderStore.get(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const validationErrors = validateOrderForConversion(order);
      if (!force && validationErrors.length > 0) {
        throw new Error(validationErrors.join('; '));
      }

      const lockId = getLockId('order', orderId);
      const existingLock = await idempotencyStore.get(lockId);
      if (existingLock && !force) {
        throw new Error('Conversion already in progress or completed for this order');
      }

      await idempotencyStore.put({
        id: lockId,
        scope: 'job_ticket_conversion',
        sourceId: orderId,
        createdAt: nowIso(),
        metadata: { sourceType: 'order', requestedBy }
      });

      const existingJobTickets = await jobTicketStore.getAll();
      const existingWorkOrders = await workOrderStore.getAll();
      const jobTicketId = generateNextId('TKT', existingJobTickets || []);
      const workOrderId = generateNextId('WO', existingWorkOrders || []);
      const workOrder = mapOrderToWorkOrder(order, workOrderId);
      const jobTicket = mapOrderToTicket(order, jobTicketId, workOrderId);

      const updatedOrder = {
        ...order,
        status: 'Converted',
        conversionStatus: 'Converted',
        convertedJobTicketId: jobTicketId,
        linkedWorkOrderId: workOrderId,
        convertedAt: nowIso()
      };

      await jobTicketStore.put(jobTicket);
      await workOrderStore.put(workOrder);
      await orderStore.put(updatedOrder);

      const auditEntry = createAuditLog({
        sourceType: 'order',
        sourceId: orderId,
        jobTicketId,
        requestedBy,
        requesterRole,
        details: `Order ${orderId} converted to job ticket ${jobTicketId} and work order ${workOrderId}`
      });
      await auditLogStore.put(auditEntry);

      return { jobTicketId, workOrderId, sourceId: orderId, sourceType: 'order' as const };
    }
  );

  const workflowStarted = conversion.workOrderId
    ? await startWorkflowForTicket(conversion.workOrderId, requestedBy, 'order', orderId)
    : false;
  try {
    const prodDb = getProductionDb();
    if (prodDb) {
      const ticket = await dbService.get<JobTicket>('jobTickets', conversion.jobTicketId);
      if (ticket) await prodDb.jobTickets.put(ticket);
    }
  } catch { /* non-critical sync to productionDb */ }
  return {
    success: true,
    sourceType: 'order',
    sourceId: conversion.sourceId,
    jobTicketId: conversion.jobTicketId,
    workOrderId: conversion.workOrderId,
    message: `Order ${orderId} converted successfully`,
    workflowStarted
  };
};

export const jobTicketConversionService = {
  convertQuotationToJobTicket,
  convertExaminationBatchToJobTicket,
  convertOrderToJobTicket
};

export type { ConversionOptions, ConversionResult, SourceType };
