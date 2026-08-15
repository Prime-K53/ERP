import React, { useState, useRef, useEffect } from 'react';
import { Loader2, MessageSquare, ArrowLeft, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSales } from '../../context/SalesContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useProduction } from '../../context/ProductionContext';
import { useAuth } from '../../context/AuthContext';
import { generateAIResponse } from '../../services/geminiService';
import { currencyService } from '../../services/currencyService';

interface Message { role: 'user' | 'assistant'; content: string; }

const EXAMPLE_QUESTIONS = [
  'What are my top 5 customers?',
  'Which items need reordering?',
  'Show me last 30 days income vs expenses',
  'How many active work orders do I have?',
];

const ConversationalQuery: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
  const { sales, customers } = useSales();
  const { inventory } = useInventory();
  const { invoices, expenses, income, ledger } = useFinance();
  const { workOrders } = useProduction();
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'Ask me anything about your business data — sales, inventory, finance, production.' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const buildContext = () => {
    const parts: string[] = [];
    const salesTotal = (sales || []).reduce((s: number, x: any) => s + Number(x.total_amount || x.total || 0), 0);
    parts.push(`Sales: ${(sales || []).length} transactions totaling ${currency}${Math.round(salesTotal)}`);
    const topCust = [...(customers || [])].slice(0, 5).map((c: any) => c.customer_name || c.name).filter(Boolean);
    if (topCust.length) parts.push(`Customers: ${topCust.join(', ')}`);
    const invVal = (inventory || []).reduce((s: number, i: any) => s + Number(i.quantity || 0) * Number(i.cost_per_unit || 0), 0);
    parts.push(`Inventory: ${(inventory || []).length} items valued at ${currency}${Math.round(invVal)}`);
    const exp30 = (expenses || []).filter((e: any) => e.expense_date && new Date(e.expense_date) > new Date(Date.now() - 30 * 86400000)).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const inc30 = (income || []).filter((i: any) => i.income_date && new Date(i.income_date) > new Date(Date.now() - 30 * 86400000)).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    parts.push(`Last 30 days: Expenses ${currency}${Math.round(exp30)}, Income ${currency}${Math.round(inc30)}`);
    const activeWO = (workOrders || []).filter((w: any) => w.status !== 'completed' && w.status !== 'cancelled').length;
    parts.push(`Active work orders: ${activeWO}`);
    return parts.join('\n');
  };

  const sendQuery = async (question?: string) => {
    const q = question || input;
    if (!q.trim() || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const context = buildContext();
      const systemPrompt = 'You are Prime ERP\'s AI business analyst. Answer concisely with specific numbers from the context provided.';
      const answer = await generateAIResponse(`Context:\n${context}\n\nQuestion: ${q}`, systemPrompt);
      setMessages(prev => [...prev, { role: 'assistant', content: answer || 'No answer available.' }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FEFDFB' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1.4px solid #e4ddd1', background: '#FEFDFB' }}>
        <button onClick={() => navigate('/ai-analytics')} style={{ padding: 8, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        ><ArrowLeft size={20} /></button>
        <MessageSquare color="#1f8577" size={24} />
        <div><h1 style={{ fontSize: 18, fontWeight: 700, color: '#23282A', margin: 0 }}>Conversational Query</h1><p style={{ fontSize: 11, color: '#5c6567', margin: 0 }}>Ask business questions in plain English</p></div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%', borderRadius: 16, padding: 12, background: msg.role === 'user' ? '#1f8577' : '#FEFDFB', border: msg.role === 'user' ? 'none' : '1.4px solid #e4ddd1', color: msg.role === 'user' ? '#fff' : '#23282A' }}>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div style={{ background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderRadius: 16, padding: 12 }}><Loader2 size={18} className="animate-spin" color="#1f8577" /></div></div>}
        <div ref={bottomRef} />
      </div>
      {messages.length === 1 && (
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ fontSize: 11, color: '#5c6567', marginBottom: 8, textAlign: 'center' }}>Try asking:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {EXAMPLE_QUESTIONS.map((q, i) => (
              <button key={i} onClick={() => sendQuery(q)} style={{ fontSize: 11, background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderRadius: 9999, padding: '6px 12px', color: '#5c6567', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1f8577'; e.currentTarget.style.color = '#1f8577' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.color = '#5c6567' }}
              >{q}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding: 16, borderTop: '1.4px solid #e4ddd1', background: '#FEFDFB' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendQuery()} placeholder="Ask a business question..." style={{ flex: 1, padding: '10px 16px', borderRadius: 12, border: '1.4px solid #e4ddd1', fontSize: 13, outline: 'none', background: '#FEFDFB', color: '#23282A' }} />
          <button onClick={() => sendQuery()} disabled={loading || !input.trim()} style={{ padding: '10px 16px', background: '#1f8577', color: '#fff', borderRadius: 12, border: 'none', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}
            onMouseEnter={e => { if (!loading && input.trim()) e.currentTarget.style.background = '#166b60' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1f8577' }}
          ><Send size={18} /></button>
        </div>
      </div>
    </div>
  );
};

export default ConversationalQuery;