/**
 * Currency Middleware
 * Injects the default currency into requests
 */

class CurrencyMiddleware {
  constructor(currencyService) {
    this.currencyService = currencyService;
  }

  /**
   * Middleware to inject currency into req object
   */
  injectCurrency() {
    return async (req, res, next) => {
      try {
        const defaultCurrency = await this.currencyService.getCurrency();
        req.currency = defaultCurrency;
        next();
      } catch (err) {
        console.error('[CurrencyMiddleware] Error injecting currency:', err);
        req.currency = 'USD'; // Fallback to USD
        next();
      }
    };
  }
}

module.exports = CurrencyMiddleware;
