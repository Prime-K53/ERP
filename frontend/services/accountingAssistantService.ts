const round2 = (value: number): number =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const daysBetween = (a: string, b: string): number => {
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs((da.getTime() - db.getTime()) / 86400000);
};

const findMatchingKeyword = (
  description: string,
  mappings: [string[], string, string][]
): { category: string; accountId: string } | null => {
  const lower = description.toLowerCase();
  for (const [keywords, category, accountId] of mappings) {
    if (keywords.some(k => lower.includes(k))) {
      return { category, accountId };
    }
  }
  return null;
};

const EXPENSE_MAPPINGS: [string[], string, string][] = [
  [['rent', 'lease'], 'Rent', '6100'],
  [['electric', 'water', 'utility'], 'Utilities', '6200'],
  [['salary', 'wage', 'payroll'], 'Salaries', '6300'],
  [['print', 'paper', 'ink', 'toner'], 'Cost of Goods', '5000'],
  [['market', 'advert', 'promo'], 'Marketing', '6100'],
  [['meal', 'food', 'lunch'], 'Meals & Entertainment', '6100'],
  [['fuel', 'petrol', 'diesel'], 'Transport', '6100'],
  [['software', 'hosting', 'domain'], 'Software Subscriptions', '6100'],
  [['insurance'], 'Insurance', '6100'],
];

export function autoCategorizeExpense(expense: {
  description: string;
  amount: number;
  category?: string;
  vendor?: string;
}): { category: string; confidence: number; suggestedAccountId: string } {
  const match = findMatchingKeyword(
    `${expense.description} ${expense.vendor || ''}`,
    EXPENSE_MAPPINGS
  );
  if (match) {
    return {
      category: match.category,
      confidence: 0.85,
      suggestedAccountId: match.accountId,
    };
  }
  return {
    category: 'General',
    confidence: 0.3,
    suggestedAccountId: '6100',
  };
}

export function matchBankTransaction(
  transaction: { description: string; amount: number; date: string },
  erpRecords: { invoices: any[]; expenses: any[]; payments: any[]; sales: any[] }
): { match: boolean; matchedTo?: { type: string; id: string; name: string }; confidence: number; reason: string } {
  const txAmount = round2(transaction.amount);

  for (const invoice of erpRecords.invoices) {
    const invAmount = round2(invoice.totalAmount ?? invoice.total ?? 0);
    if (invAmount === txAmount && daysBetween(transaction.date, invoice.date || invoice.invoiceDate || '') <= 3) {
      return {
        match: true,
        matchedTo: { type: 'invoice', id: invoice.id, name: invoice.customerName || invoice.name || '' },
        confidence: 0.9,
        reason: `Matched to invoice ${invoice.id} by amount and date proximity`,
      };
    }
  }

  for (const expense of erpRecords.expenses) {
    const expAmount = round2(expense.amount ?? 0);
    if (expAmount === txAmount && daysBetween(transaction.date, expense.date || '') <= 3) {
      return {
        match: true,
        matchedTo: { type: 'expense', id: expense.id, name: expense.description || expense.name || '' },
        confidence: 0.85,
        reason: `Matched to expense ${expense.id} by amount and date proximity`,
      };
    }
  }

  for (const payment of erpRecords.payments) {
    const payAmount = round2(payment.amount ?? 0);
    if (payAmount === txAmount && daysBetween(transaction.date, payment.date || '') <= 3) {
      return {
        match: true,
        matchedTo: { type: 'payment', id: payment.id, name: payment.reference || payment.name || '' },
        confidence: 0.85,
        reason: `Matched to payment ${payment.id} by amount and date proximity`,
      };
    }
  }

  for (const sale of erpRecords.sales) {
    const saleAmount = round2(sale.totalAmount ?? sale.total ?? sale.amount ?? 0);
    if (saleAmount === txAmount && daysBetween(transaction.date, sale.date || sale.saleDate || '') <= 3) {
      return {
        match: true,
        matchedTo: { type: 'sale', id: sale.id, name: sale.customerName || sale.name || '' },
        confidence: 0.85,
        reason: `Matched to sale ${sale.id} by amount and date proximity`,
      };
    }
  }

  return {
    match: false,
    confidence: 0,
    reason: 'No matching ERP record found within 3 days with same amount',
  };
}

export function suggestJournalEntry(
  description: string,
  amount: number
): { debitAccountId: string; creditAccountId: string; description: string; confidence: number }[] {
  const lower = description.toLowerCase();

  if (lower.includes('purchase equipment') || lower.includes('buy equipment') || lower.includes('acquire equipment')) {
    return [{
      debitAccountId: '1500',
      creditAccountId: '1050',
      description: `Purchase of equipment: ${description}`,
      confidence: 0.85,
    }];
  }

  if (lower.includes('salary') || lower.includes('payroll') || lower.includes('paid salary')) {
    return [{
      debitAccountId: '6300',
      creditAccountId: '1050',
      description: `Salary payment: ${description}`,
      confidence: 0.9,
    }];
  }

  if (lower.includes('cash sale') || lower.includes('cash sales')) {
    return [{
      debitAccountId: '1000',
      creditAccountId: '4000',
      description: `Cash sale: ${description}`,
      confidence: 0.9,
    }];
  }

  if (lower.includes('credit sale') || lower.includes('credit sales')) {
    return [{
      debitAccountId: '1100',
      creditAccountId: '4000',
      description: `Credit sale: ${description}`,
      confidence: 0.9,
    }];
  }

  if (lower.includes('paid supplier') || lower.includes('supplier payment')) {
    return [{
      debitAccountId: '2000',
      creditAccountId: '1050',
      description: `Supplier payment: ${description}`,
      confidence: 0.85,
    }];
  }

  if (lower.includes('owner investment') || lower.includes('capital injection')) {
    return [{
      debitAccountId: '1000',
      creditAccountId: '3000',
      description: `Owner investment: ${description}`,
      confidence: 0.9,
    }];
  }

  if (lower.includes('withdrawal') || lower.includes('owner draw') || lower.includes('drawing')) {
    return [{
      debitAccountId: '3000',
      creditAccountId: '1000',
      description: `Owner withdrawal: ${description}`,
      confidence: 0.9,
    }];
  }

  return [{
    debitAccountId: '5000',
    creditAccountId: '1000',
    description: 'General entry',
    confidence: 0.3,
  }];
}

const ASSET_TYPES = ['asset', 'current asset', 'fixed asset', 'non-current asset'];

export function detectAccountingInconsistencies(
  ledger: any[],
  accounts: any[]
): { type: string; severity: 'low' | 'medium' | 'high'; detail: string; recommendation: string }[] {
  const issues: { type: string; severity: 'low' | 'medium' | 'high'; detail: string; recommendation: string }[] = [];

  const accountMap = new Map<string, any>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc);
    if (acc.code) accountMap.set(acc.code, acc);
  }

  const assetAccountIds = new Set<string>();
  for (const acc of accounts) {
    const type = String(acc.type || '').toLowerCase();
    if (ASSET_TYPES.includes(type)) {
      assetAccountIds.add(acc.id);
      if (acc.code) assetAccountIds.add(acc.code);
    }
  }

  const unbalancedEntries: any[] = [];
  for (const entry of ledger) {
    if (!entry.debitAccountId || !entry.creditAccountId) {
      unbalancedEntries.push(entry);
    }
  }
  if (unbalancedEntries.length > 0) {
    issues.push({
      type: 'unbalanced_journal_entry',
      severity: 'high',
      detail: `Found ${unbalancedEntries.length} journal entries missing debit or credit account.`,
      recommendation: 'Review each entry and assign the correct debit and credit accounts before posting.',
    });
  }

  const totalDebits = round2(
    ledger.reduce((sum, e) => sum + Number(e.debitAccountId ? e.amount || 0 : 0), 0)
  );
  const totalCredits = round2(
    ledger.reduce((sum, e) => sum + Number(e.creditAccountId ? e.amount || 0 : 0), 0)
  );
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    issues.push({
      type: 'unbalanced_ledger',
      severity: 'high',
      detail: `Total debits (${totalDebits}) do not equal total credits (${totalCredits}). Difference: ${round2(totalDebits - totalCredits)}.`,
      recommendation: 'Locate the unbalanced posting and add a correcting entry to balance the ledger.',
    });
  }

  for (const entry of ledger) {
    if (entry.debitAccountId && assetAccountIds.has(entry.debitAccountId)) {
      continue;
    }
    if (entry.creditAccountId && assetAccountIds.has(entry.creditAccountId)) {
      const amount = Number(entry.amount || 0);
      if (amount > 0) {
        issues.push({
          type: 'unusual_balance_sign',
          severity: 'medium',
          detail: `Asset account ${entry.creditAccountId} has a credit balance of ${amount} in entry ${entry.id}. Asset accounts should normally have debit balances.`,
          recommendation: 'Verify that this credit posting is correct; if not, reverse or correct the entry.',
        });
      }
    }
  }

  const requiredAccounts = ['1000', '1050', '2000', '4000', '5000'];
  const existingCodes = new Set(accounts.map(a => a.code).filter(Boolean));
  const existingIds = new Set(accounts.map(a => a.id));
  for (const code of requiredAccounts) {
    if (!existingCodes.has(code) && !existingIds.has(code)) {
      issues.push({
        type: 'missing_required_account',
        severity: 'high',
        detail: `Required account with code ${code} is missing from the chart of accounts.`,
        recommendation: `Create account code ${code} with the appropriate type and name to ensure proper financial reporting.`,
      });
    }
  }

  const allAmounts = ledger
    .map(e => Number(e.amount || 0))
    .filter(a => a > 0)
    .sort((a, b) => b - a);

  const totalLedgerAmount = allAmounts.reduce((s, a) => s + a, 0);
  const medianAmount = allAmounts.length > 0
    ? allAmounts[Math.floor(allAmounts.length / 2)]
    : 0;

  for (const entry of ledger) {
    const amount = Number(entry.amount || 0);
    if (amount > medianAmount * 10 && amount > totalLedgerAmount * 0.05) {
      issues.push({
        type: 'unusually_large_adjustment',
        severity: 'low',
        detail: `Entry ${entry.id} has an unusually large amount (${amount}) compared to the median (${medianAmount}).`,
        recommendation: 'Review the entry to confirm the amount is correct and properly authorized.',
      });
    }
  }

  return issues;
}

export function suggestCorrection(
  inconsistency: { type: string; detail: string }
): {
  description: string;
  journalEntry: { debitAccountId: string; creditAccountId: string; amount: number; description: string } | null;
} {
  switch (inconsistency.type) {
    case 'unbalanced_journal_entry':
    case 'unbalanced_ledger':
      return {
        description: 'Post a correcting journal entry to balance the accounts.',
        journalEntry: {
          debitAccountId: '3999',
          creditAccountId: '3999',
          amount: 0,
          description: 'Suspense correction for unbalanced entry',
        },
      };

    case 'unusual_balance_sign': {
      const match = inconsistency.detail.match(/account (\S+)/);
      const accountId = match ? match[1] : '5000';
      return {
        description: 'Reverse the incorrectly signed posting to the asset account.',
        journalEntry: {
          debitAccountId: accountId,
          creditAccountId: '3999',
          amount: 0,
          description: `Correction of unusual balance sign on account ${accountId}`,
        },
      };
    }

    case 'missing_required_account': {
      const match = inconsistency.detail.match(/code (\d+)/);
      const code = match ? match[1] : '5000';
      return {
        description: `Create a new account with code ${code} in the chart of accounts.`,
        journalEntry: null,
      };
    }

    case 'unusually_large_adjustment':
      return {
        description: 'Review and verify the large adjustment entry. If incorrect, post a reversal.',
        journalEntry: null,
      };

    default:
      return {
        description: `Review the following issue and take corrective action: ${inconsistency.detail}`,
        journalEntry: null,
      };
  }
}
