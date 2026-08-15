
import React from 'react';
import { Activity, FileText, Users, PieChart, Sparkles, BarChart3, ShieldCheck, Wallet } from 'lucide-react';
import GenericHub from './GenericHub';

const RevenueHub: React.FC = () => {
  const options = [
    {
      label: 'Dashboard',
      description: 'Overview of revenue streams, trends, and financial performance.',
      path: '/revenue/dashboard',
      icon: <Activity />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Sales Audit',
      description: 'Comprehensive history of all sales transactions and audit trails.',
      path: '/revenue/sales-audit',
      icon: <FileText />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'Markup Performance',
      description: 'Snapshot-based margin audit and adjustment performance analysis.',
      path: '/revenue/margin-performance',
      icon: <BarChart3 />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Rounding Analytics',
      description: 'Track potential and realized profit from inventory price rounding.',
      path: '/revenue/rounding-analytics',
      icon: <Activity />,
      color: 'bg-cyan-50 text-cyan-600'
    },
    {
      label: 'Client Ledger',
      description: 'Manage customer accounts, outstanding balances, and credit limits.',
      path: '/revenue/contacts',
      icon: <Users />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Wallet Statement',
      description: 'Customer wallet transaction history with running balance and statement export.',
      path: '/revenue/wallet-statement',
      icon: <Wallet />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Business Intel',
      description: 'Visual reports and analytics for sales performance and revenue trends.',
      path: '/revenue/intel',
      icon: <PieChart />,
      color: 'bg-purple-50 text-purple-500'
    },
    {
      label: 'Health Diagnostic',
      description: 'AI-powered deep analysis of your business health and strategic steps.',
      path: '/revenue/health',
      icon: <Sparkles />,
      color: 'bg-rose-50 text-rose-500'
    },
    {
      label: 'Internal Auditor',
      description: 'Verify transactions, reconcile accounts, and detect discrepancies.',
      path: '/revenue/auditor',
      icon: <ShieldCheck />,
      color: 'bg-slate-50 text-slate-600'
    }

  ];

  return (
    <GenericHub 
      title="Revenue" 
      subtitle="Monitor your income streams, customer accounts, and sales analytics."
      options={options}
      accentColor="#3b82f6"
    />
  );
};

export default RevenueHub;
