import React, { useState, useMemo } from 'react';
import {
  X, CheckCircle, Clock, DollarSign, Printer, Edit2, Download,
  FileText, ArrowRight, History, Trash2,
  AlertTriangle, Send, Eye, Briefcase, Package, RefreshCw,
  TrendingUp, Percent, Copy, ChevronRight
} from 'lucide-react';
import { Quotation } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useSales } from '../../../context/SalesContext';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { AuditTimeline } from '../../shared/components/AuditTimeline';
import TransactionPricingInsights from './TransactionPricingInsights';
import { currencyService } from '../../../services/currencyService';

interface QuotationDetailsProps {
  quotation: Quotation;
  onClose: () => void;
  onEdit: (quote: Quotation) => void;
  onAction: (quote: Quotation, action: string) => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

export const QuotationDetails: React.FC<QuotationDetailsProps> = ({ quotation: initialQuotation, onClose, onEdit, onAction }) => {
  const { companyConfig, notify } = useAuth();
  const { quotations = [] } = useSales();
  const { handlePreview } = useDocumentPreview();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const quotation = useMemo(() =>
    quotations.find(q => q.id === initialQuotation.id) || initialQuotation
    , [quotations, initialQuotation]);

  const [activeTab, setActiveTab] = useState<'Overview' | 'Activity'>('Overview');

  const isExpired = quotation.validUntil && new Date(quotation.validUntil) < new Date();
  const isConverted = quotation.status === 'Converted';
  const isExaminationQuotation = String((quotation as Quotation & { quotationType?: string }).quotationType || '').toLowerCase() === 'examination';

  return (
    <div className="sales-detail-backdrop" style={{ fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink }}>
      <div className="sales-detail-panel">
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        <div className="sales-detail-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
            }}>
              <FileText size={19} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 className="sales-detail-title">
                  Quotation #{quotation.id}
                </h1>
                <span style={{
                  padding: '2px 10px', borderRadius: 6,
                  fontSize: 11.5, fontWeight: 600, letterSpacing: 0.04, flexShrink: 0,
                  background: quotation.status === 'Accepted' || quotation.status === 'Approved' || quotation.status === 'Converted' ? '#ecfdf5' :
                    quotation.status === 'Rejected' ? '#fef2f2' : isExpired ? amber[100] : '#eff6ff',
                  color: quotation.status === 'Accepted' || quotation.status === 'Approved' || quotation.status === 'Converted' ? '#059669' :
                    quotation.status === 'Rejected' ? '#dc2626' : isExpired ? '#d97706' : '#2563eb',
                }}>
                  {isExpired ? 'Expired' : quotation.status}
                </span>
                {isExaminationQuotation && (
                  <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: '#f5f3ff', color: '#7c3aed', flexShrink: 0 }}>
                    Examination
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ padding: '1px 6px', borderRadius: 4, background: teal[50], color: teal[700], fontWeight: 600 }}>{quotation.customerName}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Issued {new Date(quotation.date).toLocaleDateString()}</span>
                {quotation.validUntil && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: isExpired ? '#dc2626' : inkSoft }}>
                    <AlertTriangle size={12} /> Valid until {new Date(quotation.validUntil).toLocaleDateString()}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={() => onEdit(quotation)}
              style={{
                padding: '8px 14px', borderRadius: 8, background: paper,
                border: `1.4px solid ${hairline}`, color: inkSoft, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, transition: 'all .15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
              onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
              <Edit2 size={14} /> <span className="hidden sm:inline">Edit</span>
            </button>
            <button onClick={onClose} aria-label="Close"
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: `1px solid ${hairline}`, background: paper, color: inkSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
              }}
              onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
              onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="sales-tabs">
          {(['Overview', 'Activity'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`sales-tab ${activeTab === tab ? 'active' : ''}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="sales-detail-content" style={{ background: teal[50] }}>
          {activeTab === 'Overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: inkSoft, marginBottom: 4 }}>
                      <span>Subtotal</span>
                      <span style={{ fontWeight: 600 }}>{currency}{((quotation.total || 0) - (quotation.tax || 0)).toLocaleString()}</span>
                    </div>
                    {(quotation.discount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#dc2626', marginBottom: 4 }}>
                        <span>Discount {quotation.discountType === 'percentage' ? `(${quotation.discount}%)` : ''}</span>
                        <span style={{ fontWeight: 600 }}>-{currency}{(quotation.discount || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {quotation.tax && quotation.tax > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: inkSoft, marginBottom: 4 }}>
                        <span>Tax ({quotation.taxRate}%)</span>
                        <span style={{ fontWeight: 600 }}>{currency}{quotation.tax.toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ height: 1, background: hairline, margin: '8px 0' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Total Value</p>
                      <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: ink }}>{currency}{quotation.total.toLocaleString()}</p>
                    </div>
                  </div>
                  <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 4 }}>Items Count</p>
                    <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: ink }}>{quotation.items?.length || 0}</p>
                  </div>
                </div>

                <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                  <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, background: teal[50] }}>
                    <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Line Items</h3>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${hairline}` }}>
                          <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Qty</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Item / Description</th>
                          <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Unit Price</th>
                          <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotation.items?.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${hairline}` }}>
                            <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: ink }}>{item.quantity}</td>
                            <td style={{ padding: '10px 16px' }}>
                              <p style={{ margin: 0, fontWeight: 600, color: ink }}>{item.name}</p>
                              {item.description && <p style={{ margin: '2px 0 0', fontSize: 11, color: inkSoft }}>{item.description}</p>}
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: ink }}>{currency}{item.price.toLocaleString()}</td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: ink }}>{currency}{(item.quantity * item.price).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <TransactionPricingInsights transaction={quotation} currencySymbol={currency} />

                {quotation.notes && (
                  <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Terms & Notes</h3>
                    <p style={{ margin: 0, fontSize: 12, color: ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{quotation.notes}</p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08 }}>Document Actions</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => { onClose(); handlePreview('QUOTATION', quotation); }}
                      style={{ width: '100%', padding: '10px 16px', border: 'none', borderRadius: 9, cursor: 'pointer', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `0 4px 10px -4px rgba(15,84,76,.4)` }}>
                      <Eye size={16} /> Preview Quotation
                    </button>
                    <button onClick={() => onAction(quotation, 'download_pdf')}
                      style={{ width: '100%', padding: '10px 16px', border: `1.4px solid ${hairline}`, borderRadius: 9, cursor: 'pointer', background: paper, color: inkSoft, fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Download size={16} /> Download PDF
                    </button>
                    {quotation.status === 'Draft' && (
                      <button onClick={() => onAction(quotation, 'approve')}
                        style={{ width: '100%', padding: '10px 16px', border: 'none', borderRadius: 9, cursor: 'pointer', background: '#059669', color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <CheckCircle size={16} /> Approve Quotation
                      </button>
                    )}
                    <div style={{ height: 1, background: hairline, margin: '4px 0' }} />
                    <button onClick={() => onAction(quotation, 'convert_to_order')} disabled={isConverted}
                      style={{ width: '100%', padding: '10px 16px', border: `1.4px solid ${teal[200]}`, borderRadius: 9, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isConverted ? 0.5 : 1 }}>
                      <Package size={16} /> Convert to Order
                    </button>
                    <button onClick={() => onAction(quotation, 'convert_inv')} disabled={isConverted}
                      style={{ width: '100%', padding: '10px 16px', border: `1.4px solid ${teal[200]}`, borderRadius: 9, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isConverted ? 0.5 : 1 }}>
                      <CheckCircle size={16} /> Convert to Invoice
                    </button>
                    <button onClick={() => onAction(quotation, 'convert_wo')} disabled={isConverted}
                      style={{ width: '100%', padding: '10px 16px', border: `1.4px solid ${teal[200]}`, borderRadius: 9, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isConverted ? 0.5 : 1 }}>
                      <Briefcase size={16} /> Convert to Work Order
                    </button>
                    <button onClick={() => onAction(quotation, 'convert_to_job_ticket')} disabled={isConverted}
                      style={{ width: '100%', padding: '10px 16px', border: `1.4px solid ${teal[200]}`, borderRadius: 9, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isConverted ? 0.5 : 1 }}>
                      <Printer size={16} /> Convert to Job Ticket
                    </button>
                    <button onClick={() => onAction(quotation, 'duplicate_exact')}
                      style={{ width: '100%', padding: '10px 16px', border: `1.4px solid ${teal[200]}`, borderRadius: 9, cursor: 'pointer', background: teal[50], color: teal[700], fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Copy size={16} /> Duplicate Quotation
                    </button>
                  </div>
                </div>

                <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${danger}30`, background: `${danger}08` }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 10, fontWeight: 700, color: danger, textTransform: 'uppercase', letterSpacing: 0.08 }}>Danger Zone</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button onClick={() => onAction(quotation, 'status_Rejected')}
                      style={{ width: '100%', padding: '10px 16px', border: `1.4px solid ${danger}30`, borderRadius: 9, cursor: 'pointer', background: paper, color: danger, fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <X size={16} /> Reject Quotation
                    </button>
                    <button onClick={() => onAction(quotation, 'delete')}
                      style={{ width: '100%', padding: '10px 16px', border: 'none', borderRadius: 9, cursor: 'pointer', background: danger, color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Trash2 size={16} /> Delete Record
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Activity' && (
            <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
              <AuditTimeline entityType="quotation" entityId={quotation.id} />
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '16px 28px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
          <button type="button" onClick={onClose}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
              background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
