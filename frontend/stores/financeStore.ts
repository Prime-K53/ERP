
import { create } from 'zustand';
import { Account, LedgerEntry, Invoice, Expense, RecurringInvoice, ScheduledPayment, WalletTransaction, DeliveryNote, Budget, Transfer, Employee, PayrollRun, Payslip, Income, Cheque, SupplierPayment } from '../types';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { transactionService } from '../services/transactionService';
import { generateNextSalesInvoiceNumber } from '../services/documentNumberService';
import { DEFAULT_ACCOUNTS } from '../constants';
import { generateNextId } from '../utils/helpers';
import { customerNotificationService } from '../services/customerNotificationService';
import { logger } from '../services/logger';
import { isSupabaseConfigured } from '../services/cloudMode';

interface FinanceState {
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
  isLoading: boolean;

  fetchFinanceData: () => Promise<void>;
  
  addAccount: (account: Account) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  
  addInvoice: (invoice: Invoice) => Promise<string>;
  updateInvoice: (invoice: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  
  addExpense: (expense: Expense) => Promise<void>;
  addIncome: (income: Income) => Promise<void>;
  updateIncome: (income: Income) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  
  addLedgerEntry: (entry: LedgerEntry) => Promise<void>;
  toggleReconciled: (id: string) => Promise<void>;
  
  addRecurringInvoice: (inv: RecurringInvoice) => Promise<void>;
  deleteRecurringInvoice: (id: string) => Promise<void>;
  updateRecurringInvoice: (inv: RecurringInvoice) => Promise<void>;
  
  addScheduledPayment: (payment: ScheduledPayment) => Promise<void>;
  updateScheduledPayment: (payment: ScheduledPayment) => Promise<void>;
  
  addWalletTransaction: (tx: WalletTransaction) => Promise<void>;
  
  addDeliveryNote: (note: DeliveryNote) => Promise<void>;
  updateDeliveryNote: (note: DeliveryNote) => Promise<void>;
  deleteDeliveryNote: (id: string) => Promise<void>;
  
  saveBudget: (budget: Budget) => Promise<void>;
  updateOpeningBalance: (amount: number) => Promise<void>;

  addTransfer: (transfer: Transfer) => Promise<void>;
  
  addEmployee: (emp: Employee) => Promise<void>;
  updateEmployee: (emp: Employee) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  
  addPayrollRun: (run: PayrollRun) => Promise<void>;
  addPayslips: (slips: Payslip[]) => Promise<void>;

  addCheque: (cheque: Cheque) => Promise<void>;
  updateCheque: (cheque: Cheque) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  
  recordSupplierPayment: (payment: SupplierPayment) => Promise<void>;
  updateSupplierPayment: (payment: SupplierPayment) => Promise<void>;
  voidSupplierPayment: (id: string) => Promise<void>;
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  accounts: [],
  ledger: [],
  invoices: [],
  recurringInvoices: [],
  expenses: [],
  income: [],
  scheduledPayments: [],
  walletTransactions: [],
  deliveryNotes: [],
  openingBalance: 500,
  budgets: [],
  transfers: [],
  employees: [],
  payrollRuns: [],
  payslips: [],
  cheques: [],
  supplierPayments: [],
  isLoading: false,

  fetchFinanceData: async () => {
    set({ isLoading: true });
    try {
      const [
          accounts, ledger, invoices, recurringInvoices, 
          expenses, income, scheduledPayments, 
          walletTransactions, deliveryNotes, budgets,
          transfers, employees, payrollRuns, payslips,
          cheques, supplierPayments
      ] = await Promise.all([
        dbService.getAll<Account>('accounts'),
        dbService.getAll<LedgerEntry>('ledger'),
        dbService.getAll<Invoice>('invoices'),
        dbService.getAll<RecurringInvoice>('recurringInvoices'),
        dbService.getAll<Expense>('expenses'),
        dbService.getAll<Income>('income'),
        dbService.getAll<ScheduledPayment>('scheduledPayments'),
        dbService.getAll<WalletTransaction>('walletTransactions'),
        dbService.getAll<DeliveryNote>('deliveryNotes'),
        dbService.getAll<Budget>('budgets'),
        dbService.getAll<Transfer>('transfers'),
        dbService.getAll<Employee>('employees'),
        dbService.getAll<PayrollRun>('payrollRuns'),
        dbService.getAll<Payslip>('payslips'),
        dbService.getAll<Cheque>('cheques'),
        dbService.getAll<SupplierPayment>('supplierPayments'),
      ]);

      let finalAccounts = accounts;
      if (accounts.length === 0) {
          if (!isSupabaseConfigured()) {
            finalAccounts = DEFAULT_ACCOUNTS;
            for(const a of DEFAULT_ACCOUNTS) await dbService.put('accounts', a);
          } else {
            finalAccounts = [];
          }
      } else {
          // Ensure core banking accounts exist and have correct names
          const coreAccountCodes = ['1000', '1050', '1060'];
          for (const code of coreAccountCodes) {
              const defaultAcc = DEFAULT_ACCOUNTS.find(a => a.code === code);
              const existingAcc = finalAccounts.find(a => a.code === code);
              
              if (defaultAcc) {
                  if (!existingAcc) {
                      // Add missing core account
                      await dbService.put('accounts', defaultAcc);
                      finalAccounts.push(defaultAcc);
                  } else if (existingAcc.name !== defaultAcc.name) {
                      // Update name if different
                      const updatedAcc = { ...existingAcc, name: defaultAcc.name };
                      await dbService.put('accounts', updatedAcc);
                      finalAccounts = finalAccounts.map(a => a.code === code ? updatedAcc : a);
                  }
              }
          }
      }

      const openingBalance = await dbService.getSetting<number>('opening_balance').then(v => v ?? 500).catch(() => 500);
      set({ 
          accounts: finalAccounts, 
          ledger, invoices, recurringInvoices, expenses, income,
          scheduledPayments, walletTransactions, deliveryNotes, budgets,
          openingBalance,
          transfers, employees, payrollRuns, payslips, cheques, supplierPayments
      });

    } catch (error) {
      logger.error("Failed to load finance data", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addAccount: async (account) => {
      const newAccount = { ...account, id: account.id || generateNextId('ACC', get().accounts) };
      set(state => ({ accounts: [...state.accounts, newAccount] }));
      await api.finance.saveAccount(newAccount);
  },
  updateAccount: async (account) => {
      set(state => ({ accounts: state.accounts.map(a => a.id === account.id ? account : a) }));
      await api.finance.saveAccount(account);
  },
  deleteAccount: async (id) => {
      set(state => ({ accounts: state.accounts.filter(a => a.id !== id) }));
      await api.finance.deleteAccount(id);
  },

addInvoice: async (invoice) => {
      const newInvoice = {
        ...invoice,
        id: String(invoice.id || '').trim() || await generateNextSalesInvoiceNumber()
      };
      set(state => ({ invoices: [newInvoice, ...state.invoices] }));
      await api.finance.saveInvoice(newInvoice);
      
      // Trigger customer notification
      if (newInvoice.customerPhone) {
        await customerNotificationService.triggerNotification('INVOICE', {
          id: newInvoice.id,
          customerName: newInvoice.customerName,
          phoneNumber: newInvoice.customerPhone,
          amount: newInvoice.total ? `${newInvoice.currency || 'KES'} ${Number(newInvoice.total).toLocaleString()}` : '',
          dueDate: newInvoice.dueDate ? new Date(newInvoice.dueDate).toLocaleDateString() : '',
        });
      }
      return newInvoice.id;
    },
  updateInvoice: async (invoice) => {
      set(state => ({ invoices: state.invoices.map(i => i.id === invoice.id ? invoice : i) }));
      await api.finance.saveInvoice(invoice);
  },
  deleteInvoice: async (id) => {
      set(state => ({ invoices: state.invoices.filter(i => i.id !== id) }));
      await api.finance.deleteInvoice(id);
  },

  addExpense: async (expense) => {
      const newExpense = { ...expense, id: expense.id || generateNextId('EXP', get().expenses) };
      set(state => ({ expenses: [newExpense, ...state.expenses] }));
      await api.finance.saveExpense(newExpense);
  },

  addIncome: async (income) => {
      const newIncome = { ...income, id: income.id || generateNextId('INC', get().income) };
      set(state => ({ income: [newIncome, ...state.income] }));
      await api.finance.saveIncome(newIncome);
  },
  updateIncome: async (income) => {
      set(state => ({ income: state.income.map(i => i.id === income.id ? income : i) }));
      await api.finance.saveIncome(income);
  },
  deleteIncome: async (id) => {
      set(state => ({ income: state.income.filter(i => i.id !== id) }));
      await api.finance.deleteIncome(id);
  },

  addLedgerEntry: async (entry) => {
      const newEntry = { ...entry, id: entry.id || generateNextId('LED', get().ledger) };
      set(state => ({ ledger: [newEntry, ...state.ledger] }));
      await api.finance.saveLedgerEntry(newEntry);
  },
  toggleReconciled: async (id) => {
      const { ledger } = get();
      const entry = ledger.find(e => e.id === id);
      if (entry) {
          const updated = { ...entry, reconciled: !entry.reconciled };
          set(state => ({ ledger: state.ledger.map(e => e.id === id ? updated : e) }));
          await api.finance.saveLedgerEntry(updated);
      }
  },

  addRecurringInvoice: async (inv) => {
      const newRecurring = { ...inv, id: inv.id || generateNextId('REC', get().recurringInvoices) };
      set(state => ({ recurringInvoices: [...state.recurringInvoices, newRecurring] }));
      await api.finance.saveRecurringInvoice(newRecurring);
  },
  deleteRecurringInvoice: async (id) => {
      set(state => ({ recurringInvoices: state.recurringInvoices.filter(r => r.id !== id) }));
      await api.finance.deleteRecurringInvoice(id);
  },
  updateRecurringInvoice: async (inv) => {
      set(state => ({ recurringInvoices: state.recurringInvoices.map(r => r.id === inv.id ? inv : r) }));
      await api.finance.saveRecurringInvoice(inv);
  },

  addScheduledPayment: async (payment) => {
      const newPayment = { ...payment, id: payment.id || generateNextId('SCH', get().scheduledPayments) };
      set(state => ({ scheduledPayments: [...state.scheduledPayments, newPayment] }));
      await api.finance.saveScheduledPayment(newPayment);
  },
  updateScheduledPayment: async (payment) => {
      set(state => ({ scheduledPayments: state.scheduledPayments.map(p => p.id === payment.id ? payment : p) }));
      await api.finance.saveScheduledPayment(payment);
  },

  addWalletTransaction: async (tx) => {
      const newTx = { ...tx, id: tx.id || generateNextId('WTX', get().walletTransactions) };
      set(state => ({ walletTransactions: [...state.walletTransactions, newTx] }));
      await api.finance.saveWalletTransaction(newTx);
  },

  addDeliveryNote: async (note) => {
      const newNote = { ...note, id: note.id || generateNextId('DN', get().deliveryNotes) };
      set(state => ({ deliveryNotes: [...state.deliveryNotes, newNote] }));
      await api.finance.saveDeliveryNote(newNote);
  },
  updateDeliveryNote: async (note) => {
      set(state => ({ deliveryNotes: state.deliveryNotes.map(n => n.id === note.id ? note : n) }));
      await api.finance.saveDeliveryNote(note);
  },
  deleteDeliveryNote: async (id) => {
      set(state => ({ deliveryNotes: state.deliveryNotes.filter(n => n.id !== id) }));
      await api.finance.deleteDeliveryNote(id);
  },

  saveBudget: async (budget) => {
      const { budgets } = get();
      const exists = budgets.find(b => b.accountId === budget.accountId && b.month === budget.month);
      
      if (exists) {
          const updated = { ...exists, amount: budget.amount };
          set(state => ({ budgets: state.budgets.map(b => b.id === exists.id ? updated : b) }));
          await api.finance.saveBudget(updated);
      } else {
          const newBudget = { ...budget, id: generateNextId('BUD', budgets) };
          set(state => ({ budgets: [...state.budgets, newBudget] }));
          await api.finance.saveBudget(newBudget);
      }
  },

  updateOpeningBalance: async (amount) => {
      set({ openingBalance: amount });
      await dbService.saveSetting('opening_balance', amount);
  },

  addTransfer: async (transfer) => {
      const newTransfer = { ...transfer, id: transfer.id || generateNextId('TRF', get().transfers) };
      set(state => ({ transfers: [...state.transfers, newTransfer] }));
      await api.finance.saveTransfer(newTransfer);
  },

  addEmployee: async (emp) => {
      const newEmp = { ...emp, id: emp.id || generateNextId('EMP', get().employees) };
      set(state => ({ employees: [...state.employees, newEmp] }));
      await api.finance.saveEmployee(newEmp);
  },
  updateEmployee: async (emp) => {
      set(state => ({ employees: state.employees.map(e => e.id === emp.id ? emp : e) }));
      await api.finance.saveEmployee(emp);
  },
  deleteEmployee: async (id) => {
      set(state => ({ employees: state.employees.filter(e => e.id !== id) }));
      await api.finance.deleteEmployee(id);
  },

  addPayrollRun: async (run) => {
      const newRun = { ...run, id: run.id || generateNextId('PAY', get().payrollRuns) };
      set(state => ({ payrollRuns: [...state.payrollRuns, newRun] }));
      await api.finance.savePayrollRun(newRun);
  },
  addPayslips: async (slips) => {
      set(state => ({ payslips: [...state.payslips, ...slips] }));
      // IDs for slips should be handled by caller (e.g. runPayroll), but could be enforced here if needed.
      // Assuming runPayroll generates them correctly for now.
      for(const s of slips) await api.finance.savePayslip(s);
  },


  addCheque: async (cheque) => {
      const newCheque = { ...cheque, id: cheque.id || generateNextId('CHQ', get().cheques) };
      set(state => ({ cheques: [...state.cheques, newCheque] }));
      await api.finance.saveCheque(newCheque);
  },
  updateCheque: async (cheque) => {
      set(state => ({ cheques: state.cheques.map(c => c.id === cheque.id ? cheque : c) }));
      await api.finance.saveCheque(cheque);
  },
  deleteCheque: async (id) => {
      set(state => ({ cheques: state.cheques.filter(c => c.id !== id) }));
      await api.finance.deleteCheque(id);
  },
  
  recordSupplierPayment: async (payment) => {
      const newPayment = { ...payment, id: payment.id || generateNextId('SP', get().supplierPayments) };
      set(state => ({ supplierPayments: [...state.supplierPayments, newPayment] }));
      await api.finance.recordSupplierPayment(newPayment);
  },
  updateSupplierPayment: async (payment) => {
      set(state => ({ supplierPayments: state.supplierPayments.map(p => p.id === payment.id ? payment : p) }));
      await api.finance.updateSupplierPayment(payment);
  },
  voidSupplierPayment: async (id) => {
      await api.finance.voidSupplierPayment(id);
      // Refresh data to get updated PO balances and ledger
      await get().fetchFinanceData();
  }
}));
