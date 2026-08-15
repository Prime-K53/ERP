import React, { useState, useCallback } from 'react';
import { Printer } from 'lucide-react';
import { PrintingJobModal } from './PrintingJobModal';
import { usePrintingStore } from '../../stores/printingStore';
import { printingService } from '../../services/printingService';
import type { PrintingJobSpecification } from '../../types/printing';
import type { CartItem, Item } from '../../types';

interface PrintingPOSIntegratorProps {
  selectedService: { item: Item; customerName?: string; customerId?: string } | null;
  currency: string;
  onAddToCart: (cartItem: CartItem) => void;
  onClose: () => void;
}

export function isPrintingService(item: Item): boolean {
  const cat = (item.category || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  const sku = (item.sku || '').toLowerCase();
  return (
    cat.includes('printing') ||
    cat.includes('print') ||
    cat.includes('production') ||
    name.includes('printing') ||
    name.includes('business card') ||
    name.includes('flyer') ||
    name.includes('brochure') ||
    name.includes('banner') ||
    name.includes('booklet') ||
    name.includes('label') ||
    name.includes('sticker') ||
    sku.startsWith('SVC-PRINT') ||
    sku.startsWith('PRT-')
  );
}

export const PrintingPOSIntegrator: React.FC<PrintingPOSIntegratorProps> = ({
  selectedService,
  currency,
  onAddToCart,
  onClose,
}) => {
  const { createProductionJob, addProductionJob, calculatePricing } = usePrintingStore();

  const handleAddToCart = useCallback((spec: PrintingJobSpecification) => {
    const productionRef = `PJ-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const pricing = calculatePricing(spec);

    const cartItem: CartItem = {
      id: `PRINT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      productId: spec.serviceId,
      name: spec.jobName || spec.serviceName,
      description: `${spec.quantity} ${spec.unit} · ${spec.printing.color} · ${spec.paper.weight}gsm ${spec.paper.type}`,
      quantity: 1,
      price: pricing.grandTotal,
      cost: pricing.subtotal,
      type: 'Service',
      unit: 'job',
      isPrintingJob: true,
      printingSpec: spec,
      productionRef,
      serviceDetails: {
        copies: 1,
        pages: spec.printing.pages,
        totalPages: spec.printing.pages * spec.quantity,
        unitPricePerCopy: pricing.grandTotal,
        unitCostPerCopy: pricing.subtotal,
        totalPrice: pricing.grandTotal,
        totalCost: pricing.subtotal,
      },
      priceLocked: true,
      lockedUnitPricePerCopy: pricing.grandTotal,
      lockedUnitCostPerCopy: pricing.subtotal,
    };

    onAddToCart(cartItem);
    onClose();
  }, [calculatePricing, onAddToCart, onClose]);

  const handleSaveDraft = useCallback((spec: PrintingJobSpecification) => {
    const job = createProductionJob(spec);
    job.status = 'Draft';
    addProductionJob(job);
    printingService.saveProductionJob(job);
    onClose();
  }, [createProductionJob, addProductionJob, onClose]);

  const handleSaveAsQuote = useCallback((spec: PrintingJobSpecification) => {
    const job = createProductionJob(spec);
    job.status = 'Quotation';
    addProductionJob(job);
    printingService.saveProductionJob(job);
    onClose();
  }, [createProductionJob, addProductionJob, onClose]);

  if (!selectedService) return null;

  return (
    <PrintingJobModal
      serviceId={selectedService.item.id}
      serviceName={selectedService.item.name}
      customerName={selectedService.customerName}
      customerId={selectedService.customerId}
      onSaveDraft={handleSaveDraft}
      onAddToCart={handleAddToCart}
      onSaveAsQuote={handleSaveAsQuote}
      onCancel={onClose}
    />
  );
};

export function createProductionJobsFromSale(
  cartItems: CartItem[],
  saleId: string,
  addProductionJob: (job: any) => void,
  createProductionJob: (spec: PrintingJobSpecification, saleId?: string, saleItemId?: string) => any,
): void {
  const printingJobs = cartItems.filter(item => item.isPrintingJob && item.printingSpec);
  for (const item of printingJobs) {
    const job = createProductionJob(item.printingSpec, saleId, item.id);
    job.status = 'Pending';
    job.saleId = saleId;
    job.saleItemId = item.id;
    job.productionRef = item.productionRef || job.productionRef;
    addProductionJob(job);
    printingService.saveProductionJob(job);
  }
}

export default PrintingPOSIntegrator;
