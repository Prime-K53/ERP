import React from 'react';
import { PrimeDocument } from './PrimeDocument.tsx';
import { PrimeDocData } from './schemas.ts';

/**
 * INVOICE TEMPLATE
 * Re-using PrimeDocument logic for the main ERP invoice template
 * to maintain brand consistency.
 */
export const InvoiceTemplate: React.FC<{ data: PrimeDocData; type?: 'INVOICE' | 'WORK_ORDER' | 'PO' | 'DELIVERY_NOTE' | 'QUOTATION' }> = ({ data, type = 'INVOICE' }) => {
  return <PrimeDocument data={data} type={type} />;
};
