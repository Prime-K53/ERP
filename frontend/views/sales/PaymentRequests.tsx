import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../../config/api.js';
import { getJsonRequestHeaders } from '../../services/requestHeaders';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/formatters';
import {
  HandCoins, RefreshCw, Search, X, CheckCircle2, Clock, Eye,
  Ban, XCircle, AlertTriangle, Building2, FileText, Banknote, CalendarDays,
} from 'lucide-react';

/**
 * Payment Requests — ERP admin queue for NON-ACCOUNTING customer bank-transfer
 * payment intentions.
 *
 * A payment request is customer intent to pay ("I want to pay by bank"). It is
 * workflow data only: reviewing / confirming it NEVER records a payment and
 * NEVER modifies the invoice. ERP staff use this queue to review the request,
 * then record the REAL accounting payment through the existing Customer
 * Payments workflow after verifying the bank receipt.
 */

type Status = 'requested' | 'under_review' | 'confirmed' | 'rejected' | 'cancelled';

interface PaymentRequest {
  id: string;
  request_number?: string;
  requestNumber?: string;
  customer_id?: string;
  customer_name?: string;
  invoice_id?: string;
  invoice_number?: string;
  requested_amount?: number;
  payment_method?: string;
  status?: string;
  note?: string;
  requested_at?: string;
  created_at?: string;
  assigned_to?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  admin_notes?: string;
  linked_payment_id?: string;
  [key: string]: any;
}

const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';
const teal = { 50: '#eef7f6', 100: '#d3ece9', 300: '#72c0b7', 500: '#1f8577', 600: '#146b60', 700: '#0f544c' };
const amber = { 50: '#fff8ec', 100: '#fbead0', 500: '#d99a3f', 600: '#b97e2b' };
const blue = { 50: '#eff6ff', 100: '#dbeafe', 600: '#2563eb' };
const green = { 50: '#ecfdf5', 100: '#d1fae5', 600: '#059669' };
const red = { 50: '#fef2f2', 100: '#fee2e2', 600: '#b91c1c' };
const gray = { 50: '#f8fafc', 100: '#f1f5f9', 600: '#64748b' };

const STATUS_META: Record<Status, { label: string; bg: string; color: string; border: string; icon: React.ReactNode }> = {
  requested: { label: 'Requested', bg: amber[50], color: amber[600], border: '#fde68a', icon: <Clock size={13} /> },
  under_review: { label: 'Under Review', bg: blue[50], color: blue[600], border: '#bfdbfe', icon: <Eye size={13} /> },
  confirmed: { label: 'Confirmed', bg: green[50], color: green[600], border: '#a7f3d0', icon: <CheckCircle2 size={13} /> },
  rejected: { label: 'Rejected', bg: red[50], color: red[600], border: '#fecaca', icon: <XCircle size={13} /> },
  cancelled: { label: 'Cancelled', bg: gray[50], color: gray[600], border: '#e2e8f0', icon: <Ban size={13} /> },
};

const ALL_STATUSES: Status[] = ['requested', 'under_review', 'confirmed', 'rejected', 'cancelled'];

const fmtAmount = (n: number | undefined, currency: string): string => {
  const v = Number(n ?? 0);
  return `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface PaymentRequestsProps {
  /** Render as a tab inside another page (hide the standalone page chrome). */
  embedded?: boolean;
  /** Reports the total request count whenever it changes (e.g. for a parent tab badge). */
  onCountChange?: (count: number) => void;
}

const PaymentRequests: React.FC<PaymentRequestsProps> = ({ embedded = false, onCountChange }) => {
  const { companyConfig, notify } = useAuth();
  const currency = companyConfig?.currencySymbol || 'K';
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [selected, setSelected] = useState<PaymentRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/payment-requests`, {
        headers: await getJsonRequestHeaders(),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `Failed to load payment requests (${res.status})`);
      }
      const rows = await res.json();
      setRequests(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load payment requests');
      notify(err?.message || 'Failed to load payment requests', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && String(r.status || '') !== statusFilter) return false;
      if (!q) return true;
      return [
        r.request_number, r.requestNumber, r.customer_name, r.customer_id,
        r.invoice_number, r.invoice_id, r.requested_amount,
      ].some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [requests, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length };
    for (const s of ALL_STATUSES) c[s] = requests.filter((r) => r.status === s).length;
    return c;
  }, [requests]);

  useEffect(() => {
    onCountChange?.(counts.all);
  }, [counts.all, onCountChange]);

  const review = async (id: string, status: Status, notes?: string) => {
    setActing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/payment-requests/${id}/review`, {
        method: 'POST',
        headers: await getJsonRequestHeaders(),
        body: JSON.stringify({ status, adminNotes: notes || undefined }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || `Review failed (${res.status})`);
      notify(`Payment request marked ${status}`, 'success');
      await load();
      setSelected(body);
      setAdminNotes('');
    } catch (err: any) {
      notify(err?.message || 'Review failed', 'error');
    } finally {
      setActing(false);
    }
  };

  const onReview = (status: Status) => {
    if (!selected) return;
    if ((status === 'rejected' || status === 'cancelled') && !window.confirm(`Mark request ${selected.request_number || selected.id} as ${status}?`)) {
      return;
    }
    review(selected.id, status, adminNotes || undefined);
  };

  const statusChip = (status?: string) => {
    const meta = STATUS_META[(status as Status) || 'requested'] || STATUS_META.requested;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
        padding: '3px 9px', borderRadius: 9999, lineHeight: 1.3, whiteSpace: 'nowrap',
      }}>
        {meta.icon}{meta.label}
      </span>
    );
  };

  const canTransition = (from: string | undefined, to: Status): boolean => {
    const allowed: Record<string, Status[]> = {
      requested: ['under_review', 'confirmed', 'rejected', 'cancelled'],
      under_review: ['confirmed', 'rejected', 'cancelled'],
      confirmed: [], rejected: [], cancelled: [],
    };
    return (allowed[from || ''] || []).includes(to);
  };

  return (
    <div className={embedded ? '' : 'p-3 md:p-6 max-w-[1500px] mx-auto h-[calc(100vh-4rem)] flex flex-col'} style={{ fontFamily: 'inherit' }}>
      {/* Header (standalone page only) */}
      {!embedded && (
        <div className="mb-4 flex flex-col md:flex-row justify-between md:items-center gap-4 shrink-0">
          <div>
            <h1 className="text-[22px] font-semibold text-[#23282A] flex items-center gap-2 tracking-tight">
              <HandCoins className="text-[#1f8577]" size={20} />
              Payment Requests
            </h1>
            <p className="text-xs font-normal text-[#5c6567] mt-0.5">
              Customer bank-transfer payment intentions. Confirming a request does NOT record a payment — use Customer Payments to record the actual bank payment after verifying the receipt.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-[#e4ddd1] bg-[#FEFDFB] px-3 py-1.5 text-xs font-bold text-[#5c6567] shadow-sm transition-all hover:bg-[#eef7f6] disabled:cursor-not-allowed disabled:opacity-60"
              title="Refresh payment requests"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Compact refresh toolbar (embedded as a tab) */}
      {embedded && (
        <div className="mb-3 flex justify-end shrink-0">
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#e4ddd1] bg-[#FEFDFB] px-3 py-1.5 text-xs font-bold text-[#5c6567] shadow-sm transition-all hover:bg-[#eef7f6] disabled:cursor-not-allowed disabled:opacity-60"
            title="Refresh payment requests"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      )}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-3 shrink-0">
        {(['all', ...ALL_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
              border: statusFilter === s ? `1.5px solid ${teal[500]}` : `1px solid ${hairline}`,
              background: statusFilter === s ? teal[50] : paper,
              color: statusFilter === s ? teal[700] : inkSoft,
              cursor: 'pointer', transition: 'all .15s ease',
            }}
          >
            {s === 'all' ? 'All' : STATUS_META[s].label}
            <span style={{
              background: statusFilter === s ? teal[500] : '#eef2f1',
              color: statusFilter === s ? '#fff' : inkSoft,
              borderRadius: 9999, padding: '0 6px', fontSize: 10, lineHeight: '16px',
            }}>
              {counts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3 shrink-0" style={{ maxWidth: 360 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, invoice, request #…"
          style={{
            width: '100%', padding: '8px 12px 8px 32px', borderRadius: 10,
            border: `1px solid ${hairline}`, background: paper, fontSize: 12.5,
            outline: 'none', color: ink,
          }}
        />
      </div>

      {error && !loading && (
        <div className="mb-3 shrink-0" style={{ padding: '10px 14px', borderRadius: 10, background: red[50], border: `1px solid ${red[100]}`, color: red[600], fontSize: 12.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-4" style={{ minHeight: 0 }}>
        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-[#e4ddd1] bg-[#FEFDFB] shadow-sm">
          {loading ? (
            <div className="p-10 text-center text-xs text-[#5c6567]">Loading payment requests…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <HandCoins size={26} style={{ color: '#c4cdcc', margin: '0 auto 8px' }} />
              <p className="text-xs text-[#5c6567] font-medium">No payment requests found.</p>
              <p className="text-[11px] text-[#8a94a6] mt-1">Requests appear here when customers submit a bank-transfer payment intention from the portal.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#faf9f6', color: inkSoft, textAlign: 'left' }}>
                  {['Request', 'Customer', 'Invoice', 'Requested Amount', 'Method', 'Status', 'Requested Date', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${hairline}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => { setSelected(r); setAdminNotes(r.admin_notes || ''); }}
                    style={{ borderBottom: `1px solid ${hairline}`, cursor: 'pointer', background: selected?.id === r.id ? teal[50] : paper, transition: 'background .1s ease' }}
                    onMouseEnter={(e) => { if (selected?.id !== r.id) e.currentTarget.style.background = '#f7faf9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = selected?.id === r.id ? teal[50] : paper; }}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: ink, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                      {r.request_number || r.requestNumber || r.id.slice(0, 18)}
                    </td>
                    <td style={{ padding: '10px 14px', color: ink, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{r.customer_name || '—'}</div>
                      <div style={{ fontSize: 10.5, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{r.customer_id || ''}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: ink, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                      {r.invoice_number || r.invoice_id || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: teal[700], whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtAmount(r.requested_amount, currency)}
                    </td>
                    <td style={{ padding: '10px 14px', color: inkSoft, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Banknote size={13} style={{ color: teal[500] }} /> {r.payment_method || 'Bank Transfer'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{statusChip(r.status)}</td>
                    <td style={{ padding: '10px 14px', color: inkSoft, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <CalendarDays size={13} /> {formatDate(r.requested_at || r.created_at)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{ color: teal[600], fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Review →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{
            width: 360, flexShrink: 0, borderRadius: 16, border: `1px solid ${hairline}`,
            background: paper, boxShadow: '0 8px 30px -12px rgba(16,24,40,.18)', overflow: 'auto', padding: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: ink, letterSpacing: '-0.01em' }}>
                  {selected.request_number || selected.id}
                </h3>
                <div style={{ marginTop: 6 }}>{statusChip(selected.status)}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, padding: 4, borderRadius: 8 }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Building2 size={14} style={{ color: teal[500], marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, color: ink }}>{selected.customer_name || '—'}</div>
                  <div style={{ fontSize: 11, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{selected.customer_id || ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={14} style={{ color: teal[500], flexShrink: 0 }} />
                <span style={{ color: ink, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                  {selected.invoice_number || selected.invoice_id || '—'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Banknote size={14} style={{ color: teal[500], flexShrink: 0 }} />
                <span style={{ color: ink }}>
                  <b>{fmtAmount(selected.requested_amount, currency)}</b>
                  <span style={{ color: inkSoft }}> · {selected.payment_method || 'Bank Transfer'}</span>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarDays size={14} style={{ color: teal[500], flexShrink: 0 }} />
                <span style={{ color: inkSoft }}>Requested {formatDate(selected.requested_at || selected.created_at)}</span>
              </div>

              {selected.note && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: amber[50], border: `1px solid ${amber[100]}`, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, color: amber[600] }}>Customer note</div>
                  {selected.note}
                </div>
              )}

              {(selected.admin_notes || selected.reviewed_by) && (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: gray[50], border: `1px solid ${gray[100]}`, fontSize: 12, color: inkSoft, lineHeight: 1.5 }}>
                  {selected.admin_notes && (
                    <>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, color: inkSoft }}>Admin notes</div>
                      {selected.admin_notes}
                    </>
                  )}
                  {selected.reviewed_by && (
                    <div style={{ marginTop: selected.admin_notes ? 6 : 0, fontSize: 11 }}>
                      Reviewed by {selected.reviewed_by} · {formatDate(selected.reviewed_at)}
                    </div>
                  )}
                </div>
              )}

              {selected.linked_payment_id && (
                <div style={{ fontSize: 11, color: green[600], fontWeight: 600 }}>
                  Linked payment: {selected.linked_payment_id}
                </div>
              )}
            </div>

            {/* Review actions */}
            {canTransition(selected.status, 'under_review') && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Admin notes (optional)"
                  rows={2}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${hairline}`,
                    fontSize: 12, outline: 'none', resize: 'vertical', color: ink, background: '#fff',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => onReview('under_review')}
                    disabled={acting}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, border: `1px solid ${blue[100]}`, background: blue[50], color: blue[600], fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Eye size={13} /> Under Review
                  </button>
                  <button
                    onClick={() => onReview('confirmed')}
                    disabled={acting}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, border: 'none', background: teal[500], color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px -4px rgba(15,84,76,.5)' }}
                  >
                    <CheckCircle2 size={13} /> Confirm
                  </button>
                </div>
              </div>
            )}

            {canTransition(selected.status, 'under_review') && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onReview('rejected')}
                  disabled={acting}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, border: `1px solid ${red[100]}`, background: red[50], color: red[600], fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  <XCircle size={13} /> Reject
                </button>
                <button
                  onClick={() => onReview('cancelled')}
                  disabled={acting}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', borderRadius: 10, border: `1px solid ${gray[100]}`, background: gray[50], color: gray[600], fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Ban size={13} /> Cancel
                </button>
              </div>
            )}

            {!canTransition(selected.status, 'under_review') && (
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: gray[50], border: `1px solid ${gray[100]}`, fontSize: 11.5, color: inkSoft, display: 'flex', alignItems: 'center', gap: 7 }}>
                <AlertTriangle size={13} />
                This request is in a terminal state. Record the bank payment via Customer Payments when the receipt is verified.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentRequests;
