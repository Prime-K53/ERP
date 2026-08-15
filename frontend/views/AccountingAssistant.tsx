import React, { useState, useMemo } from 'react';
import {
  Tags, Banknote, FilePen, HeartPulse, CheckCircle2, XCircle,
  Sparkles, ArrowRight, AlertTriangle, Loader2, RefreshCw,
  ChevronRight, AlertCircle, BrainCircuit
} from 'lucide-react';
import {
  autoCategorizeExpense, matchBankTransaction, suggestJournalEntry,
  detectAccountingInconsistencies, suggestCorrection
} from '../services/accountingAssistantService';
import { useApp } from '../context/AppContext';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { format } from 'date-fns';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

type Tab = 'expense' | 'reconciliation' | 'journal' | 'health';

interface TabConfig {
  key: Tab;
  label: string;
  icon: React.FC<{ size?: number }>;
  desc: string;
  color: string;
}

const TABS: TabConfig[] = [
  { key: 'expense', label: 'Expense Categorizer', icon: Tags, desc: 'Auto-classify uncategorized expenses', color: '#8b5cf6' },
  { key: 'reconciliation', label: 'Bank Reconciliation', icon: Banknote, desc: 'Match transactions to records', color: '#06b6d4' },
  { key: 'journal', label: 'Journal Suggestions', icon: FilePen, desc: 'AI-powered entry suggestions', color: '#f59e0b' },
  { key: 'health', label: 'Accounting Health', icon: HeartPulse, desc: 'Detect ledger inconsistencies', color: '#10b981' },
];

const AccountingAssistant: React.FC = () => {
  const { notify } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('expense');
  const [loading, setLoading] = useState(false);

  const { sales, fetchSalesData } = useSales();
  const { invoices, expenses: allExpenses, ledger, accounts, fetchFinanceData } = useFinance();
  const [payments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  const [journalDesc, setJournalDesc] = useState('');
  const [journalAmount, setJournalAmount] = useState('');
  const [journalSuggestions, setJournalSuggestions] = useState<any[]>([]);
  const [inconsistencies, setInconsistencies] = useState<any[]>([]);

  React.useEffect(() => {
    if (allExpenses?.length > 0) setExpenses(allExpenses);
  }, [allExpenses]);

  React.useEffect(() => {
    if (ledger.length > 0 || accounts.length > 0) {
      setInconsistencies(detectAccountingInconsistencies(ledger, accounts));
    }
  }, [ledger, accounts]);

  const uncategorizedExpenses = useMemo(() => {
    return expenses.filter(e => !e.category || e.category === 'Uncategorized' || e.category === 'General');
  }, [expenses]);

  const categorizedExpenses = useMemo(() => {
    return uncategorizedExpenses.map(exp => {
      const suggestion = autoCategorizeExpense(exp);
      return { ...exp, suggestion };
    });
  }, [uncategorizedExpenses]);

  const bankTransactions = useMemo(() => {
    const txns: any[] = [];
    for (const p of payments.slice(0, 30)) {
      txns.push({
        id: `bank-${p.id}`,
        description: p.reference || p.description || `Payment ${p.id}`,
        amount: p.amount || 0,
        date: p.date || new Date().toISOString(),
      });
    }
    for (const s of sales.slice(0, 30)) {
      if (txns.length >= 60) break;
      txns.push({
        id: `bank-sale-${s.id}`,
        description: `Sale: ${s.customerName || s.id}`,
        amount: s.totalAmount || s.total || 0,
        date: s.date || s.saleDate || new Date().toISOString(),
      });
    }
    return txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);
  }, [payments, sales]);

  const matchedTransactions = useMemo(() => {
    return bankTransactions.map(tx => {
      const result = matchBankTransaction(tx, { invoices, expenses, payments, sales });
      return { ...tx, matchResult: result };
    });
  }, [bankTransactions, invoices, expenses, payments, sales]);

  const handleAcceptCategory = (expenseId: string) => {
    setExpenses(prev => prev.map(e =>
      e.id === expenseId ? { ...e, category: e.suggestion?.category || e.category } : e
    ));
    notify('Category accepted', 'success');
  };

  const handleRejectCategory = (expenseId: string) => {
    setExpenses(prev => prev.map(e =>
      e.id === expenseId ? { ...e, category: 'Uncategorized' } : e
    ));
  };

  const handleSuggestJournal = () => {
    const amount = parseFloat(journalAmount);
    if (!journalDesc.trim() || isNaN(amount) || amount <= 0) {
      notify('Enter a valid description and amount', 'warning');
      return;
    }
    setJournalSuggestions(suggestJournalEntry(journalDesc, amount));
  };

  const handleApplyJournal = (suggestion: any) => {
    notify(`Applied: ${suggestion.description}`, 'success');
    setJournalSuggestions(prev => prev.filter(s => s !== suggestion));
  };

  const handleFixInconsistency = (issue: any) => {
    const correction = suggestCorrection(issue);
    notify(correction.description, 'info');
  };

  const matchedCount = matchedTransactions.filter(t => t.matchResult?.match).length;
  const highSeverityCount = inconsistencies.filter(i => i.severity === 'high').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: paper, fontFamily: "'Inter','DM Sans',sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={36} className="animate-spin" style={{ color: teal[500] }} />
          <p style={{ marginTop: 12, fontSize: 13.5, fontWeight: 500, color: inkSoft }}>Loading Accounting Assistant...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: paper,
      padding: '20px',
      fontFamily: "'Inter','DM Sans',sans-serif",
      color: ink,
    }}>
      <div style={{
        maxWidth: 1520,
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
      }}>
        <div style={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{
            background: paper, borderRadius: 14, padding: '20px 18px',
            border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`,
              }}>
                <BrainCircuit size={18} />
              </div>
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], margin: 0, letterSpacing: 0.2 }}>Accounting</h1>
                <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI Assistant</p>
              </div>
            </div>
            <button
              onClick={() => { fetchSalesData(); fetchFinanceData(); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
                padding: '8px 0', borderRadius: 9, border: `1.4px solid ${hairline}`,
                background: paper, color: inkSoft, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
              onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
            >
              <RefreshCw size={13} /> Refresh Data
            </button>
          </div>

          <div style={{
            background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)', padding: '10px', flex: 1,
            display: 'flex', flexDirection: 'column',
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderRadius: 9,
                    border: 'none',
                    background: isActive ? paper : 'transparent',
                    boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s',
                    marginBottom: 2,
                    fontFamily: "'Inter', sans-serif",
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = teal[50]; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: isActive ? `${tab.color}15` : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <tab.icon size={15} color={isActive ? tab.color : inkSoft} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: isActive ? 700 : 600,
                      color: isActive ? ink : inkSoft,
                    }}>{tab.label}</div>
                    <div style={{
                      fontSize: 10, color: inkSoft, marginTop: 1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{tab.desc}</div>
                  </div>
                  {isActive && <ChevronRight size={14} color={tab.color} />}
                </button>
              );
            })}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          }}>
            <div style={{
              background: paper, borderRadius: 12, padding: '12px',
              border: `1.4px solid ${hairline}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: teal[500], marginTop: 4 }}>{categorizedExpenses.length}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>categories</div>
            </div>
            <div style={{
              background: paper, borderRadius: 12, padding: '12px',
              border: `1.4px solid ${hairline}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matched</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: teal[500], marginTop: 4 }}>{matchedCount}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>transactions</div>
            </div>
            <div style={{
              background: paper, borderRadius: 12, padding: '12px',
              border: `1.4px solid ${hairline}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: highSeverityCount > 0 ? danger : teal[500], marginTop: 4 }}>{inconsistencies.length}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>{highSeverityCount > 0 ? `${highSeverityCount} critical` : 'all clear'}</div>
            </div>
            <div style={{
              background: paper, borderRadius: 12, padding: '12px',
              border: `1.4px solid ${hairline}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unmatched</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: amber[500], marginTop: 4 }}>{bankTransactions.length - matchedCount}</div>
              <div style={{ fontSize: 9, color: inkSoft }}>to reconcile</div>
            </div>
          </div>
        </div>

        <div style={{
          flex: 1,
          minWidth: 0,
          background: paper,
          borderRadius: 14,
          border: `1.4px solid ${hairline}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          padding: '24px',
          overflow: 'auto',
        }}>
          {activeTab === 'expense' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                <h2 style={{ fontSize: 18, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], margin: 0, letterSpacing: '-0.01em' }}>Expense Categorizer</h2>
                <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                  Auto-classify {categorizedExpenses.length} uncategorized expense{categorizedExpenses.length !== 1 ? 's' : ''}
                </p>
                </div>
                {categorizedExpenses.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', backgroundColor: '#f5f3ff', padding: '4px 12px', borderRadius: 8 }}>
                    {categorizedExpenses.length} pending
                  </span>
                )}
              </div>
              {categorizedExpenses.length > 0 ? (
                <div style={{ border: `1px solid ${hairline}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${hairline}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Suggested Category</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confidence</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categorizedExpenses.map(exp => (
                          <tr key={exp.id} style={{ borderBottom: `1px solid ${hairline}`, transition: 'background-color 0.1s' }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {exp.description || exp.name || `Expense ${exp.id}`}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>
                              ${(exp.amount || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: teal[700], backgroundColor: teal[50], padding: '3px 10px', borderRadius: 6 }}>
                                {exp.suggestion?.category || 'General'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{
                                fontSize: 12, fontWeight: 700,
                                color: (exp.suggestion?.confidence || 0) >= 0.7 ? teal[600] : (exp.suggestion?.confidence || 0) >= 0.4 ? amber[500] : danger,
                              }}>
                                {((exp.suggestion?.confidence || 0) * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                <button onClick={() => handleAcceptCategory(exp.id)} style={{
                                  padding: '5px 10px', borderRadius: 8, border: 'none', backgroundColor: teal[50], color: teal[600],
                                  cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                                  transition: 'all 0.1s', fontFamily: "'Inter', sans-serif",
                                }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#d3ece9'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = teal[50]; e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                  <CheckCircle2 size={12} /> Accept
                                </button>
                                <button onClick={() => handleRejectCategory(exp.id)} style={{
                                  padding: '5px 10px', borderRadius: 8, border: 'none', backgroundColor: '#fef2f2', color: danger,
                                  cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                                  transition: 'all 0.1s', fontFamily: "'Inter', sans-serif",
                                }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fee2e2'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                  <XCircle size={12} /> Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <CheckCircle2 size={28} color={teal[500]} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: ink, margin: 0 }}>All expenses are categorized</p>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>No uncategorized expenses found.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'reconciliation' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                <h2 style={{ fontSize: 18, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], margin: 0, letterSpacing: '-0.01em' }}>Bank Reconciliation</h2>
                <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                  {matchedCount} matched, {bankTransactions.length - matchedCount} unmatched out of {bankTransactions.length} transactions
                </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: teal[600], backgroundColor: teal[50], padding: '4px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={12} /> {matchedCount} matched
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: danger, backgroundColor: '#fef2f2', padding: '4px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} /> {bankTransactions.length - matchedCount} unmatched
                  </span>
                </div>
              </div>
              {matchedTransactions.length > 0 ? (
                <div style={{ border: `1px solid ${hairline}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${hairline}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Match Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchedTransactions.map(tx => (
                          <tr key={tx.id} style={{ borderBottom: `1px solid ${hairline}` }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tx.description}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>
                              ${(tx.amount || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: inkSoft }}>
                              {tx.date ? format(new Date(tx.date), 'MMM dd, yyyy') : '-'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {tx.matchResult?.match ? (
                                <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: teal[50], color: teal[600], padding: '3px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={10} /> Matched
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: '#fef2f2', color: danger, padding: '3px 10px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <XCircle size={10} /> Unmatched
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: inkSoft }}>
                              {tx.matchResult?.match ? (
                                <span style={{ fontWeight: 600, color: teal[600] }}>
                                  {tx.matchResult.matchedTo?.type}: {tx.matchResult.matchedTo?.name || tx.matchResult.matchedTo?.id}
                                  {' '}({(tx.matchResult.confidence * 100).toFixed(0)}%)
                                </span>
                              ) : (
                                <span style={{ color: inkSoft }}>{tx.matchResult?.reason || 'No match found'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Banknote size={28} color={teal[400]} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: ink, margin: 0 }}>No bank transactions available</p>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Add payments or sales to see reconciliation suggestions.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'journal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: paper, borderRadius: 14, padding: '20px', border: `1px solid ${hairline}` }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px', fontFamily: "'Inter', sans-serif" }}>
                  Describe Your Journal Entry
                </h3>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: inkSoft, marginBottom: 6, display: 'block' }}>Description</label>
                    <input
                      type="text"
                      value={journalDesc}
                      onChange={e => setJournalDesc(e.target.value)}
                      placeholder="e.g. Paid salary for March, Purchased equipment..."
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`,
                        fontSize: 13.5, fontWeight: 500, color: ink, outline: 'none',
                        backgroundColor: paper, fontFamily: "'Inter', sans-serif",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = teal[400]; }}
                      onBlur={e => { e.currentTarget.style.borderColor = hairline; }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: inkSoft, marginBottom: 6, display: 'block' }}>Amount</label>
                    <input
                      type="number"
                      value={journalAmount}
                      onChange={e => setJournalAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 9, border: `1.4px solid ${hairline}`,
                        fontSize: 13.5, fontWeight: 500, color: ink, outline: 'none',
                        backgroundColor: paper, fontFamily: "'Inter', sans-serif",
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = teal[400]; }}
                      onBlur={e => { e.currentTarget.style.borderColor = hairline; }}
                    />
                  </div>
                  <button
                    onClick={handleSuggestJournal}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
                      borderRadius: 9, border: 'none', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(15,84,76,0.25)',
                      transition: 'all 0.15s', fontFamily: "'Inter', sans-serif",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(15,84,76,0.35)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,84,76,0.25)'; }}
                  >
                    <Sparkles size={16} /> Get Suggestions
                  </button>
                </div>
              </div>

              {journalSuggestions.length > 0 && (
                <div style={{ background: paper, borderRadius: 14, padding: '20px', border: `1px solid ${hairline}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      Suggested Journal Entries
                    </h3>
                    <span style={{ fontSize: 11, fontWeight: 700, color: amber[500], backgroundColor: amber[100], padding: '3px 10px', borderRadius: 6 }}>
                      {journalSuggestions.length} suggestions
                    </span>
                  </div>
                  <div style={{ border: `1px solid ${hairline}`, borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${hairline}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confidence</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journalSuggestions.map((s, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${hairline}` }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink }}>{s.description}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: teal[600], backgroundColor: teal[50], padding: '3px 10px', borderRadius: 6 }}>
                                Dr: {s.debitAccountId} / Cr: {s.creditAccountId}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>
                              ${parseFloat(journalAmount || '0').toFixed(2)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{
                                fontSize: 12, fontWeight: 700,
                                color: s.confidence >= 0.7 ? teal[600] : s.confidence >= 0.4 ? amber[500] : danger,
                              }}>
                                {(s.confidence * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleApplyJournal(s)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '5px 12px', borderRadius: 8, border: 'none',
                                  backgroundColor: teal[50], color: teal[600],
                                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  transition: 'all 0.1s', fontFamily: "'Inter', sans-serif",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#d3ece9'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = teal[50]; e.currentTarget.style.transform = 'scale(1)'; }}
                              >
                                <CheckCircle2 size={12} /> Apply
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {journalSuggestions.length === 0 && !journalDesc.trim() && (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <FilePen size={28} color={teal[400]} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: ink, margin: 0 }}>Enter details and get suggestions</p>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Provide a description and amount, then click Get Suggestions.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'health' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                <h2 style={{ fontSize: 18, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], margin: 0, letterSpacing: '-0.01em' }}>Accounting Health</h2>
                <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                  {inconsistencies.length > 0
                    ? `${inconsistencies.length} issue${inconsistencies.length !== 1 ? 's' : ''} detected in your ledger`
                    : 'Your books are healthy — no inconsistencies found'}
                </p>
                </div>
                {inconsistencies.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: highSeverityCount > 0 ? danger : teal[600], backgroundColor: highSeverityCount > 0 ? '#fef2f2' : teal[50], padding: '4px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={12} /> {inconsistencies.length} issues
                  </span>
                )}
              </div>
              {inconsistencies.length > 0 ? (
                <div style={{ border: `1px solid ${hairline}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${hairline}` }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Issue</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Severity</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Detail</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recommendation</th>
                          <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: teal[800], textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inconsistencies.map((issue, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${hairline}` }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: ink, textTransform: 'capitalize' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                  backgroundColor: issue.severity === 'high' ? danger : issue.severity === 'medium' ? amber[500] : teal[500],
                                }} />
                                {issue.type.replace(/_/g, ' ')}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {(() => {
                                const styles: Record<string, { bg: string; color: string; label: string }> = {
                                  high: { bg: '#fef2f2', color: danger, label: 'High' },
                                  medium: { bg: amber[100], color: amber[600], label: 'Medium' },
                                  low: { bg: teal[50], color: teal[600], label: 'Low' },
                                };
                                const s = styles[issue.severity] || styles.low;
                                return (
                                  <span style={{ fontSize: 10, fontWeight: 700, backgroundColor: s.bg, color: s.color, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    {s.label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: inkSoft, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {issue.detail}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: inkSoft, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {issue.recommendation}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleFixInconsistency(issue)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '5px 12px', borderRadius: 8, border: 'none',
                                  backgroundColor: teal[50], color: teal[600],
                                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  transition: 'all 0.1s', fontFamily: "'Inter', sans-serif",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#d3ece9'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = teal[50]; e.currentTarget.style.transform = 'scale(1)'; }}
                              >
                                <ArrowRight size={12} /> Fix
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <HeartPulse size={28} color={teal[500]} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: ink, margin: 0 }}>No inconsistencies detected</p>
                  <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Your books are healthy and balanced.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountingAssistant;
