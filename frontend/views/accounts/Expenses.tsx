import React, { useState, useMemo, useRef } from 'react';
import { 
  Plus, DollarSign, Banknote as PaymentIcon, Calendar, Search, Filter, 
  Download, PieChart, TrendingUp, AlertTriangle, FileText, 
  X, CheckCircle, ArrowUpRight, ArrowDownRight, Paperclip, Tag, ExternalLink, Image as ImageIcon, Sparkles, Loader2, Activity, Zap, Eye
} from 'lucide-react';
import { 
  PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend 
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useBankingStore } from '../../context/BankingContext';
import { Expense } from '../../types';
import { exportToCSV } from '../../services/excelService';
import { DEFAULT_ACCOUNTS, ACCOUNT_IDS } from '../../constants';
import { localFileStorage } from '../../services/localFileStorage';
import { OfflineImage } from '../../components/OfflineImage';
import { extractPaymentProofData, analyzeExpenses } from '../../services/geminiService';
import { getDefaultDate, validateDateInFY } from '../../utils/financialYearUtils';
import ReactMarkdown from 'react-markdown';

const COLORS = ['#1f8577', '#146b60', '#d99a3f', '#b97e2b', '#0b3e39', '#0f544c', '#3fa294'];

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294',
  500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

const Expenses: React.FC = () => {
  const { user, companyConfig, checkPermission, notify, isOnline } = useAuth();
  const { expenses, addExpense, approveExpense } = useFinance();
  const { accounts: bankAccounts, fetchBankingData } = useBankingStore();
  
  React.useEffect(() => {
    fetchBankingData?.();
  }, [fetchBankingData]);
  const currency = companyConfig?.currencySymbol || '$';

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState<'This Month' | 'Last Month' | 'All Time'>('This Month');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFileId, setAttachedFileId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleAiAudit = async () => {
    setIsAiLoading(true);
    try {
        const result = await analyzeExpenses(expenses as Expense[]);
        setAiAnalysis(result);
    } catch (error) {
        notify("AI Audit failed", "error");
    } finally {
        setIsAiLoading(false);
    }
  };

  const canEdit = checkPermission('accounts.edit');

  const [formData, setFormData] = useState({
    amount: '',
    category: 'General',
    description: '',
    date: getDefaultDate(),
    accountId: ACCOUNT_IDS.CASH_DRAWER,
    status: 'Paid'
  });

  const predefinedCategories = [
      'General', 'Utilities', 'Transport', 'Rent', 'Salaries', 'Marketing', 
      'Cost of Goods', 'Maintenance', 'Office Supplies', 'Meals & Entertainment', 
      'Insurance', 'Software Subscriptions', 'Legal & Professional'
  ];

  const categories = ['All', ...Array.from(new Set([...predefinedCategories, ...expenses.map(e => e.category)]))];

  const filteredExpenses = useMemo(() => {
    const now = new Date();
    let data = expenses;
    if (dateFilter === 'This Month') {
      data = data.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    } else if (dateFilter === 'Last Month') {
      const lastMonth = new Date();
      lastMonth.setMonth(now.getMonth() - 1);
      data = data.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
      });
    }
    return data.filter(e => 
      (categoryFilter === 'All' || e.category === categoryFilter) &&
      (e.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
       e.amount.toString().includes(searchTerm) ||
       e.recordedBy.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, searchTerm, categoryFilter, dateFilter]);

  const stats = useMemo(() => {
    const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const count = filteredExpenses.length;
    const avg = count > 0 ? total / count : 0;
    const catMap: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });
    const chartData = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const highestExpense = filteredExpenses.length > 0 ? filteredExpenses.reduce((prev, current) => (prev.amount > current.amount) ? prev : current) : null;
    return { total, count, avg, chartData, highestExpense };
  }, [filteredExpenses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const dateError = validateDateInFY(formData.date);
    if (dateError) {
      notify(dateError, "error");
      return;
    }

    const amt = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amt) || amt <= 0) {
        notify("Please enter a valid positive expense amount.", "error");
        return;
    }
    if (!formData.description.trim()) {
        notify("Expense description is required for the audit trail.", "error");
        return;
    }
    if (!formData.category) {
        notify("Please select a category for this expense.", "error");
        return;
    }

    addExpense({ 
      id: '',
      date: new Date(formData.date).toISOString(), 
      amount: amt, 
      category: formData.category, 
      description: formData.description, 
      recordedBy: user?.username || 'Unknown', 
      status: formData.status,
      paymentProofUrl: attachedFileId || undefined,
      accountId: formData.accountId
    });

    setFormData({ amount: '', category: 'General', description: '', date: getDefaultDate(), accountId: ACCOUNT_IDS.CASH_DRAWER, status: 'Paid' });
    setAttachedFileId(null); 
    setIsAddModalOpen(false);
  };

  const handleExport = () => {
    exportToCSV(filteredExpenses.map(e => ({ Date: new Date(e.date).toLocaleDateString(), ID: e.id, Category: e.category, Description: e.description, Amount: e.amount, User: e.recordedBy })), 'expenses_report');
  };

  const handleAttach = () => { if (canEdit) fileInputRef.current?.click(); };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const id = await localFileStorage.save(file);
              setAttachedFileId(id);
              if (isScanning) {
                  if (!isOnline) { notify("Scanning requires internet.", "error"); setIsScanning(false); return; }
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                      const base64 = ev.target?.result as string;
                      try {
                          const data = await extractPaymentProofData(base64);
                          if (data) { setFormData(prev => ({ ...prev, amount: data.amount?.toString() || prev.amount, date: data.date || prev.date, description: data.description || prev.description, category: data.category || prev.category })); notify("Payment proof scanned successfully!", "success"); }
                      } catch (err) { notify("Could not extract data.", "error"); } finally { setIsScanning(false); }
                  };
                  reader.readAsDataURL(file);
              } else notify("Payment proof attached", "success");
          } catch (e) { notify("Failed to attach payment proof", "error"); setIsScanning(false); }
          e.target.value = '';
      }
  };

  const handleMagicScan = () => { setIsScanning(true); fileInputRef.current?.click(); };
  const handleViewPaymentProof = async (fileId: string) => {
      const url = await localFileStorage.getUrl(fileId);
      if (url) window.open(url, '_blank');
      else notify("Payment proof file not found", "error");
  };

  const renderDetailModal = () => {
    if (!selectedExpense) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)', padding: '24px 20px',
        backdropFilter: 'blur(4px)', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink
      }}>
        <div style={{
          width: 480, maxWidth: '100%', maxHeight: '92vh',
          background: paper, borderRadius: 14,
          boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 4,
            background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
          }} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}`, background: paper
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
              }}>
                <DollarSign size={19} color="#fff" />
              </div>
              <div>
                <h1 style={{
                  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                  fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                }}>
                  Expense Details
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedExpense.id}
                </p>
              </div>
            </div>
            <button onClick={() => { setSelectedExpense(null); setAttachedFileId(null); }} aria-label="Close" style={{
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

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 8px' }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 16, background: teal[50], borderRadius: 9, border: `1px solid ${teal[100]}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    padding: 8, borderRadius: 8, background: teal[100], color: teal[700]
                  }}>
                    <DollarSign size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 2 }}>Total Amount</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: teal[800], fontFamily: "'JetBrains Mono', monospace" }}>
                      {currency}{selectedExpense.amount.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div>
                  <span style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.08,
                    background: selectedExpense.status === 'Pending Approval' ? amber[100] : teal[100],
                    color: selectedExpense.status === 'Pending Approval' ? amber[600] : teal[700]
                  }}>
                    {selectedExpense.status || 'Paid'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <div style={{ fontSize: 13, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} style={{ color: inkSoft }} />
                  {new Date(selectedExpense.date).toLocaleDateString()} {new Date(selectedExpense.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <div style={{ fontSize: 13, color: ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag size={14} style={{ color: inkSoft }} />
                  {selectedExpense.category}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Description</label>
                <div style={{
                  padding: 12, background: teal[50], borderRadius: 9, border: `1px solid ${teal[100]}`,
                  fontSize: 13, color: ink, lineHeight: 1.5
                }}>
                  {selectedExpense.description}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Recorded By</label>
                <div style={{ fontSize: 13, color: ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: teal[100],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: teal[700]
                  }}>
                    {selectedExpense.recordedBy.charAt(0)}
                  </div>
                  {selectedExpense.recordedBy}
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${hairline}`, paddingTop: 18, marginBottom: 18 }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>Ledger Impact</div>
              <div style={{
                background: teal[900], color: '#fff', padding: 14, borderRadius: 9,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, lineHeight: 1.6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: teal[200] }}>DR Expense: {selectedExpense.category}</span>
                  <span style={{ fontWeight: 600 }}>{currency}{selectedExpense.amount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: teal[200], paddingLeft: 12 }}>
                    CR {selectedExpense.accountId === ACCOUNT_IDS.BANK ? 'Main Bank Account' : 
                        selectedExpense.accountId === ACCOUNT_IDS.MOBILE_MONEY ? 'Mobile Money' : 
                        'Cash Drawer'}
                  </span>
                  <span style={{ fontWeight: 600 }}>{currency}{selectedExpense.amount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Attachments</div>
              {selectedExpense.paymentProofUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{
                      height: 180, background: teal[50], borderRadius: 9, overflow: 'hidden',
                      border: `1px solid ${teal[100]}`, position: 'relative'
                    }}>
                      <OfflineImage src={selectedExpense.paymentProofUrl} alt="Payment Proof Preview" className="w-full h-full object-contain" fallback={
                        <div style={{
                          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', color: inkSoft, fontSize: 11
                        }}>
                          <ImageIcon size={28} style={{ marginBottom: 6 }} />
                          Preview Unavailable
                        </div>
                      } />
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(15,84,76,.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity .2s'
                      }} className="group-hover:opacity-100">
                        <button onClick={() => handleViewPaymentProof(selectedExpense.paymentProofUrl!)} style={{
                          background: paper, color: ink, padding: '8px 14px', borderRadius: 8,
                          fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                          border: 'none', cursor: 'pointer'
                        }}>
                          <ExternalLink size={13} /> Open Full File
                        </button>
                      </div>
                    </div>
                    <button onClick={() => handleViewPaymentProof(selectedExpense.paymentProofUrl!)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                      background: teal[50], color: teal[700], borderRadius: 9, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${teal[100]}`, cursor: 'pointer', justifyContent: 'center', transition: 'all .15s ease'
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = teal[100]; }}
                      onMouseLeave={e => { e.currentTarget.style.background = teal[50]; }}
                    >
                      <ExternalLink size={13} /> Open in New Tab
                    </button>
                  </div>
              ) : (
                <div style={{
                  textAlign: 'center', fontSize: 12, color: inkSoft, fontStyle: 'italic',
                  padding: 14, border: `1.4px dashed ${hairline}`, borderRadius: 9
                }}>
                  No payment proof attached.
                </div>
              )}
            </div>

            {selectedExpense.status === 'Pending Approval' && checkPermission('accounts.approve') && (
              <div style={{ borderTop: `1px solid ${hairline}`, paddingTop: 18 }}>
                <button 
                  onClick={async () => {
                    await approveExpense(selectedExpense.id);
                    setSelectedExpense(null);
                  }}
                  style={{
                    width: '100%', padding: '12px 16px', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                    color: '#fff', borderRadius: 9, fontWeight: 700, fontSize: 13, border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`, cursor: 'pointer',
                    transition: 'all .15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                >
                  <CheckCircle size={18} /> Approve & Post to Ledger
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, color: teal[800],
    marginBottom: 6, letterSpacing: 0.01
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
    color: ink, background: paper,
    border: `1.4px solid ${hairline}`, borderRadius: 9,
    padding: '9px 12px', outline: 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
  };

  const btnGhostStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
    padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
    background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
    display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
  };

  const btnPrimaryStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
    padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
    color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
    boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
    transition: 'all .15s ease'
  };

  const renderAddModal = () => {
    if (!isAddModalOpen || !canEdit) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)', padding: '40px 20px',
        fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink
      }}>
        <div style={{
          width: 480, maxWidth: '100%', maxHeight: '92vh',
          background: paper, borderRadius: 14,
          boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 4,
            background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
          }} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}`, background: paper
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
              }}>
                <PaymentIcon size={19} color="#fff" />
              </div>
              <div>
                <h1 style={{
                  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                  fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                }}>
                  New Expense
                </h1>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isOnline && (
                <button onClick={handleMagicScan} style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 9,
                  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff',
                  border: 'none', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  boxShadow: `0 4px 10px -4px rgba(15,84,76,.4)`
                }} disabled={isScanning}>
                  {isScanning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Magic Scan
                </button>
              )}
              <button onClick={() => setIsAddModalOpen(false)} aria-label="Close" style={{
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
          </div>

          <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 8px' }}>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" style={inputStyle} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Amount ({currency})</label>
              <input type="number" step="0.01" autoFocus required style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16 }} value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0.00" />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                {categories.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Payment Account</label>
              <select style={inputStyle} value={formData.accountId} onChange={e => setFormData({...formData, accountId: e.target.value})}>
                <option value={ACCOUNT_IDS.CASH_DRAWER}>Cash Drawer (1000)</option>
                <option value={ACCOUNT_IDS.BANK}>Main Bank Account (1050)</option>
                <option value={ACCOUNT_IDS.MOBILE_MONEY}>Mobile Money (1060)</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="Paid">Paid</option>
                <option value="Pending Approval">Pending Approval</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Description</label>
              <textarea style={{ ...inputStyle, resize: 'none', minHeight: 80, lineHeight: 1.5 }} required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="What was this for?" />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Payment Proof Image</label>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} accept="image/*" />
              <div onClick={handleAttach} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                border: `1.4px dashed ${hairline}`, borderRadius: 9, fontSize: 13, color: inkSoft,
                cursor: 'pointer', transition: 'all .15s ease', background: attachedFileId ? teal[50] : paper
              }}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { if (!attachedFileId) { e.currentTarget.style.background = paper; e.currentTarget.style.borderColor = hairline; } }}
              >
                <Paperclip size={16} />
                <span style={{ fontWeight: 600 }}>{attachedFileId ? 'Proof Attached!' : 'Click to upload payment proof'}</span>
                {attachedFileId && <CheckCircle size={16} style={{ color: teal[500], marginLeft: 'auto' }} />}
              </div>
              {attachedFileId && (
                <div style={{ marginTop: 10, height: 80, borderRadius: 9, overflow: 'hidden', border: `1px solid ${teal[100]}`, background: teal[50] }}>
                  <OfflineImage src={attachedFileId} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              )}
            </div>
          </form>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 14, padding: '16px 28px',
            borderTop: `1px solid ${hairline}`, background: paper
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: inkSoft }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: amber[500] }} />
              Step 1 of 1 &mdash; Expense Entry
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setIsAddModalOpen(false)} style={btnGhostStyle}
                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                Cancel
              </button>
              <button type="submit" form="expense-form" style={btnPrimaryStyle}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}>
                <CheckCircle size={16} /> Record Expense
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 1600, margin: '0 auto', fontFamily: "'Inter','DM Sans',sans-serif", background: paper }}>
      {renderAddModal()}

      {renderDetailModal()}

      <div style={{ padding: '16px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`
            }}>
              <TrendingUp size={18} color="#fff" />
            </div>
            <h1 style={{
              fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
              fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
            }}>
              Expense Management
            </h1>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: inkSoft }}>Track and analyze operational spending</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button 
              onClick={handleAiAudit}
              disabled={isAiLoading}
              style={{ ...btnGhostStyle, fontSize: 12, padding: '7px 14px' }}
          >
              {isAiLoading ? <Loader2 className="animate-spin" size={14} style={{ color: teal[600] }} /> : <Sparkles size={14} style={{ color: teal[600] }} />}
              {aiAnalysis ? 'Update Audit' : 'AI Strategic Audit'}
          </button>
          <button onClick={handleExport} style={{ ...btnGhostStyle, fontSize: 12, padding: '7px 14px' }}>
            <Download size={14} /> Export
          </button>
          {canEdit && (
            <button onClick={() => setIsAddModalOpen(true)} style={{
              ...btnPrimaryStyle, fontSize: 12, padding: '7px 14px'
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}>
              <Plus size={14} /> New Expense
            </button>
          )}
        </div>
      </div>

      {aiAnalysis && (
        <div style={{ margin: '0 24px 16px', background: `linear-gradient(135deg, ${teal[50]}, ${amber[100]})`, border: `1px solid ${teal[100]}`, borderRadius: 14, padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.08 }}>
                <PaymentIcon size={80} style={{ color: teal[700] }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: paper,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${teal[100]}`, flexShrink: 0
                }}>
                  <Sparkles size={16} style={{ color: teal[600] }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h3 style={{ fontSize: 10, fontWeight: 800, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.12 }}>AI Expenditure Audit Insight</h3>
                        <button onClick={() => setAiAnalysis(null)} style={{ background: 'none', border: 'none', color: teal[600], cursor: 'pointer', padding: 4 }}>
                            <X size={14} />
                        </button>
                    </div>
                    <div style={{ fontSize: 12.5, color: teal[800], lineHeight: 1.6 }}>
                        <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div style={{ padding: '0 24px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, flexShrink: 0 }}>
            {[
                { label: `Total Spend (${dateFilter})`, value: `${currency}${stats.total.toLocaleString()}`, icon: TrendingUp },
                { label: 'Avg Transaction', value: `${currency}${stats.avg.toLocaleString(undefined, {maximumFractionDigits: 0})}`, icon: Activity },
                { label: 'Highest Category', value: stats.chartData.length > 0 ? stats.chartData[0].name : 'N/A', icon: Zap },
                { label: 'Expense Count', value: stats.count, icon: FileText }
            ].map((kpi, idx) => (
                <div key={idx} style={{
                  background: paper, border: `1.4px solid ${teal[100]}`, padding: 14, borderRadius: 14,
                  boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', alignItems: 'center', gap: 12
                }}>
                    <div style={{
                      padding: 8, borderRadius: 8, background: teal[50], color: teal[600]
                    }}>
                        <kpi.icon size={18}/>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 9, fontWeight: 800, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.1, margin: 0 }}>{kpi.label}</p>
                        <p style={{ fontSize: 14, fontWeight: 800, color: teal[800], margin: '2px 0 0', fontFamily: "'JetBrains Mono', monospace" }}>{kpi.value}</p>
                    </div>
                </div>
            ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'row', padding: '0 24px 24px', gap: 18 }}>
         <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: paper, border: `1.4px solid ${teal[100]}`, borderRadius: 14, overflow: 'hidden', minWidth: 0, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${hairline}`, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', flexShrink: 0, background: teal[50] }}>
               <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                 <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} size={14} />
                 <input type="text" placeholder="Search expenses..." style={{ ...inputStyle, paddingLeft: 30, fontSize: 12 }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
               </div>
               <select style={{ ...inputStyle, padding: '6px 30px 6px 10px', fontSize: 12, width: 'auto' }} value={dateFilter} onChange={e => setDateFilter(e.target.value as any)}>
                 <option>This Month</option><option>Last Month</option><option>All Time</option>
               </select>
               <select style={{ ...inputStyle, padding: '6px 30px 6px 10px', fontSize: 12, width: 'auto' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                 {categories.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
               <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{
                    background: teal[50], color: inkSoft, fontWeight: 700,
                    borderBottom: `1px solid ${hairline}`, position: 'sticky', top: 0, zIndex: 10, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.06
                  }}>
                    <tr>
                      <th style={{ padding: '10px 14px', width: 110 }}>Date</th>
                      <th style={{ padding: '10px 14px' }}>Description</th>
                      <th style={{ padding: '10px 14px' }}>Category</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody style={{ divideY: `1px solid ${hairline}` }}>
                     {filteredExpenses.length === 0 && (
                       <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: inkSoft, fontSize: 12 }}>No expenses found matching criteria.</td></tr>
                     )}
                     {filteredExpenses.map(exp => (
                        <tr key={exp.id} style={{ borderBottom: `1px solid ${hairline}`, cursor: 'pointer', transition: 'background .15s ease' }}
                          onMouseEnter={e => { e.currentTarget.style.background = teal[50]; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                           <td style={{ padding: '10px 14px', color: inkSoft, whiteSpace: 'nowrap', fontSize: 12 }} onClick={() => setSelectedExpense(exp)}>{new Date(exp.date).toLocaleDateString()}</td>
                           <td style={{ padding: '10px 14px', fontWeight: 600, color: ink, fontSize: 12 }} onClick={() => setSelectedExpense(exp)}>
                             {exp.description}
                             <div style={{ fontSize: 10, color: inkSoft, fontWeight: 500, display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                               {exp.id} &bull; By {exp.recordedBy}
                               {exp.paymentProofUrl && <Paperclip size={10} style={{ color: teal[600] }} />}
                             </div>
                           </td>
                           <td style={{ padding: '10px 14px' }} onClick={() => setSelectedExpense(exp)}>
                             <span style={{
                               display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 6,
                               fontSize: 10, fontWeight: 700, background: teal[50], color: teal[700], border: `1px solid ${teal[100]}`
                             }}>
                               {exp.category}
                             </span>
                           </td>
                           <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: teal[800], fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} onClick={() => setSelectedExpense(exp)}>
                             {currency}{exp.amount.toFixed(2)}
                           </td>
                           <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={() => setSelectedExpense(exp)}>
                                <span style={{
                                  padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                                  textTransform: 'uppercase', letterSpacing: 0.06, border: `1px solid ${exp.status === 'Paid' ? teal[100] : amber[100]}`,
                                  background: exp.status === 'Paid' ? teal[50] : amber[100],
                                  color: exp.status === 'Paid' ? teal[700] : amber[600]
                                }}>
                                    {exp.status || 'Paid'}
                                </span>
                           </td>
                           <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                    <button 
                                        onClick={() => setSelectedExpense(exp)}
                                        style={{
                                          padding: 6, color: inkSoft, background: 'transparent',
                                          border: 'none', borderRadius: 6, cursor: 'pointer',
                                          display: 'flex', alignItems: 'center', transition: 'all .15s ease'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = inkSoft; }}
                                        title="View Details"
                                    >
                                        <Eye size={14}/>
                                    </button>
                                </div>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
         <div style={{ width: 300, background: teal[50], borderRadius: 14, border: `1.4px solid ${teal[100]}`, display: 'flex', flexDirection: 'column', overflowY: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,.04)', padding: 16, gap: 16 }}>
            <div style={{ background: paper, borderRadius: 12, border: `1px solid ${teal[100]}`, padding: 16, position: 'relative', flexShrink: 0 }}>
              <h3 style={{ fontWeight: 700, color: teal[800], marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08 }}>
                <PieChart size={14} /> Category Breakdown
              </h3>
              <div style={{ width: '100%', height: 190, minHeight: 140, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%" minHeight={140} minWidth={0}>
                  <RePieChart>
                    <Pie data={stats.chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                      {stats.chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <ReTooltip formatter={(val: number) => `${currency}${val.toLocaleString()}`} />
                    <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{fontSize:'10px'}}/>
                  </RePieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', paddingBottom: 8 }}>
                  <div style={{ fontSize: 9, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.08 }}>Total</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: teal[800], fontFamily: "'JetBrains Mono', monospace" }}>{currency}{stats.total.toLocaleString()}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
              <h3 style={{ fontWeight: 700, color: teal[800], fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.08, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} style={{ color: amber[500] }} /> Smart Insights
              </h3>
              {stats.highestExpense && (
                <div style={{ background: paper, padding: 14, borderRadius: 12, border: `1px solid ${teal[100]}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowUpRight size={10} /> High Value
                  </div>
                  <p style={{ fontSize: 12, color: ink, marginBottom: 4, lineHeight: 1.5 }}>Largest single expense: <b>{stats.highestExpense.description}</b>.</p>
                  <div style={{ fontSize: 14, fontWeight: 800, color: teal[800], fontFamily: "'JetBrains Mono', monospace" }}>{currency}{stats.highestExpense.amount.toLocaleString()}</div>
                </div>
              )}
              <div style={{ background: paper, padding: 14, borderRadius: 12, border: `1px solid ${teal[100]}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: teal[700], textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileText size={10} /> Top Category
                </div>
                <p style={{ fontSize: 12, color: ink, lineHeight: 1.5 }}>
                  <b>{stats.chartData.length > 0 ? stats.chartData[0].name : 'None'}</b> accounts for the majority of costs.
                </p>
              </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Expenses;
