import React from 'react';
import { Table2, AlignJustify, LayoutGrid } from 'lucide-react';
import type { ViewMode } from '../hooks/useInventoryList';

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

const OPTIONS: { value: ViewMode; icon: React.ReactNode; label: string }[] = [
  { value: 'table', icon: <Table2 size={15} />, label: 'Table' },
  { value: 'compact', icon: <AlignJustify size={15} />, label: 'Compact' },
  { value: 'card', icon: <LayoutGrid size={15} />, label: 'Card' },
];

export const ViewToggle: React.FC<Props> = ({ value, onChange }) => (
  <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white">
    {OPTIONS.map((opt, i) => (
      <button key={opt.value} onClick={() => onChange(opt.value)}
        className={`flex items-center gap-[5px] px-[11px] py-[8px] border-none cursor-pointer transition-all text-sm ${
          i > 0 ? 'border-l border-slate-200' : ''
        } ${value === opt.value ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
        {opt.icon}
      </button>
    ))}
  </div>
);
