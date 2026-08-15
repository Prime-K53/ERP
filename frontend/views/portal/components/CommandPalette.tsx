import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, ShoppingCart, Receipt, Wallet, CreditCard, MessageSquare, User, TrendingUp, Truck, Users, FileBarChart, HelpCircle } from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  path: string;
  icon: React.ElementType;
  keywords?: string[];
  category: 'commerce' | 'billing' | 'finance' | 'logistics' | 'rewards' | 'account' | 'general';
}

const COMMANDS: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/portal/dashboard', icon: TrendingUp, keywords: ['home', 'overview'], category: 'general' },
  { id: 'orders', label: 'Orders', path: '/portal/orders', icon: ShoppingCart, keywords: ['purchase', 'buy'], category: 'commerce' },
  { id: 'invoices', label: 'Invoices', path: '/portal/invoices', icon: Receipt, keywords: ['billing', 'payments'], category: 'billing' },
  { id: 'statements', label: 'Account Statements', path: '/portal/account-statements', icon: FileBarChart, keywords: ['history', 'transactions', 'balance', 'credit', 'ledger', 'statements'], category: 'billing' },
  { id: 'payments', label: 'Receipt', path: '/portal/payments', icon: Receipt, keywords: ['pay', 'method'], category: 'finance' },
  { id: 'payment-options', label: 'Payment Options', path: '/portal/payment-options', icon: CreditCard, keywords: ['how to pay', 'bank', 'mobile money'], category: 'billing' },
  { id: 'wallet', label: 'Wallet', path: '/portal/wallet', icon: Wallet, keywords: ['balance', 'funds'], category: 'finance' },
  { id: 'deliveries', label: 'Deliveries & Tracking', path: '/portal/deliveries', icon: Truck, keywords: ['delivery', 'driver', 'vehicle', 'live tracking'], category: 'logistics' },
  { id: 'deliveries', label: 'Deliveries & Tracking', path: '/portal/deliveries', icon: Truck, keywords: ['delivery', 'driver', 'vehicle', 'live tracking'], category: 'logistics' },
  { id: 'referrals', label: 'Referrals', path: '/portal/referrals', icon: Users, keywords: ['rewards', 'earn'], category: 'rewards' },
  { id: 'support', label: 'Support', path: '/portal/support', icon: MessageSquare, keywords: ['help', 'contact'], category: 'account' },
  { id: 'profile', label: 'Profile', path: '/portal/profile', icon: User, keywords: ['account', 'settings'], category: 'account' },
];

const categoryOrder = ['general', 'commerce', 'billing', 'finance', 'logistics', 'rewards', 'account'];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    const q = query.toLowerCase();
    return COMMANDS.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.path.toLowerCase().includes(q) ||
      cmd.keywords?.some(k => k.includes(q))
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const cmd of filtered) {
      const arr = map.get(cmd.category) || [];
      arr.push(cmd);
      map.set(cmd.category, arr);
    }
    return categoryOrder.filter(cat => map.has(cat)).map(cat => ({ category: cat, items: map.get(cat)! }));
  }, [filtered]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl mx-4 glass-modal rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'scaleIn .2s cubic-bezier(.4,0,.2,1)' }}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60">
          <Search size={20} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, invoices, orders..."
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
            style={{ fontFamily: "'Inter', sans-serif" }}
          />
          <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
          {grouped.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No results found</div>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="mb-2">
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {group.category}
                </div>
                {group.items.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => { navigate(cmd.path); onClose(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-700 hover:bg-slate-100/80 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 text-slate-600">
                        <Icon.size size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">{cmd.label}</div>
                        <div className="text-xs text-slate-400 truncate">{cmd.path}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold">↑↓</kbd> Navigate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold">↵</kbd> Select
            </span>
          </div>
          <span>Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold">Ctrl+K</kbd> to open</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
