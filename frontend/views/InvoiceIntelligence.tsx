import React, { useState } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, AlertCircle, CheckCircle2, Clock,
  FileText, Shield, Copy, Percent,
  DollarSign, Loader2, Flag, Users, Ban,
  TrendingUp, TrendingDown, ChevronRight, BrainCircuit,
  Search, BarChart3
} from 'lucide-react';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import {
  detectDuplicateInvoices, validateInvoiceTotals,
  identifyMissingTaxInfo, flagOverduePayments,
  detectSuspiciousInvoices
} from '../services/invoiceIntelligenceService';
import { formatCurrency } from '../services/reportSummaryService';
import { useApp } from '../context/AppContext';

const toSafeNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

type Tab = 'duplicates' | 'validation' | 'overdue' | 'suspicious' | 'tax';

const TABS: { key: Tab; label: string; icon: React.FC<{ size?: number }>; desc: string; color: string }[] = [
  { key: 'duplicates', label: 'Duplicate Detection', icon: Copy, desc: 'Flag potentially duplicated invoices', color: teal[600] },
  { key: 'validation', label: 'Validation Issues', icon: AlertCircle, desc: 'Invoice total mismatches and errors', color: danger[500] },
  { key: 'overdue', label: 'Overdue Payments', icon: Clock, desc: 'Past-due invoices requiring follow-up', color: amber[500] },
  { key: 'suspicious', label: 'Suspicious Activity', icon: Shield, desc: 'High-risk invoice patterns detected', color: danger[500] },
  { key: 'tax', label: 'Missing Tax Info', icon: Percent, desc: 'Incomplete tax documentation', color: amber[600] },
];

const SeverityBadge = ({ severity }: { severity: 'low' | 'medium' | 'high' | 'critical' }) => {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    low: { bg: emerald[50], color: emerald[600], label: 'Low' },
    medium: { bg: amber[50], color: amber[600], label: 'Medium' },
    high: { bg: danger[50], color: danger[500], label: 'High' },
    critical: { bg: danger[50], color: danger[600], label: 'Critical' },
  };
  const s = config[severity] || config.low;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: s.bg, color: s.color, padding: '2px 8px', borderRadius: 9, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      {s.label}
    </span>
  );
};

const RiskScoreBadge = ({ score }: { score: number }) => {
  const color = score >= 70 ? danger[500] : score >= 40 ? amber[600] : emerald[500];
  const bg = score >= 70 ? danger[50] : score >= 40 ? amber[50] : emerald[50];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: bg, color, padding: '2px 8px', borderRadius: 9 }}>
      {score}/100
    </span>
  );
};

const InvoiceIntelligence: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useApp();
  const { invoices: contextInvoices } = useFinance();
  const { customers: contextCustomers } = useSales();

  const invoices = Array.isArray(contextInvoices) ? contextInvoices : [];
  const customers = Array.isArray(contextCustomers) ? contextCustomers : [];

  const paper = '#FEFDFB';
  const ink = '#23282A';
  const inkSoft = '#5c6567';
  const hairline = '#e4ddd1';
  const teal = { 50: '#eef7f6', 100: '#d4ebe3', 200: '#a6d9d3', 400: '#3fa294', 500: '#2d9a8a', 600: '#1f8577', 700: '#166b5e', 800: '#0f544c', 900: '#0a3d34' };
  const amber = { 50: '#fef9e7', 100: '#fef3c7', 200: '#fde68a', 400: '#d99a3f', 500: '#d99a3f', 600: '#b45309', 700: '#92400e', 800: '#78350f', 900: '#451a03' };
  const danger = { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 400: '#dc2626', 500: '#b5493f', 600: '#991b1b', 700: '#7f1d1d', 800: '#450a0a', 900: '#1a0505' };
  const emerald = { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 400: '#16a34a', 500: '#16a34a', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' };

  const [activeTab, setActiveTab] = useState<Tab>('duplicates');
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<{ invoiceId: string; duplicateOf: string; confidence: number; reason: string }[]>([]);
  const [validationResults, setValidationResults] = useState<{ invoiceId: string; valid: boolean; issues: string[] }[]>([]);
  const [missingTaxInvoices, setMissingTaxInvoices] = useState<{ invoiceId: string; customerName: string; missingFields: string[] }[]>([]);
  const [overduePayments, setOverduePayments] = useState<{ invoiceId: string; customerName: string; amountDue: number; daysOverdue: number; severity: 'low' | 'medium' | 'high' }[]>([]);
  const [suspiciousInvoices, setSuspiciousInvoices] = useState<{ invoiceId: string; flags: string[]; riskScore: number }[]>([]);

  const invoicesCount = invoices.length;
  const customersCount = customers.length;

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const duplicateResults = await detectDuplicateInvoices(invoices);
      setDuplicates(duplicateResults);

      const validation = invoices
        .map((inv: any) => ({ invoiceId: inv.id, ...validateInvoiceTotals(inv) }))
        .filter((r: any) => !r.valid);
      setValidationResults(validation);

      const missing = invoices
        .map((inv: any) => ({ invoiceId: inv.id, customerName: inv.customerName || 'Unknown', missingFields: identifyMissingTaxInfo(inv) }))
        .filter((r: any) => r.missingFields.length > 0);
      setMissingTaxInvoices(missing);

      const overdue = flagOverduePayments(invoices, { lateFeeEnabled: true, graceDays: 3 });
      setOverduePayments(overdue);

      const suspicious = detectSuspiciousInvoices(invoices);
      setSuspiciousInvoices(suspicious.filter((s: any) => s.riskScore > 0));
    } catch (err) {
      logger.error('InvoiceIntelligence analysis error', err);
    } finally {
      setLoading(false);
    }
  };

  const totalIssues = validationResults.length + missingTaxInvoices.length + suspiciousInvoices.length + overduePayments.length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: paper, flexDirection: 'column', gap: 16 }}>
        <Loader2 size={40} className="animate-spin" style={{ color: teal[600] }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: inkSoft }}>Analyzing invoices...</span>
      </div>
    );
  }

  const emptyState = (icon: React.ReactNode, message: string) => (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        {icon}
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: ink, margin: 0 }}>{message}</p>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'duplicates':
        return (
          <div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 18, margin: 0, color: ink, letterSpacing: '-0.01em' }}>Duplicate Detection</h2>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                    {duplicates.length > 0 ? `${duplicates.length} potential duplicate${duplicates.length !== 1 ? 's' : ''} found` : 'Scanning for duplicate invoices'}
                  </p>
                </div>
                {duplicates.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '4px 12px', borderRadius: 9 }}>
                    {duplicates.length} duplicate{duplicates.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {duplicates.length > 0 ? (
                <div style={{ border: `1.4px solid ${hairline}`, borderRadius: 14, overflow: 'hidden', background: paper }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: teal[50], borderBottom: `1.4px solid ${hairline}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invoice ID</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Duplicate Of</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confidence</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reason</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicates.map((d, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${hairline}` }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fafbfb'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink, fontFamily: 'monospace', fontSize: 12 }}>{d.invoiceId.slice(0, 12)}...</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink, fontFamily: 'monospace', fontSize: 12 }}>{d.duplicateOf.slice(0, 12)}...</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, backgroundColor: d.confidence >= 0.9 ? danger[50] : amber[50], color: d.confidence >= 0.9 ? danger[500] : amber[600] }}>
                                {(d.confidence * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: inkSoft }}>{d.reason}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <button onClick={() => navigate(`/sales-flow/invoices?id=${d.invoiceId}`)} style={{ border: 'none', background: teal[50], color: teal[700], padding: '5px 12px', borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                Review <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : emptyState(<CheckCircle2 size={28} color={emerald[500]} />, 'No duplicate invoices detected.')}
          </div>
        );

      case 'validation':
        return (
          <div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 18, margin: 0, color: ink, letterSpacing: '-0.01em' }}>Validation Issues</h2>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                    {validationResults.length > 0 ? `${validationResults.length} invoice${validationResults.length !== 1 ? 's' : ''} with total mismatches` : 'All invoices pass validation'}
                  </p>
                </div>
                {validationResults.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: danger[500], backgroundColor: danger[50], padding: '4px 12px', borderRadius: 9 }}>
                    {validationResults.length} issue{validationResults.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {validationResults.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {validationResults.slice(0, 10).map((r, i) => (
                    <div key={i} style={{ padding: '14px 18px', borderRadius: 14, backgroundColor: danger[50], border: `1.4px solid ${danger[200]}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: danger[700], fontFamily: 'monospace' }}>{r.invoiceId.slice(0, 12)}...</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: danger[500], backgroundColor: danger[200], padding: '2px 8px', borderRadius: 9 }}>Invalid</span>
                      </div>
                      {r.issues.map((issue, j) => (
                        <div key={j} style={{ fontSize: 12, color: inkSoft, padding: '2px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{ color: danger[500], flexShrink: 0 }}>•</span>
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {validationResults.length > 10 && (
                    <div style={{ textAlign: 'center', fontSize: 12, color: inkSoft, fontWeight: 600, padding: 8 }}>
                      +{validationResults.length - 10} more issues
                    </div>
                  )}
                </div>
              ) : emptyState(<CheckCircle2 size={28} color={emerald[500]} />, 'All invoices pass validation.')}
          </div>
        );

      case 'overdue':
        return (
          <div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 18, margin: 0, color: ink, letterSpacing: '-0.01em' }}>Overdue Payments</h2>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                    {overduePayments.length > 0 ? `${overduePayments.length} overdue invoice${overduePayments.length !== 1 ? 's' : ''} requiring attention` : 'No overdue payments'}
                  </p>
                </div>
                {overduePayments.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: amber[600], backgroundColor: amber[50], padding: '4px 12px', borderRadius: 9 }}>
                    {overduePayments.length} overdue
                  </span>
                )}
              </div>
              {overduePayments.length > 0 ? (
                <div style={{ border: `1.4px solid ${hairline}`, borderRadius: 14, overflow: 'hidden', background: paper }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: teal[50], borderBottom: `1.4px solid ${hairline}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount Due</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Days Overdue</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Severity</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overduePayments.map((o, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${hairline}` }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fafbfb'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink }}>{o.customerName}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: danger[500], fontVariantNumeric: 'tabular-nums' }}>
                              {formatCurrency(o.amountDue)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>
                              <span style={{ color: o.daysOverdue > 30 ? danger[500] : amber[600] }}>
                                {o.daysOverdue} {o.daysOverdue === 1 ? 'day' : 'days'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}><SeverityBadge severity={o.severity} /></td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <button onClick={() => navigate(`/sales-flow/invoices?id=${o.invoiceId}`)} style={{ border: 'none', background: teal[50], color: teal[700], padding: '5px 12px', borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                View <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : emptyState(<CheckCircle2 size={28} color={emerald[500]} />, 'No overdue payments found.')}
          </div>
        );

      case 'suspicious':
        return (
          <div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 18, margin: 0, color: ink, letterSpacing: '-0.01em' }}>Suspicious Activity</h2>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                    {suspiciousInvoices.length > 0 ? `${suspiciousInvoices.length} flagged invoice${suspiciousInvoices.length !== 1 ? 's' : ''} with unusual patterns` : 'No suspicious activity detected'}
                  </p>
                </div>
                {suspiciousInvoices.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: danger[500], backgroundColor: danger[50], padding: '4px 12px', borderRadius: 9 }}>
                    {suspiciousInvoices.length} flagged
                  </span>
                )}
              </div>
              {suspiciousInvoices.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                  {suspiciousInvoices.map((s, i) => (
                    <div key={i} style={{
                      padding: '18px', borderRadius: 14,
                      backgroundColor: s.riskScore >= 70 ? danger[50] : s.riskScore >= 40 ? amber[50] : '#f8fafc',
                      border: `1.4px solid ${s.riskScore >= 70 ? danger[200] : s.riskScore >= 40 ? amber[100] : hairline}`,
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: ink }}>
                          {s.invoiceId.slice(0, 14)}...
                        </span>
                        <RiskScoreBadge score={s.riskScore} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {s.flags.map((flag, j) => (
                          <div key={j} style={{ fontSize: 11, color: inkSoft, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            <Flag size={12} color={danger[500]} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => navigate(`/sales-flow/invoices?id=${s.invoiceId}`)} style={{
                        border: 'none', background: teal[50], color: teal[700], padding: '6px 14px', borderRadius: 9,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                        alignSelf: 'flex-start', marginTop: 4,
                      }}>
                        Investigate <ChevronRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : emptyState(<Shield size={28} color={emerald[500]} />, 'No suspicious activity detected.')}
          </div>
        );

      case 'tax':
        return (
          <div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 18, margin: 0, color: ink, letterSpacing: '-0.01em' }}>Missing Tax Information</h2>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                    {missingTaxInvoices.length > 0 ? `${missingTaxInvoices.length} invoice${missingTaxInvoices.length !== 1 ? 's' : ''} with incomplete tax data` : 'All invoices have complete tax info'}
                  </p>
                </div>
                {missingTaxInvoices.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: amber[600], backgroundColor: amber[50], padding: '4px 12px', borderRadius: 9 }}>
                    {missingTaxInvoices.length} affected
                  </span>
                )}
              </div>
              {missingTaxInvoices.length > 0 ? (
                <div style={{ border: `1.4px solid ${hairline}`, borderRadius: 14, overflow: 'hidden', background: paper }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: teal[50], borderBottom: `1.4px solid ${hairline}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Invoice ID</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Missing Fields</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missingTaxInvoices.map((m, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${hairline}` }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fafbfb'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink, fontFamily: 'monospace', fontSize: 12 }}>{m.invoiceId.slice(0, 12)}...</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink }}>{m.customerName}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {m.missingFields.map((field, j) => (
                                  <span key={j} style={{ fontSize: 10, fontWeight: 700, backgroundColor: danger[50], color: danger[500], padding: '2px 8px', borderRadius: 9 }}>
                                    {field}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <button onClick={() => navigate(`/sales-flow/invoices?id=${m.invoiceId}`)} style={{ border: 'none', background: teal[50], color: teal[700], padding: '5px 12px', borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                Fix <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : emptyState(<CheckCircle2 size={28} color={emerald[500]} />, 'All invoices have complete tax information.')}
          </div>
        );
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: paper,
      padding: '20px',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: ink,
    }}>
      <div style={{ maxWidth: 1520, width: '100%', margin: '0 auto', display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '20px 18px', color: ink }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                <Shield size={18} color="#fff" />
              </div>
              <div>
                <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 18, margin: 0, color: ink, letterSpacing: 0.2 }}>Invoice</h1>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>Intelligence</p>
              </div>
            </div>
            <button
              onClick={runAnalysis}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
            >
              <Search size={16} /> Run Analysis
            </button>
          </div>

          <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '10px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 9,
                  border: `1.4px solid ${isActive ? teal[400] : hairline}`, background: isActive ? teal[50] : paper,
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                  cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all .15s', marginBottom: 2,
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#fafbfb'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = paper; }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: isActive ? `${tab.color}15` : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <tab.icon size={15} color={isActive ? tab.color : inkSoft} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 600, color: isActive ? ink : inkSoft }}>{tab.label}</div>
                    <div style={{ fontSize: 10, color: inkSoft, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.desc}</div>
                  </div>
                  {isActive && <ChevronRight size={14} color={tab.color} />}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Validated</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: teal[600], marginTop: 4 }}>{invoicesCount}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>invoices</div>
            </div>
            <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: totalIssues > 0 ? danger[500] : emerald[500], marginTop: 4 }}>{totalIssues}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>found</div>
            </div>
            <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: amber[500], marginTop: 4 }}>{overduePayments.length}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>payments</div>
            </div>
            <div style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customers</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>{customersCount}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>tracked</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '24px', overflow: 'auto' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default InvoiceIntelligence;
