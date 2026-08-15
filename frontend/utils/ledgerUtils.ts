/**
 * Ledger Utilities
 * Provides financial calculation logic for ERP documents.
 */

interface Transaction {
  date: string;
  description: string;
  reference: string;
  debit?: number;
  credit?: number;
  [key: string]: any;
}

/**
 * Calculates a cumulative running balance for a set of transactions.
 * 
 * @param transactions - Array of raw transaction objects
 * @param openingBalance - The starting balance for the period
 * @returns Array of transactions with an injected 'balance' property
 */
export const calculateLedger = (transactions: Transaction[], openingBalance: number) => {
  // 1. Sort transactions by date (ascending)
  const sortedTransactions = [...transactions].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let currentBalance = openingBalance;

  // 2. Map and calculate cumulative balance
  return sortedTransactions.map(tx => {
    const debit = tx.debit || 0;
    const credit = tx.credit || 0;
    
    // In ERP accounting for Statements: 
    // Debit increases the balance (owed), Credit decreases it (paid)
    currentBalance = currentBalance + debit - credit;

    return {
      ...tx,
      balance: currentBalance
    };
  });
};

/**
 * Calculates aging buckets for unpaid amounts.
 * 
 * @param transactions - Array of transaction objects (should include debits/invoices)
 * @returns Object containing totals for Current, 30, 60, and 90+ days
 */
export const calculateAging = (transactions: Transaction[]) => {
  const now = new Date();
  const aging = {
    current: 0,
    thirty: 0,
    sixty: 0,
    ninetyPlus: 0
  };

  transactions.forEach(tx => {
    // We only age Debits (Invoices/Charges) that haven't been fully offset
    // For simplicity in this logic, we look at individual debit entries
    if (tx.debit && tx.debit > 0) {
      const txDate = new Date(tx.date);
      const diffTime = Math.abs(now.getTime() - txDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 30) {
        aging.current += tx.debit;
      } else if (diffDays <= 60) {
        aging.thirty += tx.debit;
      } else if (diffDays <= 90) {
        aging.sixty += tx.debit;
      } else {
        aging.ninetyPlus += tx.debit;
      }
    }
  });

  return aging;
};
