import { dbService } from './db';

type Severity = 'high' | 'medium' | 'low';

type MinimalAccount = {
  id: string;
  code?: string;
  name?: string;
  type?: string;
};

type MinimalLedgerEntry = {
  id: string;
  date: string;
  amount: number;
  description?: string;
  debitAccountId?: string;
  creditAccountId?: string;
  referenceId?: string;
  customerId?: string;
  supplierId?: string;
};

type MinimalInvoice = {
  id: string;
  date?: string;
  status?: string;
  totalAmount?: number;
  paidAmount?: number;
  customerId?: string;
  customerName?: string;
  originModule?: string;
  origin_module?: string;
  backendInvoiceId?: string;
};

type MinimalSale = {
  id: string;
  date?: string;
  total?: number;
  totalAmount?: number;
  status?: string;
  invoiceId?: string;
};

type MinimalCustomerPayment = {
  id: string;
  date: string;
  amount?: number;
  amountRetained?: number;
  status?: string;
  customerId?: string;
  paymentMethod?: string;
  reference?: string;
  allocations?: Array<{ invoiceId: string; amount: number }>;
  receiptSnapshot?: {
    amountRetained?: number;
  };
};

type MinimalPurchase = {
  id: string;
  status?: string;
  total?: number;
  totalAmount?: number;
  paidAmount?: number;
};

type MinimalExpense = {
  id: string;
  date?: string;
  description?: string;
  amount?: number;
  status?: string;
  accountId?: string;
};

type MinimalIncome = {
  id: string;
  description?: string;
  amount?: number;
  accountId?: string;
};

type MinimalTransfer = {
  id: string;
  amount?: number;
  fromAccountId?: string;
  toAccountId?: string;
};

type MinimalSupplier = {
  id: string;
  name?: string;
  balance?: number;
};

type MinimalSupplierPayment = {
  id: string;
  date?: string;
  amount?: number;
  status?: string;
  supplierId?: string;
};

type MinimalCustomer = {
  id: string;
  name?: string;
  balance?: number;
};

type MinimalBankTransaction = {
  id: string;
  reference?: string;
  date?: string;
  amount?: number;
  bankAccountId?: string;
  type?: string;
};

type MinimalExaminationBatch = {
  id: string;
  status?: string;
  school_id?: string;
  customerId?: string;
  customer_id?: string;
  invoice_id?: string;
  invoiceId?: string;
  quotation_id?: string;
};

export interface FinancialIntegrityIssue {
  id: string;
  severity: Severity;
  type:
    | 'invoice_payment_mismatch'
    | 'missing_ledger_posting'
    | 'missing_bank_mirror'
    | 'orphaned_bank_reference'
    | 'duplicate_ledger_line'
    | 'broken_examination_link'
    | 'customer_balance_mismatch'
    | 'supplier_balance_mismatch'
    | 'manual_ledger_without_reference';
  entityType: string;
  entityId?: string;
  message: string;
  recommendedAction: string;
  relatedIds?: string[];
}

export interface FinancialIntegrityAuditResult {
  healthy: boolean;
  issues: FinancialIntegrityIssue[];
  summary: {
    totalIssues: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    checkedAt: string;
  };
}

export interface VerifiedMonthlyMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
}

export interface VerifiedDashboardMetrics {
  currentMonth: VerifiedMonthlyMetrics;
  previousMonth: VerifiedMonthlyMetrics;
  todayCollection: number;
  receivables: number;
  payables: number;
  cashPosition: number;
  cashForecast: number;
}

export interface FinancialIntegrityDataset {
  accounts?: MinimalAccount[];
  ledger?: MinimalLedgerEntry[];
  invoices?: MinimalInvoice[];
  sales?: MinimalSale[];
  customerPayments?: MinimalCustomerPayment[];
  purchases?: MinimalPurchase[];
  expenses?: MinimalExpense[];
  income?: MinimalIncome[];
  transfers?: MinimalTransfer[];
  supplierPayments?: MinimalSupplierPayment[];
  customers?: MinimalCustomer[];
  suppliers?: MinimalSupplier[];
  bankTransactions?: MinimalBankTransaction[];
  examinationBatches?: MinimalExaminationBatch[];
}

const round2 = (value: number): number =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeDateKey = (value?: string): string => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  return date.toISOString().split('T')[0];
};

const isActiveStatus = (status?: string): boolean => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized !== 'draft' && normalized !== 'cancelled' && normalized !== 'voided';
};

const isApprovedExpenseStatus = (status?: string): boolean => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'approved' || normalized === 'paid';
};

const isRevenueAccount = (account?: MinimalAccount): boolean => {
  const type = String(account?.type || '').toLowerCase();
  return type === 'revenue' || type === 'income' || type === 'other income';
};

const isExpenseAccount = (account?: MinimalAccount): boolean => {
  const type = String(account?.type || '').toLowerCase();
  return type === 'expense' || type === 'cost of goods sold';
};

const isCashLikeAccount = (account?: MinimalAccount): boolean => {
  const code = String(account?.code || account?.id || '');
  const name = String(account?.name || '').toLowerCase();
  return (
    code === '1000' ||
    code === '1050' ||
    code === '1060' ||
    name.includes('cash') ||
    name.includes('bank') ||
    name.includes('mobile money')
  );
};

const hasLedgerReference = (ledger: MinimalLedgerEntry[], referenceId?: string): boolean =>
  !!referenceId && ledger.some(entry => String(entry.referenceId || '') === String(referenceId));

const isValidMonthlyDate = (value: string | undefined, month: number, year: number): boolean => {
  const date = value ? new Date(value) : new Date('');
  if (Number.isNaN(date.getTime())) return false;
  return date.getMonth() === month && date.getFullYear() === year;
};

const buildMonthlySnapshot = (
  accounts: MinimalAccount[],
  ledger: MinimalLedgerEntry[],
  sales: MinimalSale[],
  expensesDataset: MinimalExpense[],
  invoices: MinimalInvoice[],
  supplierPayments: MinimalSupplierPayment[],
  month: number,
  year: number
): VerifiedMonthlyMetrics => {
  const revenueIds = new Set(
    accounts.filter(account => isRevenueAccount(account)).flatMap(account => [account.id, account.code || ''])
  );
  const expenseIds = new Set(
    accounts.filter(account => isExpenseAccount(account)).flatMap(account => [account.id, account.code || ''])
  );

  const revenue = round2(
    ledger
      .filter(entry => isValidMonthlyDate(entry.date, month, year))
      .reduce((sum, entry) => (
        revenueIds.has(String(entry.creditAccountId || '')) ? sum + Number(entry.amount || 0) : sum
      ), 0)
  );

  const liveSalesRevenue = round2(
    sales
      .filter(sale => isActiveStatus(sale.status))
      .filter(sale => isValidMonthlyDate(sale.date, month, year))
      .filter(sale => {
        const referencesToCheck = [sale.id, sale.invoiceId].filter(Boolean);
        return !referencesToCheck.some(referenceId => hasLedgerReference(ledger, referenceId));
      })
      .reduce((sum, sale) => sum + Number(sale.totalAmount ?? sale.total ?? 0), 0)
  );

  const expenses = round2(
    ledger
      .filter(entry => isValidMonthlyDate(entry.date, month, year))
      .reduce((sum, entry) => (
        expenseIds.has(String(entry.debitAccountId || '')) ? sum + Number(entry.amount || 0) : sum
      ), 0)
  );

  const liveExpenseTotal = round2(
    expensesDataset
      .filter(expense => isApprovedExpenseStatus(expense.status))
      .filter(expense => isValidMonthlyDate(expense.date, month, year))
      .filter(expense => !hasLedgerReference(ledger, expense.id))
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  );

  const liveInvoicesRevenue = round2(
    invoices
      .filter(invoice => isActiveStatus(invoice.status))
      .filter(invoice => isValidMonthlyDate(invoice.date, month, year))
      .filter(invoice => !hasLedgerReference(ledger, invoice.id))
      .reduce((sum, invoice) => sum + Number(invoice.totalAmount ?? 0), 0)
  );

  const liveSupplierPaymentsExpense = round2(
    supplierPayments
      .filter(payment => isActiveStatus(payment.status || 'Approved')) // fallback to approved if status missing
      .filter(payment => isValidMonthlyDate(payment.date, month, year))
      .filter(payment => !hasLedgerReference(ledger, payment.id))
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  );

  const verifiedRevenue = round2(revenue + liveSalesRevenue + liveInvoicesRevenue);
  const verifiedExpenses = round2(expenses + liveExpenseTotal + liveSupplierPaymentsExpense);

  return {
    revenue: verifiedRevenue,
    expenses: verifiedExpenses,
    netProfit: round2(verifiedRevenue - verifiedExpenses)
  };
};

const calculateCashPosition = (accounts: MinimalAccount[], ledger: MinimalLedgerEntry[]): number => {
  const cashIds = new Set(
    accounts.filter(account => isCashLikeAccount(account)).flatMap(account => [account.id, account.code || ''])
  );

  return round2(
    ledger.reduce((sum, entry) => {
      let next = sum;
      if (cashIds.has(String(entry.debitAccountId || ''))) {
        next += Number(entry.amount || 0);
      }
      if (cashIds.has(String(entry.creditAccountId || ''))) {
        next -= Number(entry.amount || 0);
      }
      return next;
    }, 0)
  );
};

const buildBankReferenceSet = (bankTransactions: MinimalBankTransaction[]): Set<string> =>
  new Set(
    bankTransactions
      .map(entry => String(entry.reference || '').trim())
      .filter(Boolean)
  );

const buildLedgerDuplicateIssues = (ledger: MinimalLedgerEntry[]): FinancialIntegrityIssue[] => {
  const seen = new Map<string, MinimalLedgerEntry[]>();
  for (const entry of ledger) {
    const key = [
      normalizeDateKey(entry.date),
      String(entry.referenceId || ''),
      String(entry.debitAccountId || ''),
      String(entry.creditAccountId || ''),
      round2(Number(entry.amount || 0)).toFixed(2),
      String(entry.description || '').trim().toLowerCase()
    ].join('|');
    const group = seen.get(key) || [];
    group.push(entry);
    seen.set(key, group);
  }

  const issues: FinancialIntegrityIssue[] = [];
  for (const [key, entries] of seen.entries()) {
    if (entries.length <= 1) continue;
    const sample = entries[0];
    issues.push({
      id: `duplicate-ledger-${key}`,
      severity: entries.length > 2 ? 'high' : 'medium',
      type: 'duplicate_ledger_line',
      entityType: 'ledger',
      entityId: sample.id,
      message: `Potential duplicate ledger posting detected for reference ${sample.referenceId || sample.id}.`,
      recommendedAction: 'Review the source transaction and void duplicate postings before using the figures in reports.',
      relatedIds: entries.map(entry => entry.id)
    });
  }
  return issues;
};

const buildBalanceMismatchIssues = (
  accounts: MinimalAccount[],
  ledger: MinimalLedgerEntry[],
  customers: MinimalCustomer[],
  suppliers: MinimalSupplier[]
): FinancialIntegrityIssue[] => {
  const issues: FinancialIntegrityIssue[] = [];
  const arIds = new Set(
    accounts
      .filter(account => String(account.code || account.id || '') === '1100')
      .flatMap(account => [account.id, account.code || ''])
  );
  const apIds = new Set(
    accounts
      .filter(account => String(account.code || account.id || '') === '2000')
      .flatMap(account => [account.id, account.code || ''])
  );

  for (const customer of customers) {
    const expected = round2(
      ledger
        .filter(entry => entry.customerId === customer.id)
        .reduce((sum, entry) => {
          let next = sum;
          if (arIds.has(String(entry.debitAccountId || ''))) next += Number(entry.amount || 0);
          if (arIds.has(String(entry.creditAccountId || ''))) next -= Number(entry.amount || 0);
          return next;
        }, 0)
    );
    const actual = round2(Number(customer.balance || 0));
    if (Math.abs(expected - actual) > 0.01) {
      issues.push({
        id: `customer-balance-${customer.id}`,
        severity: Math.abs(expected - actual) > 100 ? 'high' : 'medium',
        type: 'customer_balance_mismatch',
        entityType: 'customer',
        entityId: customer.id,
        message: `Customer balance for ${customer.name || customer.id} does not reconcile with Accounts Receivable.`,
        recommendedAction: `Set the customer balance to ${expected.toFixed(2)} or fix the missing AR postings.`,
        relatedIds: [customer.id]
      });
    }
  }

  for (const supplier of suppliers) {
    const expected = round2(
      ledger
        .filter(entry => entry.supplierId === supplier.id)
        .reduce((sum, entry) => {
          let next = sum;
          if (apIds.has(String(entry.creditAccountId || ''))) next += Number(entry.amount || 0);
          if (apIds.has(String(entry.debitAccountId || ''))) next -= Number(entry.amount || 0);
          return next;
        }, 0)
    );
    const actual = round2(Number(supplier.balance || 0));
    if (Math.abs(expected - actual) > 0.01) {
      issues.push({
        id: `supplier-balance-${supplier.id}`,
        severity: Math.abs(expected - actual) > 100 ? 'high' : 'medium',
        type: 'supplier_balance_mismatch',
        entityType: 'supplier',
        entityId: supplier.id,
        message: `Supplier balance for ${supplier.name || supplier.id} does not reconcile with Accounts Payable.`,
        recommendedAction: `Set the supplier balance to ${expected.toFixed(2)} or fix the missing AP postings.`,
        relatedIds: [supplier.id]
      });
    }
  }

  return issues;
};

export const financialIntegrityService = {
  buildVerifiedDashboardMetrics(
    dataset: FinancialIntegrityDataset,
    now: Date = new Date()
  ): VerifiedDashboardMetrics {
    const accounts = dataset.accounts || [];
    const ledger = dataset.ledger || [];
    const invoices = dataset.invoices || [];
    const sales = dataset.sales || [];
    const customerPayments = dataset.customerPayments || [];
    const purchases = dataset.purchases || [];
    const expenses = dataset.expenses || [];
    const supplierPayments = dataset.supplierPayments || [];

    const currentMonth = buildMonthlySnapshot(accounts, ledger, sales, expenses, invoices, supplierPayments, now.getMonth(), now.getFullYear());
    const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = buildMonthlySnapshot(accounts, ledger, sales, expenses, invoices, supplierPayments, previousDate.getMonth(), previousDate.getFullYear());

    const todayKey = normalizeDateKey(now.toISOString());
    const todayCollection = round2(
      customerPayments
        .filter(payment => String(payment.status || '').toLowerCase() !== 'voided')
        .filter(payment => normalizeDateKey(payment.date) === todayKey)
        .reduce((sum, payment) => {
          const retained = Number(
            payment.amountRetained ??
            payment.receiptSnapshot?.amountRetained ??
            payment.amount ??
            0
          );
          return sum + retained;
        }, 0)
    );

    const receivables = round2(
      invoices
        .filter(invoice => isActiveStatus(invoice.status))
        .reduce((sum, invoice) => {
          const outstanding = Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0);
          return sum + Math.max(0, outstanding);
        }, 0)
    );

    const payables = round2(
      purchases
        .filter(purchase => isActiveStatus(purchase.status))
        .reduce((sum, purchase) => {
          const total = Number(purchase.totalAmount ?? purchase.total ?? 0);
          const outstanding = total - Number(purchase.paidAmount || 0);
          return sum + Math.max(0, outstanding);
        }, 0)
    );

    const cashPosition = calculateCashPosition(accounts, ledger);

    return {
      currentMonth,
      previousMonth,
      todayCollection,
      receivables,
      payables,
      cashPosition,
      cashForecast: round2(cashPosition + receivables - payables)
    };
  },

  runAuditFromDataset(dataset: FinancialIntegrityDataset): FinancialIntegrityAuditResult {
    const accounts = dataset.accounts || [];
    const ledger = dataset.ledger || [];
    const invoices = dataset.invoices || [];
    const customerPayments = dataset.customerPayments || [];
    const purchases = dataset.purchases || [];
    const expenses = dataset.expenses || [];
    const income = dataset.income || [];
    const transfers = dataset.transfers || [];
    const supplierPayments = dataset.supplierPayments || [];
    const customers = dataset.customers || [];
    const suppliers = dataset.suppliers || [];
    const bankTransactions = dataset.bankTransactions || [];
    const examinationBatches = dataset.examinationBatches || [];

    const issues: FinancialIntegrityIssue[] = [];
    const bankReferences = buildBankReferenceSet(bankTransactions);
    const paymentTotalsByInvoice = new Map<string, number>();

    for (const payment of customerPayments) {
      for (const allocation of payment.allocations || []) {
        paymentTotalsByInvoice.set(
          allocation.invoiceId,
          round2((paymentTotalsByInvoice.get(allocation.invoiceId) || 0) + Number(allocation.amount || 0))
        );
      }

      if (String(payment.status || '').toLowerCase() !== 'voided' && !hasLedgerReference(ledger, payment.id)) {
        issues.push({
          id: `missing-ledger-payment-${payment.id}`,
          severity: 'high',
          type: 'missing_ledger_posting',
          entityType: 'customer_payment',
          entityId: payment.id,
          message: `Customer payment ${payment.id} is persisted without a matching ledger posting.`,
          recommendedAction: 'Re-post the payment through transactionService.addCustomerPayment or void and recreate it.'
        });
      }
    }

    for (const invoice of invoices) {
      if (!isActiveStatus(invoice.status)) continue;

      if (!hasLedgerReference(ledger, invoice.id)) {
        issues.push({
          id: `missing-ledger-invoice-${invoice.id}`,
          severity: 'high',
          type: 'missing_ledger_posting',
          entityType: 'invoice',
          entityId: invoice.id,
          message: `Invoice ${invoice.id} has no ledger trace even though it is active.`,
          recommendedAction: 'Re-post the invoice through transactionService.processInvoice so Accounts Receivable and revenue are recorded.'
        });
      }

      const expectedPaid = round2(paymentTotalsByInvoice.get(invoice.id) || 0);
      const actualPaid = round2(Number(invoice.paidAmount || 0));
      if (Math.abs(expectedPaid - actualPaid) > 0.01) {
        issues.push({
          id: `invoice-payment-mismatch-${invoice.id}`,
          severity: 'high',
          type: 'invoice_payment_mismatch',
          entityType: 'invoice',
          entityId: invoice.id,
          message: `Invoice ${invoice.id} paid amount (${actualPaid.toFixed(2)}) does not match allocated receipts (${expectedPaid.toFixed(2)}).`,
          recommendedAction: 'Reconcile invoice allocations and customer payment snapshots before using receivables or collections reports.',
          relatedIds: customerPayments
            .filter(payment => (payment.allocations || []).some(allocation => allocation.invoiceId === invoice.id))
            .map(payment => payment.id)
        });
      }
    }

    for (const expense of expenses) {
      if (!isApprovedExpenseStatus(expense.status)) continue;
      if (!hasLedgerReference(ledger, expense.id)) {
        issues.push({
          id: `missing-ledger-expense-${expense.id}`,
          severity: 'high',
          type: 'missing_ledger_posting',
          entityType: 'expense',
          entityId: expense.id,
          message: `Approved expense ${expense.id} is missing from the ledger.`,
          recommendedAction: 'Re-approve or repost the expense so it hits the expense ledger and cash/bank accounts.'
        });
      }
      if (!bankReferences.has(`EXP-${expense.id}`)) {
        issues.push({
          id: `missing-bank-expense-${expense.id}`,
          severity: 'medium',
          type: 'missing_bank_mirror',
          entityType: 'expense',
          entityId: expense.id,
          message: `Expense ${expense.id} does not have a matching bank movement reference.`,
          recommendedAction: 'Mirror approved expenses to bankTransactions so banking, cash flow, and reconciliation stay aligned.'
        });
      }
    }

    for (const entry of income) {
      if (!hasLedgerReference(ledger, entry.id)) {
        issues.push({
          id: `missing-ledger-income-${entry.id}`,
          severity: 'high',
          type: 'missing_ledger_posting',
          entityType: 'income',
          entityId: entry.id,
          message: `Income record ${entry.id} is missing from the ledger.`,
          recommendedAction: 'Re-post the income entry so cash and revenue stay in sync.'
        });
      }
      if (!bankReferences.has(`INC-${entry.id}`)) {
        issues.push({
          id: `missing-bank-income-${entry.id}`,
          severity: 'medium',
          type: 'missing_bank_mirror',
          entityType: 'income',
          entityId: entry.id,
          message: `Income record ${entry.id} does not have a matching bank movement reference.`,
          recommendedAction: 'Mirror income postings to bankTransactions for reconciliation and cash flow reporting.'
        });
      }
    }

    for (const transfer of transfers) {
      if (!hasLedgerReference(ledger, transfer.id)) {
        issues.push({
          id: `missing-ledger-transfer-${transfer.id}`,
          severity: 'high',
          type: 'missing_ledger_posting',
          entityType: 'transfer',
          entityId: transfer.id,
          message: `Transfer ${transfer.id} is missing from the ledger.`,
          recommendedAction: 'Re-post the transfer so both GL accounts reflect the movement.'
        });
      }
      if (!bankReferences.has(`TRF-OUT-${transfer.id}`) || !bankReferences.has(`TRF-IN-${transfer.id}`)) {
        issues.push({
          id: `missing-bank-transfer-${transfer.id}`,
          severity: 'medium',
          type: 'missing_bank_mirror',
          entityType: 'transfer',
          entityId: transfer.id,
          message: `Transfer ${transfer.id} does not have both outbound and inbound bank mirrors.`,
          recommendedAction: 'Create linked bank transactions for both sides of the transfer before reconciling bank balances.'
        });
      }
    }

    for (const payment of supplierPayments) {
      if (String(payment.status || '').toLowerCase() === 'voided') continue;
      if (!hasLedgerReference(ledger, payment.id)) {
        issues.push({
          id: `missing-ledger-supplier-payment-${payment.id}`,
          severity: 'high',
          type: 'missing_ledger_posting',
          entityType: 'supplier_payment',
          entityId: payment.id,
          message: `Supplier payment ${payment.id} is missing from Accounts Payable / cash ledger.`,
          recommendedAction: 'Re-post the supplier payment through transactionService.recordSupplierPayment.'
        });
      }
      if (!bankReferences.has(`SPAY-${payment.id}`)) {
        issues.push({
          id: `missing-bank-supplier-payment-${payment.id}`,
          severity: 'medium',
          type: 'missing_bank_mirror',
          entityType: 'supplier_payment',
          entityId: payment.id,
          message: `Supplier payment ${payment.id} does not have a mirrored bank transaction.`,
          recommendedAction: 'Mirror supplier disbursements to bankTransactions so banking and AP reconcile.'
        });
      }
    }

    for (const tx of bankTransactions) {
      const reference = String(tx.reference || '').trim();
      if (!reference) continue;
      if (reference.startsWith('EXP-')) {
        const sourceId = reference.replace('EXP-', '');
        if (!expenses.some(entry => entry.id === sourceId)) {
          issues.push({
            id: `orphan-bank-expense-${tx.id}`,
            severity: 'medium',
            type: 'orphaned_bank_reference',
            entityType: 'bank_transaction',
            entityId: tx.id,
            message: `Bank transaction ${tx.id} points to missing expense ${sourceId}.`,
            recommendedAction: 'Restore the source expense or void the orphaned bank movement.',
            relatedIds: [reference]
          });
        }
      }
      if (reference.startsWith('INC-')) {
        const sourceId = reference.replace('INC-', '');
        if (!income.some(entry => entry.id === sourceId)) {
          issues.push({
            id: `orphan-bank-income-${tx.id}`,
            severity: 'medium',
            type: 'orphaned_bank_reference',
            entityType: 'bank_transaction',
            entityId: tx.id,
            message: `Bank transaction ${tx.id} points to missing income record ${sourceId}.`,
            recommendedAction: 'Restore the source income entry or void the orphaned bank movement.',
            relatedIds: [reference]
          });
        }
      }
      if (reference.startsWith('SPAY-')) {
        const sourceId = reference.replace('SPAY-', '');
        if (!supplierPayments.some(entry => entry.id === sourceId)) {
          issues.push({
            id: `orphan-bank-supplier-payment-${tx.id}`,
            severity: 'medium',
            type: 'orphaned_bank_reference',
            entityType: 'bank_transaction',
            entityId: tx.id,
            message: `Bank transaction ${tx.id} points to missing supplier payment ${sourceId}.`,
            recommendedAction: 'Restore the supplier payment or void the orphaned bank transaction.',
            relatedIds: [reference]
          });
        }
      }
    }

    for (const batch of examinationBatches) {
      const status = String(batch.status || '').toLowerCase();
      if (!['approved', 'invoiced', 'converted'].includes(status)) continue;
      const invoiceId = String(batch.invoiceId || batch.invoice_id || '').trim();
      const customerId = String(batch.customerId || batch.customer_id || batch.school_id || '').trim();
      if (!customerId) {
        issues.push({
          id: `broken-exam-customer-${batch.id}`,
          severity: 'high',
          type: 'broken_examination_link',
          entityType: 'examination_batch',
          entityId: batch.id,
          message: `Examination batch ${batch.id} is financially active without a customer or school link.`,
          recommendedAction: 'Attach the batch to a school/customer before approving, invoicing, or collecting payment.'
        });
      }
      if (invoiceId && !invoices.some(invoice => String(invoice.id) === invoiceId)) {
        issues.push({
          id: `broken-exam-invoice-${batch.id}`,
          severity: 'high',
          type: 'broken_examination_link',
          entityType: 'examination_batch',
          entityId: batch.id,
          message: `Examination batch ${batch.id} references missing invoice ${invoiceId}.`,
          recommendedAction: 'Regenerate or relink the invoice so examination revenue is traceable end-to-end.',
          relatedIds: [invoiceId]
        });
      }
    }

    for (const entry of ledger) {
      if (!entry.referenceId && !entry.customerId && !entry.supplierId) {
        issues.push({
          id: `manual-ledger-${entry.id}`,
          severity: 'low',
          type: 'manual_ledger_without_reference',
          entityType: 'ledger',
          entityId: entry.id,
          message: `Ledger entry ${entry.id} has no source reference.`,
          recommendedAction: 'Attach a referenceId or document the origin so the entry can be traced in audits.'
        });
      }
    }

    issues.push(...buildLedgerDuplicateIssues(ledger));
    issues.push(...buildBalanceMismatchIssues(accounts, ledger, customers, suppliers));

    const summary = {
      totalIssues: issues.length,
      highSeverity: issues.filter(issue => issue.severity === 'high').length,
      mediumSeverity: issues.filter(issue => issue.severity === 'medium').length,
      lowSeverity: issues.filter(issue => issue.severity === 'low').length,
      checkedAt: new Date().toISOString()
    };

    return {
      healthy: issues.length === 0,
      issues,
      summary
    };
  },

  async runAudit(): Promise<FinancialIntegrityAuditResult> {
    const [
      accounts,
      ledger,
      invoices,
      customerPayments,
      purchases,
      expenses,
      income,
      transfers,
      supplierPayments,
      customers,
      suppliers,
      bankTransactions,
      examinationBatches
    ] = await Promise.all([
      dbService.getAll<any>('accounts'),
      dbService.getAll<any>('ledger'),
      dbService.getAll<any>('invoices'),
      dbService.getAll<any>('customerPayments'),
      dbService.getAll<any>('purchases'),
      dbService.getAll<any>('expenses'),
      dbService.getAll<any>('income'),
      dbService.getAll<any>('transfers'),
      dbService.getAll<any>('supplierPayments'),
      dbService.getAll<any>('customers'),
      dbService.getAll<any>('suppliers'),
      dbService.getAll<any>('bankTransactions'),
      dbService.getAll<any>('examinationBatches')
    ]);

    return this.runAuditFromDataset({
      accounts,
      ledger,
      invoices,
      customerPayments,
      purchases,
      expenses,
      income,
      transfers,
      supplierPayments,
      customers,
      suppliers,
      bankTransactions,
      examinationBatches
    });
  }
};

export default financialIntegrityService;
