export interface BatchToProductionSubject {
  subject: string;
  className: string;
  pages: number;
  candidates: number;
  extraCopies: number;
  baseSheets: number;
  totalSheets: number;
  totalPages: number;
  productionCopies: number;
}

export interface BatchToProductionData {
  batchId: string;
  batchName: string;
  schoolName: string;
  subjects: BatchToProductionSubject[];
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate?: string;
}

export interface ProductionJobAttributes {
  pages: number;
  candidates: number;
  base_sheets: number;
  total_sheets: number;
  total_pages: number;
  production_copies: number;
  extra_copies: number;
}

export interface WorkOrderPayload {
  id: string;
  productId: string;
  productName: string;
  quantityPlanned: number;
  quantityCompleted: number;
  status: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate: string;
  bomId: string;
  notes: string;
  logs: unknown[];
  customerName: string;
  tags: string[];
  attributes: {
    examinationBatchId: string;
    examinationBatchName: string;
    pages: number;
    candidates: number;
    base_sheets: number;
    total_sheets: number;
    total_pages: number;
    production_copies: number;
    extra_copies: number;
  };
}

export interface ProductionJobDraft {
  id: string;
  batchId: string;
  batchName: string;
  workOrderId: string;
  subject: string;
  className: string;
  schoolName: string;
  quantity: number;
  totalPages: number;
  totalSheets: number;
  status: 'pending';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  createdAt: string;
  updatedAt: string;
  dueDate: string;
  attributes: ProductionJobAttributes;
}

export interface ProductionAdapterRecord {
  job: ProductionJobDraft;
  workOrder: WorkOrderPayload;
}

const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export const createWorkOrdersFromBatch = (batchData: BatchToProductionData): ProductionAdapterRecord[] => {
  const now = new Date().toISOString();
  const dueDate = batchData?.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const priority = batchData?.priority || 'Medium';
  const subjects = Array.isArray(batchData?.subjects) ? batchData.subjects : [];

  return subjects.map((subject) => {
    const jobId = generateId('EXAM-PROD');
    const workOrderId = generateId('WO-EXAM');
    const attributes: ProductionJobAttributes = {
      pages: subject.pages,
      candidates: subject.candidates,
      base_sheets: subject.baseSheets,
      total_sheets: subject.totalSheets,
      total_pages: subject.totalPages,
      production_copies: subject.productionCopies,
      extra_copies: subject.extraCopies
    };

    const job: ProductionJobDraft = {
      id: jobId,
      batchId: batchData.batchId,
      batchName: batchData.batchName,
      workOrderId,
      subject: subject.subject,
      className: subject.className,
      schoolName: batchData.schoolName,
      quantity: subject.productionCopies,
      totalPages: subject.totalPages,
      totalSheets: subject.totalSheets,
      status: 'pending',
      priority,
      createdAt: now,
      updatedAt: now,
      dueDate,
      attributes
    };

    const workOrder: WorkOrderPayload = {
      id: workOrderId,
      productId: 'EXAM-PRINT',
      productName: `Exam: ${subject.subject} (${subject.className}) - ${batchData.schoolName}`,
      quantityPlanned: subject.productionCopies,
      quantityCompleted: 0,
      status: 'Scheduled',
      priority,
      dueDate,
      bomId: 'EXAM-BOM-DEFAULT',
      notes: `Examination batch: ${batchData.batchName}\nSchool: ${batchData.schoolName}\nSubject: ${subject.subject}\nClass: ${subject.className}\nCandidates: ${subject.candidates}\nPages: ${subject.pages}`,
      logs: [],
      customerName: batchData.schoolName,
      tags: ['Examination', subject.className, batchData.batchId],
      attributes: {
        examinationBatchId: batchData.batchId,
        examinationBatchName: batchData.batchName,
        ...attributes
      }
    };

    return { job, workOrder };
  });
};
