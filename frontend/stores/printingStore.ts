import { create } from 'zustand';
import { logger } from '../services/logger';
import type {
  PrintingJobSpecification,
  ProductionJob,
  BOMTemplatePrinting,
  PrintingJobStatus,
  PaymentStatus,
  BOMLine,
  PrintingDashboardMetrics,
} from '../types/printing';

function generateProductionRef(): string {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `PJ-${num}`;
}

interface PrintingState {
  activeSpec: PrintingJobSpecification | null;
  productionJobs: ProductionJob[];
  bomTemplates: BOMTemplatePrinting[];
  metrics: PrintingDashboardMetrics;
  isLoading: boolean;

  setActiveSpec: (spec: PrintingJobSpecification | null) => void;
  updateSpec: (patch: Partial<PrintingJobSpecification>) => void;
  resetSpec: () => void;

  calculatePricing: (spec: PrintingJobSpecification) => PrintingJobSpecification['pricing'];
  createProductionJob: (spec: PrintingJobSpecification, saleId?: string, saleItemId?: string) => ProductionJob;
  transitionJobStatus: (jobId: string, newStatus: PrintingJobStatus) => void;
  updatePaymentStatus: (jobId: string, paidAmount: number) => void;

  addProductionJob: (job: ProductionJob) => void;
  loadBOMTemplates: () => Promise<void>;
  refreshMetrics: () => void;
}

const DEFAULT_SPEC: PrintingJobSpecification = {
  serviceId: '',
  serviceName: '',
  jobName: '',
  customerName: '',
  quantity: 1,
  unit: 'pcs',
  dueDate: '',
  priority: 'Normal',
  paper: { type: 'Art Card', weight: 300, size: 'A4' },
  printing: { color: 'Full Color', sides: 'Double Sided', pages: 1, copies: 1, orientation: 'Portrait' },
  finishing: {
    lamination: false, binding: false, folding: false, creasing: false,
    perforation: false, numbering: false, stitching: false, spotUV: false,
    foiling: false, dieCutting: false, packaging: false,
  },
  artwork: { source: 'Customer Artwork', files: [], status: 'Pending', notes: '' },
  customerNotes: '',
  internalNotes: '',
  pricing: {
    printingCost: 0, paperCost: 0, inkCost: 0, finishingCost: 0,
    designCost: 0, machineSetupCost: 0, deliveryCost: 0, urgentFee: 0,
    discount: 0, tax: 0, subtotal: 0, grandTotal: 0,
  },
};

export const usePrintingStore = create<PrintingState>((set, get) => ({
  activeSpec: null,
  productionJobs: [],
  bomTemplates: [],
  metrics: {
    todayJobs: 0, urgentJobs: 0, pendingArtwork: 0, awaitingApproval: 0,
    readyToPrint: 0, printing: 0, finishing: 0, readyForCollection: 0, completedToday: 0,
  },
  isLoading: false,

  setActiveSpec: (spec) => set({ activeSpec: spec }),
  updateSpec: (patch) => {
    const current = get().activeSpec;
    if (!current) return;
    const updated = { ...current, ...patch };
    const pricing = get().calculatePricing(updated);
    set({ activeSpec: { ...updated, pricing } });
  },
  resetSpec: () => set({ activeSpec: null }),

  calculatePricing: (spec) => {
    const { quantity, printing, paper, finishing, priority } = spec;
    const basePaperCost = paper.weight * 0.5 * quantity * printing.pages * 0.01;
    const baseInkCost = printing.color === 'Full Color'
      ? quantity * printing.pages * 0.15
      : quantity * printing.pages * 0.05;
    const printingCost = quantity * printing.pages * 0.2;
    const finishingCost = [
      finishing.lamination ? quantity * 0.5 : 0,
      finishing.binding ? quantity * 1.0 : 0,
      finishing.folding ? quantity * 0.3 : 0,
      finishing.creasing ? quantity * 0.4 : 0,
      finishing.perforation ? quantity * 0.3 : 0,
      finishing.numbering ? quantity * 0.2 : 0,
      finishing.stitching ? quantity * 0.5 : 0,
      finishing.spotUV ? quantity * 1.5 : 0,
      finishing.foiling ? quantity * 2.0 : 0,
      finishing.dieCutting ? quantity * 3.0 : 0,
      finishing.packaging ? quantity * 0.8 : 0,
    ].reduce((a, b) => a + b, 0);
    const designCost = printing.pages * 50;
    const machineSetupCost = 150;
    const deliveryCost = 0;
    const urgencyFees: Record<string, number> = { Normal: 0, Urgent: 0.15, Express: 0.3 };
    const urgentFeeRate = urgencyFees[priority] || 0;
    const subtotalBeforeUrgent = printingCost + basePaperCost + baseInkCost + finishingCost + designCost + machineSetupCost + deliveryCost;
    const urgentFee = subtotalBeforeUrgent * urgentFeeRate;
    const subtotal = subtotalBeforeUrgent + urgentFee;
    const tax = subtotal * 0.16;
    const discount = 0;
    const grandTotal = subtotal + tax - discount;
    return {
      printingCost: Math.round(printingCost * 100) / 100,
      paperCost: Math.round(basePaperCost * 100) / 100,
      inkCost: Math.round(baseInkCost * 100) / 100,
      finishingCost: Math.round(finishingCost * 100) / 100,
      designCost: Math.round(designCost * 100) / 100,
      machineSetupCost: Math.round(machineSetupCost * 100) / 100,
      deliveryCost: Math.round(deliveryCost * 100) / 100,
      urgentFee: Math.round(urgentFee * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  },

  createProductionJob: (spec, saleId, saleItemId) => {
    const now = new Date().toISOString();
    const totalAmount = spec.pricing.grandTotal;
    const job: ProductionJob = {
      id: `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productionRef: generateProductionRef(),
      saleId,
      saleItemId,
      customerName: spec.customerName,
      customerId: spec.customerId,
      spec,
      status: 'Draft',
      paymentStatus: 'Unpaid',
      totalAmount,
      paidAmount: 0,
      outstandingAmount: totalAmount,
      estimatedProductionTime: `${spec.quantity * spec.printing.pages * 0.5} mins`,
      estimatedMaterialUsage: [
        { materialId: 'RM-PAP', materialName: `${spec.paper.weight}gsm ${spec.paper.type}`, estimatedQuantity: spec.quantity * spec.printing.pages * 0.5, unit: 'sheets', unitCost: spec.pricing.paperCost / (spec.quantity * spec.printing.pages * 0.5 || 1), totalCost: spec.pricing.paperCost },
        { materialId: 'RM-INK', materialName: `${spec.printing.color === 'Full Color' ? 'CMYK' : 'Black'} Ink`, estimatedQuantity: spec.quantity * spec.printing.pages * 0.5, unit: 'ml', unitCost: spec.pricing.inkCost / (spec.quantity * spec.printing.pages * 0.5 || 1), totalCost: spec.pricing.inkCost },
      ],
      createdAt: now,
      updatedAt: now,
    };
    return job;
  },

  transitionJobStatus: (jobId, newStatus) => {
    set(state => ({
      productionJobs: state.productionJobs.map(j =>
        j.id === jobId ? { ...j, status: newStatus, updatedAt: new Date().toISOString() } : j
      ),
    }));
    get().refreshMetrics();
  },

  updatePaymentStatus: (jobId, paidAmount) => {
    set(state => ({
      productionJobs: state.productionJobs.map(j => {
        if (j.id !== jobId) return j;
        const totalPaid = j.paidAmount + paidAmount;
        const paymentStatus: PaymentStatus = totalPaid >= j.totalAmount ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
        return {
          ...j,
          paidAmount: totalPaid,
          outstandingAmount: Math.max(0, j.totalAmount - totalPaid),
          paymentStatus,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    get().refreshMetrics();
  },

  addProductionJob: (job) => {
    set(state => ({ productionJobs: [...state.productionJobs, job] }));
    get().refreshMetrics();
  },

  loadBOMTemplates: async () => {
    try {
      const { dbService } = await import('../services/db');
      const templates = await dbService.getAll<BOMTemplatePrinting>('bomTemplates');
      const printingTemplates = (templates || []).filter((t: any) =>
        !t.category || t.category === 'Printing' || t.category === 'Service'
      ).map((t: any): BOMTemplatePrinting => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        serviceId: t.serviceId,
        lines: (t.components || t.lines || []).map((l: any): BOMLine => ({
          materialId: l.itemId || l.materialId || l.id,
          materialName: l.name || l.materialName || '',
          estimatedQuantity: Number(l.quantity) || 0,
          unit: l.unit || 'pcs',
          unitCost: Number(l.cost || l.costPerUnit || 0),
          totalCost: Number(l.cost || l.costPerUnit || 0) * (Number(l.quantity) || 0),
        })),
      }));
      set({ bomTemplates: printingTemplates });
    } catch (err) {
      logger.error('Failed to load BOM templates for printing', err);
    }
  },

  refreshMetrics: () => {
    const jobs = get().productionJobs;
    const today = new Date().toISOString().split('T')[0];
    set({
      metrics: {
        todayJobs: jobs.filter(j => j.createdAt.startsWith(today)).length,
        urgentJobs: jobs.filter(j => j.spec.priority === 'Urgent' || j.spec.priority === 'Express').length,
        pendingArtwork: jobs.filter(j => j.spec.artwork.status === 'Pending').length,
        awaitingApproval: jobs.filter(j => j.status === 'Artwork Review').length,
        readyToPrint: jobs.filter(j => j.status === 'Ready for Production').length,
        printing: jobs.filter(j => j.status === 'Printing').length,
        finishing: jobs.filter(j => j.status === 'Finishing').length,
        readyForCollection: jobs.filter(j => j.status === 'Ready for Collection').length,
        completedToday: jobs.filter(j => j.status === 'Completed' && j.completedAt?.startsWith(today)).length,
      },
    });
  },
}));
