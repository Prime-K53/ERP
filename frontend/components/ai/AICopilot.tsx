import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateAIResponse } from '../../services/geminiService';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { useProcurement } from '../../context/ProcurementContext';
import { executeQuery, interpretQuery, generateQuerySuggestions } from '../../services/naturalLanguageReportingService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function buildContext(sales: any[], inventory: any[], customers: any[], invoices: any[], accounts: any[], expenses: any[], income: any[], purchases: any[], companyName: string, userName: string): string {
  const unpaidInvoices = invoices.filter((inv: any) => {
    const s = String(inv.status || '').toLowerCase();
    return s !== 'cancelled' && s !== 'voided' && s !== 'draft' && (s === 'unpaid' || s === 'partial' || s === 'overdue');
  });
  const receivables = unpaidInvoices.reduce((sum: number, inv: any) => {
    const total = Number(inv.totalAmount) || 0;
    const paid = Number(inv.paidAmount) || 0;
    return sum + Math.max(0, total - paid);
  }, 0);
  const overdueCount = invoices.filter((i: any) => String(i.status || '').toLowerCase() === 'overdue').length;
  const totalRevenue = invoices
    .filter((i: any) => String(i.status || '').toLowerCase() !== 'cancelled')
    .reduce((s: number, i: any) => s + (Number(i.totalAmount) || 0), 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const totalIncome = income.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
  const inventoryValue = inventory.reduce((sum: number, i: any) => sum + ((i.cost || 0) * (i.stock || 0)), 0);
  const todaySales = sales.filter((s: any) => {
    const d = new Date(s.date);
    return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  });
  const todayRevenue = todaySales.reduce((s: number, sale: any) => s + (Number(sale.totalAmount) || Number(sale.total) || 0), 0);

  return `COMPANY: ${companyName}
USER: ${userName}
DATE: ${new Date().toLocaleDateString()}

INVENTORY: ${inventory.length} items, value MWK ${inventoryValue.toLocaleString()}
CUSTOMERS: ${customers.length} total
INVOICES: ${invoices.length} total (${overdueCount} overdue, ${unpaidInvoices.length - overdueCount} unpaid) — MWK ${receivables.toLocaleString()} outstanding
TOTAL REVENUE: MWK ${totalRevenue.toLocaleString()}
TOTAL EXPENSES: MWK ${totalExpenses.toLocaleString()}
TOTAL INCOME: MWK ${totalIncome.toLocaleString()}
TODAY SALES: ${todaySales.length} transactions, MWK ${todayRevenue.toLocaleString()}
ACCOUNTS: ${accounts.length} chart of accounts
PURCHASES: ${purchases.length} purchase records

Product sales data available: ${sales.length > 0 ? sales.length + ' sales records' : 'None'}
Customer payment data available: Yes`;
}

function formatQueryResult(result: any): string {
  const lines: string[] = [];

  if (result.summary) {
    lines.push(result.summary);
  }

  if (result.data && result.data.length > 0) {
    const sample = result.data.slice(0, 10);
    sample.forEach((row: any, i: number) => {
      const parts = result.columns.map((col: any) => {
        let val = row[col.key];
        if (val === null || val === undefined) return '-';
        if (col.type === 'currency') {
          const num = Number(val);
          return isNaN(num) ? String(val) : `MWK ${num.toLocaleString()}`;
        }
        if (col.type === 'number') {
          const num = Number(val);
          return isNaN(num) ? String(val) : num.toLocaleString();
        }
        if (col.type === 'date') {
          try { return new Date(val).toLocaleDateString(); } catch { return String(val); }
        }
        return String(val);
      });
      lines.push(`  ${i + 1}. ${parts.join(' | ')}`);
    });
    if (result.data.length > 10) {
      lines.push(`  ... and ${result.data.length - 10} more`);
    }
  }

  if (result.data && result.data.length === 0) {
    lines.push('No results found.');
  }

  return lines.join('\n');
}

function formatCurrency(amount: number): string {
  return `MWK ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AICopilot() {
  const { companyConfig, user } = useAuth();
  const { inventory } = useInventory();
  const { customers, sales } = useSales();
  const { invoices, accounts, expenses, income } = useFinance();
  const { purchases } = useProcurement();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: `Hi! I'm your AI Copilot. Ask me about your business data in plain English.` },
  ]);
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const typingRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const allData = { sales: sales || [], invoices: invoices || [], expenses: expenses || [], customers: customers || [], inventory: inventory || [], purchases: purchases || [] };

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = String(overrideText ?? input).trim();
    if (!text || typingRef.current) return;
    typingRef.current = true;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setTyping(true);

    await new Promise(resolve => setTimeout(resolve, 400));

    try {
      const interpreted = interpretQuery(text);
      const result = executeQuery(text, allData);

      if (result.type !== 'unknown' && result.data !== undefined) {
        setMessages(prev => [...prev, { role: 'assistant', content: formatQueryResult(result) }]);
      } else {
        const context = buildContext(
          sales || [], inventory || [], customers || [], invoices || [],
          accounts || [], expenses || [], income || [], purchases || [],
          companyConfig?.companyName || 'Prime ERP',
          user?.name || 'Admin'
        );
        const systemPrompt = `You are Prime ERP AI Assistant. Answer the user's business question using the provided data. Use plain text only — no markdown formatting, no "**" bold, no bullet symbols. Use numbers and MWK currency format. Be concise: 3-5 sentences max.`;
        const resp = await generateAIResponse(
          `${context}\n\nUser Question: ${text}`,
          systemPrompt
        );
        const cleaned = resp.replace(/\*\*/g, '').replace(/\*/g, '');
        setMessages(prev => [...prev, { role: 'assistant', content: cleaned }]);
      }
    } catch {
      const context = buildContext(
        sales || [], inventory || [], customers || [], invoices || [],
        accounts || [], expenses || [], income || [], purchases || [],
        companyConfig?.companyName || 'Prime ERP',
        user?.name || 'Admin'
      );
      try {
        const systemPrompt = `You are Prime ERP AI Assistant. Answer the user's business question using the provided data. Use plain text only — no markdown formatting, no "**" bold, no bullet symbols. Use numbers and MWK currency format. Be concise: 3-5 sentences max.`;
        const resp = await generateAIResponse(
          `${context}\n\nUser Question: ${text}`,
          systemPrompt
        );
        const cleaned = resp.replace(/\*\*/g, '').replace(/\*/g, '');
        setMessages(prev => [...prev, { role: 'assistant', content: cleaned }]);
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error processing your request. Please try again.' }]);
      }
    } finally {
      typingRef.current = false;
      setTyping(false);
    }
  }, [input, typing, sales, inventory, customers, invoices, accounts, expenses, income, purchases, companyConfig, user, allData]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
      const hasFinal = Array.from(e.results).some((r: any) => r.isFinal);
      if (hasFinal && transcript.trim()) {
        setTimeout(() => handleSendRef.current(transcript.trim()), 60);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open && listening) recognitionRef.current?.stop();
  }, [open, listening]);

  const toggleVoice = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    setInput('');
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              bottom: 80,
              right: 24,
              zIndex: 9999,
              width: 380,
              maxHeight: 500,
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
              border: '1px solid rgba(15,23,42,0.08)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="#3b82f6" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>AI Copilot</span>
              </div>
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex' }} aria-label="Close AI Copilot">
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 340 }}>
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: m.role === 'user' ? '#3b82f6' : '#1e293b',
                  color: '#fff',
                  fontSize: 13,
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}>
                  {typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}
                </div>
              ))}
              {typing && (
                <div style={{
                  alignSelf: 'flex-start',
                  padding: '12px 18px',
                  borderRadius: 14,
                  background: '#1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <Loader2 size={14} color="#94a3b8" className="animate-spin" />
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={listening ? 'Listening… speak now' : 'Ask about your business...'}
                style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', fontSize: 13, outline: 'none', color: '#0f172a' }}
              />
              {voiceSupported && (
                <button onClick={toggleVoice} style={{
                  border: 'none', background: listening ? '#ef4444' : '#f1f5f9', color: listening ? '#fff' : '#475569',
                  cursor: 'pointer', width: 38, height: 38, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: listening ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none',
                }} aria-label={listening ? 'Stop voice input' : 'Start voice input'} title={listening ? 'Stop voice input' : 'Voice command'}>
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              <button onClick={handleSend} disabled={typing || !input.trim()} style={{
                border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', width: 38, height: 38, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: typing || !input.trim() ? 0.5 : 1,
              }} aria-label="Send message">
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}>
        <div style={{
          position: 'absolute', inset: -8, borderRadius: '50%',
          border: '2px solid rgba(59,130,246,0.3)',
          animation: 'ai-pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite',
        }} />
        <button onClick={() => setOpen(o => !o)} style={{
          width: 48, height: 48, borderRadius: '50%', border: 'none',
          background: '#3b82f6', color: '#fff', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(59,130,246,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }} aria-label={open ? 'Close AI Copilot' : 'Open AI Copilot'}>
          {open ? <X size={20} /> : <Sparkles size={20} />}
        </button>
      </div>
      <style>{`
        @keyframes ai-pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </>
  );
}
