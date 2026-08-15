import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurrencyService } from '../../../services/currencyService';

vi.mock('../../../services/db', () => ({
  dbService: {
    getSetting: vi.fn().mockResolvedValue(null),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = vi.fn();

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    service = new CurrencyService();
  });

  describe('Initialization', () => {
    it('should initialize with default currencies', () => {
      const currencies = service.getCurrencies();
      expect(currencies.length).toBeGreaterThan(0);
      expect(currencies.some(c => c.code === 'USD')).toBe(true);
      expect(currencies.some(c => c.code === 'EUR')).toBe(true);
    });

    it('should set MWK as default base currency', () => {
      expect(service.getBaseCurrency()).toBe('MWK');
    });

    it('should load settings from localStorage', async () => {
      const savedSettings = JSON.stringify({
        baseCurrency: 'EUR',
        enabledCurrencies: ['EUR', 'USD'],
      });
      localStorageMock.getItem.mockReturnValue(savedSettings);

      await service.initialize();
      expect(service.getBaseCurrency()).toBe('EUR');
    });
  });

  describe('Currency Management', () => {
    it('should get currency by code', () => {
      const usd = service.getCurrency('USD');
      expect(usd).toBeDefined();
      expect(usd?.code).toBe('USD');
      expect(usd?.name).toBe('US Dollar');
    });

    it('should return undefined for unknown currency', () => {
      const unknown = service.getCurrency('XYZ');
      expect(unknown).toBeUndefined();
    });

    it('should get active currencies', () => {
      const active = service.getActiveCurrencies();
      expect(active.length).toBeGreaterThan(0);
      expect(active.every(c => c.isActive)).toBe(true);
    });

    it('should enable a currency', async () => {
      await service.enableCurrency('EUR');
      const settings = service.getSettings();
      expect(settings.enabledCurrencies).toContain('EUR');
    });

    it('should disable a currency', async () => {
      await service.disableCurrency('EUR');
      const settings = service.getSettings();
      expect(settings.enabledCurrencies).not.toContain('EUR');
    });

    it('should not allow disabling base currency', async () => {
      await expect(service.disableCurrency('MWK')).rejects.toThrow();
    });
  });

  describe('Exchange Rates', () => {
    it('should return 1 for same currency conversion', async () => {
      const rate = await service.getExchangeRate('USD', 'USD');
      expect(rate).toBe(1);
    });

    it('should save and retrieve exchange rate', async () => {
      await service.saveExchangeRate({
        id: 'test-1',
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: 0.85,
        date: new Date(),
        source: 'manual',
        createdAt: new Date(),
      });

      const rate = await service.getExchangeRate('USD', 'EUR');
      expect(rate).toBe(0.85);
    });

    it('should throw error when no rate available', async () => {
      await expect(service.getExchangeRate('USD', 'XYZ')).rejects.toThrow();
    });
  });

  describe('Currency Conversion', () => {
    beforeEach(async () => {
      await service.saveExchangeRate({
        id: 'test-1',
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: 0.85,
        date: new Date(),
        source: 'manual',
        createdAt: new Date(),
      });
    });

    it('should convert amount between currencies', async () => {
      const result = await service.convert(100, 'USD', 'EUR');
      expect(result.amount).toBe(100);
      expect(result.currency).toBe('USD');
      expect(result.baseAmount).toBe(85);
      expect(result.baseCurrency).toBe('EUR');
      expect(result.exchangeRate).toBe(0.85);
    });

    it('should convert with details', async () => {
      const result = await service.convertWithDetails(100, 'USD', 'EUR');
      expect(result.originalAmount).toBe(100);
      expect(result.convertedAmount).toBe(85);
      expect(result.inverseRate).toBeCloseTo(1 / 0.85);
    });

    it('should handle same currency conversion', async () => {
      const result = await service.convert(100, 'USD', 'USD');
      expect(result.baseAmount).toBe(100);
      expect(result.exchangeRate).toBe(1);
    });
  });

  describe('Amount Rounding', () => {
    it('should round to 2 decimal places for USD', () => {
      const rounded = service.roundAmount(10.555, 'USD');
      expect(rounded).toBe(10.56);
    });

    it('should round to 0 decimal places for JPY', () => {
      const rounded = service.roundAmount(100.5, 'JPY');
      expect(rounded).toBe(101);
    });

    it('should handle banker rounding', async () => {
      await service.updateSettings({ roundingMethod: 'bankers' });
      const rounded = service.roundAmount(2.5, 'JPY');
      expect(rounded).toBe(2); // Banker's rounding rounds half to even
    });

    it('should handle truncate rounding', async () => {
      await service.updateSettings({ roundingMethod: 'truncate' });
      const rounded = service.roundAmount(2.999, 'JPY');
      expect(rounded).toBe(2);
    });
  });

  describe('Amount Formatting', () => {
    it('should format amount with symbol', () => {
      const formatted = service.formatAmount(1000, 'USD');
      expect(formatted).toContain('$');
      expect(formatted).toContain('1,000');
    });

    it('should format amount with code', () => {
      const formatted = service.formatAmount(1000, 'EUR', { showCode: true });
      expect(formatted).toContain('EUR');
    });

    it('should format amount without symbol', () => {
      const formatted = service.formatAmount(1000, 'USD', { showSymbol: false });
      expect(formatted).not.toContain('$');
    });
  });

  describe('Gain/Loss Calculation', () => {
    it('should calculate gain when rate increases', async () => {
      const gainLoss = await service.calculateGainLoss(
        'INV-001',
        100,
        'EUR',
        1.1, // Original rate (EUR to USD)
        100,
        1.2  // New rate (EUR to USD)
      );

      expect(gainLoss.gainLossType).toBe('gain');
      expect(gainLoss.gainLossAmount).toBe(10); // (100 * 1.2) - (100 * 1.1)
    });

    it('should calculate loss when rate decreases', async () => {
      const gainLoss = await service.calculateGainLoss(
        'INV-001',
        100,
        'EUR',
        1.2, // Original rate
        100,
        1.1  // New rate
      );

      expect(gainLoss.gainLossType).toBe('loss');
      expect(gainLoss.gainLossAmount).toBe(10);
    });
  });

  describe('Currency Options', () => {
    it('should get currency options for dropdown', () => {
      const options = service.getCurrencyOptions();
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]).toHaveProperty('value');
      expect(options[0]).toHaveProperty('label');
      expect(options[0]).toHaveProperty('symbol');
    });
  });

  describe('Multi-Currency Check', () => {
    it('should return true when multiple currencies enabled', () => {
      expect(service.isMultiCurrencyEnabled()).toBe(true);
    });

    it('should return false when only base currency enabled', async () => {
      await service.updateSettings({ enabledCurrencies: ['USD'] });
      expect(service.isMultiCurrencyEnabled()).toBe(false);
    });
  });
});

describe('CurrencyService - API Integration', () => {
  let service: CurrencyService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    service = new CurrencyService();
  });

  it('should fetch rate from ExchangeRate-API', async () => {
    await service.updateSettings({
      apiProvider: 'exchangerate-api',
      apiKey: 'test-key',
    });

    (global.fetch as vi.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        rates: { EUR: 0.85 },
      }),
    });

    const rate = await service.fetchExchangeRate('USD', 'EUR');
    expect(rate).toBe(0.85);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('exchangerate-api.com')
    );
  });

  it('should handle API errors gracefully', async () => {
    await service.updateSettings({
      apiProvider: 'exchangerate-api',
      apiKey: 'test-key',
    });

    (global.fetch as vi.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(service.fetchExchangeRate('USD', 'EUR')).rejects.toThrow();
  });
});
