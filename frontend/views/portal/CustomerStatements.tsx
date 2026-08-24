import React, { useEffect, useState, useCallback } from 'react';
import { FileText, RefreshCw, Download, Loader2 } from 'lucide-react';
import { createElement } from 'react';
import { pdf } from '@react-pdf/renderer';
import { portalLifecycle } from '../../services/portalApiClient';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { useAuth } from '../../context/AuthContext';
import PortalPageHeader from './components/PortalPageHeader';
import PortalButton from './components/PortalButton';
import PortalInput from './components/PortalInput';
import PortalCard from './components/PortalCard';
import ErrorBanner from './components/ErrorBanner';
import EmptyState from './components/EmptyState';
import PortalLoadingSkeleton from './components/PortalLoadingSkeleton';
import { formatK } from './constants';
import { F } from './portalStyles';

interface Transaction {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementData {
  opening_balance: number;
  closing_balance: number;
  transactions: Transaction[];
}

const CustomerStatements: React.FC = () => {
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [downloading, setDownloading] = useState(false);
  const { companyConfig } = useAuth();

  const fetchStatement = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await portalLifecycle.statements.list({ startDate: start, endDate: end });
      setData(result as StatementData);
    } catch (err: any) {
      setError(err.message || 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    setStartDate(start);
    setEndDate(end);
    fetchStatement(start, end);
  }, [fetchStatement]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && (
            payload?.docType === 'statement' || payload?.docType === 'invoice'
              || payload?.docType === 'payment_allocated' || payload?.docType === 'credit_note'
              || payload?.docType === 'debit_note'
          ) && !cancelled) {
            fetchStatement(startDate, endDate);
          }
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [fetchStatement, startDate, endDate]);

  const handleDownloadPdf = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      await initializePrimePdfFonts();

      const transactions = (data.transactions || []).map((t) => ({
        date: t.date,
        reference: t.description || '',
        memo: '',
        debit: Number(t.debit || 0),
        credit: Number(t.credit || 0),
        runningBalance: Number(t.balance || 0),
      }));

      const totalInvoiced = transactions.reduce((sum, t) => sum + t.debit, 0);
      const totalReceived = transactions.reduce((sum, t) => sum + t.credit, 0);

      const statementData = {
        date: new Date().toLocaleDateString(),
        customerName: companyConfig?.companyName || 'Customer',
        startDate: startDate || 'N/A',
        endDate: endDate || 'N/A',
        currency: 'MWK',
        openingBalance: Number(data.opening_balance || 0),
        transactions,
        totalInvoiced,
        totalReceived,
        finalBalance: Number(data.closing_balance || 0),
      };

      const secured = await attachDocumentSecurity(statementData, companyConfig?.companyName);
      const blob = await pdf(
        createElement(PrimeDocument, { type: 'ACCOUNT_STATEMENT', data: secured })
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `Statement-${startDate || 'start'}_to_${endDate || 'end'}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate statement PDF:', err);
    } finally {
      setDownloading(false);
    }
  }, [data, startDate, endDate, companyConfig]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatement(startDate, endDate);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 896, margin: '0 auto' }}>
        <PortalLoadingSkeleton type="table" count={6} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, fontSize: 13, lineHeight: 1.4, color: '#2D3748' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <PortalPageHeader title="Account Statement" subtitle="View and download account statements for any period" icon={FileText} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <form
          onSubmit={handleFilter}
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 12,
            background: '#fff',
            borderRadius: 12,
            padding: '16px',
            border: '1px solid #E9EDF3',
            boxShadow: '0 1px 3px rgba(0,0,0,.04)',
          }}
        >
          <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  fontFamily: F,
                  fontSize: 13,
                  padding: '8px 12px',
                  border: '1px solid #E9EDF3',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#1A202C',
                  outline: 'none',
                  lineHeight: 1.4,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  fontFamily: F,
                  fontSize: 13,
                  padding: '8px 12px',
                  border: '1px solid #E9EDF3',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#1A202C',
                  outline: 'none',
                  lineHeight: 1.4,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="submit"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                background: '#F7FAFC',
                color: '#4A5568',
                border: '1px solid #E9EDF3',
                cursor: 'pointer',
                fontFamily: F,
                lineHeight: 1.4,
              }}
            >
              <RefreshCw size={14} /> Filter
            </button>
            {data && data.transactions.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                  background: 'linear-gradient(135deg, #146b60 0%, #0f544c 100%)',
                  border: 'none',
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  opacity: downloading ? 0.5 : 1,
                  boxShadow: '0 4px 6px rgba(15,84,76,.25)',
                  fontFamily: F,
                  lineHeight: 1.4,
                }}
              >
                {downloading ? (
                  <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <Download size={14} />
                )}
                {downloading ? 'Generating\u2026' : 'Download PDF'}
              </button>
            )}
          </div>
        </form>

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '20px', border: '1px solid #E9EDF3', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A94A6', display: 'block', marginBottom: 8 }}>Opening Balance</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#1A202C', fontVariantNumeric: 'tabular-nums' }}>{formatK(data.opening_balance || 0)}</span>
            </div>
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: '20px',
              border: Number(data.closing_balance) < 0 ? '1px solid #FED7D7' : '1px solid #C6F6D5',
              boxShadow: '0 1px 3px rgba(0,0,0,.04)',
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A94A6', display: 'block', marginBottom: 8 }}>Closing Balance</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: Number(data.closing_balance) < 0 ? '#E53E3E' : '#059669', fontVariantNumeric: 'tabular-nums' }}>{formatK(data.closing_balance || 0)}</span>
            </div>
          </div>
        )}

        {!data ? null : data.transactions.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="No transactions" description="No transactions found for the selected period." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#8A94A6', paddingLeft: 4, paddingRight: 4 }}>{data.transactions.length} transactions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.transactions.map((t, i) => (
                <div
                  key={`${t.date}-${t.description}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    background: '#fff',
                    borderRadius: 12,
                    padding: '14px 16px',
                    border: '1px solid #E9EDF3',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1A202C', lineHeight: 1.3, margin: 0 }}>{t.description}</p>
                    <p style={{ fontSize: 11, fontWeight: 500, color: '#8A94A6', marginTop: 2, marginBottom: 0 }}>{new Date(t.date).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    {t.debit ? (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#E53E3E', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Debit</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#E53E3E', fontVariantNumeric: 'tabular-nums' }}>{formatK(t.debit)}</span>
                      </div>
                    ) : null}
                    {t.credit ? (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Credit</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{formatK(t.credit)}</span>
                      </div>
                    ) : null}
                    <div style={{ textAlign: 'right', minWidth: 80, paddingLeft: 12, borderLeft: '1px solid #E9EDF3' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#8A94A6', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Balance</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1A202C', fontVariantNumeric: 'tabular-nums' }}>{formatK(t.balance)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerStatements;
