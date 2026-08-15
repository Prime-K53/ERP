
import React, { createContext, useContext, useEffect } from 'react';
import { useFinanceStore } from '../stores/financeStore';
import { useSalesStore } from '../stores/salesStore';
import { useInventoryStore } from '../stores/inventoryStore'; 
import { Account, LedgerEntry, Invoice, Expense, RecurringInvoice, ScheduledPayment, WalletTransaction, DeliveryNote, Budget, Transfer, Employee, PayrollRun, Payslip, Income, Cheque, ZReport, SupplierPayment, CustomerPayment } from '../types';
import { useAuth } from './AuthContext'; 
import { transactionService } from '../services/transactionService';
import { dbService } from '../services/db';
import { roundFinancial, generateNextId, formatNumber } from '../utils/helpers';
import { generateNextSalesInvoiceNumber } from '../services/documentNumberService';
import { isBefore, isWithinInterval, parseISO } from 'date-fns';
import { logger } from '../services/logger';
import { workflowService } from '../services/workflowService';
import { workflowService as autoWorkflowService } from '../services/automatedWorkflowService';
import { customerNotificationService } from '../services/customerNotificationService';

interface FinanceContextType {
  accounts: Account[];
  ledger: LedgerEntry[];
  invoices: Invoice[];
  recurringInvoices: RecurringInvoice[];
  expenses: Expense[];
  income: Income[];
  scheduledPayments: ScheduledPayment[];
  walletTransactions: WalletTransaction[];
  deliveryNotes: DeliveryNote[];
  openingBalance: number;
  budgets: Budget[];
  transfers: Transfer[];
  employees: Employee[];
  payrollRuns: PayrollRun[];
  payslips: Payslip[];
  cheques: Cheque[];
  supplierPayments: SupplierPayment[];
  customerPayments: CustomerPayment[];
  
  addAccount: (account: Account) => void;
  updateAccount: (account: Account) => void;
  deleteAccount: (id: string) => void;
  
  addInvoice: (invoice: Invoice) => Promise<string>;
  updateInvoice: (invoice: Invoice) => void;
  deleteInvoice: (id: string) => Promise<void>; 
  
  addExpense: (expense: Expense) => Promise<void>;
  approveExpense: (id: string) => Promise<void>;
  
  addIncome: (income: Income) => Promise<void>;
  updateIncome: (income: Income) => void;
  deleteIncome: (id: string) => void;
  
  postJournalEntry: (entries: Omit<LedgerEntry, 'id' | 'date'>[]) => Promise<void>;
  syncInventoryValuation: (accountId: string, physicalValue: number, currentLedgerBalance: number) => Promise<void>;
  toggleReconciled: (id: string) => void;
  
  addRecurringInvoice: (inv: RecurringInvoice) => void;
  deleteRecurringInvoice: (id: string) => void;
  updateRecurringInvoice: (inv: RecurringInvoice) => void;
  
  addScheduledPayment: (payment: ScheduledPayment) => void;
  updateScheduledPayment: (payment: ScheduledPayment) => void;
  
  createDeliveryNote: (invoiceId: string) => Promise<string | null>;
  updateDeliveryNote: (note: DeliveryNote) => void;
  deleteDeliveryNote: (id: string) => void;
  
  saveBudget: (budget: Budget) => void;
  updateOpeningBalance: (amount: number) => void;

  executeTransfer: (transfer: Transfer) => void;
  
  addEmployee: (emp: Employee) => void;
  updateEmployee: (emp: Employee) => void;
  deleteEmployee: (id: string) => void;
  
  runPayroll: (month: string, date: string, employees: Employee[]) => void;
  
  addCheque: (cheque: Cheque) => void;
  updateCheque: (cheque: Cheque) => void;
  deleteCheque: (id: string) => void;

  recordSupplierPayment: (payment: SupplierPayment) => Promise<void>;
  updateSupplierPayment: (payment: SupplierPayment) => Promise<void>;
  voidSupplierPayment: (id: string) => Promise<void>;

  postZReportToLedger: (report: ZReport, targetAccountId: string) => Promise<void>;
  fetchFinanceData: () => Promise<void>;
  checkAndApplyLateFees: () => Promise<void>;
  closeFinancialYear: (year: number) => Promise<void>;
  runMonthEndClosing: (month: string) => Promise<void>;
  formatNumber: (num: number) => string;
  updateCustomerPayment: (payment: CustomerPayment, reason?: string) => Promise<void>;
  addCustomerPayment: (payment: CustomerPayment) => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const financeStore = useFinanceStore();
  const salesStore = useSalesStore();
  const inventoryStore = useInventoryStore(); 
  const { companyConfig, notify, addAuditLog, auditLogs, user, isInitialized } = useAuth();

  const gl = companyConfig?.glMapping || {
    defaultSalesAccount: '4000',
    defaultInventoryAccount: '1200',
    defaultCOGSAccount: '5000',
    accountsReceivable: '1100',
    accountsPayable: '2000',
    cashDrawerAccount: '1000',
    bankAccount: '1050',
    salesReturnAccount: '4100',
    customerDepositAccount: '2200',
    otherIncomeAccount: '4900',
    defaultExpenseAccount: '6100',
    defaultLaborWagesAccount: '6300',
    retainedEarningsAccount: '3000',
    defaultWasteAccount: '6100'
  };

  useEffect(() => {
    if (!isInitialized) return;

    // Auth initialized, fetching finance data
    financeStore.fetchFinanceData().catch(err => {
      notify("Financial database busy or unavailable.", "info");
    });
  }, [isInitialized]);

  useEffect(() => {
    if (user && financeStore.openingBalance > 0) {
        const hasOpeningPost = financeStore.ledger.some(l => l.referenceId === 'OPENING_BALANCE');
        if (!hasOpeningPost) {
            postJournalEntry([{
                description: 'System Initialization: Opening Cash Balance',
                debitAccountId: gl.cashDrawerAccount || '1000', 
                creditAccountId: '3000', 
                amount: financeStore.openingBalance,
                referenceId: 'OPENING_BALANCE',
                reconciled: true
            }]);
        }
    }
  }, [user, financeStore.openingBalance, financeStore.ledger.length]);

  const isPeriodClosed = (dateStr: string) => {
    const entryDate = parseISO(dateStr);
    const lastClosing = auditLogs.find(log => log.action === 'PERIOD_CLOSE');
    if (!lastClosing) return false;
    return isBefore(entryDate, parseISO(lastClosing.date));
  };

  const postJournalEntry = async (entries: Omit<LedgerEntry, 'id' | 'date'>[]) => {
      try {
        await transactionService.postJournalEntry(entries);
        await financeStore.fetchFinanceData();
      } catch (err: any) {
        notify(`Ledger Posting Failed: ${err.message}`, "error");
      }
  };

  const syncInventoryValuation = async (accountId: string, physicalValue: number, currentLedgerBalance: number) => {
      try {
          await transactionService.syncInventoryValuation(accountId, physicalValue, currentLedgerBalance);
          await financeStore.fetchFinanceData();
          notify(`Inventory valuation synchronized with ledger`, 'success');
          addAuditLog({
              action: 'UPDATE',
              entityType: 'Ledger',
              entityId: accountId,
              details: `Synced inventory ledger (${currentLedgerBalance}) with physical valuation (${physicalValue})`
          });
      } catch (err: any) {
          notify(`Sync Error: ${err.message}`, 'error');
      }
  };

  const runPayroll = async (month: string, date: string, employeesToPay: Employee[]) => {
      const runId = generateNextId('PAY', financeStore.payrollRuns, companyConfig);
      let totalBasic = 0;
      const slips: Payslip[] = [];

      employeesToPay.forEach(emp => {
          totalBasic += emp.basicSalary;
            const slip: Payslip = {
                id: `SLIP-${emp.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                payrollRunId: runId,
                employeeId: emp.id,
                employeeName: emp.name,
                date: date,
                basicSalary: emp.basicSalary,
                allowances: 0,
                deductions: 0,
                netPay: emp.basicSalary,
                status: 'Paid',
                amount: emp.basicSalary,
                period: month
            };
          slips.push(slip);
      });

      const run: PayrollRun = {
            id: runId,
            month,
            date,
            totalBasic,
            totalAllowances: 0,
            totalDeductions: 0,
            totalNetPay: totalBasic,
            status: 'Paid',
            employeeCount: employeesToPay.length,
            period: month,
            employees: employeesToPay,
            totalAmount: totalBasic
      };

      await financeStore.addPayrollRun(run);
      await financeStore.addPayslips(slips);

      // Ledger: Wage Expense vs Bank/Wages Payable
      await postJournalEntry([{
          description: `Payroll Run: ${month} (${employeesToPay.length} employees)`,
          debitAccountId: gl.defaultLaborWagesAccount || '6300', // Labor Wages
          creditAccountId: gl.bankAccount || '1050',
          amount: totalBasic,
          referenceId: runId,
          reconciled: false
      }]);

      addAuditLog({
          action: 'CREATE',
          entityType: 'Payroll',
          entityId: runId,
          details: `Processed payroll for ${month}. Total net: ${totalBasic}`,
          newValue: run
      });

      notify("Payroll processed and ledger updated.", "success");
  };

  const updateInvoice = async (invoice: Invoice) => {
      try {
          const existing = financeStore.invoices.find(i => i.id === invoice.id);
          const prevPaid = Number(existing?.paidAmount || 0);
          const nextPaid = Number(invoice.paidAmount || 0);
          const paidDelta = roundFinancial(nextPaid - prevPaid);

          await transactionService.updateInvoice(invoice);

          if (paidDelta > 0 && invoice.status !== 'Draft' && invoice.status !== 'Cancelled') {
              const allPayments = await dbService.getAll<CustomerPayment>('customerPayments');
              const paymentId = generateNextId('RCPT', allPayments, companyConfig);
              const payment: CustomerPayment = {
                  id: paymentId,
                  date: new Date().toISOString(),
                  customerId: invoice.customerId || invoice.customerName,
                  customerName: invoice.customerName,
                  amount: paidDelta,
                  paymentMethod: invoice.paymentMethod || invoice.payment_method || 'Cash',
                  accountId: invoice.accountId,
                  reference: invoice.id,
                  notes: `Invoice payment for #${invoice.id}`,
                  allocations: [{ invoiceId: invoice.id, amount: paidDelta }],
                  status: 'Cleared',
                  reconciled: false,
                  method: invoice.paymentMethod || invoice.payment_method || 'Cash'
              };
              await transactionService.addCustomerPayment(payment);
              await salesStore.fetchSalesData();
          }
          await financeStore.fetchFinanceData();
          addAuditLog({
              action: 'UPDATE',
              entityType: 'Invoice',
              entityId: invoice.id,
              details: `Updated invoice for ${invoice.customerName}`,
              newValue: invoice
          });
          notify(`Invoice #${invoice.id} updated successfully`, "success");
      } catch (err: any) {
          notify(`Invoice Update Error: ${err.message}`, "error");
      }
  };

  const deleteInvoice = async (id: string) => {
      const inv = financeStore.invoices.find(i => i.id === id);
      if (!inv) return;

      if (inv.status === 'Cancelled' || inv.status === 'Void') {
          if (confirm(`DELETE PERMANENTLY: Invoice #${id} is already cancelled. Do you want to delete it completely from the system? This action cannot be undone.`)) {
              try {
                  await dbService.delete('invoices', id);
                  await financeStore.fetchFinanceData();
                  addAuditLog({ action: 'DELETE', entityType: 'Invoice', entityId: id, details: `Invoice ${id} permanently deleted.` });
                  notify(`Invoice #${id} deleted completely`, "success");
              } catch (err: any) {
                  notify(`Delete Failed: ${err.message}`, "error");
              }
          }
          return;
      }

      if (confirm(`VOID INVOICE: This will reverse all ledger entries and return items to inventory. Continue?`)) {
          try {
              await transactionService.voidInvoice(id, "User requested void");
              
              // Refresh finance data to reflect changes
              await financeStore.fetchFinanceData();
              
              addAuditLog({ action: 'VOID', entityType: 'Invoice', entityId: id, details: `Invoice ${id} voided.` });
              notify(`Invoice #${id} voided successfully`, "success");
          } catch (err: any) {
              notify(`Void Failed: ${err.message}`, "error");
          }
      }
  };

  const runMonthEndClosing = async (month: string) => {
      const normalizedMonth = String(month || '').trim();
      if (!/^\d{4}-\d{2}$/.test(normalizedMonth)) {
          notify(`Invalid month format: ${month}. Use YYYY-MM.`, "error");
          return;
      }

      const [year, monthNum] = normalizedMonth.split('-').map(v => Number(v));
      if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
          notify(`Invalid month value: ${month}. Use YYYY-MM.`, "error");
          return;
      }
      const startDay = `${normalizedMonth}-01`;
      const endDay = new Date(Date.UTC(year, monthNum, 0)).toISOString().slice(0, 10);
      const closeMarkerPrefix = `MEC-${normalizedMonth}-RESET-`;

      const alreadyClosed =
          auditLogs.some(log => log.action === 'PERIOD_CLOSE' && log.entityId === normalizedMonth) ||
          financeStore.ledger.some(entry => String(entry.referenceId || '').startsWith(closeMarkerPrefix));

      if (alreadyClosed) {
          notify(`Month ${normalizedMonth} is already closed.`, "info");
          return;
      }

      notify(`Executing Multi-Step Closing for ${normalizedMonth}...`, "info");

      const entries: Omit<LedgerEntry, 'id' | 'date'>[] = [];
      const balances: Record<string, number> = {};
      financeStore.accounts.forEach(a => balances[a.id] = 0);

      financeStore.ledger.forEach(l => {
          const entryDay = String(l.date || '').slice(0, 10);
          if (!entryDay || entryDay < startDay || entryDay > endDay) return;

          const debitAcc = financeStore.accounts.find(a => a.id === l.debitAccountId || a.code === l.debitAccountId);
          const creditAcc = financeStore.accounts.find(a => a.id === l.creditAccountId || a.code === l.creditAccountId);

          if (debitAcc) balances[debitAcc.id] += l.amount * ((debitAcc.type === 'Asset' || debitAcc.type === 'Expense') ? 1 : -1);
          if (creditAcc) balances[creditAcc.id] += l.amount * ((creditAcc.type === 'Asset' || creditAcc.type === 'Expense') ? -1 : 1);
      });

      const plAccounts = financeStore.accounts.filter(a => a.type === 'Revenue' || a.type === 'Expense');
      plAccounts.forEach(acc => {
          const bal = balances[acc.id];
          if (Math.abs(bal) > 0.005) {
              const isRevenue = acc.type === 'Revenue';
              entries.push({
                  description: `MEC RESET: Zero out ${acc.name} (${normalizedMonth})`,
                  debitAccountId: isRevenue ? acc.id : (gl.retainedEarningsAccount || '3000'),
                  creditAccountId: isRevenue ? (gl.retainedEarningsAccount || '3000') : acc.id,
                  amount: Math.abs(roundFinancial(bal)),
                  referenceId: `MEC-${normalizedMonth}-RESET-${acc.id}`,
                  reconciled: true
              });
          }
      });

      if (entries.length === 0) {
          notify(`No P&L activity found for ${normalizedMonth}.`, "info");
          return;
      }

      try {
          await postJournalEntry(entries);
          addAuditLog({ action: 'PERIOD_CLOSE', entityType: 'System', entityId: normalizedMonth, details: `Closed month ${normalizedMonth}.` });
          notify(`Month ${normalizedMonth} closed successfully.`, "success");
      } catch (err: any) {
          notify(`Month-end closing failed: ${err.message}`, "error");
      }
  };

  const addInvoice = async (invoice: Invoice) => {
      try {
        const invoiceId = String(invoice.id || '').trim() || await generateNextSalesInvoiceNumber(companyConfig);
        const finalizedInvoice: Invoice = {
          ...invoice,
          id: invoiceId
        };

        // Use transactionService for atomic Invoice + Inventory + Ledger
        await transactionService.processInvoice(finalizedInvoice);

        // Keep the Order -> Invoice chain intact for admin-created invoices:
        // materialise a sales order (same customerId) so the customer portal
        // shows it under Orders / recent activity. No-op when the invoice
        // already came from an order, is POS, or has no customer.
        await transactionService.ensureOrderFromInvoice(finalizedInvoice).catch(() => {});
        
        // Refresh finance data to reflect changes
        await financeStore.fetchFinanceData();
        await inventoryStore.fetchInventory();
        
        addAuditLog({
            action: 'CREATE',
            entityType: 'Invoice',
            entityId: invoiceId,
            details: `Created invoice for ${finalizedInvoice.customerName}. Amount: ${companyConfig?.currencySymbol || ''}${finalizedInvoice.totalAmount}`,
            newValue: finalizedInvoice
        });
        
        notify(`Invoice #${invoiceId} processed successfully`, "success");
        autoWorkflowService.fireEvent('invoice.created', { invoiceId, amount: finalizedInvoice.totalAmount, customerName: finalizedInvoice.customerName }).catch(() => {});

        // Trigger Customer Notification (Exclude POS if possible)
        const isPosInvoice = finalizedInvoice.notes?.includes('POS') || finalizedInvoice.sourceType === 'POS' || finalizedInvoice.reference?.includes('POS');
        if (!isPosInvoice) {
            const customer = salesStore.customers.find(c => c.name === finalizedInvoice.customerName || c.id === finalizedInvoice.customerId);
            if (customer?.phone) {
                const isExaminationInvoice =
                    String(finalizedInvoice.originModule || finalizedInvoice.origin_module || '').toLowerCase() === 'examination'
                    || String(finalizedInvoice.documentTitle || '').toLowerCase().includes('examination invoice')
                    || String(finalizedInvoice.documentTitle || '').toLowerCase().includes('service invoice')
                    || String(finalizedInvoice.reference || '').toUpperCase().startsWith('EXM-BATCH-');

                await customerNotificationService.triggerNotification(isExaminationInvoice ? 'EXAMINATION_INVOICE' : 'INVOICE', {
                    id: invoiceId,
                    customerName: finalizedInvoice.customerName,
                    phoneNumber: customer.phone,
                    amount: `${companyConfig?.currencySymbol || ''}${finalizedInvoice.totalAmount.toLocaleString()}`,
                    dueDate: new Date(finalizedInvoice.dueDate).toLocaleDateString()
                });
            }
        }
        return invoiceId;
      } catch (err: any) {
        notify(`Invoice Processing Error: ${err.message}`, "error");
        throw err;
      }
  };

  const addExpense = async (expense: Expense) => {
      try {
        const expenseWithId: Expense = {
          ...expense,
          id: expense.id || generateNextId('EXP', financeStore.expenses, companyConfig)
        };
        const isAdmin = user?.role === 'Admin';
        const isAlreadyApproved = expenseWithId.status === 'Approved' || expenseWithId.status === 'Paid';
        
        // Admin users or already approved expenses post directly to ledger
        if (isAdmin || isAlreadyApproved) {
          await transactionService.addExpense(expenseWithId);
          await financeStore.fetchFinanceData();
          
          addAuditLog({
              action: 'CREATE',
              entityType: 'Expense',
              entityId: expenseWithId.id,
              details: `Recorded expense${isAdmin ? ' (Admin - Direct Post)' : ' (Pre-approved)'}: ${expenseWithId.description} (${expenseWithId.amount})`,
              newValue: expenseWithId
          });
          
          notify("Expense recorded and posted to ledger", "success");
        } else {
          // Non-admin users: Create expense with Pending Approval status
          const pendingExpense: Expense = {
            ...expenseWithId,
            status: 'Pending Approval'
          };
          
          // Store expense without posting to ledger
          await dbService.put('expenses', pendingExpense);
          await financeStore.fetchFinanceData();
          
          addAuditLog({
              action: 'CREATE',
              entityType: 'Expense',
              entityId: expenseWithId.id,
              details: `Recorded expense (Pending Approval): ${expenseWithId.description} (${expenseWithId.amount})`,
              newValue: pendingExpense
          });

          // Start approval workflow
          try {
            await workflowService.initialize();
            const activeDefinitions = workflowService.getActiveDefinitions('expense');
            
            if (activeDefinitions.length > 0 && user) {
              const workflowDef = activeDefinitions[0];
              await workflowService.startWorkflow(
                workflowDef.id,
                'expense',
                expenseWithId.id,
                user.id,
                {
                  amount: expenseWithId.amount,
                  description: expenseWithId.description,
                  category: expenseWithId.category,
                  reference: expenseWithId.id,
                  requesterName: user.username,
                },
                expenseWithId.amount > 1000 ? 'high' : 'normal'
              );
              notify("Expense submitted for approval", "info");
            } else {
              // No workflow configured, but still requires approval
              notify("Expense recorded - pending approval from Admin", "info");
            }
          } catch (workflowError) {
            logger.error('Failed to start expense workflow', workflowError as Error);
            notify("Expense recorded - pending approval from Admin", "info");
          }
        }
      } catch (err: any) {
        notify(`Expense Record Failed: ${err.message}`, "error");
      }
  };

  const approveExpense = async (id: string) => {
      try {
          await transactionService.approveExpense(id);
          await financeStore.fetchFinanceData();
          
          const expense = financeStore.expenses.find(e => e.id === id);
          addAuditLog({ 
              action: 'UPDATE', 
              entityType: 'Expense', 
              entityId: id, 
              details: `Approved Expense ${id} - ${expense?.description || ''}`,
              newValue: { ...expense, status: 'Approved' }
          });
          
          notify("Expense approved and ledger updated", "success");
      } catch (err: any) {
          notify(`Approval Failed: ${err.message}`, "error");
      }
  };

  const addIncome = async (income: Income) => {
      try {
        const incomeWithId: Income = {
          ...income,
          id: income.id || generateNextId('INC', financeStore.income, companyConfig)
        };

        await transactionService.addIncome(incomeWithId);
        await financeStore.fetchFinanceData();
        
        addAuditLog({
            action: 'CREATE',
            entityType: 'Income',
            entityId: incomeWithId.id,
            details: `Recorded income: ${incomeWithId.description} (${incomeWithId.amount})`,
            newValue: incomeWithId
        });

        notify("Income recorded successfully", "success");
      } catch (err: any) {
        notify(`Income Record Failed: ${err.message}`, "error");
      }
  };

  const postZReportToLedger = async (report: ZReport, targetAccountId: string) => {
      try {
          if (report.cashSales <= 0) return;
          await postJournalEntry([{
              description: `POS Session Cash-out: ${report.id}`,
              debitAccountId: targetAccountId,
              creditAccountId: gl.cashDrawerAccount || '1000',
              amount: roundFinancial(report.cashSales),
              referenceId: report.id,
              reconciled: false
          }]);
      } catch (err: any) {
          notify(`Z-Report Posting Error: ${err.message}`, "error");
      }
  };

  const closeFinancialYear = async (year: number) => {
      try {
          notify(`Initiating Year-End Closing for ${year}...`, "info");
          
          const startDate = `${year}-01-01T00:00:00.000Z`;
          const endDate = `${year}-12-31T23:59:59.999Z`;
          
          // 1. Calculate Balances for P&L Accounts
          const balances: Record<string, number> = {};
          financeStore.accounts.forEach(a => balances[a.id] = 0);
          
          financeStore.ledger.forEach(l => {
              const d = parseISO(l.date);
              if (isWithinInterval(d, { start: parseISO(startDate), end: parseISO(endDate) })) {
                  const debitAcc = financeStore.accounts.find(a => a.id === l.debitAccountId || a.code === l.debitAccountId);
                  const creditAcc = financeStore.accounts.find(a => a.id === l.creditAccountId || a.code === l.creditAccountId);
                  if (debitAcc) balances[debitAcc.id] += l.amount * ((debitAcc.type === 'Asset' || debitAcc.type === 'Expense') ? 1 : -1);
                  if (creditAcc) balances[creditAcc.id] += l.amount * ((creditAcc.type === 'Asset' || creditAcc.type === 'Expense') ? -1 : 1);
              }
          });

          const plAccounts = financeStore.accounts.filter(a => a.type === 'Revenue' || a.type === 'Expense');
          const entries: Omit<LedgerEntry, 'id' | 'date'>[] = [];
          let netIncome = 0;

          plAccounts.forEach(acc => {
              const bal = balances[acc.id];
              if (Math.abs(bal) > 0.001) {
                  const isRevenue = acc.type === 'Revenue';
                  netIncome += isRevenue ? bal : -bal;
                  
                  // Reset account to zero
                  entries.push({
                      description: `YEAR-END RESET: ${acc.name} (${year})`,
                      debitAccountId: isRevenue ? acc.id : (gl.retainedEarningsAccount || '3000'),
                      creditAccountId: isRevenue ? (gl.retainedEarningsAccount || '3000') : acc.id,
                      amount: Math.abs(roundFinancial(bal)),
                      referenceId: `YEC-${year}-${acc.id}`,
                      reconciled: true
                  });
              }
          });

          if (entries.length > 0) {
              await postJournalEntry(entries);
              addAuditLog({ 
                  action: 'PERIOD_CLOSE', 
                  entityType: 'System', 
                  entityId: year.toString(), 
                  details: `Closed financial year ${year}. Net Income of ${netIncome} rolled to Retained Earnings.` 
              });
              notify(`Year ${year} closed successfully.`, "success");
          } else {
              notify(`No P&L activity found for year ${year}.`, "info");
          }
      } catch (err: any) {
          notify(`Year-End Closing Failed: ${err.message}`, "error");
      }
  };

  const createDeliveryNote = async (invoiceId: string): Promise<string | null> => {
      try {
        const invoice = financeStore.invoices.find(i => i.id === invoiceId);
        if (!invoice) return null;
        
        const newId = generateNextId('DN', financeStore.deliveryNotes, companyConfig);
        const note: DeliveryNote = {
            id: newId,
            number: newId,
            dnNumber: newId,
            invoiceId: invoice.id,
            date: new Date().toISOString(),
            customerName: invoice.customerName,
            clientName: invoice.customerName,
            shippingAddress: invoice.shippingAddress || 'N/A',
            items: invoice.items || [],
            status: 'Pending'
        };
        await financeStore.addDeliveryNote(note);
        return newId;
      } catch (err: any) {
        notify(`DN Creation Error: ${err.message}`, "error");
        return null;
      }
  };

  const executeTransfer = async (transfer: Transfer) => {
      try {
        const id = transfer.id || generateNextId('TRF', financeStore.transfers, companyConfig);
        await transactionService.executeTransfer({ ...transfer, id });
        await financeStore.fetchFinanceData();
        
        // Add Audit Log
        addAuditLog({
          action: 'CREATE',
          entityType: 'Transfer',
          entityId: id,
          details: `Internal Transfer: ${transfer.amount} from ${transfer.fromAccountId} to ${transfer.toAccountId}`,
          newValue: transfer
        });

        notify("Internal transfer completed", "success");
      } catch (err: any) {
        notify(`Transfer Error: ${err.message}`, "error");
      }
  };

  const addCheque = async (cheque: Cheque) => {
      const newCheque = {
        ...cheque,
        id: cheque.id || generateNextId('CHQ', financeStore.cheques, companyConfig)
      };
      await financeStore.addCheque(newCheque);
  };

  const recordSupplierPayment = async (payment: SupplierPayment) => {
    try {
      const paymentWithId: SupplierPayment = {
        ...payment,
        id: payment.id || generateNextId('SP', financeStore.supplierPayments, companyConfig)
      };

      await financeStore.recordSupplierPayment(paymentWithId);
      
      // Refresh related data
      await financeStore.fetchFinanceData();
      // Since suppliers/purchases are in ProcurementContext, we might need to refresh that too
      // However, FinanceContext doesn't have direct access to ProcurementContext's fetch.
      // But we can trigger it via the store if we import it.
      
      notify("Supplier payment recorded successfully", "success");
      addAuditLog({
        action: 'CREATE',
        entityType: 'SupplierPayment',
        entityId: paymentWithId.id,
        details: `Recorded payment of ${paymentWithId.amount} to supplier ${paymentWithId.supplierId}`
      });
    } catch (err: any) {
      notify(`Failed to record payment: ${err.message}`, "error");
      throw err;
    }
  };

  const updateSupplierPayment = async (payment: SupplierPayment) => {
    try {
      await financeStore.updateSupplierPayment(payment);
      await financeStore.fetchFinanceData();
      notify("Supplier payment updated successfully", "success");
      addAuditLog({
        action: 'UPDATE',
        entityType: 'SupplierPayment',
        entityId: payment.id,
        details: `Updated payment ${payment.id}`
      });
    } catch (err: any) {
      notify(`Failed to update payment: ${err.message}`, "error");
      throw err;
    }
  };

  const voidSupplierPayment = async (id: string) => {
    try {
      if (confirm(`Are you sure you want to void this payment? This will reverse all ledger entries and restore purchase order balances.`)) {
        await financeStore.voidSupplierPayment(id);
        await financeStore.fetchFinanceData();
        notify("Supplier payment voided successfully", "success");
        addAuditLog({
          action: 'VOID',
          entityType: 'SupplierPayment',
          entityId: id,
          details: `Voided payment ${id}`
        });
      }
    } catch (err: any) {
      notify(`Failed to void payment: ${err.message}`, "error");
      throw err;
    }
  };

  const checkAndApplyLateFees = async () => {
      const policy = companyConfig.lateFeePolicy;
      if (!policy || !policy.enabled) return;
      const today = new Date();
      let appliedCount = 0;

      for (const invoice of financeStore.invoices) {
          if (invoice.status === 'Paid' || invoice.status === 'Cancelled' || invoice.status === 'Draft') continue;
          const dueDate = new Date(invoice.dueDate);
          if (today > dueDate) {
              const outstanding = roundFinancial(invoice.totalAmount - (invoice.paidAmount || 0));
              const fee = roundFinancial(policy.type === 'Flat' ? policy.value : outstanding * (policy.value / 100));
              
              if (fee > 0) {
                  try {
                      await transactionService.applyLateFeeToInvoice(invoice.id, fee);
                      appliedCount++;
                  } catch (err) {
                      logger.error(`Failed to apply late fee to invoice ${invoice.id}`, err as Error, { invoiceId: invoice.id, fee });
                  }
              }
          }
      }

      if (appliedCount > 0) {
          await financeStore.fetchFinanceData();
          notify(`Applied late fees to ${appliedCount} overdue invoices.`, "info");
      }
  };

  const updateCustomerPayment = async (payment: CustomerPayment, reason?: string) => {
    try {
      await transactionService.updateCustomerPayment(payment);
      await financeStore.fetchFinanceData();
      notify(`Payment updated successfully`, "success");
      addAuditLog({
        action: 'UPDATE',
        entityType: 'CustomerPayment',
        entityId: payment.id,
        details: `Updated customer payment: ${reason || 'No reason provided'}`,
        newValue: payment
      });
    } catch (err: any) {
      notify(`Update Failed: ${err.message}`, "error");
      throw err;
    }
  };

  const addCustomerPayment = async (payment: CustomerPayment) => {
    try {
      await transactionService.addCustomerPayment(payment);
      await financeStore.fetchFinanceData();
      notify(`Payment recorded successfully`, "success");
      addAuditLog({
        action: 'CREATE',
        entityType: 'CustomerPayment',
        entityId: payment.id,
        details: `Recorded customer payment of ${payment.amount} from ${payment.customerName}`,
        newValue: payment
      });
    } catch (err: any) {
      notify(`Failed to record payment: ${err.message}`, "error");
      throw err;
    }
  };

  return (
    <FinanceContext.Provider value={{
      ...financeStore, addInvoice, updateInvoice, addExpense, approveExpense, addIncome, postJournalEntry,
      createDeliveryNote, executeTransfer, runPayroll, addCheque, updateCheque: financeStore.updateCheque, deleteCheque: financeStore.deleteCheque,
      recordSupplierPayment, updateSupplierPayment, voidSupplierPayment, postZReportToLedger, checkAndApplyLateFees, closeFinancialYear, runMonthEndClosing, syncInventoryValuation,
      addAccount: financeStore.addAccount, updateAccount: financeStore.updateAccount, deleteAccount: financeStore.deleteAccount,
      deleteInvoice, updateIncome: financeStore.updateIncome, deleteIncome: financeStore.deleteIncome,
      toggleReconciled: financeStore.toggleReconciled, addRecurringInvoice: financeStore.addRecurringInvoice, deleteRecurringInvoice: financeStore.deleteRecurringInvoice, updateRecurringInvoice: financeStore.updateRecurringInvoice,
      addScheduledPayment: financeStore.addScheduledPayment, updateScheduledPayment: financeStore.updateScheduledPayment, 
      updateDeliveryNote: async (note: DeliveryNote) => {
        try {
          await financeStore.updateDeliveryNote(note);
          notify(`Delivery Note ${note.id} updated`, "success");
        } catch (err: any) {
          notify(`Update failed: ${err.message}`, "error");
        }
      },
      deleteDeliveryNote: financeStore.deleteDeliveryNote, saveBudget: financeStore.saveBudget,
      updateOpeningBalance: financeStore.updateOpeningBalance, addEmployee: financeStore.addEmployee, updateEmployee: financeStore.updateEmployee, deleteEmployee: financeStore.deleteEmployee,
      formatNumber,
      customerPayments: salesStore.customerPayments || [],
      updateCustomerPayment,
      addCustomerPayment
    }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used within FinanceProvider');
  return context;
};
