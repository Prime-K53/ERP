import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileText, File, Download, FileSpreadsheet, ArrowUpRight, Search, CheckSquare, Square } from 'lucide-react';
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { portalLifecycle } from '../../services/portalApiClient';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import PortalPageHeader from './components/PortalPageHeader';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { useToast } from './components/Toast';
import { formatK } from './constants';
import { F } from './portalStyles';

interface Document {
  id: string;
  type: string;
  title: string;
  date: string;
  url: string;
  amount?: number;
}

const typeIcons: Record<string, React.ReactNode> = {
  invoice: <FileText size={20} />,
  receipt: <FileText size={20} />,
  statement: <FileSpreadsheet size={20} />,
  report: <File size={20} />,
};

const CustomerDocuments: React.FC = () => {
  const { companyConfig } = useAuth();
  const { addToast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    portalLifecycle.documents.list()
      .then(setDocuments)
      .catch((err) => setError(err.message || 'Failed to load documents'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && !cancelled) {
            portalLifecycle.documents.list()
              .then(setDocuments)
              .catch(() => {});
          }
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const filtered = documents.filter((doc) =>
    doc.title?.toLowerCase().includes(search.toLowerCase()) ||
    doc.type?.toLowerCase().includes(search.toLowerCase())
  );

  const extractInvoiceId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/#\/portal\/invoices\/(.+)/);
    return match ? match[1] : null;
  };

  const toggleSelect = useCallback((docId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.id)));
    }
  }, [selected.size, filtered]);

  const handleBulkDownload = useCallback(async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      await initializePrimePdfFonts();
      let successCount = 0;

      for (const docId of selected) {
        const doc = documents.find((d) => d.id === docId);
        if (!doc) continue;

        const invoiceId = extractInvoiceId(doc.url);
        if (!invoiceId) continue;

        try {
          const invoice = await portalLifecycle.invoices.get(invoiceId);
          if (!invoice) continue;

          const items = Array.isArray(invoice.line_items_json)
            ? invoice.line_items_json
            : typeof invoice.line_items_json === 'string'
              ? JSON.parse(invoice.line_items_json)
              : [];

          const customerName = invoice.customer_name || invoice.customerName || 'Customer';

          const mapped = mapToInvoiceData(
            { ...invoice, items, customerName, subtotal: invoice.subtotal || invoice.total_amount },
            companyConfig,
            'INVOICE'
          );
          const secured = await attachDocumentSecurity(mapped, companyConfig?.companyName);
          const blob = await pdf(
            createElement(PrimeDocument, { type: 'INVOICE', data: secured })
          ).toBlob();

          const url = URL.createObjectURL(blob);
          const a = window.document.createElement('a');
          a.href = url;
          a.download = `${doc.title || `Invoice-${invoiceId}`}.pdf`;
          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
          URL.revokeObjectURL(url);
          successCount++;
        } catch (err) {
          console.warn(`Failed to generate PDF for ${docId}:`, err);
        }
      }

      if (successCount > 0) {
        addToast({ title: 'Download complete', description: `${successCount} document(s) downloaded.`, type: 'success' });
      } else {
        addToast({ title: 'Download failed', description: 'Could not generate PDFs for selected documents.', type: 'error' });
      }
    } catch (err) {
      addToast({ title: 'Download failed', description: String(err), type: 'error' });
    } finally {
      setDownloading(false);
    }
  }, [selected, documents, companyConfig, addToast]);

  const grouped: Record<string, Document[]> = {};
  filtered.forEach((doc) => {
    const type = doc.type || 'Other';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(doc);
  });
  const typeKeys = Object.keys(grouped);

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 896, margin: '0 auto' }}>
        <PortalLoadingSkeleton type="table" count={6} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748' }}>
      <PortalPageHeader title="Documents" subtitle="Access your invoices, receipts, statements and more" icon={FileText} />

      <div style={{ padding: '20px 28px 8px' }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', maxWidth: 360, flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                fontFamily: F,
                fontSize: 13,
                padding: '8px 12px 8px 32px',
                border: '1px solid #E9EDF3',
                borderRadius: 10,
                background: '#fff',
                color: '#1A202C',
                outline: 'none',
                width: '100%',
                lineHeight: 1.4,
                boxSizing: 'border-box',
              }}
            />
          </div>
          {filtered.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={toggleSelectAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: `1px solid ${selected.size > 0 ? '#a6d9d3' : '#e2e8f0'}`,
                  background: selected.size > 0 ? '#eef7f6' : 'transparent',
                  color: selected.size > 0 ? '#0f544c' : '#6b7280',
                  cursor: 'pointer',
                  lineHeight: 1.4,
                  fontFamily: F,
                }}
              >
                {selected.size === filtered.length && filtered.length > 0 ? (
                  <CheckSquare size={14} />
                ) : (
                  <Square size={14} />
                )}
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </button>

              {selected.size > 0 && (
                <button
                  onClick={handleBulkDownload}
                  disabled={downloading}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: downloading ? 'not-allowed' : 'pointer',
                    background: '#008A4C',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    lineHeight: 1.4,
                    fontFamily: F,
                    opacity: downloading ? 0.7 : 1,
                  }}
                >
                  <Download size={14} />
                  {downloading ? 'Downloading…' : `Download (${selected.size})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 28px 28px' }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<FileText size={28} />} title="No documents available" description={search ? 'No documents match your search.' : 'Your documents will appear here once generated.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {typeKeys.map((type) => (
              <div key={type}>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 12, marginTop: 0 }}>{type}s</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {grouped[type].map((doc) => {
                    const isSelected = selected.has(doc.id);
                    return (
                      <div
                        key={doc.id}
                        style={{
                          background: isSelected ? '#eef7f6' : '#fff',
                          borderRadius: 12,
                          padding: '12px 14px',
                          marginBottom: 10,
                          border: isSelected ? '2px solid #4ed3c7' : '1px solid #E9EDF3',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          transition: 'all 0.15s ease',
                          cursor: 'default',
                        }}
                      >
                        <button
                          onClick={() => toggleSelect(doc.id)}
                          style={{
                            flexShrink: 0,
                            padding: 2,
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: isSelected ? '#146b60' : '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title={isSelected ? 'Deselect' : 'Select for download'}
                        >
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: '#eef7f6',
                          color: '#146b60',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {typeIcons[doc.type?.toLowerCase()] || <File size={20} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#0b3e39',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>{doc.title}</p>
                          <p style={{ fontSize: 10.5, color: '#8A94A6', marginTop: 4, marginBottom: 0 }}>
                            {doc.date ? new Date(doc.date).toLocaleDateString() : ''}
                            {doc.amount !== undefined ? ` • ${formatK(doc.amount)}` : ''}
                          </p>
                        </div>
                        {doc.url?.startsWith('#/') ? (
                          <Link
                            to={doc.url.slice(2)}
                            style={{
                              padding: 8,
                              borderRadius: 10,
                              flexShrink: 0,
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textDecoration: 'none',
                            }}
                            title="Open document"
                          >
                            <ArrowUpRight size={16} />
                          </Link>
                        ) : (
                          <a
                            href={doc.url}
                            download
                            style={{
                              padding: 8,
                              borderRadius: 10,
                              flexShrink: 0,
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textDecoration: 'none',
                            }}
                            title="Download"
                          >
                            <Download size={16} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerDocuments;
