
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, ArrowLeft } from 'lucide-react';

const routeNameMap: Record<string, string> = {
  'inventory': 'inventory',
  'supply-chain': 'supply chain',
  'industrial': 'industrial',
  'revenue': 'revenue',
  'sales-flow': 'sales flow',
  'sales-audit': 'sales audit',
  'intel': 'business intel',
  'procurement': 'procurement',
  'fiscal-reports': 'fiscal reports',
  'internal-tools': 'internal tools',
  'smart-operations': 'smart operations',
  'ai-analytics': 'AI Analytics',
  'ai-workspace': 'AI',
  'forecasting': 'forecasting',
  'purchases': 'procurement',
  'grn': 'goods received',
  'shipping': 'shipping manager',
  'bills': 'vendor bills',
  'pos': 'point of sale',
  'sales': 'sales',
  'orders': 'orders & quotes',
  'quotations': 'quotations',
  'invoices': 'invoices',
  'subscriptions': 'subscriptions',
  'receipts': 'receipts',
  'tasks': 'tasks',
  'sms': 'crm comms',
  'production': 'manufacturing',
  'work-orders': 'work orders',
  'shop-floor': 'shop floor',
  'scheduler': 'scheduler',
  'mrp': 'mrp logic',
  'bom': 'bom recipes',
  'maintenance': 'machine maintenance',
  'gang-run': 'gang run estimator',
  'accounts': 'accounting',
  'payments': 'bill payments',
  'expenses': 'expense log',
  'income': 'revenue log',
  'banking': 'banking hub',
  'payroll': 'payroll engine',
  'reconciliation': 'bank recon',
  'chart-of-accounts': 'chart of accounts',
  'financials': 'financials',
  'budgets': 'budgets',
  'reports': 'business intel',
  'contacts': 'client ledger',
  'audit': 'security log',
  'admin': 'admin',
  'users': 'user management',
  'profile': 'user profile',
  'settings': 'engine config',
  'import': 'data migration',
  'chat': 'chat hub',
  'architect': 'intelligence hub'
};

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathnames = location.pathname.split('/').filter((x) => x);

  // If we are on the dashboard, show nothing in the top bar
  if (pathnames.length === 0) {
      return null;
  }

  return (
    <div className="flex items-center gap-3">
      {pathnames.length > 1 && (
        <button 
          onClick={() => navigate(-1)} 
          className="p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-500 transition-all shadow-sm active:scale-95"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
      )}
      <nav className="flex items-center text-[13px] font-medium text-slate-500 overflow-hidden whitespace-nowrap">
        <Link to="/" className="hover:text-blue-600 transition-colors flex items-center">
          <Home size={14} className="mr-1.5" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        
        {pathnames.map((value, index) => {
          const to = `/${pathnames.slice(0, index + 1).join('/')}`;
          const isLast = index === pathnames.length - 1;
          
          // Determine name from map or state and ensure it's Title Case
          let name = (routeNameMap[value] || value);
          name = name.charAt(0).toUpperCase() + name.slice(1);
          if (isLast && location.state?.name) {
              name = location.state.name;
              name = name.charAt(0).toUpperCase() + name.slice(1);
          }

          return (
            <div key={to} className="flex items-center min-w-0">
              <ChevronRight size={14} className="mx-2 text-slate-300 flex-shrink-0" />
              {isLast ? (
                <span className="text-slate-800 font-bold truncate">
                  {name}
                </span>
              ) : (
                <Link to={to} className="hover:text-blue-600 transition-colors truncate">
                  {name}
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

export default Breadcrumbs;
