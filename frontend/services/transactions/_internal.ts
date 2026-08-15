import { dbService } from '../db';
import { logger } from '@/services/logger';
import { getFifoUnitCost } from '../fifoCostService';
import { currencyService } from '../currencyService';
import {
    LedgerEntry, BankAccount, BankTransaction, VATConfig,
    MultiCurrencyJournalEntry, MultiCurrencyTransactionLine, CurrencyGainLoss,
    Invoice
} from '../../types';
import { generateNextId, roundToCurrency } from '../../utils/helpers';

export const getCompanyConfig = () => {
    const saved = localStorage.getItem('nexus_company_config');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            logger.error("Failed to parse company config", e);
        }
    }
    return null;
};

export const getGLConfig = () => {
    const saved = localStorage.getItem('nexus_company_config');
    const defaultConfig = {
        defaultSalesAccount: '4000',
        defaultInventoryAccount: '1200',
        defaultCOGSAccount: '5000',
        accountsReceivable: '1100',
        accountsPayable: '2000',
        cashDrawerAccount: '1000',
        bankAccount: '1050',
        mobileMoneyAccount: '1060',
        salesReturnAccount: '4100',
        customerDepositAccount: '2200',
        otherIncomeAccount: '4900',
        defaultExpenseAccount: '6100',
        defaultLaborWagesAccount: '6300',
        retainedEarningsAccount: '3000'
    };

    if (saved) {
        try {
            const config = JSON.parse(saved);
            return {
                ...defaultConfig,
                ...(config.glMapping || {})
            };
        } catch (e) {
            logger.error("Failed to parse company config", e);
        }
    }
    return defaultConfig;
};

export const generateId = (prefix: string, randomLength = 9): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, randomLength)}`;
};

export const calculateBankBalance = (transactions: BankTransaction[], accountId: string): number => {
    return transactions
        .filter(tx => tx.bankAccountId === accountId)
        .reduce((sum, tx) => sum + (tx.type === 'Deposit' ? tx.amount : -tx.amount), 0);
};

export const ensureBankAccounts = async (bankAccountsStore: any): Promise<BankAccount[]> => {
    const existing = await bankAccountsStore.getAll();
    if (existing.length > 0) return existing;

    const now = new Date().toISOString();
    const sampleAccounts: Omit<BankAccount, 'id' | 'balance' | 'availableBalance' | 'createdAt' | 'updatedAt'>[] = [
        {
            name: 'Cash Account',
            accountNumber: 'CASH-001',
            bankName: 'Prime Bank',
            accountType: 'Asset',
            status: 'Active',
            openingDate: now,
            currency: 'USD'
        },
        {
            name: 'Bank Account',
            accountNumber: 'BANK-001',
            bankName: 'Prime Bank',
            accountType: 'Asset',
            status: 'Active',
            openingDate: now,
            currency: 'USD'
        },
        {
            name: 'Mobile Money Account',
            accountNumber: 'MOMO-001',
            bankName: 'Mobile Money',
            accountType: 'Asset',
            status: 'Active',
            openingDate: now,
            currency: 'USD'
        }
    ];

    let seeded: BankAccount[] = [];
    let temp = [...existing];

    for (const accountData of sampleAccounts) {
        const newAccount: BankAccount = {
            ...accountData,
            id: generateNextId('BANK', temp),
            balance: 0,
            availableBalance: 0,
            createdAt: now,
            updatedAt: now
        };
        await bankAccountsStore.put(newAccount);
        temp.push(newAccount);
        seeded.push(newAccount);
    }

    return temp;
};

export const resolveBankAccountForPayment = (
    bankAccounts: BankAccount[],
    payment: { accountId?: string; paymentMethod?: string }
): BankAccount | undefined => {
    if (bankAccounts.length === 0) return undefined;

    if (payment.accountId) {
        const direct = bankAccounts.find(acc => acc.id === payment.accountId);
        if (direct) return direct;
    }

    const method = (payment.paymentMethod || '').toLowerCase();
    const accountId = payment.accountId || '';

    const matches = (acc: BankAccount, tokens: string[]) => {
        const name = (acc.name || '').toLowerCase();
        const number = (acc.accountNumber || '').toLowerCase();
        return tokens.some(token => name.includes(token) || number.includes(token));
    };

    if (accountId === '1000' || method.includes('cash')) {
        return bankAccounts.find(acc => matches(acc, ['cash']));
    }

    if (accountId === '1060' || method.includes('mobile') || method.includes('momo')) {
        return bankAccounts.find(acc => matches(acc, ['mobile', 'momo']));
    }

    if (accountId === '1050' || method.includes('bank') || method.includes('card')) {
        return bankAccounts.find(acc => matches(acc, ['bank']));
    }

    return undefined;
};

export const reserveIdempotencyKey = async (
    tx: any,
    scope: string,
    sourceId: string,
    explicitKey?: string
) => {
    const store = tx.objectStore('idempotencyKeys');
    const key = String(explicitKey || `${scope}:${sourceId}`).trim();
    const existing = await store.get(key);
    if (existing) {
        throw new Error(`Duplicate financial request blocked for ${scope} (${sourceId}).`);
    }

    await store.put({
        id: key,
        scope,
        sourceId,
        createdAt: new Date().toISOString()
    });
};

export const ensureMirroredBankTransaction = async ({
    bankAccountsStore,
    bankTransactionsStore,
    date,
    amount,
    type,
    description,
    reference,
    accountId,
    paymentMethod,
    category,
    counterpartyName
}: {
    bankAccountsStore: any;
    bankTransactionsStore: any;
    date: string;
    amount: number;
    type: 'Deposit' | 'Withdrawal';
    description: string;
    reference: string;
    accountId?: string;
    paymentMethod?: string;
    category?: string;
    counterpartyName?: string;
}) => {
    const normalizedAmount = roundToCurrency(Math.max(0, Number(amount || 0)));
    if (normalizedAmount <= 0) return null;

    const bankAccounts = await ensureBankAccounts(bankAccountsStore);
    const bankAccount = resolveBankAccountForPayment(bankAccounts, {
        accountId,
        paymentMethod: paymentMethod || ''
    });
    if (!bankAccount) return null;

    const allBankTransactions = await bankTransactionsStore.getAll();
    const existing = allBankTransactions.find((entry: BankTransaction) =>
        entry.bankAccountId === bankAccount.id &&
        entry.reference === reference &&
        entry.type === type
    );
    if (existing) return existing;

    const bankTx: BankTransaction = {
        id: generateNextId('TXN', allBankTransactions),
        date,
        amount: normalizedAmount,
        type,
        description,
        reference,
        bankAccountId: bankAccount.id,
        counterparty: counterpartyName ? { name: counterpartyName } : undefined,
        category,
        reconciled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const nextTransactions = [...allBankTransactions, bankTx];
    await bankTransactionsStore.put(bankTx);

    const nextBalance = calculateBankBalance(nextTransactions, bankAccount.id);
    await bankAccountsStore.put({
        ...bankAccount,
        balance: roundToCurrency(nextBalance),
        availableBalance: roundToCurrency(nextBalance),
        updatedAt: new Date().toISOString()
    });

    return bankTx;
};

export const getVatConfig = (): VATConfig | undefined => {
    const saved = localStorage.getItem('nexus_company_config');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            return config.vat;
        } catch (e) {
            logger.error("Failed to parse company config for VAT", e);
        }
    }
    return undefined;
};

export const toMoney = (value: number): number => {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
};

export const createMultiCurrencyJournalEntry = async (
    date: Date | string,
    description: string,
    lines: Array<{
        accountId: string;
        amount: number;
        currency: string;
        type: 'debit' | 'credit';
        description?: string;
    }>,
    transactionCurrency: string,
    reference?: string
): Promise<MultiCurrencyJournalEntry> => {
    const baseCurrency = currencyService.getBaseCurrency();
    
    const exchangeRate = transactionCurrency === baseCurrency 
        ? 1 
        : await currencyService.getExchangeRate(transactionCurrency, baseCurrency);
    
    const processedLines: MultiCurrencyTransactionLine[] = await Promise.all(
        lines.map(async (line) => {
            const baseAmount = line.currency === baseCurrency
                ? line.amount
                : currencyService.roundAmount(
                    (await currencyService.convert(line.amount, line.currency, baseCurrency)).baseAmount,
                    baseCurrency
                );
            
            return {
                accountId: line.accountId,
                amount: line.amount,
                currency: line.currency,
                baseAmount,
                baseCurrency,
                exchangeRate: line.currency === baseCurrency ? 1 : exchangeRate,
                exchangeRateDate: new Date(),
                debit: line.type === 'debit' ? line.amount : 0,
                credit: line.type === 'credit' ? line.amount : 0,
            };
        })
    );
    
    const totalDebit = processedLines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = processedLines.reduce((sum, l) => sum + l.credit, 0);
    const totalBaseDebit = processedLines.reduce((sum, l) => sum + (l.type === 'debit' ? l.baseAmount : 0), 0);
    const totalBaseCredit = processedLines.reduce((sum, l) => sum + (l.type === 'credit' ? l.baseAmount : 0), 0);
    
    return {
        id: generateId('MCJ'),
        date: typeof date === 'string' ? new Date(date) : date,
        description,
        reference,
        transactionCurrency,
        exchangeRate,
        exchangeRateDate: new Date(),
        lines: processedLines.map((l, i) => ({
            ...l,
            description: lines[i].description,
        })),
        totalDebit,
        totalCredit,
        totalBaseDebit,
        totalBaseCredit,
        createdBy: 'system',
        createdAt: new Date(),
        status: 'posted',
    };
};

export const calculatePaymentGainLoss = async (
    invoice: Invoice,
    paymentAmount: number,
    paymentCurrency: string,
    paymentRate: number
): Promise<CurrencyGainLoss | null> => {
    const baseCurrency = currencyService.getBaseCurrency();
    const invoiceCurrency = (invoice as Invoice & { currency?: string }).currency || baseCurrency;
    
    if (invoiceCurrency === paymentCurrency) {
        return null;
    }
    
    const invoiceRate = invoiceCurrency === baseCurrency 
        ? 1 
        : await currencyService.getExchangeRate(invoiceCurrency, baseCurrency);
    
    return currencyService.calculateGainLoss(
        invoice.id,
        invoice.totalAmount,
        invoiceCurrency,
        invoiceRate,
        paymentAmount,
        paymentRate
    );
};

export const resolveItemUnitCost = async (item: any, inventoryItem: any): Promise<number> => {
    const snapshotCost = Number(item?.productionCostSnapshot?.baseProductionCost);
    if (Number.isFinite(snapshotCost) && snapshotCost > 0) return snapshotCost;

    const batchSelections = item?.batchSelections;
    if (batchSelections && batchSelections.length > 0) {
        const totalQty = batchSelections.reduce((s: number, sel: any) => s + (sel.quantity || 0), 0);
        if (totalQty > 0) {
            const batches = await dbService.getAll<any>('materialBatches');
            const totalCost = batchSelections.reduce((sum: number, sel: any) => {
                const batch = batches.find((b: any) => b.id === sel.batchId);
                const unitCost = batch?.costPerUnit || 0;
                return sum + (unitCost * sel.quantity);
            }, 0);
            if (totalCost > 0) return totalCost / totalQty;
        }
    }

    const costingMethod = inventoryItem?.costingMethod || 'weighted_average';
    if (costingMethod === 'fifo') {
        try {
            const fifoCost = await getFifoUnitCost(inventoryItem?.id || item?.id);
            if (Number.isFinite(fifoCost) && fifoCost > 0) return fifoCost;
        } catch { /* fall through to weighted average */ }
    }

    const directCost = Number(item?.cost_price ?? item?.cost);
    if (Number.isFinite(directCost) && directCost > 0) return directCost;

    const variantId = item?.variantId;
    if (variantId && inventoryItem?.variants?.length) {
        const variant = inventoryItem.variants.find((v: any) => v.id === variantId);
        if (variant) {
            const variantCost = Number(variant.cost_price ?? variant.cost);
            if (Number.isFinite(variantCost) && variantCost > 0) return variantCost;
        }
    }

    const inventoryCost = Number(inventoryItem?.cost_price ?? inventoryItem?.cost);
    return Number.isFinite(inventoryCost) ? inventoryCost : 0;
};

export const resolveInventoryRecord = async (
    itemId: string | undefined,
    ...sources: any[]
) => {
    const normalizedItemId = String(itemId || '').trim();
    if (!normalizedItemId) return undefined;

    for (const source of sources) {
        if (!source) continue;

        if (Array.isArray(source)) {
            const match = source.find((entry) => String(entry?.id || '').trim() === normalizedItemId);
            if (match) return match;
            continue;
        }

        if (source instanceof Map) {
            const match = source.get(normalizedItemId);
            if (match) return match;
            continue;
        }

        if (typeof source.get === 'function') {
            const match = await source.get(normalizedItemId);
            if (match) return match;
        }
    }

    return undefined;
};

export const calculateItemsCost = async (
    items: any[],
    inventorySource: any,
    resolveId: (item: any) => string | undefined,
    fallbackInventorySource?: any
) => {
    let totalCost = 0;
    for (const item of items || []) {
        if (item?.type === 'Service') continue;
        const itemId = resolveId(item);
        if (!itemId) continue;
        const invItem = await resolveInventoryRecord(itemId, inventorySource, fallbackInventorySource);
        const unitCost = await resolveItemUnitCost(item, invItem);
        const qty = Number(item?.quantity || 0);
        if (qty > 0 && unitCost > 0) {
            totalCost += unitCost * qty;
        }
    }
    return roundToCurrency(totalCost);
};

export const validateLedgerBalance = (entries: LedgerEntry[], context: string) => {
    const debitAccountSums: Record<string, number> = {};
    const creditAccountSums: Record<string, number> = {};
    for (const entry of entries) {
        const amount = Number(entry.amount || 0);
        debitAccountSums[entry.debitAccountId] = (debitAccountSums[entry.debitAccountId] || 0) + amount;
        creditAccountSums[entry.creditAccountId] = (creditAccountSums[entry.creditAccountId] || 0) + amount;
    }
    const totalDebits = Object.values(debitAccountSums).reduce((s, v) => s + v, 0);
    const totalCredits = Object.values(creditAccountSums).reduce((s, v) => s + v, 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
        console.warn(`[LEDGER MISMATCH] ${context}: Debits ${totalDebits.toFixed(2)} !== Credits ${totalCredits.toFixed(2)} (diff: ${(totalDebits - totalCredits).toFixed(2)})`);
    }
};

export const distributePosRetainedAmounts = (
    payments: { method: string; amount: number; accountId?: string }[],
    totalAmount: number
): number[] => {
    const retained = payments.map(payment => toMoney(payment.amount));
    let remainingChange = Math.max(0, toMoney(payments.reduce((sum, payment) => sum + payment.amount, 0) - totalAmount));
    if (remainingChange <= 0) return retained;

    const cashIndexes = payments
        .map((payment, index) => ({ payment, index }))
        .filter(entry => entry.payment.method === 'Cash')
        .map(entry => entry.index);

    const deductionOrder = cashIndexes.length > 0
        ? cashIndexes
        : (payments.length > 0 ? [payments.length - 1] : []);

    const deductFromIndex = (index: number) => {
        if (remainingChange <= 0) return;
        const current = retained[index] || 0;
        if (current <= 0) return;
        const deduction = Math.min(current, remainingChange);
        retained[index] = toMoney(current - deduction);
        remainingChange = toMoney(remainingChange - deduction);
    };

    for (const index of deductionOrder) {
        deductFromIndex(index);
        if (remainingChange <= 0) break;
    }

    if (remainingChange > 0) {
        for (let index = retained.length - 1; index >= 0; index -= 1) {
            deductFromIndex(index);
            if (remainingChange <= 0) break;
        }
    }

    return retained.map(amount => Math.max(0, toMoney(amount)));
};
