import React, { useEffect, useState } from 'react';
import { currencyService } from '../services/currencyService';
import { Currency } from '../types/currency';

interface CurrencySelectorProps {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
  showSymbol?: boolean;
  showCode?: boolean;
  className?: string;
  includeAll?: boolean;
  filterActive?: boolean;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  value,
  onChange,
  disabled = false,
  showSymbol = true,
  showCode = true,
  className = '',
  includeAll = false,
  filterActive = true,
}) => {
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  useEffect(() => {
    const loadCurrencies = async () => {
      await currencyService.initialize();
      const list = includeAll 
        ? currencyService.getCurrencies()
        : filterActive 
          ? currencyService.getActiveCurrencies()
          : currencyService.getCurrencies();
      setCurrencies(list);
    };
    loadCurrencies();
  }, [includeAll, filterActive]);

  const formatLabel = (currency: Currency): string => {
    const parts: string[] = [];
    
    if (showSymbol) {
      parts.push(currency.symbol);
    }
    
    parts.push(currency.code);
    
    if (showCode) {
      parts.push(`- ${currency.name}`);
    }
    
    return parts.join(' ');
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`border rounded-md p-2 ${className}`}
    >
      {currencies.map((currency) => (
        <option key={currency.code} value={currency.code}>
          {formatLabel(currency)}
        </option>
      ))}
    </select>
  );
};

interface CurrencyBadgeProps {
  currency: string;
  amount?: number;
  showSymbol?: boolean;
}

export const CurrencyBadge: React.FC<CurrencyBadgeProps> = ({
  currency,
  amount,
  showSymbol = true,
}) => {
  const [currencyInfo, setCurrencyInfo] = useState<Currency | null>(null);

  useEffect(() => {
    const loadCurrency = async () => {
      await currencyService.initialize();
      const info = currencyService.getCurrency(currency);
      setCurrencyInfo(info || null);
    };
    loadCurrency();
  }, [currency]);

  if (!currencyInfo) {
    return <span className="text-gray-500">{currency}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
      {showSymbol && <span>{currencyInfo.symbol}</span>}
      <span className="font-medium">{currency}</span>
    </span>
  );
};

interface CurrencyInputProps {
  value: number;
  currency: string;
  onChange: (value: number) => void;
  onCurrencyChange?: (currency: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  currency,
  onChange,
  onCurrencyChange,
  disabled = false,
  label,
  className = '',
}) => {
  const [currencyInfo, setCurrencyInfo] = useState<Currency | null>(null);

  useEffect(() => {
    const loadCurrency = async () => {
      await currencyService.initialize();
      const info = currencyService.getCurrency(currency);
      setCurrencyInfo(info || null);
    };
    loadCurrency();
  }, [currency]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value) || 0;
    onChange(newValue);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <div className="flex items-center gap-2">
        <span className="text-gray-500">
          {currencyInfo?.symbol || currency}
        </span>
        <input
          type="number"
          value={value}
          onChange={handleInputChange}
          disabled={disabled}
          className="flex-1 border rounded-md p-2"
          step="0.01"
          min="0"
        />
        {onCurrencyChange && (
          <CurrencySelector
            value={currency}
            onChange={onCurrencyChange}
            disabled={disabled}
            showSymbol={false}
            className="w-32"
          />
        )}
      </div>
    </div>
  );
};

interface CurrencyDisplayProps {
  amount: number;
  currency: string;
  showCode?: boolean;
  className?: string;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency,
  showCode = true,
  className = '',
}) => {
  const [formatted, setFormatted] = useState<string>('');

  useEffect(() => {
    const format = async () => {
      await currencyService.initialize();
      const result = currencyService.formatAmount(amount, currency, {
        showSymbol: true,
        showCode,
      });
      setFormatted(result);
    };
    format();
  }, [amount, currency, showCode]);

  return <span className={className}>{formatted}</span>;
};
