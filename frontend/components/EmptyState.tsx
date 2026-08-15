import React from 'react';
import {
  FileText, Package, ShoppingCart, CreditCard, Banknote,
  BarChart3, Receipt, Users, Truck, CalendarDays,
  PlusCircle, ArrowRight, AlertCircle
} from 'lucide-react';
import { useFinancialYear } from '../context/FinancialYearContext';

type Module =
  | 'sales' | 'invoices' | 'purchases' | 'expenses' | 'income'
  | 'inventory' | 'banking' | 'payroll' | 'vat' | 'reports'
  | 'dashboard' | 'ledger' | 'budget' | 'transfers'
  | 'production' | 'customers' | 'suppliers' | 'employees'
  | 'journal' | 'statements' | 'tax';

interface EmptyStateProps {
  module: Module;
  actionLabel?: string;
  actionLink?: string;
  onAction?: () => void;
  compact?: boolean;
  searchTerm?: string;
  customTitle?: string;
  customDescription?: string;
}

const moduleConfig: Record<Module, { icon: React.ReactNode; title: string }> = {
  sales: { icon: <ShoppingCart size={48} />, title: 'No sales records found' },
  invoices: { icon: <Receipt size={48} />, title: 'No invoices found' },
  purchases: { icon: <Truck size={48} />, title: 'No purchase records found' },
  expenses: { icon: <Banknote size={48} />, title: 'No expenses found' },
  income: { icon: <CreditCard size={48} />, title: 'No income records found' },
  inventory: { icon: <Package size={48} />, title: 'No inventory items found' },
  banking: { icon: <CreditCard size={48} />, title: 'No bank transactions found' },
  payroll: { icon: <Users size={48} />, title: 'No payroll records found' },
  vat: { icon: <FileText size={48} />, title: 'No VAT transactions found' },
  reports: { icon: <BarChart3 size={48} />, title: 'No report data available' },
  dashboard: { icon: <BarChart3 size={48} />, title: 'No dashboard data available' },
  ledger: { icon: <FileText size={48} />, title: 'No ledger entries found' },
  budget: { icon: <BarChart3 size={48} />, title: 'No budget data found' },
  transfers: { icon: <ArrowRight size={48} />, title: 'No transfers found' },
  production: { icon: <Package size={48} />, title: 'No production records found' },
  customers: { icon: <Users size={48} />, title: 'No customers found' },
  suppliers: { icon: <Truck size={48} />, title: 'No suppliers found' },
  employees: { icon: <Users size={48} />, title: 'No employees found' },
  journal: { icon: <FileText size={48} />, title: 'No journal entries have been posted' },
  statements: { icon: <FileText size={48} />, title: 'No statements found' },
  tax: { icon: <Receipt size={48} />, title: 'No tax records found' },
};

const EmptyState: React.FC<EmptyStateProps> = ({
  module,
  actionLabel,
  onAction,
  compact = false,
  searchTerm,
  customTitle,
  customDescription,
}) => {
  const { selectedFinancialYear } = useFinancialYear();

  const cfg = moduleConfig[module];
  const fyLabel = selectedFinancialYear
    ? `${selectedFinancialYear.name || selectedFinancialYear.start_date?.slice(0, 4)}`
    : 'selected';

  const defaultDescriptions: Record<string, string> = {
    sales: `There are currently no sales transactions recorded for Financial Year ${fyLabel}. You can begin creating transactions immediately.`,
    invoices: `No invoices have been created for Financial Year ${fyLabel}. Create your first invoice to get started.`,
    purchases: `There are currently no purchase transactions recorded for Financial Year ${fyLabel}. No purchase records found.`,
    expenses: `There are currently no expenses recorded for Financial Year ${fyLabel}.`,
    income: `There are currently no income records for Financial Year ${fyLabel}.`,
    inventory: `No inventory movements have been recorded for Financial Year ${fyLabel}.`,
    banking: `No bank transactions have been recorded for Financial Year ${fyLabel}.`,
    payroll: `No payroll records found for Financial Year ${fyLabel}.`,
    vat: `No VAT transactions recorded for Financial Year ${fyLabel}.`,
    reports: `There is no report data available for Financial Year ${fyLabel}. All values will display as zero.`,
    dashboard: `No transactions have been recorded for Financial Year ${fyLabel}. Create your first transaction to see dashboard analytics.`,
    ledger: `No journal entries have been posted for Financial Year ${fyLabel}.`,
    budget: `No budget data has been configured for Financial Year ${fyLabel}.`,
    transfers: `No transfers have been made in Financial Year ${fyLabel}.`,
    production: `No production records found for Financial Year ${fyLabel}.`,
    journal: `No journal entries have been posted for Financial Year ${fyLabel}.`,
  };

  const isSearch = !!searchTerm;
  const title = customTitle || (isSearch ? `No results for "${searchTerm}"` : cfg.title);
  const description = customDescription || (isSearch
    ? `No records match your search. Try adjusting your search terms or clearing filters.`
    : (defaultDescriptions[module] || `No records found for Financial Year ${fyLabel}.`));

  if (compact) {
    return (
      <tr>
        <td colSpan={100}>
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="text-slate-200 mb-4">{cfg.icon}</div>
            <h3 className="text-base font-semibold text-slate-700 mb-2">{title}</h3>
            <p className="text-sm text-slate-400 max-w-md text-center mb-6">{description}</p>
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <PlusCircle size={16} />
                {actionLabel}
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm">
      <div className="text-slate-200 mb-5">{cfg.icon}</div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md text-center mb-8 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <PlusCircle size={16} />
          {actionLabel}
        </button>
      )}
      {selectedFinancialYear && !actionLabel && (
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-4">
          <CalendarDays size={14} />
          <span>Financial Year: {selectedFinancialYear.start_date} – {selectedFinancialYear.end_date}</span>
        </div>
      )}
    </div>
  );
};

export const TableEmptyState: React.FC<{
  module: Module;
  colSpan?: number;
  actionLabel?: string;
  onAction?: () => void;
  searchTerm?: string;
}> = ({ module, colSpan = 100, actionLabel, onAction, searchTerm }) => {
  const { selectedFinancialYear } = useFinancialYear();
  const cfg = moduleConfig[module];
  const fyLabel = selectedFinancialYear?.name || selectedFinancialYear?.start_date?.slice(0, 4) || 'selected';

  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="text-slate-200 mb-4">{cfg.icon}</div>
          <h3 className="text-base font-semibold text-slate-700 mb-2">
            {searchTerm ? `No results for "${searchTerm}"` : cfg.title}
          </h3>
          <p className="text-sm text-slate-400 max-w-md text-center mb-6">
            {searchTerm
              ? 'No records match your search. Try adjusting your search terms or clearing filters.'
              : `No records found for Financial Year ${fyLabel}. You can begin creating transactions immediately.`}
          </p>
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={16} />
              {actionLabel}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

export default EmptyState;
