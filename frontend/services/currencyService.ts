/**
 * Currency Service for Prime ERP
 * Handles currency conversion, exchange rate management, and multi-currency operations
 */

import { 
  Currency, 
  ExchangeRate, 
  MultiCurrencyAmount, 
  CurrencyConversionRequest,
  CurrencyConversionResult,
  CurrencySettings,
  DEFAULT_CURRENCIES,
  DEFAULT_CURRENCY_SETTINGS,
  CurrencyGainLoss,
  CurrencyRevaluationResult
} from '../types/currency';
import { logger } from './logger';
import { dbService } from './db';
import { OFFLINE_MODE } from '../constants';

// Storage keys
const CURRENCY_SETTINGS_KEY = 'nexus_currency_settings';
const EXCHANGE_RATES_KEY = 'nexus_exchange_rates';

class CurrencyService {
  private currencies: Map<string, Currency> = new Map();
  private exchangeRates: Map<string, ExchangeRate> = new Map();
  private settings: CurrencySettings;
  private initialized: boolean = false;

  constructor() {
    this.settings = { ...DEFAULT_CURRENCY_SETTINGS };
    this.initializeDefaultCurrencies();
  }

  /**
   * Initialize the currency service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadSettings();
      await this.loadExchangeRates();
      this.initialized = true;
      logger.info('Currency service initialized', { 
        baseCurrency: this.settings.baseCurrency,
        enabledCurrencies: this.settings.enabledCurrencies.length 
      });
    } catch (error) {
      logger.error('Failed to initialize currency service', error as Error);
      throw error;
    }
  }

  /**
   * Initialize default currencies
   */
  private initializeDefaultCurrencies(): void {
    DEFAULT_CURRENCIES.forEach(currency => {
      this.currencies.set(currency.code, currency);
    });
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const saved = await dbService.getSetting<CurrencySettings>(CURRENCY_SETTINGS_KEY);
      if (saved) {
        this.settings = { ...DEFAULT_CURRENCY_SETTINGS, ...saved };
      } else {
        const local = localStorage.getItem(CURRENCY_SETTINGS_KEY);
        if (local) {
          this.settings = { ...DEFAULT_CURRENCY_SETTINGS, ...JSON.parse(local) };
        }
      }

      if (OFFLINE_MODE) {
        this.settings.autoUpdateRates = false;
        this.settings.apiProvider = 'manual';
      }
      
      // Mark base currency
      const baseCurrency = this.currencies.get(this.settings.baseCurrency);
      if (baseCurrency) {
        baseCurrency.isBase = true;
      }
    } catch (error) {
      logger.error('Failed to load currency settings', error as Error);
    }
  }

  /**
   * Save settings to storage
   */
  private async saveSettings(): Promise<void> {
    try {
      await dbService.saveSetting(CURRENCY_SETTINGS_KEY, this.settings);
    } catch (error) {
      logger.error('Failed to save currency settings', error as Error);
    }
  }

  /**
   * Load exchange rates from storage
   */
  private async loadExchangeRates(): Promise<void> {
    try {
      const saved = await dbService.getSetting<ExchangeRate[]>(EXCHANGE_RATES_KEY);
      if (saved && saved.length > 0) {
        saved.forEach(rate => {
          const key = this.getRateKey(rate.fromCurrency, rate.toCurrency);
          this.exchangeRates.set(key, rate);
        });
      } else {
        const local = localStorage.getItem(EXCHANGE_RATES_KEY);
        if (local) {
          const rates: ExchangeRate[] = JSON.parse(local);
          rates.forEach(rate => {
            const key = this.getRateKey(rate.fromCurrency, rate.toCurrency);
            this.exchangeRates.set(key, rate);
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load exchange rates', error as Error);
    }
  }

  /**
   * Save exchange rates to storage
   */
  private async saveExchangeRates(): Promise<void> {
    try {
      const rates = Array.from(this.exchangeRates.values());
      await dbService.saveSetting(EXCHANGE_RATES_KEY, rates);
    } catch (error) {
      logger.error('Failed to save exchange rates', error as Error);
    }
  }

  /**
   * Get key for exchange rate map
   */
  private getRateKey(from: string, to: string): string {
    return `${from}_${to}`;
  }

  /**
   * Get all currencies
   */
  getCurrencies(): Currency[] {
    return Array.from(this.currencies.values());
  }

  /**
   * Get active currencies
   */
  getActiveCurrencies(): Currency[] {
    return this.getCurrencies().filter(c => 
      this.settings.enabledCurrencies.includes(c.code)
    );
  }

  /**
   * Get currency by code
   */
  getCurrency(code: string): Currency | undefined {
    return this.currencies.get(code);
  }

  /**
   * Get base currency
   */
  getBaseCurrency(): string {
    return this.settings.baseCurrency;
  }

  /**
   * Get currency settings
   */
  getSettings(): CurrencySettings {
    return { ...this.settings };
  }

  /**
   * Update currency settings
   */
  async updateSettings(updates: Partial<CurrencySettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };

    if (OFFLINE_MODE) {
      this.settings.autoUpdateRates = false;
      this.settings.apiProvider = 'manual';
    }

    await this.saveSettings();
    logger.info('Currency settings updated', updates);
  }

  /**
   * Add or update a currency
   */
  async saveCurrency(currency: Currency): Promise<void> {
    this.currencies.set(currency.code, currency);
    logger.info('Currency saved', { code: currency.code });
  }

  /**
   * Enable a currency
   */
  async enableCurrency(code: string): Promise<void> {
    if (!this.settings.enabledCurrencies.includes(code)) {
      this.settings.enabledCurrencies.push(code);
      await this.saveSettings();
    }
  }

  /**
   * Disable a currency
   */
  async disableCurrency(code: string): Promise<void> {
    if (code === this.settings.baseCurrency) {
      throw new Error('Cannot disable base currency');
    }
    this.settings.enabledCurrencies = this.settings.enabledCurrencies.filter(c => c !== code);
    await this.saveSettings();
  }

  /**
   * Get exchange rate between two currencies
   */
  async getExchangeRate(from: string, to: string, date?: Date): Promise<number> {
    if (from === to) return 1;

    const key = this.getRateKey(from, to);
    let rate = this.exchangeRates.get(key);

    // If rate exists and is recent enough (within 24 hours), use it
    if (rate && this.isRateRecent(rate)) {
      return rate.rate;
    }

    // Try to fetch from API if configured
    if (!OFFLINE_MODE && this.settings.autoUpdateRates && this.settings.apiKey) {
      return await this.fetchExchangeRate(from, to);
    }

    // If we have any stored rate, use it even if old
    if (rate) {
      return rate.rate;
    }

    // Try inverse rate
    const inverseKey = this.getRateKey(to, from);
    const inverseRate = this.exchangeRates.get(inverseKey);
    if (inverseRate) {
      return 1 / inverseRate.rate;
    }

    // No rate available
    throw new Error(`No exchange rate available for ${from} to ${to}`);
  }

  /**
   * Check if a rate is recent (within 24 hours)
   */
  private isRateRecent(rate: ExchangeRate): boolean {
    const now = new Date();
    const rateAge = now.getTime() - new Date(rate.date).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return rateAge < twentyFourHours;
  }

  /**
   * Fetch exchange rate from API
   */
  async fetchExchangeRate(from: string, to: string): Promise<number> {
    if (OFFLINE_MODE) {
      throw new Error('Automatic exchange-rate updates are disabled in offline desktop mode. Save a manual rate instead.');
    }

    try {
      let rate: number;

      switch (this.settings.apiProvider) {
        case 'exchangerate-api':
          rate = await this.fetchFromExchangeRateApi(from, to);
          break;
        case 'openexchangerates':
          rate = await this.fetchFromOpenExchangeRates(from, to);
          break;
        case 'fixer':
          rate = await this.fetchFromFixer(from, to);
          break;
        default:
          throw new Error(`Unsupported API provider: ${this.settings.apiProvider}`);
      }

      // Save the rate
      await this.saveExchangeRate({
        id: `${this.getRateKey(from, to)}_${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        fromCurrency: from,
        toCurrency: to,
        rate,
        date: new Date(),
        source: 'api',
        createdAt: new Date(),
      });

      return rate;
    } catch (error) {
      logger.error('Failed to fetch exchange rate', error as Error, { from, to });
      throw error;
    }
  }

  /**
   * Fetch from ExchangeRate-API (free tier available)
   */
  private async fetchFromExchangeRateApi(from: string, to: string): Promise<number> {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
    const data = await response.json();
    
    if (!data.rates || !data.rates[to]) {
      throw new Error(`Rate not found for ${to}`);
    }
    
    return data.rates[to];
  }

  /**
   * Fetch from Open Exchange Rates
   */
  private async fetchFromOpenExchangeRates(from: string, to: string): Promise<number> {
    const appId = this.settings.apiKey;
    const response = await fetch(
      `https://openexchangerates.org/api/latest.json?app_id=${appId}&symbols=${to}`
    );
    const data = await response.json();
    
    if (!data.rates || !data.rates[to]) {
      throw new Error(`Rate not found for ${to}`);
    }
    
    // Open Exchange Rates returns rates relative to USD
    // Need to convert if from is not USD
    if (from === 'USD') {
      return data.rates[to];
    } else {
      const fromResponse = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${appId}&symbols=${from}`
      );
      const fromData = await fromResponse.json();
      const fromRate = fromData.rates[from];
      return data.rates[to] / fromRate;
    }
  }

  /**
   * Fetch from Fixer.io
   */
  private async fetchFromFixer(from: string, to: string): Promise<number> {
    const apiKey = this.settings.apiKey;
    const response = await fetch(
      `https://data.fixer.io/api/latest?access_key=${apiKey}&symbols=${to}`
    );
    const data = await response.json();
    
    if (!data.rates || !data.rates[to]) {
      throw new Error(`Rate not found for ${to}`);
    }
    
    // Fixer returns rates relative to EUR
    if (from === 'EUR') {
      return data.rates[to];
    } else {
      const fromResponse = await fetch(
        `https://data.fixer.io/api/latest?access_key=${apiKey}&symbols=${from}`
      );
      const fromData = await fromResponse.json();
      const fromRate = fromData.rates[from];
      return data.rates[to] / fromRate;
    }
  }

  /**
   * Save exchange rate manually
   */
  async saveExchangeRate(rate: ExchangeRate): Promise<void> {
    const key = this.getRateKey(rate.fromCurrency, rate.toCurrency);
    this.exchangeRates.set(key, rate);
    await this.saveExchangeRates();
    logger.info('Exchange rate saved', { 
      from: rate.fromCurrency, 
      to: rate.toCurrency, 
      rate: rate.rate 
    });
  }

  /**
   * Convert amount between currencies
   */
  async convert(
    amount: number,
    from: string,
    to: string,
    date?: Date
  ): Promise<MultiCurrencyAmount> {
    const rate = await this.getExchangeRate(from, to, date);
    const baseAmount = this.roundAmount(amount * rate, to);

    return {
      amount,
      currency: from,
      baseAmount,
      baseCurrency: to,
      exchangeRate: rate,
      exchangeRateDate: date || new Date(),
    };
  }

  /**
   * Convert with full result details
   */
  async convertWithDetails(
    amount: number,
    from: string,
    to: string
  ): Promise<CurrencyConversionResult> {
    const rate = await this.getExchangeRate(from, to);
    const convertedAmount = this.roundAmount(amount * rate, to);
    const inverseRate = 1 / rate;

    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount,
      convertedCurrency: to,
      exchangeRate: rate,
      rateDate: new Date(),
      inverseRate,
    };
  }

  /**
   * Round amount according to currency decimal places
   */
  roundAmount(amount: number, currency: string): number {
    const currencyInfo = this.currencies.get(currency);
    const places = currencyInfo?.decimalPlaces ?? 2;
    
    if (this.settings.roundingMethod === 'bankers') {
      return this.bankersRound(amount, places);
    } else if (this.settings.roundingMethod === 'truncate') {
      return this.truncateAmount(amount, places);
    }
    
    // Standard rounding
    const multiplier = Math.pow(10, places);
    return Math.round((amount + Number.EPSILON) * multiplier) / multiplier;
  }

  /**
   * Banker's rounding (round half to even)
   */
  private bankersRound(amount: number, places: number): number {
    const multiplier = Math.pow(10, places);
    const value = amount * multiplier;
    const rounded = Math.round(value);
    
    // If exactly halfway, round to even
    if (Math.abs(value - rounded) === 0.5) {
      return Math.round(value / 2) * 2 / multiplier;
    }
    
    return rounded / multiplier;
  }

  /**
   * Truncate amount (floor)
   */
  private truncateAmount(amount: number, places: number): number {
    const multiplier = Math.pow(10, places);
    return Math.floor(amount * multiplier) / multiplier;
  }

  /**
   * Format amount with currency symbol
   */
  formatAmount(amount: number, currency: string, options?: {
    showSymbol?: boolean;
    showCode?: boolean;
  }): string {
    const currencyInfo = this.currencies.get(currency);
    if (!currencyInfo) {
      return `${amount.toFixed(2)} ${currency}`;
    }

    const { showSymbol = true, showCode = false } = options || {};
    
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: currencyInfo.decimalPlaces,
      maximumFractionDigits: currencyInfo.decimalPlaces,
    }).format(amount);

    if (showSymbol && showCode) {
      return `${currencyInfo.symbol}${formatted} ${currency}`;
    } else if (showSymbol) {
      return `${currencyInfo.symbol}${formatted}`;
    } else if (showCode) {
      return `${formatted} ${currency}`;
    }
    
    return formatted;
  }

  /**
   * Calculate currency gain/loss for an invoice
   */
  async calculateGainLoss(
    invoiceId: string,
    originalAmount: number,
    originalCurrency: string,
    originalRate: number,
    paymentAmount: number,
    paymentRate: number
  ): Promise<CurrencyGainLoss> {
    const baseCurrency = this.settings.baseCurrency;
    
    // Original amount in base currency
    const originalBaseAmount = this.roundAmount(originalAmount * originalRate, baseCurrency);
    
    // Payment amount in base currency
    const paymentBaseAmount = this.roundAmount(paymentAmount * paymentRate, baseCurrency);
    
    // Calculate gain/loss
    const gainLossAmount = paymentBaseAmount - originalBaseAmount;
    const gainLossType = gainLossAmount >= 0 ? 'gain' : 'loss';

    return {
      id: `GL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      transactionId: invoiceId,
      transactionType: 'invoice',
      originalAmount,
      originalCurrency,
      originalExchangeRate: originalRate,
      currentRate: paymentRate,
      currentBaseAmount: paymentBaseAmount,
      gainLossAmount: Math.abs(gainLossAmount),
      gainLossType,
      postedToLedger: false,
      calculatedAt: new Date(),
      period: new Date().toISOString().slice(0, 7), // YYYY-MM
    };
  }

  /**
   * Revalue open items for a period
   */
  async revalueOpenItems(
    items: Array<{
      id: string;
      type: 'invoice' | 'bill';
      amount: number;
      currency: string;
      exchangeRate: number;
    }>,
    period: string
  ): Promise<CurrencyRevaluationResult> {
    const baseCurrency = this.settings.baseCurrency;
    let totalGain = 0;
    let totalLoss = 0;
    
    const currencyBreakdown: Map<string, {
      receivables: number;
      payables: number;
      gain: number;
      loss: number;
    }> = new Map();

    for (const item of items) {
      if (item.currency === baseCurrency) continue;

      // Get current rate
      const currentRate = await this.getExchangeRate(item.currency, baseCurrency);
      
      // Calculate original and current base amounts
      const originalBaseAmount = this.roundAmount(item.amount * item.exchangeRate, baseCurrency);
      const currentBaseAmount = this.roundAmount(item.amount * currentRate, baseCurrency);
      
      // Calculate gain/loss
      const gainLoss = currentBaseAmount - originalBaseAmount;
      
      // Update breakdown
      let breakdown = currencyBreakdown.get(item.currency);
      if (!breakdown) {
        breakdown = { receivables: 0, payables: 0, gain: 0, loss: 0 };
        currencyBreakdown.set(item.currency, breakdown);
      }
      
      if (item.type === 'invoice') {
        breakdown.receivables += item.amount;
      } else {
        breakdown.payables += item.amount;
      }
      
      if (gainLoss > 0) {
        breakdown.gain += gainLoss;
        totalGain += gainLoss;
      } else {
        breakdown.loss += Math.abs(gainLoss);
        totalLoss += Math.abs(gainLoss);
      }
    }

    return {
      id: `REV-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      period,
      evaluatedAt: new Date(),
      totalGain,
      totalLoss,
      netGainLoss: totalGain - totalLoss,
      currencyBreakdown: Array.from(currencyBreakdown.entries()).map(([currency, data]) => ({
        currency,
        ...data,
      })),
      status: 'pending',
    };
  }

  /**
   * Get exchange rate history
   */
  async getRateHistory(
    from: string, 
    to: string, 
    days: number = 30
  ): Promise<Array<{ date: Date; rate: number }>> {
    // In a full implementation, this would fetch historical rates from the API
    // For now, return current rate for each day
    const rate = await this.getExchangeRate(from, to);
    const history: Array<{ date: Date; rate: number }> = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      history.push({ date, rate });
    }
    
    return history.reverse();
  }

  /**
   * Get all exchange rates
   */
  getAllRates(): ExchangeRate[] {
    return Array.from(this.exchangeRates.values());
  }

  /**
   * Delete an exchange rate
   */
  async deleteRate(from: string, to: string): Promise<void> {
    const key = this.getRateKey(from, to);
    this.exchangeRates.delete(key);
    await this.saveExchangeRates();
  }

  /**
   * Check if multi-currency is enabled
   */
  isMultiCurrencyEnabled(): boolean {
    return this.settings.enabledCurrencies.length > 1;
  }

  /**
   * Get currencies for dropdown/select
   */
  getCurrencyOptions(): Array<{ value: string; label: string; symbol: string }> {
    return this.getActiveCurrencies().map(c => ({
      value: c.code,
      label: `${c.code} - ${c.name}`,
      symbol: c.symbol,
    }));
  }
}

// Export singleton instance
export const currencyService = new CurrencyService();

// Export class for testing
export { CurrencyService };
