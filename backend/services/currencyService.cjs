const repo = require('./supabaseRepository.cjs');
const crypto = require('crypto');

class CurrencyService {
  constructor() {
    this.defaultCurrency = 'USD';
    this.exchangeRates = new Map();
  }

  async getCurrency() {
    const rows = await repo.getAll('settings', { 'data->>key': 'eq.default_currency' });
    return rows.length > 0 ? rows[0].value : this.defaultCurrency;
  }

  async getExchangeRate(fromCurrency, toCurrency, date = null) {
    const cacheKey = `${fromCurrency}_${toCurrency}_${date || 'latest'}`;
    if (this.exchangeRates.has(cacheKey)) {
      return this.exchangeRates.get(cacheKey);
    }
    let rows = await repo.getAll('exchange_rates', {
      'data->>from_currency': `eq.${fromCurrency}`,
      'data->>to_currency': `eq.${toCurrency}`,
    });
    if (date) {
      rows = rows.filter(r => r.date <= date).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    } else {
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }
    const rate = rows.length > 0 ? Number(rows[0].rate) : 1;
    this.exchangeRates.set(cacheKey, rate);
    return rate;
  }

  async convert(amount, fromCurrency, toCurrency, date = null) {
    if (fromCurrency === toCurrency) return Number(amount);
    const rate = await this.getExchangeRate(fromCurrency, toCurrency, date);
    return Number((Number(amount) * rate).toFixed(2));
  }

  async updateExchangeRate(fromCurrency, toCurrency, rate, date = null) {
    const rateDate = date || new Date().toISOString().split('T')[0];
    const cacheKey = `${fromCurrency}_${toCurrency}_${rateDate || 'latest'}`;
    const existing = await repo.getAll('exchange_rates', {
      'data->>from_currency': `eq.${fromCurrency}`,
      'data->>to_currency': `eq.${toCurrency}`,
      'data->>date': `eq.${rateDate}`,
    });
    const record = {
      id: existing.length > 0 ? existing[0].id : `ER-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate,
      date: rateDate,
    };
    await repo.upsert('exchange_rates', record);
    this.exchangeRates.delete(cacheKey);
    return { fromCurrency, toCurrency, rate, date: rateDate };
  }

  async getCurrencies() {
    const rows = await repo.getAll('currencies', { 'data->>is_active': 'eq.1' });
    return rows.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  }

  async addCurrency(code, name, symbol, decimalPlaces = 2) {
    const existing = await repo.getAll('currencies', { 'data->>code': `eq.${code}` });
    const record = {
      id: existing.length > 0 ? existing[0].id : code,
      code,
      name,
      symbol,
      decimal_places: decimalPlaces,
      is_active: 1,
    };
    await repo.upsert('currencies', record);
    return { code, name, symbol, decimalPlaces };
  }

  formatAmount(amount, currencyCode, locale = 'en-US') {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency: currencyCode,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(amount);
    } catch (e) {
      return `${currencyCode} ${Number(amount).toFixed(2)}`;
    }
  }

  parseCurrency(currencyString) {
    const cleaned = currencyString.replace(/[^0-9.-]/g, '');
    return Number(cleaned);
  }
}

module.exports = CurrencyService;
