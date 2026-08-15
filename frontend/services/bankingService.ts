import { dbService } from './db';
import { BankAccount, BankTransaction, BankStatement, ScheduledPayment, ExchangeRate, BankFee, Reconciliation, Adjustment, CashFlowForecast, BankAlert, BankCategory } from '../types/banking';
import { generateNextId, roundFinancial } from '../utils/helpers';
import { format, addDays, addMonths, addYears, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isWithinInterval, differenceInDays } from 'date-fns';

export const bankingService = {
  /**
   * Create a new bank account
   */
  async createAccount(account: Omit<BankAccount, 'id' | 'balance' | 'availableBalance' | 'createdAt' | 'updatedAt'>): Promise<BankAccount> {
    const newAccount: BankAccount = {
      ...account,
      id: generateNextId('BANK', await dbService.getAll<BankAccount>('bankAccounts')),
      balance: 0,
      availableBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await dbService.put('bankAccounts', newAccount);
    return newAccount;
  },

  /**
   * Get all bank accounts
   */
  async getAllAccounts(): Promise<BankAccount[]> {
    return await dbService.getAll<BankAccount>('bankAccounts');
  },

  /**
   * Get a specific bank account by ID
   */
  async getAccount(id: string): Promise<BankAccount | null> {
    return await dbService.get<BankAccount>('bankAccounts', id);
  },

  /**
   * Update a bank account
   */
  async updateAccount(account: Partial<BankAccount> & Pick<BankAccount, 'id'>): Promise<BankAccount> {
    const existing = await this.getAccount(account.id);
    if (!existing) throw new Error('Account not found');

    const updated: BankAccount = {
      ...existing,
      ...account,
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankAccounts', updated);
    return updated;
  },

  /**
   * Delete a bank account (mark as inactive)
   */
  async deleteAccount(id: string): Promise<void> {
    const account = await this.getAccount(id);
    if (!account) throw new Error('Account not found');

    await this.updateAccount({ 
      id, 
      status: 'Inactive',
      closingDate: new Date().toISOString()
    });
  },

  /**
   * Create a new bank transaction
   */
  async createTransaction(transaction: Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<BankTransaction> {
    const existingTransactions = await dbService.getAll<BankTransaction>('bankTransactions');
    const duplicate = existingTransactions.find(tx =>
      tx.bankAccountId === transaction.bankAccountId &&
      String(tx.reference || '').trim() !== '' &&
      tx.reference === transaction.reference &&
      tx.type === transaction.type
    );
    if (duplicate) {
      return duplicate;
    }

    const newTransaction: BankTransaction = {
      ...transaction,
      id: generateNextId('TXN', existingTransactions),
      reconciled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankTransactions', newTransaction);
    
    // Update account balances
    await this.updateAccountBalances(newTransaction.bankAccountId);

    return newTransaction;
  },

  /**
   * Get all transactions for an account
   */
  async getTransactions(accountId: string, startDate?: string, endDate?: string): Promise<BankTransaction[]> {
    const allTransactions = await dbService.getAll<BankTransaction>('bankTransactions');
    
    return allTransactions
      .filter(tx => tx.bankAccountId === accountId)
      .filter(tx => {
        if (!startDate || !endDate) return true;
        const txDate = new Date(tx.date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return isWithinInterval(txDate, { start, end });
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  /**
   * Get transaction by ID
   */
  async getTransaction(id: string): Promise<BankTransaction | null> {
    return await dbService.get<BankTransaction>('bankTransactions', id);
  },

  /**
   * Update a transaction
   */
  async updateTransaction(transaction: Partial<BankTransaction> & Pick<BankTransaction, 'id'>): Promise<BankTransaction> {
    const existing = await this.getTransaction(transaction.id);
    if (!existing) throw new Error('Transaction not found');

    const updated: BankTransaction = {
      ...existing,
      ...transaction,
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankTransactions', updated);
    
    // Update account balances
    await this.updateAccountBalances(updated.bankAccountId);

    return updated;
  },

  /**
   * Delete a transaction
   */
  async deleteTransaction(id: string): Promise<void> {
    const transaction = await this.getTransaction(id);
    if (!transaction) throw new Error('Transaction not found');

    await dbService.delete('bankTransactions', id);
    
    // Update account balances
    await this.updateAccountBalances(transaction.bankAccountId);
  },

  /**
   * Create a scheduled payment
   */
  async createScheduledPayment(payment: Omit<ScheduledPayment, 'id' | 'nextPaymentDate' | 'createdAt' | 'updatedAt'>): Promise<ScheduledPayment> {
    const newPayment: ScheduledPayment = {
      ...payment,
      id: generateNextId('SCH', await dbService.getAll<ScheduledPayment>('bankScheduledPayments')),
      nextPaymentDate: payment.startDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankScheduledPayments', newPayment);
    return newPayment;
  },

  /**
   * Get all scheduled payments
   */
  async getAllScheduledPayments(): Promise<ScheduledPayment[]> {
    return await dbService.getAll<ScheduledPayment>('bankScheduledPayments');
  },

  /**
   * Get scheduled payments for an account
   */
  async getScheduledPaymentsForAccount(accountId: string): Promise<ScheduledPayment[]> {
    const allPayments = await this.getAllScheduledPayments();
    return allPayments.filter(p => p.bankAccountId === accountId);
  },

  /**
   * Update a scheduled payment
   */
  async updateScheduledPayment(payment: Partial<ScheduledPayment> & Pick<ScheduledPayment, 'id'>): Promise<ScheduledPayment> {
    const existing = await dbService.get<ScheduledPayment>('bankScheduledPayments', payment.id);
    if (!existing) throw new Error('Scheduled payment not found');

    const updated: ScheduledPayment = {
      ...existing,
      ...payment,
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankScheduledPayments', updated);
    return updated;
  },

  /**
   * Delete a scheduled payment
   */
  async deleteScheduledPayment(id: string): Promise<void> {
    await dbService.delete('bankScheduledPayments', id);
  },

  /**
   * Process scheduled payments due today
   */
  async processDueScheduledPayments(): Promise<BankTransaction[]> {
    const today = format(new Date(), 'yyyy-MM-dd');
    const payments = await this.getAllScheduledPayments();
    const duePayments = payments.filter(p => p.nextPaymentDate === today && p.status === 'Active');
    
    const createdTransactions: BankTransaction[] = [];

    for (const payment of duePayments) {
      const transaction: Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'> = {
        date: today,
        amount: payment.amount,
        type: 'Transfer',
        description: payment.description,
        reference: `SCH-${payment.id}`,
        bankAccountId: payment.bankAccountId,
        counterparty: payment.counterparty,
        categoryId: payment.categoryId,
        category: payment.category,
        reconciled: false
      };

      const createdTx = await this.createTransaction(transaction);
      createdTransactions.push(createdTx);

      // Update next payment date based on frequency
      const nextDate = this.calculateNextPaymentDate(payment);
      await this.updateScheduledPayment({ 
        id: payment.id, 
        nextPaymentDate: nextDate 
      });
    }

    return createdTransactions;
  },

  /**
   * Calculate next payment date for scheduled payment
   */
  calculateNextPaymentDate(payment: ScheduledPayment): string {
    const currentDate = new Date(payment.nextPaymentDate);
    
    switch (payment.frequency) {
      case 'Daily':
        return format(addDays(currentDate, 1), 'yyyy-MM-dd');
      case 'Weekly':
        return format(addDays(currentDate, 7), 'yyyy-MM-dd');
      case 'Biweekly':
        return format(addDays(currentDate, 14), 'yyyy-MM-dd');
      case 'Monthly':
        return format(addMonths(currentDate, 1), 'yyyy-MM-dd');
      case 'Quarterly':
        return format(addMonths(currentDate, 3), 'yyyy-MM-dd');
      case 'Annually':
        return format(addYears(currentDate, 1), 'yyyy-MM-dd');
      default:
        return format(addDays(currentDate, 1), 'yyyy-MM-dd');
    }
  },

  /**
   * Create a bank fee
   */
  async createFee(fee: Omit<BankFee, 'id' | 'createdAt' | 'updatedAt'>): Promise<BankFee> {
    const newFee: BankFee = {
      ...fee,
      id: generateNextId('FEE', await dbService.getAll<BankFee>('bankFees')),
      reconciled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankFees', newFee);
    
    // Create corresponding transaction
    const transaction: Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'> = {
      date: fee.date,
      amount: fee.amount,
      type: 'Fee',
      description: fee.description,
      reference: `FEE-${newFee.id}`,
      bankAccountId: fee.bankAccountId,
      reconciled: false,
      categoryId: 'Bank Fees'
    };

    await this.createTransaction(transaction);

    return newFee;
  },

  /**
   * Get all fees for an account
   */
  async getFees(accountId: string, startDate?: string, endDate?: string): Promise<BankFee[]> {
    const allFees = await dbService.getAll<BankFee>('bankFees');
    
    return allFees
      .filter(fee => fee.bankAccountId === accountId)
      .filter(fee => {
        if (!startDate || !endDate) return true;
        const feeDate = new Date(fee.date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return isWithinInterval(feeDate, { start, end });
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  /**
   * Create a bank statement
   */
  async createStatement(statement: Omit<BankStatement, 'id' | 'importedAt' | 'createdAt' | 'updatedAt'>): Promise<BankStatement> {
    const newStatement: BankStatement = {
      ...statement,
      id: generateNextId('STMT', await dbService.getAll<BankStatement>('bankStatements')),
      importedAt: new Date().toISOString(),
      importedBy: 'System',
      status: 'Imported',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankStatements', newStatement);
    return newStatement;
  },

  /**
   * Get all statements for an account
   */
  async getStatements(accountId: string): Promise<BankStatement[]> {
    const allStatements = await dbService.getAll<BankStatement>('bankStatements');
    return allStatements.filter(s => s.bankAccountId === accountId);
  },

  /**
   * Get statement by ID
   */
  async getStatement(id: string): Promise<BankStatement | null> {
    return await dbService.get<BankStatement>('bankStatements', id);
  },

  /**
   * Process a bank statement (match transactions)
   */
  async processStatement(id: string): Promise<BankStatement> {
    const statement = await this.getStatement(id);
    if (!statement) throw new Error('Statement not found');

    // Match transactions with existing bank transactions
    const matchedTransactions = await this.matchStatementTransactions(statement);
    
    // Update statement status
    const updatedStatement: BankStatement = {
      ...statement,
      status: 'Processed',
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankStatements', updatedStatement);
    return updatedStatement;
  },

  /**
   * Match statement transactions with existing transactions
   */
  async matchStatementTransactions(statement: BankStatement): Promise<BankTransaction[]> {
    const existingTransactions = await this.getTransactions(statement.bankAccountId);
    const matched: BankTransaction[] = [];

    for (const stmtTx of statement.transactions) {
      const match = existingTransactions.find(tx => 
        tx.date === stmtTx.date &&
        tx.amount === stmtTx.amount &&
        tx.description === stmtTx.description
      );

      if (match) {
        // Mark transaction as reconciled
        await this.updateTransaction({ 
          id: match.id, 
          reconciled: true,
          reconciliationId: statement.id
        });
        matched.push(match);
      }
    }

    return matched;
  },

  /**
   * Create a reconciliation
   */
  async createReconciliation(reconciliation: Omit<Reconciliation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Reconciliation> {
    const newReconciliation: Reconciliation = {
      ...reconciliation,
      id: generateNextId('REC', await dbService.getAll<Reconciliation>('bankReconciliations')),
      status: 'In Progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankReconciliations', newReconciliation);
    return newReconciliation;
  },

  /**
   * Get all reconciliations for an account
   */
  async getReconciliations(accountId: string): Promise<Reconciliation[]> {
    const allReconciliations = await dbService.getAll<Reconciliation>('bankReconciliations');
    return allReconciliations.filter(r => r.bankAccountId === accountId);
  },

  /**
   * Get reconciliation by ID
   */
  async getReconciliation(id: string): Promise<Reconciliation | null> {
    return await dbService.get<Reconciliation>('bankReconciliations', id);
  },

  /**
   * Complete a reconciliation
   */
  async completeReconciliation(id: string, notes?: string): Promise<Reconciliation> {
    const reconciliation = await this.getReconciliation(id);
    if (!reconciliation) throw new Error('Reconciliation not found');

    // Calculate balances and differences
    const bookBalance = await this.calculateBookBalance(reconciliation.bankAccountId, reconciliation.endDate);
    const clearedBalance = reconciliation.endingBalance;
    const difference = bookBalance - clearedBalance;

    const updated: Reconciliation = {
      ...reconciliation,
      bookBalance,
      clearedBalance,
      difference,
      status: 'Completed',
      completedBy: 'System',
      completedAt: new Date().toISOString(),
      notes,
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankReconciliations', updated);
    return updated;
  },

  /**
   * Calculate book balance for an account up to a date
   */
  async calculateBookBalance(accountId: string, endDate: string): Promise<number> {
    const transactions = await this.getTransactions(accountId);
    const filtered = transactions.filter(tx => {
      const txDate = new Date(tx.date);
      const end = new Date(endDate);
      return txDate <= end;
    });

    return filtered.reduce((sum, tx) => {
      return sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount);
    }, 0);
  },

  /**
   * Create an adjustment
   */
  async createAdjustment(adjustment: Omit<Adjustment, 'id' | 'createdAt'>): Promise<Adjustment> {
    const newAdjustment: Adjustment = {
      ...adjustment,
      id: generateNextId('ADJ', await dbService.getAll<Adjustment>('bankAdjustments')),
      createdAt: new Date().toISOString()
    };

    await dbService.put('bankAdjustments', newAdjustment);
    return newAdjustment;
  },

  /**
   * Create a cash flow forecast
   */
  async createCashFlowForecast(forecast: Omit<CashFlowForecast, 'id' | 'createdAt' | 'updatedAt'>): Promise<CashFlowForecast> {
    const newForecast: CashFlowForecast = {
      ...forecast,
      id: generateNextId('CFF', await dbService.getAll<CashFlowForecast>('bankCashFlowForecasts')),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankCashFlowForecasts', newForecast);
    return newForecast;
  },

  /**
   * Get cash flow forecasts for an account
   */
  async getCashFlowForecasts(accountId: string, startDate?: string, endDate?: string): Promise<CashFlowForecast[]> {
    const allForecasts = await dbService.getAll<CashFlowForecast>('bankCashFlowForecasts');
    
    return allForecasts
      .filter(f => f.bankAccountId === accountId)
      .filter(f => {
        if (!startDate || !endDate) return true;
        const fDate = new Date(f.date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return isWithinInterval(fDate, { start, end });
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },

  /**
   * Create a bank alert
   */
  async createAlert(alert: Omit<BankAlert, 'id' | 'createdAt' | 'updatedAt'>): Promise<BankAlert> {
    const newAlert: BankAlert = {
      ...alert,
      id: generateNextId('ALRT', await dbService.getAll<BankAlert>('bankAlerts')),
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankAlerts', newAlert);
    return newAlert;
  },

  /**
   * Get all alerts for an account
   */
  async getAlerts(accountId: string): Promise<BankAlert[]> {
    const allAlerts = await dbService.getAll<BankAlert>('bankAlerts');
    return allAlerts.filter(a => a.bankAccountId === accountId);
  },

  /**
   * Trigger an alert
   */
  async triggerAlert(id: string, message: string): Promise<BankAlert> {
    const alert = await this.getAlert(id);
    if (!alert) throw new Error('Alert not found');

    const updated: BankAlert = {
      ...alert,
      triggeredAt: new Date().toISOString(),
      message,
      status: 'Triggered',
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankAlerts', updated);
    return updated;
  },

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(id: string): Promise<BankAlert> {
    const alert = await this.getAlert(id);
    if (!alert) throw new Error('Alert not found');

    const updated: BankAlert = {
      ...alert,
      acknowledgedAt: new Date().toISOString(),
      status: 'Acknowledged',
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankAlerts', updated);
    return updated;
  },

  /**
   * Create a bank category
   */
  async createCategory(category: Omit<BankCategory, 'id' | 'createdAt' | 'updatedAt'>): Promise<BankCategory> {
    const newCategory: BankCategory = {
      ...category,
      id: generateNextId('CAT', await dbService.getAll<BankCategory>('bankCategories')),
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankCategories', newCategory);
    return newCategory;
  },

  /**
   * Get all categories
   */
  async getAllCategories(): Promise<BankCategory[]> {
    return await dbService.getAll<BankCategory>('bankCategories');
  },

  /**
   * Get category by ID
   */
  async getCategory(id: string): Promise<BankCategory | null> {
    return await dbService.get<BankCategory>('bankCategories', id);
  },

  /**
   * Update a category
   */
  async updateCategory(category: Partial<BankCategory> & Pick<BankCategory, 'id'>): Promise<BankCategory> {
    const existing = await this.getCategory(category.id);
    if (!existing) throw new Error('Category not found');

    const updated: BankCategory = {
      ...existing,
      ...category,
      updatedAt: new Date().toISOString()
    };

    await dbService.put('bankCategories', updated);
    return updated;
  },

  /**
   * Delete a category
   */
  async deleteCategory(id: string): Promise<void> {
    await dbService.delete('bankCategories', id);
  },

  /**
   * Update account balances after transaction
   */
  async updateAccountBalances(accountId: string): Promise<void> {
    const transactions = await this.getTransactions(accountId);
    const balance = transactions.reduce((sum, tx) => {
      return sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount);
    }, 0);

    const availableBalance = balance; // In a real system, this would account for pending transactions

    await this.updateAccount({ 
      id: accountId, 
      balance,
      availableBalance 
    });
  },

  /**
   * Get exchange rate
   */
  async getExchangeRate(base: string, target: string): Promise<ExchangeRate | null> {
    const allRates = await dbService.getAll<ExchangeRate>('bankExchangeRates');
    return allRates.find(r => r.baseCurrency === base && r.targetCurrency === target) || null;
  },

  /**
   * Create or update exchange rate
   */
  async saveExchangeRate(rate: Omit<ExchangeRate, 'id' | 'updatedAt'>): Promise<ExchangeRate> {
    const existing = await this.getExchangeRate(rate.baseCurrency, rate.targetCurrency);
    
    if (existing) {
      const updated: ExchangeRate = {
        ...existing,
        rate: rate.rate,
        updatedAt: new Date().toISOString()
      };
      await dbService.put('bankExchangeRates', updated);
      return updated;
    } else {
      const newRate: ExchangeRate = {
        ...rate,
        id: generateNextId('EXR', await dbService.getAll<ExchangeRate>('bankExchangeRates')),
        updatedAt: new Date().toISOString()
      };
      await dbService.put('bankExchangeRates', newRate);
      return newRate;
    }
  },

  /**
   * Get all transactions (for context)
   */
  async getAllTransactions(): Promise<BankTransaction[]> {
    return await dbService.getAll<BankTransaction>('bankTransactions');
  },

  /**
   * Get all statements (for context)
   */
  async getAllStatements(): Promise<BankStatement[]> {
    return await dbService.getAll<BankStatement>('bankStatements');
  },

  /**
   * Get all exchange rates (for context)
   */
  async getAllExchangeRates(): Promise<ExchangeRate[]> {
    return await dbService.getAll<ExchangeRate>('bankExchangeRates');
  },

  /**
   * Get all fees (for context)
   */
  async getAllFees(): Promise<BankFee[]> {
    return await dbService.getAll<BankFee>('bankFees');
  },

  /**
   * Get all reconciliations (for context)
   */
  async getAllReconciliations(): Promise<Reconciliation[]> {
    return await dbService.getAll<Reconciliation>('bankReconciliations');
  },

  /**
   * Get all adjustments (for context)
   */
  async getAllAdjustments(): Promise<Adjustment[]> {
    return await dbService.getAll<Adjustment>('bankAdjustments');
  },

  /**
   * Get all cash flow forecasts (for context)
   */
  async getAllCashFlowForecasts(): Promise<CashFlowForecast[]> {
    return await dbService.getAll<CashFlowForecast>('bankCashFlowForecasts');
  },

  /**
   * Get all alerts (for context)
   */
  async getAllAlerts(): Promise<BankAlert[]> {
    return await dbService.getAll<BankAlert>('bankAlerts');
  },

  /**
   * Get alert by ID
   */
  async getAlert(id: string): Promise<BankAlert | null> {
    return await dbService.get<BankAlert>('bankAlerts', id);
  },

  // ==================== REPORT GENERATION FUNCTIONS ====================

  /**
   * Generate Transaction Report with filters
   */
  async generateTransactionReport(
    accountId: string,
    options: {
      startDate?: string;
      endDate?: string;
      type?: BankTransaction['type'];
      category?: string;
      minAmount?: number;
      maxAmount?: number;
      reconciled?: boolean;
    } = {}
  ): Promise<{
    transactions: BankTransaction[];
    summary: {
      totalDeposits: number;
      totalWithdrawals: number;
      netChange: number;
      transactionCount: number;
      reconciledCount: number;
    };
  }> {
    let transactions = await this.getTransactions(accountId);

    // Apply filters
    if (options.startDate) {
      transactions = transactions.filter(tx => new Date(tx.date) >= new Date(options.startDate!));
    }
    if (options.endDate) {
      transactions = transactions.filter(tx => new Date(tx.date) <= new Date(options.endDate!));
    }
    if (options.type) {
      transactions = transactions.filter(tx => tx.type === options.type);
    }
    if (options.category) {
      transactions = transactions.filter(tx => tx.category === options.category);
    }
    if (options.minAmount !== undefined) {
      transactions = transactions.filter(tx => tx.amount >= options.minAmount!);
    }
    if (options.maxAmount !== undefined) {
      transactions = transactions.filter(tx => tx.amount <= options.maxAmount!);
    }
    if (options.reconciled !== undefined) {
      transactions = transactions.filter(tx => tx.reconciled === options.reconciled);
    }

    const summary = {
      totalDeposits: transactions.filter(tx => tx.type === 'Deposit').reduce((sum, tx) => sum + tx.amount, 0),
      totalWithdrawals: transactions.filter(tx => tx.type === 'Withdrawal' || tx.type === 'Payment' || tx.type === 'Fee').reduce((sum, tx) => sum + tx.amount, 0),
      netChange: transactions.reduce((sum, tx) => {
        return sum + (tx.type === 'Deposit' || tx.type === 'Interest' ? tx.amount : -tx.amount);
      }, 0),
      transactionCount: transactions.length,
      reconciledCount: transactions.filter(tx => tx.reconciled).length
    };

    return { transactions, summary };
  },

  /**
   * Generate Account Statement Report
   */
  async generateAccountStatement(
    accountId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    account: BankAccount;
    statement: {
      openingBalance: number;
      closingBalance: number;
      totalDeposits: number;
      totalWithdrawals: number;
      totalFees: number;
      totalInterest: number;
      netChange: number;
    };
    transactions: BankTransaction[];
  }> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error('Account not found');

    const transactions = await this.getTransactions(accountId, startDate, endDate);
    
    // Calculate opening balance (balance before start date)
    const allTransactions = await this.getTransactions(accountId);
    const openingBalance = allTransactions
      .filter(tx => new Date(tx.date) < new Date(startDate))
      .reduce((sum, tx) => sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount), 0);

    const deposits = transactions.filter(tx => tx.type === 'Deposit');
    const withdrawals = transactions.filter(tx => tx.type === 'Withdrawal' || tx.type === 'Payment');
    const fees = transactions.filter(tx => tx.type === 'Fee');
    const interest = transactions.filter(tx => tx.type === 'Interest');

    const statement = {
      openingBalance,
      closingBalance: openingBalance + deposits.reduce((sum, tx) => sum + tx.amount, 0) - withdrawals.reduce((sum, tx) => sum + tx.amount, 0) - fees.reduce((sum, tx) => sum + tx.amount, 0) + interest.reduce((sum, tx) => sum + tx.amount, 0),
      totalDeposits: deposits.reduce((sum, tx) => sum + tx.amount, 0),
      totalWithdrawals: withdrawals.reduce((sum, tx) => sum + tx.amount, 0),
      totalFees: fees.reduce((sum, tx) => sum + tx.amount, 0),
      totalInterest: interest.reduce((sum, tx) => sum + tx.amount, 0),
      netChange: deposits.reduce((sum, tx) => sum + tx.amount, 0) - withdrawals.reduce((sum, tx) => sum + tx.amount, 0) - fees.reduce((sum, tx) => sum + tx.amount, 0) + interest.reduce((sum, tx) => sum + tx.amount, 0)
    };

    return { account, statement, transactions };
  },

  /**
   * Generate Reconciliation Report
   */
  async generateReconciliationReport(accountId: string): Promise<{
    reconciliations: Reconciliation[];
    summary: {
      totalReconciliations: number;
      completedCount: number;
      pendingCount: number;
      totalAdjusted: number;
    };
  }> {
    const reconciliations = await this.getReconciliations(accountId);
    const adjustments = await dbService.getAll<Adjustment>('bankAdjustments');
    
    const accountReconciliationIds = reconciliations.map(r => r.id);
    const relevantAdjustments = adjustments.filter(a => accountReconciliationIds.includes(a.reconciliationId));

    const summary = {
      totalReconciliations: reconciliations.length,
      completedCount: reconciliations.filter(r => r.status === 'Completed').length,
      pendingCount: reconciliations.filter(r => r.status === 'Pending' || r.status === 'In Progress').length,
      totalAdjusted: relevantAdjustments.reduce((sum, adj) => sum + adj.amount, 0)
    };

    return { reconciliations, summary };
  },

  /**
   * Generate Cash Flow Report
   */
  async generateCashFlowReport(
    accountId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    cashFlow: {
      totalInflow: number;
      totalOutflow: number;
      netCashFlow: number;
      openingBalance: number;
      closingBalance: number;
    };
    byCategory: Record<string, { inflow: number; outflow: number; count: number }>;
    transactions: BankTransaction[];
  }> {
    const transactions = await this.getTransactions(accountId, startDate, endDate);
    const categories: Record<string, { inflow: number; outflow: number; count: number }> = {};

    let totalInflow = 0;
    let totalOutflow = 0;

    transactions.forEach(tx => {
      const category = tx.category || 'Uncategorized';
      if (!categories[category]) {
        categories[category] = { inflow: 0, outflow: 0, count: 0 };
      }
      categories[category].count++;

      if (tx.type === 'Deposit' || tx.type === 'Interest') {
        totalInflow += tx.amount;
        categories[category].inflow += tx.amount;
      } else {
        totalOutflow += tx.amount;
        categories[category].outflow += tx.amount;
      }
    });

    // Calculate opening balance
    const allTransactions = await this.getTransactions(accountId);
    const openingBalance = allTransactions
      .filter(tx => new Date(tx.date) < new Date(startDate))
      .reduce((sum, tx) => sum + (tx.type === 'Deposit' || tx.type === 'Interest' ? tx.amount : -tx.amount), 0);

    const cashFlow = {
      totalInflow,
      totalOutflow,
      netCashFlow: totalInflow - totalOutflow,
      openingBalance,
      closingBalance: openingBalance + totalInflow - totalOutflow
    };

    return { cashFlow, byCategory: categories, transactions };
  },

  /**
   * Generate Bank Fees Report
   */
  async generateFeesReport(
    accountId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    fees: BankFee[];
    summary: {
      totalFees: number;
      byType: Record<string, number>;
      feeCount: number;
    };
  }> {
    let fees = await this.getFees(accountId);

    if (startDate) {
      fees = fees.filter(f => new Date(f.date) >= new Date(startDate));
    }
    if (endDate) {
      fees = fees.filter(f => new Date(f.date) <= new Date(endDate));
    }

    const byType: Record<string, number> = {};
    let totalFees = 0;

    fees.forEach(fee => {
      totalFees += fee.amount;
      if (!byType[fee.type]) {
        byType[fee.type] = 0;
      }
      byType[fee.type] += fee.amount;
    });

    return {
      fees,
      summary: {
        totalFees,
        byType,
        feeCount: fees.length
      }
    };
  },

  /**
   * Generate Category Analysis Report
   */
  async generateCategoryReport(
    accountId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    categories: {
      category: string;
      totalAmount: number;
      transactionCount: number;
      percentage: number;
      type: 'Income' | 'Expense' | 'Transfer' | 'Fee';
    }[];
    totalIncome: number;
    totalExpense: number;
  }> {
    let transactions = await this.getTransactions(accountId);

    if (startDate) {
      transactions = transactions.filter(tx => new Date(tx.date) >= new Date(startDate));
    }
    if (endDate) {
      transactions = transactions.filter(tx => new Date(tx.date) <= new Date(endDate));
    }

    const categoryMap: Record<string, { amount: number; count: number; type: string }> = {};
    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach(tx => {
      const category = tx.category || 'Uncategorized';
      if (!categoryMap[category]) {
        categoryMap[category] = { amount: 0, count: 0, type: 'Transfer' };
      }
      categoryMap[category].amount += tx.amount;
      categoryMap[category].count++;

      if (tx.type === 'Deposit' || tx.type === 'Interest') {
        categoryMap[category].type = 'Income';
        totalIncome += tx.amount;
      } else if (tx.type === 'Withdrawal' || tx.type === 'Payment') {
        categoryMap[category].type = 'Expense';
        totalExpense += tx.amount;
      } else if (tx.type === 'Fee') {
        categoryMap[category].type = 'Fee';
        totalExpense += tx.amount;
      }
    });

    const totalAmount = totalIncome + totalExpense;
    const categories = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      totalAmount: data.amount,
      transactionCount: data.count,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      type: data.type as 'Income' | 'Expense' | 'Transfer' | 'Fee'
    })).sort((a, b) => b.totalAmount - a.totalAmount);

    return { categories, totalIncome, totalExpense };
  },

  /**
   * Export transactions to CSV
   */
  async exportTransactionsToCSV(accountId: string, transactions: BankTransaction[]): Promise<void> {
    const account = await this.getAccount(accountId);
    const filename = `${account?.name || 'bank'}_transactions_${new Date().toISOString().split('T')[0]}`;
    
    const exportData = transactions.map(tx => ({
      Date: tx.date,
      Description: tx.description,
      Reference: tx.reference,
      Type: tx.type,
      Amount: tx.amount,
      Category: tx.category || '',
      Reconciled: tx.reconciled ? 'Yes' : 'No',
      Counterparty: tx.counterparty?.name || ''
    }));

    // Use dynamic import for exportToCSV
    const { exportToCSV } = await import('./excelService');
    exportToCSV(exportData, filename);
  },

  /**
   * Export report to PDF (generates printable HTML)
   */
  generatePrintableHTML(
    title: string,
    reportData: any,
    options: {
      showSummary?: boolean;
      showTransactions?: boolean;
      dateRange?: { start: string; end: string };
    } = {}
  ): string {
    const { showSummary = true, showTransactions = true, dateRange } = options;
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
          h2 { color: #334155; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; }
          .summary { display: flex; gap: 20px; margin: 20px 0; }
          .summary-card { flex: 1; padding: 15px; background: #f8fafc; border-radius: 8px; }
          .summary-card h3 { margin: 0 0 10px 0; color: #64748b; font-size: 12px; }
          .summary-card .value { font-size: 24px; font-weight: bold; color: #1e293b; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${dateRange ? `<p>Period: ${dateRange.start} to ${dateRange.end}</p>` : ''}
        <p>Generated: ${new Date().toLocaleString()}</p>
    `;

    if (showSummary && reportData.summary) {
      html += `<h2>Summary</h2><div class="summary">`;
      const summary = reportData.summary;
      
      if (summary.totalDeposits !== undefined) {
        html += `
          <div class="summary-card">
            <h3>Total Deposits</h3>
            <div class="value positive">$${summary.totalDeposits.toLocaleString()}</div>
          </div>
          <div class="summary-card">
            <h3>Total Withdrawals</h3>
            <div class="value negative">$${summary.totalWithdrawals.toLocaleString()}</div>
          </div>
          <div class="summary-card">
            <h3>Net Change</h3>
            <div class="value ${summary.netChange >= 0 ? 'positive' : 'negative'}">$${summary.netChange.toLocaleString()}</div>
          </div>
        `;
      }
      
      if (summary.transactionCount !== undefined) {
        html += `
          <div class="summary-card">
            <h3>Transaction Count</h3>
            <div class="value">${summary.transactionCount}</div>
          </div>
        `;
      }

      html += `</div>`;
    }

    if (showTransactions && reportData.transactions && reportData.transactions.length > 0) {
      html += `
        <h2>Transactions</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Reference</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Reconciled</th>
            </tr>
          </thead>
          <tbody>
      `;

      reportData.transactions.forEach((tx: BankTransaction) => {
        html += `
          <tr>
            <td>${tx.date}</td>
            <td>${tx.description}</td>
            <td>${tx.reference}</td>
            <td>${tx.type}</td>
            <td class="${tx.type === 'Deposit' || tx.type === 'Interest' ? 'positive' : 'negative'}">$${tx.amount.toLocaleString()}</td>
            <td>${tx.category || '-'}</td>
            <td>${tx.reconciled ? 'Yes' : 'No'}</td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    }

    html += `
        <div class="footer">
          <p>Prime ERP System - Banking Report</p>
          <p>This is a computer-generated document. No signature required.</p>
        </div>
      </body>
      </html>
    `;

    return html;
  },

  /**
   * Print report
   */
  printReport(html: string): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  }
};
