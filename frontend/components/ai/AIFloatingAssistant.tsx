import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { generateAIResponse } from '../../services/geminiService';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useSales } from '../../context/SalesContext';
import { useFinance } from '../../context/FinanceContext';
import { currencyService } from '../../services/currencyService';

const AIFloatingAssistant: React.FC = () => {
  const { companyConfig, user } = useAuth();
  const { inventory } = useInventory();
  const { customers, sales } = useSales();
  const { invoices, accounts } = useFinance();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Hi! Ask me anything about your business data.' },
  ]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const generateContext = useCallback(() => {
    const currency = currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
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
    return `
SYSTEM CONTEXT:
- Company: ${companyConfig?.companyName || 'Prime ERP'}
- User: ${user?.name || 'Admin'}
- Currency: ${currency}
- Current Date: ${new Date().toLocaleDateString()}

DATA SUMMARY:
- Inventory: ${inventory.length} items, total value: ${currency} ${inventory.reduce((sum: number, i: any) => sum + (i.cost * i.stock), 0).toLocaleString()}
- Customers: ${customers.length} total customers
- Invoices: ${invoices.length} total (${overdueCount} overdue, ${unpaidInvoices.length - overdueCount} unpaid/pending)
- Unpaid Receivables: ${currency} ${receivables.toLocaleString()}
- Sales Today: ${sales.filter((s: any) => new Date(s.date).toDateString() === new Date().toDateString()).length} transactions
- Accounts: ${accounts.length} chart of accounts

Provide concise, actionable insights. Use the data above to give specific numbers.
`;
  }, [inventory, customers, invoices, sales, accounts, companyConfig, user]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    const context = generateContext();
    try {
      const resp = await generateAIResponse(
        `${context}\n\nUser Question: ${q}`,
        `You are Prime ERP AI Assistant.

All responses must follow professional business-report formatting.

Structure:
1. Title
2. Executive Summary
3. Key Metrics (bullets)
4. Analysis
5. Recommendations
6. Next Actions

Never place multiple statistics in a single sentence.
Always use paragraphs, bullet points, tables, or sections.
Use Markdown formatting.
Highlight important numbers in bold.
Keep explanations concise but professional.`
      );
      setMessages(prev => [...prev, { role: 'assistant', content: resp }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error processing your request. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24, zIndex: 9999,
          width: 360, maxHeight: 500, background: '#fff', borderRadius: 20,
          boxShadow: '0 20px 60px rgba(15,23,42,0.18)', border: '1px solid rgba(15,23,42,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'kpi-slide-in 0.25s ease-out',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={16} color="#8b5cf6" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>AI Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }} title="Close" aria-label="Close AI assistant">
              <X size={16} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 340 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
                background: m.role === 'user' ? '#8b5cf6' : '#f1f5f9',
                color: m.role === 'user' ? '#fff' : '#0f172a',
                fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
              }}>{m.content}</div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 14, background: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
                <Loader2 size={14} className="animate-spin" /> Thinking...
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
              placeholder="Ask anything..."
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', fontSize: 13, outline: 'none', color: '#0f172a' }}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} style={{
              border: 'none', background: '#8b5cf6', color: '#fff', cursor: 'pointer', width: 38, height: 38, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading || !input.trim() ? 0.5 : 1,
            }} title="Send" aria-label="Send message"><Send size={16} /></button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        width: 52, height: 52, borderRadius: 16, border: 'none',
        background: '#8b5cf6', color: '#fff', cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(139,92,246,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s',
      }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title={open ? 'Close' : 'Open AI assistant'}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  );
};

export default AIFloatingAssistant;