import { create } from 'zustand';
import { logger } from '@/services/logger';
import { BankAccount, BankTransaction, BankStatement, ScheduledPayment, ExchangeRate, BankFee, Reconciliation, Adjustment, CashFlowForecast, BankAlert, BankCategory } from '../types/banking';
import { bankingService } from '../services/bankingService';
import { isSupabaseConfigured } from '../services/cloudMode';

interface BankingState {
  accounts: BankAccount[];
  transactions: BankTransaction[];
  statements: BankStatement[];
  scheduledPayments: ScheduledPayment[];
  exchangeRates: ExchangeRate[];
  fees: BankFee[];
  reconciliations: Reconciliation[];
  adjustments: Adjustment[];
  cashFlowForecasts: CashFlowForecast[];
  alerts: BankAlert[];
  categories: BankCategory[];
  isLoading: boolean;

  // Actions
  fetchBankingData: () => Promise<void>;
  createAccount: (account: Omit<BankAccount, 'id' | 'balance' | 'availableBalance' | 'createdAt' | 'updatedAt'>) => Promise<BankAccount>;
  updateAccount: (account: Partial<BankAccount> & Pick<BankAccount, 'id'>) => Promise<BankAccount>;
  deleteAccount: (id: string) => Promise<void>;
  createTransaction: (transaction: Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<BankTransaction>;
  updateTransaction: (transaction: Partial<BankTransaction> & Pick<BankTransaction, 'id'>) => Promise<BankTransaction>;
  deleteTransaction: (id: string) => Promise<void>;
  createScheduledPayment: (payment: Omit<ScheduledPayment, 'id' | 'nextPaymentDate' | 'createdAt' | 'updatedAt'>) => Promise<ScheduledPayment>;
  updateScheduledPayment: (payment: Partial<ScheduledPayment> & Pick<ScheduledPayment, 'id'>) => Promise<ScheduledPayment>;
  deleteScheduledPayment: (id: string) => Promise<void>;
  createFee: (fee: Omit<BankFee, 'id' | 'createdAt' | 'updatedAt'>) => Promise<BankFee>;
  createStatement: (statement: Omit<BankStatement, 'id' | 'importedAt' | 'createdAt' | 'updatedAt'>) => Promise<BankStatement>;
  processStatement: (id: string) => Promise<BankStatement>;
  createReconciliation: (reconciliation: Omit<Reconciliation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Reconciliation>;
  completeReconciliation: (id: string, notes?: string) => Promise<Reconciliation>;
  createCashFlowForecast: (forecast: Omit<CashFlowForecast, 'id' | 'createdAt' | 'updatedAt'>) => Promise<CashFlowForecast>;
  createAlert: (alert: Omit<BankAlert, 'id' | 'createdAt' | 'updatedAt'>) => Promise<BankAlert>;
  acknowledgeAlert: (id: string) => Promise<BankAlert>;
  createCategory: (category: Omit<BankCategory, 'id' | 'createdAt' | 'updatedAt'>) => Promise<BankCategory>;
  updateCategory: (category: Partial<BankCategory> & Pick<BankCategory, 'id'>) => Promise<BankCategory>;
  deleteCategory: (id: string) => Promise<void>;
  saveExchangeRate: (rate: Omit<ExchangeRate, 'id' | 'updatedAt'>) => Promise<ExchangeRate>;
}

export const useBankingStore = create<BankingState>((set, get) => ({
  accounts: [],
  transactions: [],
  statements: [],
  scheduledPayments: [],
  exchangeRates: [],
  fees: [],
  reconciliations: [],
  adjustments: [],
  cashFlowForecasts: [],
  alerts: [],
  categories: [],
  isLoading: false,

  fetchBankingData: async () => {
    set({ isLoading: true });
    try {
      const [
        accounts, transactions, statements, scheduledPayments,
        exchangeRates, fees, reconciliations, adjustments,
        cashFlowForecasts, alerts, categories
      ] = await Promise.all([
        bankingService.getAllAccounts(),
        bankingService.getAllTransactions(),
        bankingService.getAllStatements(),
        bankingService.getAllScheduledPayments(),
        bankingService.getAllExchangeRates(),
        bankingService.getAllFees(),
        bankingService.getAllReconciliations(),
        bankingService.getAllAdjustments(),
        bankingService.getAllCashFlowForecasts(),
        bankingService.getAllAlerts(),
        bankingService.getAllCategories()
      ]);

      // Create sample bank accounts if none exist
      let finalAccounts = accounts;
      if (accounts.length === 0 && !isSupabaseConfigured()) {
        const sampleAccounts = [
          {
            name: 'Cash Account',
            accountNumber: 'CASH-001',
            bankName: 'Prime Bank',
            accountType: 'Asset' as const,
            status: 'Active' as const,
            openingDate: new Date().toISOString(),
            currency: '$',
            interestRate: 0
          },
          {
            name: 'Bank Account',
            accountNumber: 'BANK-001',
            bankName: 'Prime Bank',
            accountType: 'Asset' as const,
            status: 'Active' as const,
            openingDate: new Date().toISOString(),
            currency: '$'
          },
          {
            name: 'Mobile Money Account',
            accountNumber: 'MOMO-001',
            bankName: 'Mobile Money',
            accountType: 'Asset' as const,
            status: 'Active' as const,
            openingDate: new Date().toISOString(),
            currency: '$'
          }
        ];

        for (const accountData of sampleAccounts) {
          await bankingService.createAccount(accountData);
        }
        
        // Refresh accounts after creation
        finalAccounts = await bankingService.getAllAccounts();
      }

      set({
        accounts: finalAccounts,
        transactions,
        statements,
        scheduledPayments,
        exchangeRates,
        fees,
        reconciliations,
        adjustments,
        cashFlowForecasts,
        alerts,
        categories,
        isLoading: false
      });
    } catch (error) {
      logger.error('Failed to load banking data', error);
      set({ isLoading: false });
    }
  },

  createAccount: async (account) => {
    const newAccount = await bankingService.createAccount(account);
    set(state => ({ accounts: [...state.accounts, newAccount] }));
    return newAccount;
  },

  updateAccount: async (account) => {
    const updated = await bankingService.updateAccount(account);
    set(state => ({
      accounts: state.accounts.map(a => a.id === account.id ? updated : a)
    }));
    return updated;
  },

  deleteAccount: async (id) => {
    await bankingService.deleteAccount(id);
    set(state => ({
      accounts: state.accounts.map(a =>
        a.id === id
          ? {
              ...a,
              status: 'Inactive',
              closingDate: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          : a
      )
    }));
  },

  createTransaction: async (transaction) => {
    const newTransaction = await bankingService.createTransaction(transaction);
    set(state => ({
      transactions: [newTransaction, ...state.transactions],
      accounts: state.accounts.map(a => 
        a.id === newTransaction.bankAccountId 
          ? { ...a, balance: a.balance + (newTransaction.type === 'Deposit' ? newTransaction.amount : -newTransaction.amount) }
          : a
      )
    }));
    return newTransaction;
  },

  updateTransaction: async (transaction) => {
    const updated = await bankingService.updateTransaction(transaction);
    set(state => ({
      transactions: state.transactions.map(t => t.id === transaction.id ? updated : t)
    }));
    return updated;
  },

  deleteTransaction: async (id) => {
    const transaction = await bankingService.getTransaction(id);
    if (transaction) {
      await bankingService.deleteTransaction(id);
      set(state => ({
        transactions: state.transactions.filter(t => t.id !== id),
        accounts: state.accounts.map(a => 
          a.id === transaction.bankAccountId 
            ? { ...a, balance: a.balance - (transaction.type === 'Deposit' ? transaction.amount : -transaction.amount) }
            : a
        )
      }));
    }
  },

  createScheduledPayment: async (payment) => {
    const newPayment = await bankingService.createScheduledPayment(payment);
    set(state => ({
      scheduledPayments: [...state.scheduledPayments, newPayment]
    }));
    return newPayment;
  },

  updateScheduledPayment: async (payment) => {
    const updated = await bankingService.updateScheduledPayment(payment);
    set(state => ({
      scheduledPayments: state.scheduledPayments.map(p => p.id === payment.id ? updated : p)
    }));
    return updated;
  },

  deleteScheduledPayment: async (id) => {
    await bankingService.deleteScheduledPayment(id);
    set(state => ({
      scheduledPayments: state.scheduledPayments.filter(p => p.id !== id)
    }));
  },

  createFee: async (fee) => {
    const newFee = await bankingService.createFee(fee);
    set(state => ({
      fees: [...state.fees, newFee]
    }));
    return newFee;
  },

  createStatement: async (statement) => {
    const newStatement = await bankingService.createStatement(statement);
    set(state => ({
      statements: [...state.statements, newStatement]
    }));
    return newStatement;
  },

  processStatement: async (id) => {
    const processed = await bankingService.processStatement(id);
    set(state => ({
      statements: state.statements.map(s => s.id === id ? processed : s)
    }));
    return processed;
  },

  createReconciliation: async (reconciliation) => {
    const newReconciliation = await bankingService.createReconciliation(reconciliation);
    set(state => ({
      reconciliations: [...state.reconciliations, newReconciliation]
    }));
    return newReconciliation;
  },

  completeReconciliation: async (id, notes) => {
    const completed = await bankingService.completeReconciliation(id, notes);
    set(state => ({
      reconciliations: state.reconciliations.map(r => r.id === id ? completed : r)
    }));
    return completed;
  },

  createCashFlowForecast: async (forecast) => {
    const newForecast = await bankingService.createCashFlowForecast(forecast);
    set(state => ({
      cashFlowForecasts: [...state.cashFlowForecasts, newForecast]
    }));
    return newForecast;
  },

  createAlert: async (alert) => {
    const newAlert = await bankingService.createAlert(alert);
    set(state => ({
      alerts: [...state.alerts, newAlert]
    }));
    return newAlert;
  },

  acknowledgeAlert: async (id) => {
    const acknowledged = await bankingService.acknowledgeAlert(id);
    set(state => ({
      alerts: state.alerts.map(a => a.id === id ? acknowledged : a)
    }));
    return acknowledged;
  },

  createCategory: async (category) => {
    const newCategory = await bankingService.createCategory(category);
    set(state => ({
      categories: [...state.categories, newCategory]
    }));
    return newCategory;
  },

  updateCategory: async (category) => {
    const updated = await bankingService.updateCategory(category);
    set(state => ({
      categories: state.categories.map(c => c.id === category.id ? updated : c)
    }));
    return updated;
  },

  deleteCategory: async (id) => {
    await bankingService.deleteCategory(id);
    set(state => ({
      categories: state.categories.filter(c => c.id !== id)
    }));
  },

  saveExchangeRate: async (rate) => {
    const savedRate = await bankingService.saveExchangeRate(rate);
    set(state => ({
      exchangeRates: state.exchangeRates.some(
        r => r.baseCurrency === rate.baseCurrency && r.targetCurrency === rate.targetCurrency
      )
        ? state.exchangeRates.map(r =>
            r.baseCurrency === rate.baseCurrency && r.targetCurrency === rate.targetCurrency
              ? savedRate
              : r
          )
        : [...state.exchangeRates, savedRate]
    }));
    return savedRate;
  }
}));
