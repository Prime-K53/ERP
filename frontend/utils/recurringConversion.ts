import { ExaminationBatch, Invoice, RecurringInvoice } from '../types';
import { validateAndBuildInvoicePayload } from '../services/invoiceDataGovernanceService';

const cloneValue = <T,>(value: T): T => {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export const normalizeRecurringDate = (value?: string | null) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return parsed.toISOString().split('T')[0];
};

export const addRecurringFrequency = (dateValue: string, frequency = 'Monthly') => {
  const nextDate = new Date(normalizeRecurringDate(dateValue));
  switch (String(frequency || '').toLowerCase()) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'annually':
    case 'annual':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }
  return nextDate.toISOString().split('T')[0];
};

export const getDefaultRecurringNextRunDate = (frequency = 'Monthly', startDate?: string) =>
  addRecurringFrequency(normalizeRecurringDate(startDate), frequency);

export const buildRecurringDraftFromInvoice = (invoice: Partial<Invoice> & Record<string, any>): RecurringInvoice => {
  const issueDate = normalizeRecurringDate(invoice.date);
  const startDate = issueDate;
  const items = Array.isArray(invoice.items) ? invoice.items.map((item: any) => cloneValue(item)) : [];

  return {
    ...cloneValue(invoice),
    id: '',
    date: issueDate,
    dueDate: normalizeRecurringDate(invoice.dueDate || issueDate),
    status: 'Draft',
    frequency: 'Monthly',
    autoDeductWallet: false,
    autoEmail: true,
    startDate,
    endDate: '',
    nextRunDate: getDefaultRecurringNextRunDate('Monthly', startDate),
    scheduledDates: [],
    paidAmount: 0,
    amountPaid: 0,
    items,
    totalAmount: Number(invoice.totalAmount ?? invoice.total ?? 0) || 0,
    total: Number(invoice.totalAmount ?? invoice.total ?? 0) || 0,
    notes: [
      invoice.notes ? String(invoice.notes).trim() : '',
      `Converted from invoice ${invoice.id || ''}`.trim()
    ].filter(Boolean).join('\n')
  } as RecurringInvoice;
};

const buildBatchRecurringItems = (batch: ExaminationBatch): any[] => {
  try {
    const governedPayload = validateAndBuildInvoicePayload(batch);
    return governedPayload.lineItems.map((line, index) => ({
      id: `EXM-REC-${batch.id}-${index + 1}`,
      itemId: `EXM-REC-${batch.id}-${index + 1}`,
      name: `Examination Service - ${line.className}`,
      sku: `EXM-${batch.id}-${index + 1}`,
      description: `${batch.name} | ${batch.academic_year} Term ${batch.term} | ${batch.exam_type}`,
      category: 'Examination',
      type: 'Service',
      unit: 'learner',
      minStockLevel: 0,
      stock: 0,
      reserved: 0,
      price: Number(line.unitPrice || 0),
      cost: Number(line.unitPrice || 0),
      quantity: Math.max(1, Number(line.learners || 1)),
      total: Number(line.totalAmount || 0)
    }));
  } catch {
    return [{
      id: `EXM-REC-${batch.id}`,
      itemId: `EXM-REC-${batch.id}`,
      name: `Examination Batch - ${batch.name}`,
      sku: `EXM-${batch.id}`,
      description: `${batch.academic_year} Term ${batch.term} | ${batch.exam_type}`,
      category: 'Examination',
      type: 'Service',
      unit: 'batch',
      minStockLevel: 0,
      stock: 0,
      reserved: 0,
      price: Number(batch.total_amount || 0),
      cost: Number(batch.total_amount || 0),
      quantity: 1,
      total: Number(batch.total_amount || 0)
    }];
  }
};

export const buildRecurringDraftFromExaminationBatch = (
  batch: ExaminationBatch,
  schoolName?: string
): RecurringInvoice => {
  const startDate = normalizeRecurringDate();
  const items = buildBatchRecurringItems(batch);
  const totalAmount = Number(batch.total_amount || items.reduce((sum, item) => sum + Number(item.total || 0), 0)) || 0;

  const b = batch as ExaminationBatch & { customer_id?: string; customerId?: string; customer_name?: string };
  return {
    id: '',
    date: startDate,
    dueDate: startDate,
    customerId: String(b.customer_id || b.customerId || batch.school_id || ''),
    customerName: schoolName || b.customer_name || batch.name || 'Examination Customer',
    subAccountName: 'Main',
    status: 'Draft',
    frequency: 'Monthly',
    autoDeductWallet: false,
    autoEmail: true,
    startDate,
    endDate: '',
    nextRunDate: getDefaultRecurringNextRunDate('Monthly', startDate),
    scheduledDates: [],
    items,
    totalAmount,
    total: totalAmount,
    paidAmount: 0,
    amountPaid: 0,
    notes: `Converted from examination batch ${batch.name} (${batch.id})`,
    originModule: 'examination',
    originBatchId: batch.id,
    batchId: batch.id,
    academicYear: batch.academic_year,
    term: batch.term,
    examType: batch.exam_type
  } as RecurringInvoice;
};
