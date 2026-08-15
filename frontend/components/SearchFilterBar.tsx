import React from 'react';
import { Search, Filter, X, ChevronDown } from 'lucide-react';

export interface FilterOption {
    value: string;
    label: string;
}

export interface FilterConfig {
    key: string;
    label: string;
    type: 'select' | 'date' | 'dateRange' | 'text';
    options?: FilterOption[];
    placeholder?: string;
}

interface SearchFilterBarProps {
    searchPlaceholder?: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    filters?: FilterConfig[];
    filterValues?: Record<string, any>;
    onFilterChange?: (key: string, value: any) => void;
    onClearFilters?: () => void;
    showFilters?: boolean;
    onToggleFilters?: () => void;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
    searchPlaceholder = 'e.g. INV-1001',
    searchValue,
    onSearchChange,
    filters = [],
    filterValues = {},
    onFilterChange,
    onClearFilters,
    showFilters = false,
    onToggleFilters
}) => {
    const activeFilterCount = Object.values(filterValues).filter(v => v && v !== '').length;

    return (
        <div className="space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all"
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    {searchValue && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {filters.length > 0 && (
                    <div className="flex gap-2">
                        <button
                            onClick={onToggleFilters}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                showFilters || activeFilterCount > 0
                                    ? 'bg-blue-50 border border-blue-200 text-blue-600'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <Filter size={16} />
                            Filters
                            {activeFilterCount > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                    {activeFilterCount}
                                </span>
                            )}
                            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </button>

                        {activeFilterCount > 0 && (
                            <button
                                onClick={onClearFilters}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all"
                            >
                                <X size={16} />
                                Clear
                            </button>
                        )}
                    </div>
                )}
            </div>

            {showFilters && filters.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {filters.map((filter) => (
                            <div key={filter.key}>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                    {filter.label}
                                </label>
                                {filter.type === 'select' && (
                                    <select
                                        value={filterValues[filter.key] || ''}
                                        onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors cursor-pointer"
                                    >
                                        <option value="">{filter.placeholder || 'All'}</option>
                                        {filter.options?.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                )}
                                {filter.type === 'text' && (
                                    <input
                                        type="text"
                                        placeholder={filter.placeholder}
                                        value={filterValues[filter.key] || ''}
                                        onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                                    />
                                )}
                                {filter.type === 'date' && (
                                    <input
                                        type="date"
                                        value={filterValues[filter.key] || ''}
                                        onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                                    />
                                )}
                                {filter.type === 'dateRange' && (
                                    <div className="flex gap-2">
                                        <input
                                            type="date"
                                            placeholder="From"
                                            value={filterValues[`${filter.key}From`] || ''}
                                            onChange={(e) => onFilterChange?.(`${filter.key}From`, e.target.value)}
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                                        />
                                        <input
                                            type="date"
                                            placeholder="To"
                                            value={filterValues[`${filter.key}To`] || ''}
                                            onChange={(e) => onFilterChange?.(`${filter.key}To`, e.target.value)}
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Common filter configurations
export const getInvoiceFilters = (customers: { id: string; name: string }[]): FilterConfig[] => [
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'Draft', label: 'Draft' },
        { value: 'Unpaid', label: 'Unpaid' },
        { value: 'Partial', label: 'Partial' },
        { value: 'Paid', label: 'Paid' },
        { value: 'Overdue', label: 'Overdue' },
        { value: 'Cancelled', label: 'Cancelled' }
    ]},
    { key: 'customer', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })), placeholder: 'All Customers' },
    { key: 'date', label: 'Date Range', type: 'dateRange' }
];

export const getQuotationFilters = (customers: { id: string; name: string }[]): FilterConfig[] => [
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'Draft', label: 'Draft' },
        { value: 'Sent', label: 'Sent' },
        { value: 'Accepted', label: 'Accepted' },
        { value: 'Rejected', label: 'Rejected' },
        { value: 'Expired', label: 'Expired' },
        { value: 'Converted', label: 'Converted' }
    ]},
    { key: 'customer', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })), placeholder: 'All Customers' },
    { key: 'date', label: 'Date Range', type: 'dateRange' }
];

export const getOrdersFilters = (customers: { id: string; name: string }[]): FilterConfig[] => [
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'Pending', label: 'Pending' },
        { value: 'Processing', label: 'Processing' },
        { value: 'Completed', label: 'Completed' },
        { value: 'Cancelled', label: 'Cancelled' }
    ]},
    { key: 'customer', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })), placeholder: 'All Customers' },
    { key: 'date', label: 'Date Range', type: 'dateRange' }
];

export const getExchangeFilters = (): FilterConfig[] => [
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'completed', label: 'Completed' }
    ]},
    { key: 'type', label: 'Type', type: 'select', options: [
        { value: 'return', label: 'Return' },
        { value: 'replacement', label: 'Replacement' },
        { value: 'reprint', label: 'Reprint' }
    ]},
    { key: 'date', label: 'Date Range', type: 'dateRange' }
];

export const getSubscriptionFilters = (): FilterConfig[] => [
    { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'Active', label: 'Active' },
        { value: 'Paused', label: 'Paused' },
        { value: 'Cancelled', label: 'Cancelled' },
        { value: 'Expired', label: 'Expired' }
    ]},
    { key: 'frequency', label: 'Frequency', type: 'select', options: [
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'yearly', label: 'Yearly' }
    ]}
];

export const getPaymentFilters = (customers: { id: string; name: string }[]): FilterConfig[] => [
    { key: 'method', label: 'Payment Method', type: 'select', options: [
        { value: 'Cash', label: 'Cash' },
        { value: 'Card', label: 'Card' },
        { value: 'Bank Transfer', label: 'Bank Transfer' },
        { value: 'Mobile Money', label: 'Mobile Money' },
        { value: 'Wallet', label: 'Wallet' }
    ]},
    { key: 'customer', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })), placeholder: 'All Customers' },
    { key: 'date', label: 'Date Range', type: 'dateRange' }
];

export default SearchFilterBar;
