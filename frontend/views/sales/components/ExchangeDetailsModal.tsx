import React, { useState } from 'react';
import {
  CheckCircle, XCircle, Printer, Clock,
  User, Calendar, MessageSquare, AlertCircle,
  FileText, ArrowRight, Package, X, ChevronRight
} from 'lucide-react';
import { useSalesStore } from '../../../stores/salesStore';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { SalesExchange } from '../../../types';
import { format } from 'date-fns';

interface ExchangeDetailsModalProps {
  exchange: SalesExchange;
  onClose: () => void;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

export const ExchangeDetailsModal: React.FC<ExchangeDetailsModalProps> = ({ exchange, onClose }) => {
  const { approveSalesExchange, cancelSalesExchange, isLoading } = useSalesStore();
  const { handlePreview } = useDocumentPreview();
  const [approvalComments, setApprovalComments] = useState('');
  const [showApprovalForm, setShowApprovalForm] = useState(false);

  const toNum = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getItemName = (item: any) =>
    item?.product_name || item?.productName || item?.description || item?.name || item?.desc || 'Item';

  const getReplacementName = (item: any) =>
    item?.replaced_product_name || item?.replacedProductName || getItemName(item);

  const handleApproval = async (status: 'approved' | 'rejected') => {
    try {
      if (status === 'rejected' && !approvalComments) {
        alert("Please provide a reason for rejection in the comments field.");
        return;
      }
      if (status === 'approved') {
        await approveSalesExchange(exchange.id, approvalComments);
      } else {
        await cancelSalesExchange(exchange.id);
      }
      onClose();
    } catch (error) {
      alert(`Failed to process ${status}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">APPROVED</span>;
      case 'rejected': return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">REJECTED</span>;
      case 'completed': return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200">COMPLETED</span>;
      default: return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border border-yellow-200">PENDING</span>;
    }
  };

  return (
    <div className="sales-modal-backdrop" style={{
      fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div className="sales-modal-panel" style={{
        maxWidth: 960,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: `1px solid ${hairline}`, background: paper
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
            }}>
              <FileText size={19} color="#fff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{
                  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                  fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                }}>
                  EXCHANGE {exchange.exchange_number}
                </h1>
                {getStatusBadge(exchange.status)}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={12} />
                Requested on {format(new Date(exchange.exchange_date), 'MMMM dd, yyyy HH:mm')}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
          }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '24px 28px 8px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }} className="md:grid md:grid-cols-[2fr_1fr]">
            {/* Left Column: Details & Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Info Cards */}
              <div style={{ display: 'grid', gap: 14 }} className="grid-cols-1 sm:grid-cols-2">
                <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 8 }}>Customer</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ink }}>{exchange.customer_name}</div>
                  <div style={{ fontSize: 12, color: inkSoft, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <User size={12} />
                    ID: {exchange.customer_id || 'N/A'}
                  </div>
                </div>
                <div style={{ padding: 16, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 8 }}>Original Document</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: teal[600] }}>Invoice #{exchange.invoice_id}</div>
                  <div style={{ fontSize: 12, color: inkSoft, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FileText size={12} />
                    View Original
                  </div>
                </div>
              </div>

              {/* Reason Section */}
              <div style={{
                padding: 16, borderRadius: 12, border: `1px solid ${amber[300]}`, background: `${amber[100]}80`,
                display: 'flex', gap: 14
              }}>
                <div style={{ padding: 8, borderRadius: 8, background: amber[100], color: amber[500], flexShrink: 0 }}>
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#92400e' }}>Exchange Reason: {exchange.reason}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                    {exchange.remarks || 'No additional remarks provided.'}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={18} color={teal[600]} />
                  Exchange Items
                </h3>
                <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: teal[50], borderBottom: `1px solid ${hairline}` }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Returned Item</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Replacement Item</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Returned</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Replaced</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(exchange.items || []).map((item, idx) => (
                        <tr key={item.id || idx} style={{ borderBottom: `1px solid ${hairline}` }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: ink }}>{getItemName(item)}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 500, color: '#059669' }}>
                            {toNum(item.qty_replaced ?? item.qtyReplaced) > 0
                              ? getReplacementName(item)
                              : <span style={{ color: inkSoft, fontStyle: 'italic' }}>No replacement</span>
                            }
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: danger }}>-{toNum(item.qty_returned ?? item.qtyReturned)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>+{toNum(item.qty_replaced ?? item.qtyReplaced)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 4, background: hairline, color: inkSoft, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                              {item.condition?.replace('_', ' ') || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(exchange.items || []).length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: inkSoft, fontStyle: 'italic' }}>
                            No exchange items were found for this record.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Workflow & Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Workflow Status */}
              <div style={{ padding: 20, background: paper, borderRadius: 12, border: `1px solid ${hairline}` }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={18} color={teal[600]} />
                  Workflow Status
                </h3>

                <div style={{ position: 'relative', paddingLeft: 28 }}>
                  {/* Timeline line */}
                  <div style={{ position: 'absolute', left: 11, top: 8, bottom: 8, width: 2, background: hairline }} />

                  <div style={{ position: 'relative', marginBottom: 24 }}>
                    <div style={{ position: 'absolute', left: -28 + 4, top: 2, width: 22, height: 22, borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px #fff' }}>
                      <CheckCircle size={14} color="#fff" />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: ink }}>Request Initiated</div>
                    <div style={{ fontSize: 11, color: inkSoft }}>by Sales Clerk &bull; {format(new Date(exchange.exchange_date), 'HH:mm')}</div>
                  </div>

                  <div style={{ position: 'relative', marginBottom: 24 }}>
                    <div style={{
                      position: 'absolute', left: -28 + 4, top: 2, width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px #fff',
                      background: exchange.status === 'pending' ? amber[400] : exchange.status === 'rejected' ? danger : '#059669'
                    }}>
                      {exchange.status === 'pending' ? <Clock size={14} color="#fff" /> :
                        exchange.status === 'rejected' ? <XCircle size={14} color="#fff" /> :
                          <CheckCircle size={14} color="#fff" />}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: ink }}>Supervisor Approval</div>
                    <div style={{ fontSize: 11, color: inkSoft }}>
                      {exchange.status === 'pending' ? 'Awaiting review...' :
                        exchange.status === 'rejected' ? 'Rejected' : 'Approved'}
                    </div>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: -28 + 4, top: 2, width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 4px #fff',
                      background: exchange.status === 'approved' ? teal[500] : exchange.status === 'completed' ? '#059669' : hairline
                    }}>
                      <Printer size={14} color="#fff" />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: ink }}>Reprint Execution</div>
                    <div style={{ fontSize: 11, color: inkSoft }}>
                      {exchange.status === 'approved' ? 'Job in queue' :
                        exchange.status === 'completed' ? 'Job completed' : 'Pending approval'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {exchange.status === 'pending' && !showApprovalForm && (
                  <button onClick={() => setShowApprovalForm(true)}
                    style={{
                      width: '100%', padding: 16, border: 'none', borderRadius: 12, cursor: 'pointer',
                      background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                      color: '#fff', fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                      letterSpacing: 0.08, textTransform: 'uppercase',
                      transition: 'all .15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                    REVIEW REQUEST
                    <ArrowRight size={16} />
                  </button>
                )}

                {showApprovalForm && (
                  <div style={{ padding: 16, background: teal[50], borderRadius: 12, border: `1px solid ${teal[100]}` }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: teal[800] }}>Review Comments</h4>
                    <textarea value={approvalComments}
                      onChange={(e) => setApprovalComments(e.target.value)}
                      placeholder="Enter approval/rejection notes (required for rejection)..."
                      style={{
                        width: '100%', padding: 10, border: `1.4px solid ${hairline}`, borderRadius: 8,
                        fontSize: 12, outline: 'none', resize: 'none', minHeight: 80, lineHeight: 1.5,
                        background: paper, color: ink, fontFamily: "'Inter', sans-serif"
                      }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => handleApproval('approved')} disabled={isLoading}
                        style={{
                          flex: 1, padding: 10, border: 'none', borderRadius: 8,
                          background: '#059669', color: '#fff', fontWeight: 700, fontSize: 11,
                          cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.06
                        }}>
                        APPROVE
                      </button>
                      <button onClick={() => handleApproval('rejected')} disabled={isLoading}
                        style={{
                          flex: 1, padding: 10, border: 'none', borderRadius: 8,
                          background: danger, color: '#fff', fontWeight: 700, fontSize: 11,
                          cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.06
                        }}>
                        REJECT
                      </button>
                    </div>
                    <button onClick={() => setShowApprovalForm(false)}
                      style={{
                        width: '100%', marginTop: 8, padding: 8, border: 'none', borderRadius: 8,
                        background: 'transparent', color: inkSoft, fontWeight: 600, fontSize: 11,
                        cursor: 'pointer', textTransform: 'uppercase'
                      }}>
                      CANCEL REVIEW
                    </button>
                  </div>
                )}

                {(exchange.status === 'approved' || exchange.status === 'completed') && (
                  <button onClick={() => { onClose(); handlePreview('SALES_EXCHANGE', exchange); }}
                    style={{
                      width: '100%', padding: 14, borderRadius: 12, cursor: 'pointer',
                      border: `2px solid ${teal[500]}`, background: paper, color: teal[600],
                      fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      textTransform: 'uppercase', letterSpacing: 0.06, transition: 'all .15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                    onMouseLeave={e => { e.currentTarget.style.background = paper; }}>
                    PRINT EXCHANGE NOTE
                    <Printer size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
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
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
