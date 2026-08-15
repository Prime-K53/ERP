import { logger } from './logger';
import type {
  PrintingJobSpecification,
  ProductionJob,
  PrintingJobStatus,
  BOMLine,
  BOMTemplatePrinting,
} from '../types/printing';

export class PrintingService {
  generateBOM(spec: PrintingJobSpecification, template?: BOMTemplatePrinting): BOMLine[] {
    const qty = spec.quantity;
    const pages = spec.printing.pages;
    const totalSheets = Math.ceil((pages * qty) / 2);

    const lines: BOMLine[] = [];

    if (template && template.lines.length > 0) {
      for (const tpl of template.lines) {
        lines.push({
          ...tpl,
          estimatedQuantity: tpl.estimatedQuantity * qty,
          totalCost: tpl.unitCost * tpl.estimatedQuantity * qty,
        });
      }
      return lines;
    }

    const paperName = `${spec.paper.weight}gsm ${spec.paper.type} (${spec.paper.size})`;
    lines.push({
      materialId: 'RM-PAP-' + spec.paper.size,
      materialName: paperName,
      estimatedQuantity: totalSheets,
      unit: 'sheets',
      unitCost: spec.pricing.paperCost / (totalSheets || 1),
      totalCost: spec.pricing.paperCost,
    });

    const inkName = spec.printing.color === 'Full Color' ? 'CMYK Ink' : 'Black Ink';
    const inkEstimate = totalSheets * 0.1;
    lines.push({
      materialId: 'RM-INK-' + (spec.printing.color === 'Full Color' ? 'CMYK' : 'BLK'),
      materialName: inkName,
      estimatedQuantity: Math.round(inkEstimate * 100) / 100,
      unit: 'ml',
      unitCost: spec.pricing.inkCost / (inkEstimate || 1),
      totalCost: spec.pricing.inkCost,
    });

    if (spec.finishing.lamination) {
      lines.push({
        materialId: 'RM-LAM',
        materialName: 'Lamination Film',
        estimatedQuantity: totalSheets,
        unit: 'sheets',
        unitCost: 0.5,
        totalCost: totalSheets * 0.5,
      });
    }

    if (spec.finishing.binding) {
      lines.push({
        materialId: 'RM-BND',
        materialName: `Binding (${spec.finishing.bindingType || 'Standard'})`,
        estimatedQuantity: qty,
        unit: 'pcs',
        unitCost: 1.0,
        totalCost: qty * 1.0,
      });
    }

    if (spec.finishing.packaging) {
      lines.push({
        materialId: 'RM-PKG',
        materialName: `Packaging (${spec.finishing.packagingType || 'Standard'})`,
        estimatedQuantity: Math.ceil(qty / 100),
        unit: 'boxes',
        unitCost: 2.0,
        totalCost: Math.ceil(qty / 100) * 2.0,
      });
    }

    return lines;
  }

  estimateProductionTime(spec: PrintingJobSpecification): string {
    const qty = spec.quantity;
    const pages = spec.printing.pages;
    const totalImpressions = qty * pages;
    const machineSpeed = 5000;
    const setupMinutes = 30;
    const printMinutes = (totalImpressions / machineSpeed) * 60;
    const finishingMinutes = qty * 0.5;
    const totalMinutes = setupMinutes + printMinutes + finishingMinutes;
    if (totalMinutes < 60) return `${Math.round(totalMinutes)} mins`;
    if (totalMinutes < 1440) return `${Math.round(totalMinutes / 60)} hours`;
    return `${Math.round(totalMinutes / 1440)} days`;
  }

  async saveProductionJob(job: ProductionJob): Promise<void> {
    try {
      const { dbService } = await import('./db');
      await dbService.put('productionJobs', job);
      const { api } = await import('./api');
      await (api as any).production?.saveWorkOrder?.({
        id: job.id,
        productName: job.spec.serviceName,
        customerName: job.customerName,
        quantityPlanned: job.spec.quantity,
        status: 'Draft',
        dueDate: job.spec.dueDate,
        notes: `Production Reference: ${job.productionRef}`,
        createdAt: job.createdAt,
      }).catch(() => {});
    } catch (err) {
      logger.error('Failed to save production job', err);
    }
  }

  canTransition(from: PrintingJobStatus, to: PrintingJobStatus): boolean {
    const workflow: Record<PrintingJobStatus, PrintingJobStatus[]> = {
      'Draft': ['Quotation', 'Cancelled'],
      'Quotation': ['Approved', 'Draft', 'Cancelled'],
      'Approved': ['Deposit Paid', 'Artwork Review', 'Cancelled'],
      'Deposit Paid': ['Artwork Review', 'Cancelled'],
      'Artwork Review': ['Artwork Approved', 'Cancelled'],
      'Artwork Approved': ['Material Reservation', 'Cancelled'],
      'Material Reservation': ['Ready for Production', 'Cancelled'],
      'Ready for Production': ['Printing', 'Cancelled'],
      'Printing': ['Finishing', 'Quality Control'],
      'Finishing': ['Quality Control'],
      'Quality Control': ['Packaging', 'Printing'],
      'Packaging': ['Ready for Collection'],
      'Ready for Collection': ['Delivered'],
      'Delivered': ['Completed'],
      'Completed': [],
      'Cancelled': ['Draft'],
    };
    return workflow[from]?.includes(to) ?? false;
  }

  getStatusColor(status: PrintingJobStatus): string {
    const colors: Record<string, string> = {
      'Draft': 'bg-slate-100 text-slate-700 border-slate-200',
      'Quotation': 'bg-blue-100 text-blue-700 border-blue-200',
      'Approved': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Deposit Paid': 'bg-cyan-100 text-cyan-700 border-cyan-200',
      'Artwork Review': 'bg-amber-100 text-amber-700 border-amber-200',
      'Artwork Approved': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Material Reservation': 'bg-purple-100 text-purple-700 border-purple-200',
      'Ready for Production': 'bg-teal-100 text-teal-700 border-teal-200',
      'Printing': 'bg-orange-100 text-orange-700 border-orange-200',
      'Finishing': 'bg-rose-100 text-rose-700 border-rose-200',
      'Quality Control': 'bg-violet-100 text-violet-700 border-violet-200',
      'Packaging': 'bg-sky-100 text-sky-700 border-sky-200',
      'Ready for Collection': 'bg-lime-100 text-lime-700 border-lime-200',
      'Delivered': 'bg-green-100 text-green-700 border-green-200',
      'Completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Cancelled': 'bg-red-100 text-red-700 border-red-200',
    };
    return colors[status] || 'bg-slate-100 text-slate-600';
  }

  getPriorityColor(priority: string): string {
    const map: Record<string, string> = {
      'Normal': 'bg-slate-100 text-slate-600',
      'Urgent': 'bg-orange-100 text-orange-700',
      'Express': 'bg-red-100 text-red-700',
    };
    return map[priority] || map['Normal'];
  }

  getPaymentStatusColor(status: string): string {
    const map: Record<string, string> = {
      'Paid': 'bg-emerald-100 text-emerald-700',
      'Partial': 'bg-amber-100 text-amber-700',
      'Unpaid': 'bg-red-100 text-red-700',
    };
    return map[status] || map['Unpaid'];
  }
}

export const printingService = new PrintingService();
