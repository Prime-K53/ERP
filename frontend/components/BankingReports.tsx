import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import { 
  FileText, Download, Printer, Filter, Calendar, 
  TrendingUp, TrendingDown, ArrowRightLeft, CreditCard,
  AlertCircle, CheckCircle, DollarSign, PieChart,
  RefreshCw, ChevronDown, ChevronUp, Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBankingStore } from '../context/BankingContext';
import { bankingService } from '../services/bankingService';
import { BankTransaction, BankAccount } from '../types/banking';
import { PreviewModal } from '../views/shared/components/PDF/PreviewModal';
import { currencyService } from '../services/currencyService';

type ReportType = 
  | 'transaction' 
  | 'statement' 
  | 'reconciliation' 
  | 'cashflow' 
  | 'fees' 
  | 'category';

interface FilterOptions {
  startDate: string;
  endDate: string;
  type: BankTransaction['type'] | '';
  category: string;
  minAmount: string;
  maxAmount: string;
  reconciled: string;
}

const BankingReports: React.FC<{ selectedAccountId?: string }> = ({ selectedAccountId }) => {
  const { companyConfig } = useAuth();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
  const { accounts, transactions, reconciliations, fees, fetchBankingData } = useBankingStore();
  const [activeReport, setActiveReport] = useState<ReportType>('transaction');
  const [selectedAccount, setSelectedAccount] = useState<string>(selectedAccountId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const [reportDocPreviewOpen, setReportDocPreviewOpen] = useState(false);
  const [reportDocPreviewContent, setReportDocPreviewContent] = useState<React.ReactNode>(null);
  
  const [filters, setFilters] = useState<FilterOptions>({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: '',
    category: '',
    minAmount: '',
    maxAmount: '',
    reconciled: ''
  });

  // Set default account if provided
  useEffect(() => {
    if (selectedAccountId && accounts.length > 0) {
      setSelectedAccount(selectedAccountId);
    } else if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].id);
    }
  }, [accounts, selectedAccountId, selectedAccount]);

  // Get unique categories from transactions
  const categories = [...new Set(transactions.map(t => t.category).filter(Boolean))];

  const handleGenerateReport = async () => {
    if (!selectedAccount) return;
    
    setIsLoading(true);
    try {
      let data: any = null;

      const filterOptions = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        type: filters.type as BankTransaction['type'] | undefined,
        category: filters.category || undefined,
        minAmount: filters.minAmount ? parseFloat(filters.minAmount) : undefined,
        maxAmount: filters.maxAmount ? parseFloat(filters.maxAmount) : undefined,
        reconciled: filters.reconciled === 'true' ? true : filters.reconciled === 'false' ? false : undefined
      };

      switch (activeReport) {
        case 'transaction':
          data = await bankingService.generateTransactionReport(selectedAccount, filterOptions);
          break;
        case 'statement':
          data = await bankingService.generateAccountStatement(selectedAccount, filters.startDate, filters.endDate);
          break;
        case 'reconciliation':
          data = await bankingService.generateReconciliationReport(selectedAccount);
          break;
        case 'cashflow':
          data = await bankingService.generateCashFlowReport(selectedAccount, filters.startDate, filters.endDate);
          break;
        case 'fees':
          data = await bankingService.generateFeesReport(selectedAccount, filters.startDate, filters.endDate);
          break;
        case 'category':
          data = await bankingService.generateCategoryReport(selectedAccount, filters.startDate, filters.endDate);
          break;
      }

      setReportData(data);
    } catch (error) {
      logger.error('Failed to generate report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (!reportData || !selectedAccount) return;
    
    if (reportData.transactions) {
      await bankingService.exportTransactionsToCSV(selectedAccount, reportData.transactions);
    }
  };

  const handlePrint = () => {
    if (!reportData || !selectedAccount) return;
    
    const account = accounts.find(a => a.id === selectedAccount);
    const title = `${getReportTitle()} - ${account?.name || 'Bank Account'}`;
    
    const html = bankingService.generatePrintableHTML(title, reportData, {
      showSummary: true,
      showTransactions: true,
      dateRange: { start: filters.startDate, end: filters.endDate }
    });
    
    bankingService.printReport(html);
  };

  const handlePreview = () => {
    if (!reportData) return;
    
    setReportDocPreviewContent(renderReportPreview());
    setReportDocPreviewOpen(true);
  };

  const getReportTitle = () => {
    switch (activeReport) {
      case 'transaction': return 'Transaction Report';
      case 'statement': return 'Account Statement';
      case 'reconciliation': return 'Reconciliation Report';
      case 'cashflow': return 'Cash Flow Report';
      case 'fees': return 'Bank Fees Report';
      case 'category': return 'Category Analysis';
    }
  };

  const renderReportPreview = () => {
    if (!reportData) return null;
    
    return (
      <div className="p-4">
        <h3 className="text-lg font-bold mb-4">{getReportTitle()}</h3>
        <div className="text-sm text-slate-600 mb-4">
          Period: {filters.startDate} to {filters.endDate}
        </div>
        
        {reportData.summary && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            {Object.entries(reportData.summary).map(([key, value]) => (
              <div key={key} className="bg-slate-50 p-3 rounded">
                <div className="text-xs text-slate-500 uppercase">{key.replace(/([A-Z])/g, ' $1')}</div>
                <div className="text-lg font-semibold">
                  {typeof value === 'number' ? value.toLocaleString() : String(value)}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {reportData.transactions && (
          <div className="text-sm text-slate-500">
            {reportData.transactions.length} transactions
          </div>
        )}
      </div>
    );
  };

  const formatCurrency = (amount: number) => `${currency}${(amount || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'Deposit': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'Withdrawal': return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'Transfer': return <ArrowRightLeft className="w-4 h-4 text-blue-500" />;
      case 'Fee': return <CreditCard className="w-4 h-4 text-orange-500" />;
      case 'Interest': return <DollarSign className="w-4 h-4 text-purple-500" />;
      case 'Payment': return <CreditCard className="w-4 h-4 text-indigo-500" />;
      default: return <DollarSign className="w-4 h-4 text-gray-500" />;
    }
  };

  const reportTypes = [
    { id: 'transaction', label: 'Transactions', icon: FileText },
    { id: 'statement', label: 'Account Statement', icon: FileText },
    { id: 'reconciliation', label: 'Reconciliation', icon: CheckCircle },
    { id: 'cashflow', label: 'Cash Flow', icon: TrendingUp },
    { id: 'fees', label: 'Bank Fees', icon: CreditCard },
    { id: 'category', label: 'Category Analysis', icon: PieChart }
  ];

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Banking & Finance Reports
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Generate comprehensive reports for your banking activities
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Report Types */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Report Types</h2>
            </div>
            <div className="p-2">
              {reportTypes.map((report) => (
                <button
                  key={report.id}
                  onClick={() => { setActiveReport(report.id as ReportType); setReportData(null); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeReport === report.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <report.icon className={`w-4 h-4 ${activeReport === report.id ? 'text-blue-600' : 'text-slate-400'}`} />
                  {report.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Account Selection & Filters */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Report Options
              </h2>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                {showFilters ? 'Hide' : 'Show'} Filters
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Account Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Account
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select an account...</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.accountNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filters */}
              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                    />
                  </div>
                  
                  {(activeReport === 'transaction' || activeReport === 'cashflow') && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Transaction Type</label>
                        <select
                          value={filters.type}
                          onChange={(e) => setFilters({ ...filters, type: e.target.value as BankTransaction['type'] | '' })}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        >
                          <option value="">All Types</option>
                          <option value="Deposit">Deposit</option>
                          <option value="Withdrawal">Withdrawal</option>
                          <option value="Transfer">Transfer</option>
                          <option value="Payment">Payment</option>
                          <option value="Fee">Fee</option>
                          <option value="Interest">Interest</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                        <select
                          value={filters.category}
                          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        >
                          <option value="">All Categories</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Min Amount</label>
                        <input
                          type="number"
                          value={filters.minAmount}
                          onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Max Amount</label>
                        <input
                          type="number"
                          value={filters.maxAmount}
                          onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
                          placeholder="Any"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Reconciled</label>
                        <select
                          value={filters.reconciled}
                          onChange={(e) => setFilters({ ...filters, reconciled: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        >
                          <option value="">All</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Generate Button */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={handleGenerateReport}
                  disabled={!selectedAccount || isLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Generate Report
                    </>
                  )}
                </button>
                
                {reportData && (
                  <>
                    <button
                      onClick={handleExportCSV}
                      disabled={!reportData?.transactions}
                      className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      CSV
                    </button>
                    <button
                      onClick={handlePrint}
                      className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50"
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    <button
                      onClick={handlePreview}
                      className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50"
                    >
                      <Search className="w-4 h-4" />
                      Preview
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Report Results */}
          {reportData && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">{getReportTitle()}</h2>
                <p className="text-sm text-slate-500">
                  {filters.startDate} - {filters.endDate}
                </p>
              </div>

              <div className="p-4">
                {/* Summary Cards */}
                {reportData.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {activeReport === 'transaction' && (
                      <>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-green-600 uppercase">Total Deposits</div>
                          <div className="text-xl font-bold text-green-700">
                            {formatCurrency(reportData.summary.totalDeposits)}
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-red-600 uppercase">Total Withdrawals</div>
                          <div className="text-xl font-bold text-red-700">
                            {formatCurrency(reportData.summary.totalWithdrawals)}
                          </div>
                        </div>
                        <div className={`rounded-lg p-4 ${reportData.summary.netChange >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                          <div className="text-xs font-medium text-slate-600 uppercase">Net Change</div>
                          <div className={`text-xl font-bold ${reportData.summary.netChange >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                            {formatCurrency(reportData.summary.netChange)}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-slate-600 uppercase">Transactions</div>
                          <div className="text-xl font-bold text-slate-700">
                            {reportData.summary.transactionCount}
                          </div>
                        </div>
                      </>
                    )}
                    
                    {activeReport === 'statement' && reportData.statement && (
                      <>
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-slate-600 uppercase">Opening Balance</div>
                          <div className="text-xl font-bold text-slate-700">
                            {formatCurrency(reportData.statement.openingBalance)}
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-green-600 uppercase">Total Deposits</div>
                          <div className="text-xl font-bold text-green-700">
                            {formatCurrency(reportData.statement.totalDeposits)}
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-red-600 uppercase">Total Withdrawals</div>
                          <div className="text-xl font-bold text-red-700">
                            {formatCurrency(reportData.statement.totalWithdrawals)}
                          </div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-blue-600 uppercase">Closing Balance</div>
                          <div className="text-xl font-bold text-blue-700">
                            {formatCurrency(reportData.statement.closingBalance)}
                          </div>
                        </div>
                      </>
                    )}

                    {activeReport === 'cashflow' && reportData.cashFlow && (
                      <>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-green-600 uppercase">Total Inflow</div>
                          <div className="text-xl font-bold text-green-700">
                            {formatCurrency(reportData.cashFlow.totalInflow)}
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-red-600 uppercase">Total Outflow</div>
                          <div className="text-xl font-bold text-red-700">
                            {formatCurrency(reportData.cashFlow.totalOutflow)}
                          </div>
                        </div>
                        <div className={`rounded-lg p-4 ${reportData.cashFlow.netCashFlow >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                          <div className="text-xs font-medium text-slate-600 uppercase">Net Cash Flow</div>
                          <div className={`text-xl font-bold ${reportData.cashFlow.netCashFlow >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                            {formatCurrency(reportData.cashFlow.netCashFlow)}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-slate-600 uppercase">Closing Balance</div>
                          <div className="text-xl font-bold text-slate-700">
                            {formatCurrency(reportData.cashFlow.closingBalance)}
                          </div>
                        </div>
                      </>
                    )}

                    {activeReport === 'fees' && reportData.summary && (
                      <>
                        <div className="bg-orange-50 rounded-lg p-4 col-span-2">
                          <div className="text-xs font-medium text-orange-600 uppercase">Total Fees</div>
                          <div className="text-xl font-bold text-orange-700">
                            {formatCurrency(reportData.summary.totalFees)}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-slate-600 uppercase">Fee Count</div>
                          <div className="text-xl font-bold text-slate-700">
                            {reportData.summary.feeCount}
                          </div>
                        </div>
                      </>
                    )}

                    {activeReport === 'reconciliation' && reportData.summary && (
                      <>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-green-600 uppercase">Completed</div>
                          <div className="text-xl font-bold text-green-700">
                            {reportData.summary.completedCount}
                          </div>
                        </div>
                        <div className="bg-yellow-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-yellow-600 uppercase">Pending</div>
                          <div className="text-xl font-bold text-yellow-700">
                            {reportData.summary.pendingCount}
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-slate-600 uppercase">Total Reconciliations</div>
                          <div className="text-xl font-bold text-slate-700">
                            {reportData.summary.totalReconciliations}
                          </div>
                        </div>
                      </>
                    )}

                    {activeReport === 'category' && (
                      <>
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-green-600 uppercase">Total Income</div>
                          <div className="text-xl font-bold text-green-700">
                            {formatCurrency(reportData.totalIncome)}
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-red-600 uppercase">Total Expense</div>
                          <div className="text-xl font-bold text-red-700">
                            {formatCurrency(reportData.totalExpense)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Transactions Table */}
                {(reportData.transactions || reportData.fees) && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-3 px-2 font-medium text-slate-600">Date</th>
                          {activeReport !== 'fees' && (
                            <th className="text-left py-3 px-2 font-medium text-slate-600">Description</th>
                          )}
                          <th className="text-left py-3 px-2 font-medium text-slate-600">Type</th>
                          <th className="text-right py-3 px-2 font-medium text-slate-600">Amount</th>
                          {activeReport === 'fees' && (
                            <th className="text-left py-3 px-2 font-medium text-slate-600">Fee Type</th>
                          )}
                          {activeReport !== 'fees' && (
                            <>
                              <th className="text-left py-3 px-2 font-medium text-slate-600">Category</th>
                              <th className="text-center py-3 px-2 font-medium text-slate-600">Reconciled</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {(reportData.transactions || reportData.fees || []).slice(0, 50).map((item: any, index: number) => (
                          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-2">{formatDate(item.date)}</td>
                            {activeReport !== 'fees' && (
                              <td className="py-2 px-2 max-w-xs truncate">{item.description}</td>
                            )}
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1.5">
                                {getTransactionIcon(activeReport === 'fees' ? 'Fee' : item.type)}
                                {activeReport === 'fees' ? item.type : item.type}
                              </div>
                            </td>
                            <td className={`py-2 px-2 text-right font-medium ${
                              (activeReport === 'fees' ? item.amount : (item.type === 'Deposit' || item.type === 'Interest')) 
                                ? 'text-green-600' 
                                : 'text-red-600'
                            }`}>
                              {formatCurrency(item.amount)}
                            </td>
                            {activeReport === 'fees' && (
                              <td className="py-2 px-2">{item.description}</td>
                            )}
                            {activeReport !== 'fees' && (
                              <>
                                <td className="py-2 px-2">{item.category || '-'}</td>
                                <td className="py-2 px-2 text-center">
                                  {item.reconciled ? (
                                    <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-slate-300 mx-auto" />
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(reportData.transactions?.length || reportData.fees?.length || 0) > 50 && (
                      <div className="text-center py-3 text-sm text-slate-500">
                        Showing 50 of {reportData.transactions?.length || reportData.fees?.length} records
                      </div>
                    )}
                  </div>
                )}

                {/* Category Breakdown */}
                {activeReport === 'category' && reportData.categories && (
                  <div className="space-y-3">
                    {reportData.categories.map((cat: any, index: number) => (
                      <div key={index} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-slate-700">{cat.category}</span>
                            <span className="text-sm text-slate-600">{formatCurrency(cat.totalAmount)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${cat.type === 'Income' ? 'bg-green-500' : cat.type === 'Expense' ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-12 text-right">{cat.percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded">
                          {cat.transactionCount} txns
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reconciliations List */}
                {activeReport === 'reconciliation' && reportData.reconciliations && (
                  <div className="space-y-3">
                    {reportData.reconciliations.map((rec: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <div className="font-medium text-slate-700">{rec.startDate} - {rec.endDate}</div>
                          <div className="text-sm text-slate-500">
                            Book: {formatCurrency(rec.bookBalance)} | Bank: {formatCurrency(rec.endingBalance)}
                          </div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                          rec.status === 'Completed' ? 'bg-green-100 text-green-700' :
                          rec.status === 'In Progress' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {rec.status}
                        </div>
                      </div>
                    ))}
                    {reportData.reconciliations.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        No reconciliations found for this account
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!reportData && !isLoading && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-700 mb-2">Generate Your Report</h3>
              <p className="text-sm text-slate-500 mb-4">
                Select an account and configure filters to generate a banking report
              </p>
              <button
                onClick={handleGenerateReport}
                disabled={!selectedAccount}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Generate Sample Report
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      <PreviewModal 
        isOpen={reportDocPreviewOpen} 
        onClose={() => setReportDocPreviewOpen(false)} 
        title={getReportTitle()}
        content={reportDocPreviewContent}
      />
    </div>
  );
};

export default BankingReports;
