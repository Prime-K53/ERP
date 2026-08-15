import { AccountType } from '../types';

export interface BankAccount {
  id: string;
  name: string;
  accountNumber: string;
  routingNumber?: string;
  bankName: string;
  bankAddress?: string;
  accountType: AccountType;
  status: 'Active' | 'Inactive' | 'Closed';
  openingDate: string;
  closingDate?: string;
  balance: number;
  availableBalance: number;
  currency: string;
  interestRate?: number;
  overdraftLimit?: number;
  lastReconciledDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankTransaction {
  id: string;
  date: string;
  amount: number;
  type: 'Deposit' | 'Withdrawal' | 'Transfer' | 'Fee' | 'Interest' | 'Payment';
  description: string;
  reference: string;
  bankAccountId: string;
  counterparty?: {
    name: string;
    accountNumber?: string;
    bankName?: string;
  };
  categoryId?: string;
  category?: string;
  reconciled: boolean;
  reconciliationId?: string;
  clearedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankStatement {
  id: string;
  bankAccountId: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  endingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalFees: number;
  transactions: BankTransaction[];
  importedAt: string;
  importedBy: string;
  source: 'Manual' | 'CSV' | 'OFX' | 'QFX' | 'API';
  fileName?: string;
  status: 'Imported' | 'Processed' | 'Reconciled';
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledPayment {
  id: string;
  name: string;
  description: string;
  bankAccountId: string;
  amount: number;
  frequency: 'Daily' | 'Weekly' | 'Biweekly' | 'Monthly' | 'Quarterly' | 'Annually';
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  nextPaymentDate: string;
  status: 'Active' | 'Paused' | 'Completed' | 'Cancelled';
  paymentMethod: 'Bank Transfer' | 'Wire Transfer' | 'ACH' | 'Check';
  counterparty: {
    name: string;
    accountNumber?: string;
    bankName?: string;
  };
  categoryId?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  date: string;
  source: 'Manual' | 'ECB' | 'FederalReserve' | 'BankAPI';
  updatedAt: string;
}

export interface BankFee {
  id: string;
  bankAccountId: string;
  date: string;
  amount: number;
  type: 'Monthly' | 'Transaction' | 'Overdraft' | 'Wire' | 'ACH' | 'ATM' | 'Service';
  description: string;
  reference: string;
  reconciled: boolean;
  reconciliationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Reconciliation {
  id: string;
  bankAccountId: string;
  statementId: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  endingBalance: number;
  bookBalance: number;
  clearedBalance: number;
  unclearedItems: BankTransaction[];
  adjustments: Adjustment[];
  difference: number;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Adjusted';
  completedBy?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Adjustment {
  id: string;
  reconciliationId: string;
  date: string;
  amount: number;
  type: 'Add' | 'Subtract' | 'Correction';
  description: string;
  reference: string;
  createdAt: string;
}

export interface CashFlowForecast {
  id: string;
  bankAccountId: string;
  date: string;
  projectedBalance: number;
  actualBalance?: number;
  variance: number;
  income: number;
  expenses: number;
  scheduledPayments: ScheduledPayment[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankAlert {
  id: string;
  bankAccountId: string;
  type: 'LowBalance' | 'LargeTransaction' | 'UnusualActivity' | 'ScheduledPayment';
  threshold: number;
  message: string;
  triggeredAt?: string;
  acknowledgedAt?: string;
  status: 'Active' | 'Triggered' | 'Acknowledged' | 'Resolved';
  createdAt: string;
  updatedAt: string;
}

export interface BankCategory {
  id: string;
  name: string;
  type: 'Income' | 'Expense' | 'Transfer' | 'Fee';
  parentCategoryId?: string;
  isDefault: boolean;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}
