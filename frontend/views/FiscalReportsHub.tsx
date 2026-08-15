import React, { useState } from 'react';
import { BarChart3, FileBarChart, FileText, Scale, Target, FileCheck, TrendingUp, DollarSign, History, CheckCircle2, Activity, Coins } from 'lucide-react';
import GenericHub from './GenericHub';
import ReportOptionsModal from '../components/ReportOptionsModal';

const REPORT_TYPE_MAP: Record<string, { type: any; label: string }> = {
  'Profit & loss': { type: 'IncomeStatement', label: 'Profit & Loss Statement' },
  'Balance sheet': { type: 'BalanceSheet', label: 'Balance Sheet' },
  'Cash flow': { type: 'CashFlow', label: 'Statement of Cash Flows' },
  'Equity statement': { type: 'EquityStatement', label: 'Statement of Changes in Equity' },
  'Trial balance': { type: 'TrialBalance', label: 'Trial Balance' },
  'Budget analysis': { type: 'Budget', label: 'Budget Analysis' },
  'Aged receivables': { type: 'AgedAR', label: 'Aged Receivables' },
  'Aged reports': { type: 'AgedAP', label: 'Aged Payables' },
};

const FiscalReportsHub: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<{ type: any, label: string } | null>(null);

  const options = [
    {
      label: 'Profit & loss',
      description: 'Review revenue, expenses, and net profit over a specific period.',
      icon: <TrendingUp />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Profit & loss'])
    },
    {
      label: 'Balance sheet',
      description: 'Snapshot of assets, liabilities, and equity at a point in time.',
      icon: <Scale />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Balance sheet'])
    },
    {
      label: 'Cash flow',
      description: 'Track the flow of cash in and out of your business.',
      icon: <Activity />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Cash flow'])
    },
    {
      label: 'Trial balance',
      description: 'Verify the mathematical accuracy of your ledger balances.',
      icon: <FileCheck />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Trial balance'])
    },
    {
      label: 'Equity statement',
      description: 'Track changes in owner equity, capital contributions, and retained earnings.',
      icon: <Coins />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Equity statement'])
    },
    {
      label: 'Budget analysis',
      description: 'Compare actual spending against your planned budgets.',
      icon: <Target />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Budget analysis'])
    },
    {
      label: 'Aged receivables',
      description: 'Track outstanding customer invoices and their overdue status.',
      icon: <History />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Aged receivables'])
    },
    {
      label: 'Financials',
      description: 'Balance sheet, P&L, trial balance, and cash flow.',
      icon: <BarChart3 />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Aged reports',
      description: 'Aged receivables and payables analysis.',
      icon: <FileText />,
      color: 'bg-blue-50 text-blue-600',
      onClick: () => setSelectedReport(REPORT_TYPE_MAP['Aged reports'])
    }
  ];

  return (
    <>
      <GenericHub
        title="Fiscal reports"
        subtitle="Comprehensive financial oversight, auditing, and performance reporting."
        options={options}
        accentColor="#6366f1"
      />
      {selectedReport && (
        <ReportOptionsModal
          isOpen={!!selectedReport}
          onClose={() => setSelectedReport(null)}
          reportType={selectedReport.type}
          reportLabel={selectedReport.label}
        />
      )}
    </>
  );
};

export default FiscalReportsHub;
