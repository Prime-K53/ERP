import React, { useEffect, useState } from 'react';
import { currencyService } from '../../services/currencyService';
import { Currency, ExchangeRate, CurrencySettings as CurrencySettingsData, DEFAULT_CURRENCIES } from '../../types/currency';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Card } from '../../components/Card';
import { logger } from '../../services/logger';
import { OFFLINE_MODE } from '../../constants';

export const CurrencySettings: React.FC = () => {
  const [settings, setSettings] = useState<CurrencySettingsData | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRate, setNewRate] = useState({
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    rate: 1,
  });
  const [activeTab, setActiveTab] = useState<'general' | 'currencies' | 'rates'>('general');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await currencyService.initialize();
      setSettings(currencyService.getSettings());
      setCurrencies(currencyService.getCurrencies());
      setRates(currencyService.getAllRates());
    } catch (error) {
      logger.error('Failed to load currency settings', error as Error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    
    try {
      setSaving(true);
      await currencyService.updateSettings(settings);
      alert('Settings saved successfully');
    } catch (error) {
      logger.error('Failed to save settings', error as Error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRate = async () => {
    try {
      const rate: ExchangeRate = {
        id: `RATE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        fromCurrency: newRate.fromCurrency,
        toCurrency: newRate.toCurrency,
        rate: newRate.rate,
        date: new Date(),
        source: 'manual',
        createdAt: new Date(),
      };
      
      await currencyService.saveExchangeRate(rate);
      setRates(currencyService.getAllRates());
      setNewRate({ ...newRate, rate: 1 });
      alert('Exchange rate added');
    } catch (error) {
      logger.error('Failed to add rate', error as Error);
      alert('Failed to add exchange rate');
    }
  };

  const handleFetchRates = async () => {
    if (OFFLINE_MODE) {
      alert('Automatic exchange-rate fetching is unavailable in the offline desktop app. Add manual rates instead.');
      return;
    }

    if (!settings?.apiKey) {
      alert('Please configure API key first');
      return;
    }

    try {
      setSaving(true);
      // Fetch rates for enabled currencies
      for (const currency of settings.enabledCurrencies) {
        if (currency !== settings.baseCurrency) {
          await currencyService.fetchExchangeRate(settings.baseCurrency, currency);
        }
      }
      setRates(currencyService.getAllRates());
      alert('Rates fetched successfully');
    } catch (error) {
      logger.error('Failed to fetch rates', error as Error);
      alert('Failed to fetch rates from API');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCurrency = async (code: string, enable: boolean) => {
    try {
      if (enable) {
        await currencyService.enableCurrency(code);
      } else {
        await currencyService.disableCurrency(code);
      }
      setSettings(currencyService.getSettings());
    } catch (error) {
      logger.error('Failed to toggle currency', error as Error);
      alert(error instanceof Error ? error.message : 'Failed to update currency');
    }
  };

  const handleDeleteRate = async (from: string, to: string) => {
    if (!confirm('Are you sure you want to delete this exchange rate?')) return;
    
    try {
      await currencyService.deleteRate(from, to);
      setRates(currencyService.getAllRates());
    } catch (error) {
      logger.error('Failed to delete rate', error as Error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading currency settings...</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <div className="text-red-500">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Currency Settings</h1>
        <Button onClick={handleSaveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex space-x-8">
          <button
            className={`py-4 px-1 border-b-2 font-medium ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium ${
              activeTab === 'currencies'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('currencies')}
          >
            Currencies
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium ${
              activeTab === 'rates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('rates')}
          >
            Exchange Rates
          </button>
        </nav>
      </div>

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <Card className="p-6 space-y-6">
          <h2 className="text-lg font-semibold">General Settings</h2>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Base Currency</label>
              <select
                value={settings.baseCurrency}
                onChange={(e) => setSettings({ ...settings, baseCurrency: e.target.value })}
                className="w-full border rounded-md p-2"
              >
                {DEFAULT_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-1">
                All financial reports will be displayed in this currency
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Rounding Method</label>
              <select
                value={settings.roundingMethod}
                onChange={(e) => setSettings({ 
                  ...settings, 
                  roundingMethod: e.target.value as CurrencySettingsData['roundingMethod']
                })}
                className="w-full border rounded-md p-2"
              >
                <option value="standard">Standard (Round Half Up)</option>
                <option value="bankers">Banker's Rounding (Round Half to Even)</option>
                <option value="truncate">Truncate (Floor)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">API Provider</label>
              <select
                value={settings.apiProvider}
                onChange={(e) => setSettings({ 
                  ...settings, 
                  apiProvider: e.target.value as CurrencySettingsData['apiProvider']
                })}
                className="w-full border rounded-md p-2"
              >
                <option value="manual">Manual Entry</option>
                <option value="exchangerate-api">ExchangeRate-API</option>
                <option value="openexchangerates">Open Exchange Rates</option>
                <option value="fixer">Fixer.io</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <Input
                type="password"
                value={settings.apiKey || ''}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder="Enter API key"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Rate Update Frequency</label>
              <select
                value={settings.rateUpdateFrequency}
                onChange={(e) => setSettings({ 
                  ...settings, 
                  rateUpdateFrequency: e.target.value as CurrencySettingsData['rateUpdateFrequency']
                })}
                className="w-full border rounded-md p-2"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="autoUpdateRates"
                checked={settings.autoUpdateRates}
                onChange={(e) => setSettings({ ...settings, autoUpdateRates: e.target.checked })}
                className="mr-2"
              />
              <label htmlFor="autoUpdateRates" className="text-sm font-medium">
                Automatically update exchange rates
              </label>
            </div>
          </div>

          {settings.apiProvider !== 'manual' && settings.apiKey && (
            <div className="pt-4">
              <Button onClick={handleFetchRates} disabled={saving}>
                {saving ? 'Fetching...' : 'Fetch Latest Rates'}
              </Button>
            </div>
          )}

          {OFFLINE_MODE && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              This desktop build is fully offline. Save manual exchange rates locally instead of using internet providers.
            </p>
          )}
        </Card>
      )}

      {/* Currencies Tab */}
      {activeTab === 'currencies' && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Available Currencies</h2>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Decimal Places</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currencies.map((currency) => {
                  const isEnabled = settings.enabledCurrencies.includes(currency.code);
                  const isBase = currency.code === settings.baseCurrency;
                  
                  return (
                    <tr key={currency.code}>
                      <td className="px-4 py-3 font-medium">{currency.code}</td>
                      <td className="px-4 py-3">{currency.name}</td>
                      <td className="px-4 py-3">{currency.symbol}</td>
                      <td className="px-4 py-3">{currency.decimalPlaces}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          isBase ? 'bg-blue-100 text-blue-800' :
                          isEnabled ? 'bg-blue-100 text-blue-800' : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {isBase ? 'Base' : isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {!isBase && (
                          <button
                            onClick={() => handleToggleCurrency(currency.code, !isEnabled)}
                            className={`text-sm ${isEnabled ? 'text-red-600' : 'text-green-600'}`}
                          >
                            {isEnabled ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Exchange Rates Tab */}
      {activeTab === 'rates' && (
        <div className="space-y-6">
          {/* Add New Rate */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Add Exchange Rate</h2>
            
            <div className="grid grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">From Currency</label>
                <select
                  value={newRate.fromCurrency}
                  onChange={(e) => setNewRate({ ...newRate, fromCurrency: e.target.value })}
                  className="w-full border rounded-md p-2"
                >
                  {DEFAULT_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">To Currency</label>
                <select
                  value={newRate.toCurrency}
                  onChange={(e) => setNewRate({ ...newRate, toCurrency: e.target.value })}
                  className="w-full border rounded-md p-2"
                >
                  {DEFAULT_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Rate</label>
                <Input
                  type="number"
                  step="0.000001"
                  value={newRate.rate}
                  onChange={(e) => setNewRate({ ...newRate, rate: parseFloat(e.target.value) || 0 })}
                />
              </div>
              
              <Button onClick={handleAddRate}>Add Rate</Button>
            </div>
          </Card>

          {/* Existing Rates */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Current Exchange Rates</h2>
            
            {rates.length === 0 ? (
              <p className="text-gray-500">No exchange rates configured</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pair</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inverse</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rates.map((rate) => (
                      <tr key={`${rate.fromCurrency}-${rate.toCurrency}`}>
                        <td className="px-4 py-3 font-medium">
                          {rate.fromCurrency} / {rate.toCurrency}
                        </td>
                        <td className="px-4 py-3">{rate.rate.toFixed(6)}</td>
                        <td className="px-4 py-3">{(1 / rate.rate).toFixed(6)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            rate.source === 'api' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {rate.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(rate.date).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDeleteRate(rate.fromCurrency, rate.toCurrency)}
                            className="text-red-600 text-sm"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default CurrencySettings;
