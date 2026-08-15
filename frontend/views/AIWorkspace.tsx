import React from 'react';
import {
  LayoutDashboard, MessageSquare, FileText, Shield,
  BarChart3, TrendingUp, AlertTriangle, MessageSquareText,
  Sparkles, Brain, Zap, Layers, Users, Package,
  FileSearch, Calendar, Activity
} from 'lucide-react';
import GenericHub from './GenericHub';

const AIWorkspace: React.FC = () => {
  const options = [
    {
      label: 'Dashboard',
      description: 'Real-time financial KPIs, AI insights, revenue charts, and activity timeline.',
      path: '/ai-workspace/dashboard',
      icon: <LayoutDashboard />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'AI Assistant',
      description: 'Conversational AI for summaries, forecasts, anomaly detection, and risk analysis.',
      path: '/ai-workspace/assistant',
      icon: <MessageSquare />,
      color: 'bg-violet-50 text-violet-500'
    },
    {
      label: 'Gang Run Optimizer',
      description: 'Group similar print jobs to reduce setup waste and maximize press utilization.',
      path: '/ai-workspace/gang-run',
      icon: <Layers />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Cash Flow Forecaster',
      description: 'ML-based cash flow projections from AR, AP, invoices, and historical trends.',
      path: '/ai-workspace/cash-flow',
      icon: <TrendingUp />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Anomaly Detector',
      description: 'Flag unusual transactions, pricing overrides, and security events.',
      path: '/ai-workspace/anomalies',
      icon: <AlertTriangle />,
      color: 'bg-red-50 text-red-500'
    },
    {
      label: 'Churn Predictor',
      description: 'Identify at-risk customers from declining order patterns and engagement.',
      path: '/ai-workspace/churn',
      icon: <Users />,
      color: 'bg-orange-50 text-orange-500'
    },
    {
      label: 'Reorder Optimizer',
      description: 'Smart inventory reorder points with EOQ, safety stock, and demand variability.',
      path: '/ai-workspace/reorder',
      icon: <Package />,
      color: 'bg-cyan-50 text-cyan-500'
    },
    {
      label: 'PO Matcher',
      description: '3-way matching: Purchase Orders vs Goods Receipts vs Supplier Invoices.',
      path: '/ai-workspace/po-match',
      icon: <FileSearch />,
      color: 'bg-violet-50 text-violet-500'
    },
    {
      label: 'Smart Scheduler',
      description: 'Constraint-based production scheduling across work centers and resources.',
      path: '/ai-workspace/scheduler',
      icon: <Calendar />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'Conversational Query',
      description: 'Ask business questions in plain English — get instant answers.',
      path: '/ai-workspace/query',
      icon: <MessageSquareText />,
      color: 'bg-purple-50 text-purple-500'
    },
    {
      label: 'Audit Investigator',
      description: 'AI-powered audit trail analysis with integrity verification.',
      path: '/ai-workspace/audit',
      icon: <Shield />,
      color: 'bg-slate-50 text-slate-500'
    },
    {
      label: 'BOM Generator',
      description: 'Auto-generate Bill of Materials from product specifications.',
      path: '/ai-workspace/bom',
      icon: <FileText />,
      color: 'bg-teal-50 text-teal-500'
    },
    {
      label: 'Invoice Intelligence',
      description: 'AI-powered invoice analysis, processing, and pattern recognition.',
      path: '/smart-features/invoice-intelligence',
      icon: <FileText />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Customer Risk Score',
      description: 'Predictive risk scoring and payment behavior analysis for customers.',
      path: '/smart-features/customer-risk',
      icon: <Shield />,
      color: 'bg-amber-50 text-amber-500'
    },
    {
      label: 'Smart Sales Dashboard',
      description: 'AI-driven sales performance insights and revenue trend forecasting.',
      path: '/smart-features/sales-dashboard',
      icon: <BarChart3 />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'NL Reporting',
      description: 'Natural language queries to explore financial data conversationally.',
      path: '/smart-features/natural-language-reporting',
      icon: <MessageSquareText />,
      color: 'bg-teal-50 text-teal-500'
    },
    {
      label: 'Accounting Assistant',
      description: 'Automated journal entries, reconciliation, and ledger analysis.',
      path: '/smart-features/accounting-assistant',
      icon: <Brain />,
      color: 'bg-cyan-50 text-cyan-500'
    },
    {
      label: 'Anomaly Detection',
      description: 'Detect fraud indicators, unusual patterns, and suspicious transactions.',
      path: '/smart-features/anomaly-detection',
      icon: <AlertTriangle />,
      color: 'bg-rose-50 text-rose-500'
    },
    {
      label: 'Report Summaries',
      description: 'Auto-generated executive summaries with key metrics and highlights.',
      path: '/smart-features/report-summaries',
      icon: <Zap />,
      color: 'bg-sky-50 text-sky-500'
    },
    {
      label: 'Advanced Data Table',
      description: 'Comprehensive data grid with filtering, sorting, and export capabilities.',
      path: '/smart-features/advanced-data-table',
      icon: <Sparkles />,
      color: 'bg-purple-50 text-purple-500'
    },
  ];

  return (
    <GenericHub
      title="AI Workspace"
      subtitle="Command your financial intelligence — AI-powered tools for analysis, prediction, and automation."
      options={options}
      accentColor="#6366f1"
    />
  );
};

export default AIWorkspace;
