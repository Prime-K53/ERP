import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, UserPlus, Save, Users } from 'lucide-react';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';

interface CustomerSearchProps {
  open: boolean;
  onSelect: (customer: { id: string; name: string } | null) => void;
  onClose: () => void;
  title?: string;
  excludeIds?: string[];
  showQuickAdd?: boolean;
  mode?: 'customer' | 'referrer';
}

export const CustomerSearch: React.FC<CustomerSearchProps> = ({
  open, onSelect, onClose, title = 'Select Customer',
  excludeIds = [], showQuickAdd = true, mode = 'customer'
}) => {
  const { companyConfig, notify } = useAuth();
  const { customers, addCustomer } = useSales();
  const { invoices } = useFinance();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const currency = companyConfig?.currencySymbol || '$';
  const isReferrer = mode === 'referrer';

  const headerAccent = isReferrer ? 'bg-[#B8863B]' : 'bg-[#2563EB]';
  const headerIcon = isReferrer ? Users : UserPlus;
  const badgeBg = isReferrer ? 'bg-[rgba(184,134,59,0.1)] text-[#B8863B] border-[rgba(184,134,59,0.25)]' : 'bg-[rgba(37,99,235,0.08)] text-[#2563EB] border-[rgba(37,99,235,0.2)]';

  useEffect(() => {
    if (open) {
      setSearchTerm('');
      setQuickAddOpen(false);
      setNewName('');
      setNewContact('');
      setHoveredId(null);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    if (quickAddOpen && listRef.current) {
      const qaForm = listRef.current.previousElementSibling as HTMLElement | null;
      qaForm?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [quickAddOpen]);

  const customerList = useMemo(() => {
    return (customers || []).filter((c: any) => !excludeIds.includes(c.id));
  }, [customers, excludeIds]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return customerList;
    const q = searchTerm.trim().toLowerCase();
    return customerList.filter((c: any) =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      (c.customerCode || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    );
  }, [customerList, searchTerm]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    onSelect({ id: '', name: newName });
    onClose();
  };

  const handleSelect = (c: any) => {
    onSelect({ id: c.id, name: c.name });
    onClose();
  };

  const getOutstanding = (customerId: string, customerName: string) => {
    return (invoices || [])
      .filter((i: any) => (i.customerId === customerId || i.customerName === customerName) && i.status !== 'Paid' && i.status !== 'Cancelled')
      .reduce((sum: number, i: any) => sum + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-[rgba(15,40,40,0.45)] flex items-center justify-center p-4 backdrop-blur-[3px]">
      <div className="w-full max-w-[580px] max-h-[82vh] flex flex-col overflow-hidden rounded-[14px] shadow-[0_25px_55px_-15px_rgba(16,43,40,0.35),0_0_0_1px_rgba(16,43,40,0.08)] bg-[#FEFDFB]">
        {/* ── Gold accent top bar ── */}
        <div className={`h-[3px] shrink-0 ${headerAccent}`} />

        {/* ── Header ── */}
        <div className="px-5 py-3.5 flex justify-between items-center bg-[#FBF8F2] border-b border-[#E4DFD1] shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-[8px] ${headerAccent} flex items-center justify-center`}>
              {React.createElement(headerIcon, { size: 15, className: 'text-white' })}
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[#23282A] leading-tight">{title}</h2>
              <p className="text-[10px] font-['JetBrains_Mono',monospace] text-[#666F6C] tracking-wide mt-[2px]">
                {filtered.length} record{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-[6px] text-[#666F6C] hover:text-[#D52B1E] hover:bg-[rgba(213,43,30,0.08)] transition-all"
            title="Close"
            aria-label={`Close ${title}`}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Search bar ── */}
        <div className="px-4 py-2.5 bg-[#FEFDFB] border-b border-[#E4DFD1] shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666F6C]" size={14} />
            <input
              ref={inputRef}
              type="text"
              placeholder={isReferrer ? 'Search referrers by name, phone, email…' : 'Search by name, phone, email, code…'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#E4DFD1] rounded-[8px] text-[13px] text-[#23282A] placeholder:text-[#666F6C] outline-none focus:border-[#2563EB] focus:bg-[#EFF6FF] transition-all font-['JetBrains_Mono',monospace]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#F4F5F8] text-[#666F6C] hover:text-[#23282A] transition-colors"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* ── Quick Add toolbar ── */}
        {showQuickAdd && !isReferrer && (
          <div className="px-4 py-2 bg-[#FEFDFB] border-b border-[#E4DFD1] flex justify-between items-center shrink-0">
            <span className="text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] font-['JetBrains_Mono',monospace]">
              Actions
            </span>
            <button
              onClick={() => setQuickAddOpen(!quickAddOpen)}
              className={`flex items-center gap-1.5 px-3 py-[6px] rounded-[7px] text-[12px] font-bold transition-all ${
                quickAddOpen
                  ? 'bg-[#F4F5F8] text-[#666F6C] border border-[#D4D7DC]'
                  : 'bg-[#2563EB] text-white border border-[#2563EB] hover:bg-[#1D4ED8] hover:shadow-[0_2px_8px_rgba(37,99,235,0.3)]'
              }`}
            >
              {quickAddOpen ? <X size={13} /> : <UserPlus size={13} />}
              {quickAddOpen ? 'Cancel' : 'New Customer'}
            </button>
          </div>
        )}

        {/* ── Quick Add Form ── */}
        {quickAddOpen && (
          <div className="px-4 py-3.5 bg-[#FBF8F2] border-b border-[#E4DFD1] shrink-0">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[5px] font-['JetBrains_Mono',monospace]">
                  Full Name <span className="text-[#D52B1E]">*</span>
                </label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-[7px] bg-white border border-[#E4DFD1] rounded-[7px] text-[13px] text-[#23282A] placeholder:text-[#666F6C] outline-none focus:border-[#2563EB] focus:bg-[#EFF6FF] transition-all"
                  placeholder="e.g. Acme Printing"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-[0.8px] uppercase text-[#666F6C] mb-[5px] font-['JetBrains_Mono',monospace]">
                  Contact
                </label>
                <input
                  value={newContact}
                  onChange={e => setNewContact(e.target.value)}
                  className="w-full px-3 py-[7px] bg-white border border-[#E4DFD1] rounded-[7px] text-[13px] text-[#23282A] placeholder:text-[#666F6C] outline-none focus:border-[#2563EB] focus:bg-[#EFF6FF] transition-all"
                  placeholder="Phone or Email"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!newName}
              onClick={handleQuickAdd}
              className="px-4 py-[7px] bg-[#2563EB] text-white rounded-[7px] text-[12px] font-bold hover:bg-[#1D4ED8] hover:shadow-[0_2px_8px_rgba(37,99,235,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all w-full justify-center"
            >
              <Save size={13} /> Save and Select
            </button>
          </div>
        )}

        {/* ── Customer List ── */}
        <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar bg-[#FEFDFB]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-6">
              <div className="w-12 h-12 rounded-full bg-[#F4F5F8] flex items-center justify-center mb-3">
                <Users size={20} className="text-[#666F6C] opacity-50" />
              </div>
              <p className="text-[13px] font-medium text-[#666F6C] text-center">
                {searchTerm ? `No matches for "${searchTerm}"` : 'No customers found'}
              </p>
              <p className="text-[11px] text-[#D4D7DC] mt-1 text-center">
                {searchTerm ? 'Try adjusting your search criteria' : 'Add a new customer to get started'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F0EFE8]">
              {filtered.map((c: any) => {
                const debt = getOutstanding(c.id, c.name);
                const isHovered = hoveredId === c.id;
                const initials = (c.name || '?').charAt(0).toUpperCase();
                const contactLine = c.phone || c.email || c.customerCode || '';

                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-all ${
                      isHovered ? 'bg-[#EFF6FF]' : 'bg-[#FEFDFB] hover:bg-[#F8F9FB]'
                    }`}
                  >
                    {/* Left: avatar + info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                        isHovered
                          ? 'bg-[#2563EB] text-white shadow-[0_2px_6px_rgba(37,99,235,0.3)]'
                          : 'bg-[#F4F5F8] text-[#666F6C] border border-[#E4DFD1]'
                      }`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-[#23282A] leading-tight truncate">
                          {c.name}
                        </div>
                        {contactLine && (
                          <div className="text-[11px] text-[#666F6C] font-['JetBrains_Mono',monospace] truncate mt-[1px]">
                            {contactLine}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: debt badge */}
                    <div className="shrink-0 text-right">
                      <div className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-[5px] text-[11px] font-bold font-['JetBrains_Mono',monospace] border ${
                        debt > 0
                          ? 'bg-[rgba(220,38,38,0.07)] text-[#DC2626] border-[rgba(220,38,38,0.18)]'
                          : 'bg-[rgba(22,163,74,0.07)] text-[#16A34A] border-[rgba(22,163,74,0.18)]'
                      }`}>
                        {debt > 0 ? '●' : '●'}
                        <span className="tabular-nums">{currency}{debt.toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-[#666F6C] font-bold tracking-wide uppercase mt-[2px]">
                        {debt > 0 ? 'Outstanding' : 'Settled'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer hint ── */}
        <div className="px-4 py-2 bg-[#FBF8F2] border-t border-[#E4DFD1] flex items-center justify-between shrink-0">
          <span className="text-[10px] text-[#D4D7DC] font-['JetBrains_Mono',monospace]">
            ↑↓ navigate · ↵ select · esc close
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-[4px] text-[10px] font-bold border ${badgeBg}`}>
            {isReferrer ? 'Referrer Mode' : 'Customer Mode'}
          </span>
        </div>
      </div>
    </div>
  );
};
