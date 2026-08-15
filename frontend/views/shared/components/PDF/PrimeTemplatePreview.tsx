import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { CompanyConfig } from '../../../../types';
import { attachDocumentSecurity } from '../../../../utils/documentSecurity';
import type { PrimeDocData } from './schemas';
import { getDefaultPaymentTermsLabel, initializePrimePdfFonts } from './templateSettings';
import { getPlaceholder } from '../../../../constants/placeholders';
import { hydrateCompanyPdfAssets } from '../../../../utils/companyAssetUtils';
import { NativePdfPreview } from './NativePdfPreview';

interface PrimeTemplatePreviewProps {
  config: CompanyConfig;
}

const buildPreviewData = (config: CompanyConfig): PrimeDocData => {
  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  const paymentTerms = getDefaultPaymentTermsLabel(config);
  const termsDays = Number(config?.transactionSettings?.defaultPaymentTermsDays || 30);
  dueDate.setDate(issueDate.getDate() + (Number.isFinite(termsDays) ? termsDays : 30));

  const items = [
    { desc: 'A4 Full Colour Booklets', qty: 120, price: 14.5, total: 1740 },
    { desc: 'Branded NCR Invoice Pads', qty: 30, price: 68, total: 2040 },
    { desc: 'Custom Delivery Note Books', qty: 15, price: 92, total: 1380 },
  ];
  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
  const amountPaid = 2100;

  return {
    number: 'INV-TEMPLATE-001',
    invoiceNumber: 'INV-TEMPLATE-001',
    date: issueDate.toLocaleDateString(),
    dueDate: dueDate.toLocaleDateString(),
    paymentTerms,
    clientName: 'Mwai Academy',
    address: getPlaceholder.address(),
    phone: getPlaceholder.phone(),
    createdAtIso: issueDate.toISOString(),
    createdByName: 'Template Preview',
    items,
    subtotal: totalAmount,
    amountPaid,
    totalAmount,
    status: 'Partially Paid',
    totalCustomerOutstanding: 5600,
    walletBalance: 350,
  };
};

export const PrimeTemplatePreview: React.FC<PrimeTemplatePreviewProps> = ({ config }) => {
  const [directPath, setDirectPath] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [genInfo, setGenInfo] = useState('');
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsGenerating(true);
      setError(null);
      setDirectPath(null);
      setGenInfo('');

      try {
        const previewData = buildPreviewData(config);

        setGenInfo('Generating…');
        await initializePrimePdfFonts();
        const hydratedConfig = await hydrateCompanyPdfAssets(config);
        const securedData = await attachDocumentSecurity(previewData, config?.companyName);
        const { generatePrimeDocumentBlob } = await import('./generatePrimeDocumentBlob');
        const blob = await generatePrimeDocumentBlob('INVOICE', securedData as PrimeDocData, hydratedConfig, 10000);
        if (cancelled) return;

        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setDirectPath(url);
      } catch (previewError: any) {
        if (!cancelled) {
          setError(previewError?.message || 'Failed to generate preview.');
        }
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config, retryKey]);

  return (
    <div className="relative h-[760px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      {directPath ? (
        <NativePdfPreview
          directPath={directPath}
          title="Template Preview"
          hideHeader={true}
          className="h-full"
        />
      ) : !error ? (
        <div className="flex h-full items-center justify-center bg-white">
          <p className="text-sm font-medium text-slate-500">Preparing the Prime PDF preview...</p>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-white p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle size={24} />
          </div>
          <p className="text-sm font-medium text-slate-500">{error || 'Preview unavailable'}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {isGenerating && !directPath && (
        <div className="flex h-full items-center justify-center bg-white">
          <p className="text-sm font-medium text-slate-500">{genInfo || 'Preparing the Prime PDF preview...'}</p>
        </div>
      )}
    </div>
  );
};

export default PrimeTemplatePreview;
