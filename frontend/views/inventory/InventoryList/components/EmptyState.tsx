import React from 'react';
import { Package, Search, Filter, Plus, ArrowLeft } from 'lucide-react';

interface Props {
  type: 'no_items' | 'no_search' | 'no_filters';
  onNewItem?: () => void;
  onResetFilters?: () => void;
  onClearSearch?: () => void;
}

export const EmptyState: React.FC<Props> = ({ type, onNewItem, onResetFilters, onClearSearch }) => {
  const configs = {
    no_items: {
      icon: <Package size={48} />,
      title: 'No items yet',
      description: 'Start building your inventory by adding your first item.',
      action: onNewItem && { label: 'New Item', icon: <Plus size={16} />, onClick: onNewItem, primary: true },
    },
    no_search: {
      icon: <Search size={48} />,
      title: 'No matching items',
      description: 'Try adjusting your search terms or clearing the search.',
      action: onClearSearch && { label: 'Clear Search', icon: <ArrowLeft size={16} />, onClick: onClearSearch, primary: false },
    },
    no_filters: {
      icon: <Filter size={48} />,
      title: 'No items match filters',
      description: 'Try removing some filters to see more items.',
      action: onResetFilters && { label: 'Reset Filters', icon: <Filter size={16} />, onClick: onResetFilters, primary: false },
    },
  };

  const cfg = configs[type];

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm p-10 text-center">
      <div className="mb-4 text-slate-300">{cfg.icon}</div>
      <h3 className="text-base font-semibold mb-1 text-slate-800">{cfg.title}</h3>
      <p className="text-sm mb-5 max-w-xs text-center text-slate-500 mx-auto">{cfg.description}</p>
      {cfg.action && (
        <button onClick={cfg.action.onClick}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            cfg.action.primary
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}>
          {cfg.action.icon} {cfg.action.label}
        </button>
      )}
    </div>
  );
};
