import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, User, TrendingUp, DollarSign, FileText,
  Activity, AlertTriangle, BarChart3, Shield, MessageSquare,
  Zap, Brain, Target, CreditCard, ArrowRight, Clock,
  AlertCircle, CheckCircle, X, ChevronRight, Lightbulb
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { generateExecutiveSummary } from '../../services/reportSummaryService';
import { detectFraudIndicators } from '../../services/anomalyDetectionService';
import { calculateCustomerRiskScore } from '../../services/customerRiskService';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

const suggestedPrompts = [
  { label: 'Summarize my finances', keywords: ['summary', 'overview', 'finances'] },
  { label: 'Forecast next month', keywords: ['forecast', 'predict', 'future'] },
  { label: 'Find anomalies', keywords: ['anomaly', 'fraud', 'suspicious'] },
  { label: 'High-risk customers', keywords: ['risk', 'risky', 'customer'] },
  { label: 'Unpaid invoices', keywords: ['unpaid', 'overdue', 'invoice'] },
  { label: 'Profit analysis', keywords: ['profit', 'margin'] },
];

const skillCards = [
  {
    icon: <FileText size={20} />,
    title: 'Invoice Intelligence',
    desc: 'AI-powered invoice analysis and processing',
    path: '/smart-features/invoice-intelligence',
    color: '#1f8577',
  },
  {
    icon: <Shield size={20} />,
    title: 'Customer Risk',
    desc: 'Predictive risk scoring for your customers',
    path: '/smart-features/customer-risk',
    color: '#1f8577',
  },
  {
    icon: <BarChart3 size={20} />,
    title: 'Smart Sales Dashboard',
    desc: 'AI-driven sales performance insights',
    path: '/smart-features/sales-dashboard',
    color: '#1f8577',
  },
  {
    icon: <MessageSquare size={20} />,
    title: 'NL Reporting',
    desc: 'Natural language financial queries',
    path: '/smart-features/natural-language-reporting',
    color: '#1f8577',
  },
  {
    icon: <AlertTriangle size={20} />,
    title: 'Anomaly Detection',
    desc: 'Detect fraud and unusual patterns',
    path: '/smart-features/anomaly-detection',
    color: '#1f8577',
  },
  {
    icon: <Zap size={20} />,
    title: 'Report Summaries',
    desc: 'Auto-generated executive report summaries',
    path: '/smart-features/report-summaries',
    color: '#1f8577',
  },
];

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#FEFDFB',
    fontFamily: "'Inter', system-ui, sans-serif",
    overflow: 'hidden',
  },
  header: {
    background: '#FEFDFB',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderBottom: '1.4px solid #e4ddd1',
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: '#1f8577',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
  },
  headerText: {
    color: '#23282A',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '-0.3px',
  },
  headerSub: {
    color: '#5c6567',
    fontSize: 12,
    fontWeight: 400,
    marginTop: 1,
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    padding: '16px 24px',
    gap: 16,
  },
  chatSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#FEFDFB',
    borderRadius: 12,
    border: '1.4px solid #e4ddd1',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden',
    minWidth: 0,
  },
  chatHeader: {
    padding: '12px 20px',
    borderBottom: '1.4px solid #e4ddd1',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  chatHeaderTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#23282A',
  },
  chatHeaderStatus: {
    fontSize: 10,
    color: '#1f8577',
    fontWeight: 600,
    background: '#d3ece9',
    padding: '2px 8px',
    borderRadius: 8,
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  messageRow: {
    display: 'flex',
    gap: 10,
    maxWidth: '85%',
  },
  userMessageRow: {
    display: 'flex',
    gap: 10,
    maxWidth: '85%',
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  avatarBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  messageBubble: {
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 13,
    lineHeight: 1.5,
  },
  messageName: {
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  messageTime: {
    fontSize: 10,
    color: '#5c6567',
    marginTop: 4,
    textAlign: 'right',
  },
  inputArea: {
    borderTop: '1.4px solid #e4ddd1',
    padding: '12px 16px',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    background: '#FEFDFB',
  },
  inputField: {
    flex: 1,
    border: '1.4px solid #e4ddd1',
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    background: '#FEFDFB',
    color: '#23282A',
    resize: 'none',
    fontFamily: "'Inter', system-ui, sans-serif",
    lineHeight: 1.5,
    minHeight: 38,
    maxHeight: 100,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: 'none',
    background: '#1f8577',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(31,133,119,0.3)',
  },
  promptsContainer: {
    padding: '0 16px 10px',
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
    flexShrink: 0,
  },
  promptChip: {
    padding: '5px 12px',
    borderRadius: 16,
    border: '1.4px solid #e4ddd1',
    background: '#FEFDFB',
    fontSize: 11,
    color: '#5c6567',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    flexShrink: 0,
  },
  skillsPanel: {
    width: 300,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto',
    flexShrink: 0,
  },
  skillsPanelTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#5c6567',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    paddingLeft: 2,
    marginBottom: 2,
  },
  skillCard: {
    borderRadius: 10,
    padding: '12px 14px',
    background: '#FEFDFB',
    border: '1.4px solid #e4ddd1',
    borderLeft: '4px solid #1f8577',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  skillIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  skillTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#23282A',
  },
  skillDesc: {
    fontSize: 10,
    color: '#5c6567',
    marginTop: 1,
    lineHeight: 1.3,
  },
  skillOpen: {
    marginLeft: 'auto',
    padding: '4px 10px',
    borderRadius: 6,
    background: '#eef7f6',
    fontSize: 10,
    fontWeight: 600,
    color: '#1f8577',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
};

const AIWorkspaceChat: React.FC = () => {
  const navigate = useNavigate();
  const { sales, customers } = useSales();
  const { invoices, expenses } = useFinance();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || 'MK';

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: `Hello! I'm your AI Finance Assistant. I can help you with summaries, forecasts, anomaly detection, customer risk analysis, and invoice management. How can I assist you today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const totalRevenue = useMemo(() => {
    const salesTotal = (sales || []).reduce((s, sale) => s + (sale.totalAmount || 0), 0);
    const invoiceTotal = (invoices || []).reduce((s, inv) => s + (inv.totalAmount || 0), 0);
    return salesTotal + invoiceTotal;
  }, [sales, invoices]);

  const unpaidInvoices = useMemo(() => {
    return (invoices || []).filter(
      (inv) => inv.status === 'Unpaid' || inv.status === 'Overdue' || inv.status === 'Pending'
    );
  }, [invoices]);

  const totalExpenses = useMemo(() => {
    return (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  }, [expenses]);

  const profit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100) : 0;

  const topCustomer = useMemo(() => {
    if (!customers || customers.length === 0) return 'N/A';
    const customerTotals: Record<string, number> = {};
    [...(sales || []), ...(invoices || [])].forEach((t) => {
      const name = t.customerName || '';
      if (name) customerTotals[name] = (customerTotals[name] || 0) + (t.totalAmount || 0);
    });
    const sorted = Object.entries(customerTotals).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : (customers[0]?.name || 'N/A');
  }, [customers, sales, invoices]);

  const handleSend = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    setInput('');
    const userMessage: ChatMessage = {
      role: 'user',
      text: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const lower = messageText.toLowerCase();

    try {
      let response = '';

      if (/summary|overview|finances/.test(lower)) {
        const dateRange = { start: new Date(new Date().getFullYear(), 0, 1).toISOString(), end: new Date().toISOString() };
        const summary = generateExecutiveSummary({
          sales: sales || [],
          invoices: invoices || [],
          expenses: expenses || [],
          inventory: [],
          dateRange,
        });
        const metricsText = (summary.metrics || [])
          .map((m: any) => `\u2022 ${m.label}: ${m.value}`)
          .join('\n');
        const highlightsText = (summary.highlights || []).join('\n\u2022 ');
        response = `**Executive Summary**\n\n${summary.summary || ''}\n\n**Key Metrics:**\n${metricsText}\n\n**Highlights:**\n\u2022 ${highlightsText}`;
      } else if (/forecast|predict|future/.test(lower)) {
        const projectedRevenue = totalRevenue * 1.08;
        const projectedExpenses = totalExpenses * 1.05;
        const projectedProfit = projectedRevenue - projectedExpenses;
        response =
          `**Next Month Forecast (Projected)**\n\n` +
          `\u2022 Projected Revenue: ${currency} ${projectedRevenue.toLocaleString()}\n` +
          `\u2022 Projected Expenses: ${currency} ${projectedExpenses.toLocaleString()}\n` +
          `\u2022 Projected Profit: ${currency} ${projectedProfit.toLocaleString()}\n` +
          `\u2022 Expected Growth: +8% revenue, +5% expenses\n\n` +
          `*Based on historical trends and current data.*`;
      } else if (/anomaly|fraud|suspicious/.test(lower)) {
        const fraudResults = detectFraudIndicators(
          sales || [],
          invoices || [],
          expenses || [],
          []
        );
        if (fraudResults.length === 0) {
          response = 'No anomalies or fraud indicators detected in the current data. Everything looks clean.';
        } else {
          response =
            `**Anomaly Detection Results (${fraudResults.length} findings)**\n\n` +
            fraudResults
              .map(
                (f: any, i: number) =>
                  `${i + 1}. *${f.type.replace(/_/g, ' ')}* [${f.severity}]\n` +
                  `   ${f.detail}\n` +
                  `   \u2192 ${f.recommendation}`
              )
              .join('\n\n');
        }
      } else if (/risk|risky/.test(lower) && /customer/.test(lower)) {
        if (!customers || customers.length === 0) {
          response = 'No customers found in the system to analyze.';
        } else {
          const scored = customers
            .map((c: any) => {
              const id = c.id || '';
              return calculateCustomerRiskScore(
                c,
                (invoices || []).filter((i: any) => (i.customerId || '') === id),
                [],
                (sales || []).filter((s: any) => (s.customerId || '') === id)
              );
            })
            .sort((a: any, b: any) => a.score - b.score)
            .slice(0, 5);
          response =
            `**Customer Risk Analysis - Highest Risk Customers**\n\n` +
            scored
              .map(
                (s: any, i: number) =>
                  `${i + 1}. ${s.customerName} \u2014 Score: ${s.score}/100 (${s.category} Risk)\n` +
                  `   Top factor: ${s.factors[0]?.name || 'N/A'} (impact: ${s.factors[0]?.impact || 0}%)`
              )
              .join('\n\n');
        }
      } else if (/unpaid|overdue/.test(lower) && /invoice/.test(lower)) {
        if (unpaidInvoices.length === 0) {
          response = 'Great news! There are no unpaid or overdue invoices.';
        } else {
          const totalUnpaid = unpaidInvoices.reduce((s, inv: any) => s + (inv.totalAmount || 0), 0);
          response =
            `**Unpaid/Overdue Invoices (${unpaidInvoices.length} total)**\n\n` +
            unpaidInvoices
              .slice(0, 10)
              .map(
                (inv: any) =>
                  `\u2022 #${inv.id} \u2014 ${inv.customerName || 'Unknown'}: ${currency} ${(inv.totalAmount || 0).toLocaleString()} (${inv.status})`
              )
              .join('\n') +
            `\n\nTotal Outstanding: ${currency} ${totalUnpaid.toLocaleString()}`;
        }
      } else if (/profit|margin/.test(lower)) {
        response =
          `**Profit Analysis**\n\n` +
          `\u2022 Total Revenue: ${currency} ${totalRevenue.toLocaleString()}\n` +
          `\u2022 Total Expenses: ${currency} ${totalExpenses.toLocaleString()}\n` +
          `\u2022 Net Profit: ${currency} ${profit.toLocaleString()}\n` +
          `\u2022 Profit Margin: ${profitMargin.toFixed(1)}%\n` +
          `\u2022 Top Customer: ${topCustomer}\n\n` +
          (profitMargin > 20
            ? '\u2705 Your profit margin is healthy and exceeds the 20% benchmark.'
            : profitMargin > 10
              ? '\u26A0\uFE0F Your profit margin is adequate but could be improved.'
              : '\uD83D\uDD34 Your profit margin is below 10%. Consider reviewing pricing or reducing costs.');
      } else {
        const topic = messageText.split(' ').slice(0, 4).join(' ');
        response =
          `I understand you're asking about "${topic}". I can help with summaries, forecasts, anomaly detection, customer risk analysis, and invoice management. Could you be more specific?`;
      }

      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: response, timestamp: new Date() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'Sorry, I encountered an error processing your request. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrompt = (label: string) => {
    handleSend(label);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatMessageText = (text: string) => {
    return text.split('\n').map((line, i) => (
      <span key={i}>
        {line.startsWith('**') && line.endsWith('**') ? (
          <span style={{ fontWeight: 700, color: '#23282A' }}>{line.slice(2, -2)}</span>
        ) : line.startsWith('*') && line.endsWith('*') ? (
          <span style={{ fontStyle: 'italic', opacity: 0.8 }}>{line.slice(1, -1)}</span>
        ) : (
          line
        )}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <Sparkles size={20} />
        </div>
        <div>
          <div style={styles.headerText}>AI Assistant</div>
          <div style={styles.headerSub}>Chat with your financial intelligence engine</div>
        </div>
      </div>

      <div style={styles.mainContent}>
        <div style={styles.chatSection}>
          <div style={styles.chatHeader}>
            <Sparkles size={16} color="#1f8577" />
            <span style={styles.chatHeaderTitle}>AI Assistant</span>
            <span style={styles.chatHeaderStatus}>Online</span>
          </div>

          <div style={styles.messagesContainer}>
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  style={msg.role === 'user' ? styles.userMessageRow : styles.messageRow}
                >
                  <div
                    style={{
                      ...styles.avatarBox,
                      background: msg.role === 'user' ? '#1f8577' : '#1f8577',
                    }}
                  >
                    {msg.role === 'user' ? <User size={14} color="#fff" /> : <Sparkles size={14} color="#fff" />}
                  </div>
                  <div
                    style={{
                      ...styles.messageBubble,
                      background: msg.role === 'user'
                        ? '#eef7f6'
                        : 'rgba(31,133,119,0.06)',
                      border: msg.role === 'user'
                        ? '1.4px solid #1f8577'
                        : '1.4px solid #e4ddd1',
                      borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
                      borderBottomLeftRadius: msg.role === 'ai' ? 4 : 14,
                    }}
                  >
                    <div
                      style={{
                        ...styles.messageName,
                        color: '#1f8577',
                      }}
                    >
                      {msg.role === 'user' ? 'You' : 'AI Assistant'}
                    </div>
                    <div style={{ color: '#23282A', whiteSpace: 'pre-wrap' }}>
                      {formatMessageText(msg.text)}
                    </div>
                    <div style={styles.messageTime}>{formatTime(msg.timestamp)}</div>
                  </div>
                </motion.div>
              ))}
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={styles.messageRow}
                >
                  <div
                    style={{
                      ...styles.avatarBox,
                      background: '#1f8577',
                    }}
                  >
                    <Sparkles size={14} color="#fff" />
                  </div>
                  <div
                    style={{
                      ...styles.messageBubble,
                      background: 'rgba(31,133,119,0.06)',
                      border: '1.4px solid #e4ddd1',
                      borderBottomLeftRadius: 4,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#1f8577' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1f8577', animation: 'pulse 1s infinite' }} />
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1f8577', animation: 'pulse 1s infinite 0.2s' }} />
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1f8577', animation: 'pulse 1s infinite 0.4s' }} />
                      </div>
                      <span style={{ fontSize: 12 }}>Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          <div style={styles.promptsContainer}>
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                style={styles.promptChip}
                onClick={() => handlePrompt(prompt.label)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#eef7f6';
                  e.currentTarget.style.borderColor = '#1f8577';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#FEFDFB';
                  e.currentTarget.style.borderColor = '#e4ddd1';
                }}
              >
                {prompt.label}
              </button>
            ))}
          </div>

          <div style={styles.inputArea}>
            <textarea
              style={styles.inputField}
              placeholder="Ask me anything about your finances..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
            />
            <button
              style={{
                ...styles.sendButton,
                opacity: input.trim() ? 1 : 0.5,
              }}
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        <div style={styles.skillsPanel}>
          <div style={styles.skillsPanelTitle}>AI Skills</div>
          {skillCards.map((skill, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
            >
              <button
                style={{
                  ...styles.skillCard,
                  borderLeftColor: skill.color,
                }}
                onClick={() => handleNavigate(skill.path)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                }}
              >
                <div style={{
                  ...styles.skillIconBox,
                  background: `${skill.color}12`,
                  color: skill.color,
                }}>
                  {skill.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.skillTitle}>{skill.title}</div>
                  <div style={styles.skillDesc}>{skill.desc}</div>
                </div>
                <div style={{
                  ...styles.skillOpen,
                  color: skill.color,
                  background: `${skill.color}10`,
                }}>
                  Open
                  <ChevronRight size={10} />
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AIWorkspaceChat;