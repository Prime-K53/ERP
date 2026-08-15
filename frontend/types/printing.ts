export type PrintingJobPriority = 'Normal' | 'Urgent' | 'Express';

export type PrintingJobStatus =
  | 'Draft'
  | 'Quotation'
  | 'Approved'
  | 'Deposit Paid'
  | 'Artwork Review'
  | 'Artwork Approved'
  | 'Material Reservation'
  | 'Ready for Production'
  | 'Printing'
  | 'Finishing'
  | 'Quality Control'
  | 'Packaging'
  | 'Ready for Collection'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled';

export type ArtworkSource = 'Customer Artwork' | 'Design Required';

export type ArtworkStatus = 'Pending' | 'Received' | 'Approved';

export type ColorMode = 'Full Color' | 'Black & White';

export type SidedMode = 'Single Sided' | 'Double Sided';

export type Orientation = 'Portrait' | 'Landscape';

export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid';

export type PaperSize = 'A4' | 'A3' | 'A5' | 'Legal' | 'Letter' | 'Custom';

export interface PaperSpec {
  type: string;
  weight: number;
  size: PaperSize;
  customWidth?: number;
  customHeight?: number;
}

export interface PrintSpec {
  color: ColorMode;
  sides: SidedMode;
  pages: number;
  copies: number;
  orientation: Orientation;
}

export interface FinishingSpec {
  lamination: boolean;
  laminationType?: string;
  binding: boolean;
  bindingType?: string;
  folding: boolean;
  foldingType?: string;
  creasing: boolean;
  perforation: boolean;
  numbering: boolean;
  stitching: boolean;
  spotUV: boolean;
  foiling: boolean;
  dieCutting: boolean;
  packaging: boolean;
  packagingType?: string;
}

export interface ArtworkSpec {
  source: ArtworkSource;
  files: Array<{ name: string; url: string; size: number }>;
  status: ArtworkStatus;
  notes: string;
}

export interface PricingBreakdown {
  printingCost: number;
  paperCost: number;
  inkCost: number;
  finishingCost: number;
  designCost: number;
  machineSetupCost: number;
  deliveryCost: number;
  urgentFee: number;
  discount: number;
  tax: number;
  subtotal: number;
  grandTotal: number;
}

export interface PrintingJobSpecification {
  serviceId: string;
  serviceName: string;
  jobName: string;
  customerName: string;
  customerId?: string;
  quantity: number;
  unit: string;
  dueDate: string;
  priority: PrintingJobPriority;
  paper: PaperSpec;
  printing: PrintSpec;
  finishing: FinishingSpec;
  artwork: ArtworkSpec;
  customerNotes: string;
  internalNotes: string;
  pricing: PricingBreakdown;
  productionRef?: string;
}

export interface BOMLine {
  materialId: string;
  materialName: string;
  estimatedQuantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
}

export interface ProductionJob {
  id: string;
  productionRef: string;
  saleId?: string;
  saleItemId?: string;
  salesOrderId?: string;
  customerName: string;
  customerId?: string;
  spec: PrintingJobSpecification;
  status: PrintingJobStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  estimatedProductionTime: string;
  estimatedMaterialUsage: BOMLine[];
  bomTemplateId?: string;
  jobTicketUrl?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  assignedTo?: string;
  notes?: string;
}

export interface ProductionQueueEntry {
  job: ProductionJob;
  position: number;
  estimatedStart: string;
  estimatedEnd: string;
}

export interface BOMTemplatePrinting {
  id: string;
  name: string;
  description?: string;
  category?: string;
  serviceId?: string;
  lines: BOMLine[];
}

export interface PrintingDashboardMetrics {
  todayJobs: number;
  urgentJobs: number;
  pendingArtwork: number;
  awaitingApproval: number;
  readyToPrint: number;
  printing: number;
  finishing: number;
  readyForCollection: number;
  completedToday: number;
}
