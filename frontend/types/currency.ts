/**
 * Currency-related types for Prime ERP Multi-Currency Support
 */

/**
 * ISO 4217 Currency definition
 */
export interface Currency {
  code: string; // ISO 4217 code (USD, EUR, GBP, etc.)
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
  isBase?: boolean;
}

/**
 * Exchange rate between two currencies
 */
export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: Date;
  source: 'manual' | 'api' | 'system';
  createdAt: Date;
  createdBy?: string;
}

/**
 * Multi-currency amount with conversion details
 */
export interface MultiCurrencyAmount {
  amount: number;
  currency: string;
  baseAmount: number; // Converted to base currency
  baseCurrency: string;
  exchangeRate: number;
  exchangeRateDate: Date;
}

/**
 * Currency conversion request
 */
export interface CurrencyConversionRequest {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  date?: Date;
}

/**
 * Currency conversion result
 */
export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  exchangeRate: number;
  rateDate: Date;
  inverseRate: number;
}

/**
 * Currency settings for the company
 */
export interface CurrencySettings {
  baseCurrency: string;
  enabledCurrencies: string[];
  autoUpdateRates: boolean;
  rateUpdateFrequency: 'daily' | 'weekly' | 'monthly';
  apiProvider: 'openexchangerates' | 'exchangerate-api' | 'fixer' | 'manual';
  apiKey?: string;
  lastRateUpdate?: Date;
  roundingMethod: 'standard' | 'bankers' | 'truncate';
}

/**
 * Exchange rate history entry
 */
export interface ExchangeRateHistory {
  id: string;
  currency: string;
  rates: Array<{
    date: Date;
    rate: number;
    source: string;
  }>;
}

/**
 * Multi-currency transaction line
 */
export interface MultiCurrencyTransactionLine {
  accountId: string;
  description?: string;
  
  // Original amount in transaction currency
  amount: number;
  currency: string;
  
  // Converted amount in base currency
  baseAmount: number;
  baseCurrency: string;
  
  // Exchange rate used
  exchangeRate: number;
  exchangeRateDate: Date;
  
  // Debit or credit
  debit: number;
  credit: number;
  
  // Line type for filtering
  type?: 'debit' | 'credit';
}

/**
 * Multi-currency journal entry
 */
export interface MultiCurrencyJournalEntry {
  id: string;
  date: Date;
  description: string;
  reference?: string;
  
  // Transaction currency (may differ from base)
  transactionCurrency: string;
  exchangeRate: number;
  exchangeRateDate: Date;
  
  // Lines with multi-currency support
  lines: MultiCurrencyTransactionLine[];
  
  // Totals
  totalDebit: number;
  totalCredit: number;
  totalBaseDebit: number;
  totalBaseCredit: number;
  
  // Metadata
  createdBy: string;
  createdAt: Date;
  status: 'draft' | 'posted' | 'reversed';
}

/**
 * Currency gain/loss calculation
 */
export interface CurrencyGainLoss {
  id: string;
  transactionId: string;
  transactionType: 'invoice' | 'payment' | 'purchase' | 'bill';
  
  // Original transaction details
  originalAmount: number;
  originalCurrency: string;
  originalExchangeRate: number;
  
  // Current/revaluation details
  currentRate: number;
  currentBaseAmount: number;
  
  // Gain/Loss
  gainLossAmount: number;
  gainLossType: 'gain' | 'loss';
  
  // Accounting
  gainAccount?: string;
  lossAccount?: string;
  postedToLedger: boolean;
  
  calculatedAt: Date;
  period: string; // YYYY-MM format
}

/**
 * Currency revaluation result
 */
export interface CurrencyRevaluationResult {
  id: string;
  period: string;
  evaluatedAt: Date;
  
  // Summary
  totalGain: number;
  totalLoss: number;
  netGainLoss: number;
  
  // Details by currency
  currencyBreakdown: Array<{
    currency: string;
    receivables: number;
    payables: number;
    gain: number;
    loss: number;
  }>;
  
  // Journal entry created
  journalEntryId?: string;
  status: 'pending' | 'posted' | 'cancelled';
}

/**
 * Default currencies with ISO 4217 data
 */
export const DEFAULT_CURRENCIES: Currency[] = [
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'K', decimalPlaces: 2, isActive: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isActive: true },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, isActive: true },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2, isActive: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, isActive: true },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2, isActive: true },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, isActive: true },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2, isActive: true },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2, isActive: true },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', decimalPlaces: 2, isActive: true },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalPlaces: 2, isActive: true },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimalPlaces: 2, isActive: true },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimalPlaces: 2, isActive: true },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', decimalPlaces: 2, isActive: true },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', decimalPlaces: 2, isActive: true },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', decimalPlaces: 0, isActive: true },
  { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$', decimalPlaces: 2, isActive: true },
];

/**
 * Default currency settings
 */
export const DEFAULT_CURRENCY_SETTINGS: CurrencySettings = {
  baseCurrency: 'MWK',
  enabledCurrencies: ['MWK', 'USD', 'EUR', 'GBP'],
  autoUpdateRates: false,
  rateUpdateFrequency: 'daily',
  apiProvider: 'manual',
  roundingMethod: 'standard',
};
