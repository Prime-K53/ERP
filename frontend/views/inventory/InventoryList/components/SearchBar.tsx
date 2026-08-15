import React from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<Props> = ({ value, onChange, placeholder = 'Search by name, SKU, barcode, brand, description…' }) => (
  <div className="relative flex-1 min-w-[220px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" />
    {value && (
      <button onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <X size={14} />
      </button>
    )}
  </div>
);
