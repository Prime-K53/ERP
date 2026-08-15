import React, { useEffect, useState } from 'react';
import { logger } from '@/services/logger';
import { currencyService } from '../services/currencyService';
import { CurrencyConversionResult } from '../types/currency';

interface ExchangeRateDisplayProps {
  fromAmount: number;
  fromCurrency: string;
  toCurrency: string;
  showInverse?: boolean;
  showDetails?: boolean;
  className?: string;
}

export const ExchangeRateDisplay: React.FC<ExchangeRateDisplayProps> = ({
  fromAmount,
  fromCurrency,
  toCurrency,
  showInverse = true,
  showDetails = false,
  className = '',
}) => {
  const [conversion, setConversion] = useState<CurrencyConversionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const convert = async () => {
      if (fromCurrency === toCurrency) {
        setConversion({
          originalAmount: fromAmount,
          originalCurrency: fromCurrency,
          convertedAmount: fromAmount,
          convertedCurrency: toCurrency,
          exchangeRate: 1,
          rateDate: new Date(),
          inverseRate: 1,
        });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        await currencyService.initialize();
        const result = await currencyService.convertWithDetails(
          fromAmount,
          fromCurrency,
          toCurrency
        );
        setConversion(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Conversion failed');
      } finally {
        setLoading(false);
      }
    };

    convert();
  }, [fromAmount, fromCurrency, toCurrency]);

  if (loading) {
    return (
      <div className={`text-gray-400 ${className}`}>
        <span className="animate-pulse">Converting...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-500 text-sm ${className}`}>
        {error}
      </div>
    );
  }

  if (!conversion) {
    return null;
  }

  return (
    <div className={className}>
      <div className="font-medium text-lg">
        {currencyService.formatAmount(conversion.convertedAmount, toCurrency)}
      </div>
      
      {showDetails && (
        <div className="text-sm text-gray-500 mt-1 space-y-1">
          <div>
            {currencyService.formatAmount(conversion.originalAmount, fromCurrency)} →{' '}
            {currencyService.formatAmount(conversion.convertedAmount, toCurrency)}
          </div>
          
          <div className="flex items-center gap-4">
            <span>
              Rate: 1 {fromCurrency} = {conversion.exchangeRate.toFixed(6)} {toCurrency}
            </span>
            
            {showInverse && (
              <span>
                1 {toCurrency} = {conversion.inverseRate.toFixed(6)} {fromCurrency}
              </span>
            )}
          </div>
          
          <div className="text-xs text-gray-400">
            Updated: {new Date(conversion.rateDate).toLocaleString()}
          </div>
        </div>
      )}
      
      {!showDetails && showInverse && (
        <div className="text-xs text-gray-500 mt-1">
          Rate: {conversion.exchangeRate.toFixed(4)}
        </div>
      )}
    </div>
  );
};

interface ExchangeRateCardProps {
  fromCurrency: string;
  toCurrency: string;
  rate?: number;
  lastUpdated?: Date;
  onRefresh?: () => void;
}

export const ExchangeRateCard: React.FC<ExchangeRateCardProps> = ({
  fromCurrency,
  toCurrency,
  rate: propRate,
  lastUpdated,
  onRefresh,
}) => {
  const [rate, setRate] = useState<number | null>(propRate || null);
  const [loading, setLoading] = useState(!propRate);

  useEffect(() => {
    if (propRate !== undefined) {
      setRate(propRate);
      return;
    }

    const fetchRate = async () => {
      try {
        setLoading(true);
        await currencyService.initialize();
        const fetchedRate = await currencyService.getExchangeRate(fromCurrency, toCurrency);
        setRate(fetchedRate);
      } catch (err) {
        logger.error('Failed to fetch rate:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRate();
  }, [fromCurrency, toCurrency, propRate]);

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-sm text-gray-500">
            {fromCurrency} → {toCurrency}
          </div>
          <div className="text-2xl font-bold mt-1">
            {loading ? (
              <span className="animate-pulse">Loading...</span>
            ) : rate ? (
              rate.toFixed(6)
            ) : (
              'N/A'
            )}
          </div>
          {lastUpdated && (
            <div className="text-xs text-gray-400 mt-1">
              Updated: {lastUpdated.toLocaleString()}
            </div>
          )}
        </div>
        
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-blue-500 hover:text-blue-700 text-sm"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
};

interface MultiCurrencyAmountDisplayProps {
  amount: number;
  currency: string;
  baseCurrency: string;
  exchangeRate: number;
  showConversion?: boolean;
}

export const MultiCurrencyAmountDisplay: React.FC<MultiCurrencyAmountDisplayProps> = ({
  amount,
  currency,
  baseCurrency,
  exchangeRate,
  showConversion = true,
}) => {
  const baseAmount = amount * exchangeRate;

  return (
    <div className="space-y-1">
      <div className="font-medium">
        {currencyService.formatAmount(amount, currency)}
      </div>
      
      {showConversion && currency !== baseCurrency && (
        <div className="text-sm text-gray-500">
          ≈ {currencyService.formatAmount(baseAmount, baseCurrency)}
          <span className="text-xs ml-1">
            (@ {exchangeRate.toFixed(4)})
          </span>
        </div>
      )}
    </div>
  );
};

interface ExchangeRateTableProps {
  baseCurrency: string;
  targetCurrencies: string[];
  rates?: Record<string, number>;
}

export const ExchangeRateTable: React.FC<ExchangeRateTableProps> = ({
  baseCurrency,
  targetCurrencies,
  rates: propRates,
}) => {
  const [rates, setRates] = useState<Record<string, number>>(propRates || {});
  const [loading, setLoading] = useState(!propRates);

  useEffect(() => {
    if (propRates) {
      setRates(propRates);
      return;
    }

    const fetchRates = async () => {
      try {
        setLoading(true);
        await currencyService.initialize();
        
        const fetchedRates: Record<string, number> = {};
        for (const currency of targetCurrencies) {
          if (currency !== baseCurrency) {
            fetchedRates[currency] = await currencyService.getExchangeRate(
              baseCurrency,
              currency
            );
          }
        }
        setRates(fetchedRates);
      } catch (err) {
        logger.error('Failed to fetch rates:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRates();
  }, [baseCurrency, targetCurrencies, propRates]);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Currency
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Rate
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Inverse
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {targetCurrencies.map((currency) => {
            if (currency === baseCurrency) return null;
            
            const rate = rates[currency];
            const inverseRate = rate ? 1 / rate : null;

            return (
              <tr key={currency}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-medium">{currency}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {loading ? (
                    <span className="animate-pulse">...</span>
                  ) : rate ? (
                    rate.toFixed(6)
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                  {inverseRate ? inverseRate.toFixed(6) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
