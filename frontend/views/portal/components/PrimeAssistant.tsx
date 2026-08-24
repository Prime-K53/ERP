import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, ChevronRight } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Explain invoice INV-1042',
  'Find quotation for Acme Corp',
  'Reorder stationery',
  'Track delivery',
  'Pay balance',
  'Generate quotation',
];

const PrimeAssistant: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hi! I\'m Prime AI. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    const responses = [
      'I found 3 invoices matching your request. The most recent is INV-1042 for K 12,400.',
      'I\'ve prepared a quotation draft. Would you like me to send it for approval?',
      'Your order #ORD-2024 is out for delivery and should arrive today.',
      'I can help with that. Please confirm the items and quantities you\'d like to reorder.',
    ];
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: responses[Math.floor(Math.random() * responses.length)]
    };
    setMessages(prev => [...prev, assistantMsg]);
    setLoading(false);
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 md:right-8 z-50 w-[90vw] md:w-[420px] glass-modal rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: 'min(560px, 80vh)', animation: 'scaleIn .2s cubic-bezier(.4,0,.2,1)' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
                style={{ background: 'linear-gradient(135deg, #1f8577, #0f544c)', boxShadow: '0 4px 10px -4px rgba(15,84,76,.4)' }}>
                <Sparkles size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Prime AI</div>
                <div className="text-[10px] text-slate-400">Always here to help</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Close assistant">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-slate-100 text-slate-800">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {messages.length === 1 && (
            <div className="px-4 pb-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2 px-1">Suggestions</div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => handleSend(s)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-brand-200 hover:text-brand-700 transition-all">
                    {s}
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="p-3 border-t border-slate-200/60">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/60 focus-within:border-brand-200 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask anything about your account..."
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 md:right-8 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          style={{ background: 'linear-gradient(135deg, #1f8577, #0f544c)', boxShadow: '0 10px 25px -8px rgba(15,84,76,.5)' }}
          aria-label="Open Prime AI assistant"
        >
          <Sparkles size={22} />
        </button>
      )}
    </>
  );
};

export default PrimeAssistant;
