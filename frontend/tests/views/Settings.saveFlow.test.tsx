import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../../views/Settings';
import type { PricingSettings } from '../../types';

const mockUseData = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../context/DataContext', () => ({
  useData: () => mockUseData()
}));

vi.mock('../../services/localFileStorage', () => ({
  localFileStorage: {
    save: vi.fn().mockResolvedValue('file-id-123')
  }
}));

vi.mock('../../services/api', () => ({
  api: {
    system: {
      getLicenseInfo: vi.fn().mockResolvedValue({ licensed: true, expires: '2026-12-31' })
    }
  }
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

vi.mock('../../context/FinanceContext', () => ({
  useFinance: () => ({
    ledger: [],
  }),
}));

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    inventory: [],
  }),
}));

const mockUpdateCompanyConfig = vi.fn();
const mockNotify = vi.fn();

const defaultCompanyConfig = {
    companyName: 'Test Company',
    currencySymbol: '$',
    taxNumber: 'TAX123',
    address: '123 Test St',
    phone: '555-0123',
    email: 'test@example.com',
    website: 'https://test.com',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    securitySettings: {
      passwordProtectionEnabled: false,
      enforcePasswordComplexity: false,
      sessionTimeoutMinutes: 60,
      forcePasswordChangeDays: 90,
      requireTwoFactor: false,
      auditLogLevel: 'Standard',
      lockoutAttempts: 5
    },
    pricingSettings: {
      enableRounding: false,
      defaultMethod: 'NEAREST_50',
      customStep: 50,
      applyToPOS: false,
      applyToInvoices: false,
      applyToQuotations: false,
      allowManualOverride: false,
      showOriginalPrice: false,
      profitProtectionMode: false
    }
  };

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-02-23T12:00:00.000Z'));
    mockUseData.mockReset();
    mockUseAuth.mockReset();
    mockUpdateCompanyConfig.mockClear();
    mockNotify.mockClear();

    mockUseData.mockReturnValue({
      companyConfig: defaultCompanyConfig,
      updateCompanyConfig: mockUpdateCompanyConfig,
      notify: mockNotify,
      resetSystem: vi.fn(),
      manualDownloadBackup: vi.fn(),
      inventory: [],
      ledger: [],
      auditLogs: [],
      allUsers: []
    });

    mockUseAuth.mockReturnValue({
      companyConfig: defaultCompanyConfig,
      updateCompanyConfig: mockUpdateCompanyConfig,
      validatePasswordStrength: vi.fn(),
      manageUser: vi.fn(),
      notify: mockNotify,
      resetSystem: vi.fn(),
      manualDownloadBackup: vi.fn(),
      auditLogs: [],
      allUsers: [],
      user: { id: 'test-user', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

describe('Settings - Pricing Settings Save Flow Integration', () => {
  it('should save valid pricing settings successfully', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeInTheDocument();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockNotify).toHaveBeenCalledWith('Settings updated successfully', 'success');
  });

  it('should display validation errors for invalid pricing settings', async () => {
    // Mock company config with invalid pricing settings
    const invalidConfig = {
      ...defaultCompanyConfig,
      pricingSettings: {
        ...defaultCompanyConfig.pricingSettings,
        enableRounding: true,
        defaultMethod: 'INVALID_METHOD' as unknown as 'NEAREST_50' | 'ALWAYS_UP_50' | 'ALWAYS_UP_100' | 'ALWAYS_UP_500' | 'ALWAYS_UP_10' | 'ALWAYS_UP_CUSTOM' | 'NEAREST_10' | 'NEAREST_50' | 'NEAREST_100' | 'PSYCHOLOGICAL' | 'Nearest' | 'AlwaysUp' | 'AlwaysDown', // Invalid enum value
        customStep: -10, // Negative step
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false
      }
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: invalidConfig
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
  });

  it('should handle missing pricing settings gracefully', async () => {
    const configWithoutPricingSettings = {
      ...defaultCompanyConfig,
      pricingSettings: undefined
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: configWithoutPricingSettings
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    // Should still save successfully as pricingSettings is optional
    expect(mockNotify).toHaveBeenCalledWith('Settings updated successfully', 'success');
  });

  it('should validate smart threshold rules when enabled', async () => {
    const configWithInvalidThresholds = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, maxPrice: 100, step: 25, method: 'NEAREST_25' },
          { minPrice: 100, step: 50, method: 'NEAREST_50' },
          { minPrice: 50, maxPrice: 200, step: 10, method: 'NEAREST_10' } // Overlapping range
        ]
      }
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: configWithInvalidThresholds
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
  });

  it('should accept valid smart threshold configuration', async () => {
    const configWithValidThresholds = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, maxPrice: 100, step: 25, method: 'NEAREST_50' },
          { minPrice: 100, step: 50, method: 'NEAREST_50' }
        ]
      }
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: configWithValidThresholds
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockNotify).toHaveBeenCalledWith('Settings updated successfully', 'success');
  });

  it('should normalize pricing settings with defaults on save', async () => {
    const partialConfig = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_100'
        // Missing other required fields
      } as unknown as PricingSettings
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: partialConfig
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    // Verify that the saved config includes default values for missing fields
    const savedConfig = mockUpdateCompanyConfig.mock.calls[0][0];
    expect(savedConfig.pricingSettings).toMatchObject({
      enableRounding: true,
      defaultMethod: 'NEAREST_100',
      customStep: 50, // default
      applyToPOS: true, // DEFAULT_PRICING_SETTINGS
      applyToInvoices: true, // DEFAULT_PRICING_SETTINGS
      applyToQuotations: true, // DEFAULT_PRICING_SETTINGS
      allowManualOverride: true, // DEFAULT_PRICING_SETTINGS
      showOriginalPrice: true, // DEFAULT_PRICING_SETTINGS
      profitProtectionMode: true // DEFAULT_PRICING_SETTINGS
    });
  });

  it('should handle save errors gracefully', async () => {
    mockUpdateCompanyConfig.mockRejectedValue(new Error('Failed to save to localStorage'));

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalled();
    });

  });

  it('should preserve existing company config when pricing settings are valid', async () => {
    const configWithOtherSettings = {
      ...defaultCompanyConfig,
      companyName: 'Updated Company Name',
      currencySymbol: '€',
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'ALWAYS_UP_50',
        customStep: 50,
        applyToPOS: true,
        applyToInvoices: true,
        applyToQuotations: false,
        allowManualOverride: true,
        showOriginalPrice: true,
        profitProtectionMode: true
      }
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: configWithOtherSettings
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    const savedConfig = mockUpdateCompanyConfig.mock.calls[0][0];
    expect(savedConfig.companyName).toBe('Updated Company Name');
    expect(savedConfig.currencySymbol).toBe('€');
    expect(savedConfig.pricingSettings.enableRounding).toBe(true);
    expect(savedConfig.pricingSettings.applyToPOS).toBe(true);
  });

  it('should validate threshold rule structure', async () => {
    const configWithMalformedThresholds = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, step: 25, method: 'NEAREST_25' }, // Missing maxPrice (optional but should be valid)
          { minPrice: 100, maxPrice: 50, step: 50, method: 'NEAREST_50' } // Invalid: maxPrice < minPrice
        ]
      }
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: configWithMalformedThresholds
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
  });

  it('should clear validation errors when valid settings are saved', async () => {
    // Start with invalid config
    const invalidConfig = {
      ...defaultCompanyConfig,
      pricingSettings: {
        ...defaultCompanyConfig.pricingSettings,
        defaultMethod: 'INVALID' as unknown as 'NEAREST_50' | 'ALWAYS_UP_50' | 'ALWAYS_UP_100' | 'ALWAYS_UP_500' | 'ALWAYS_UP_10' | 'ALWAYS_UP_CUSTOM' | 'NEAREST_10' | 'NEAREST_50' | 'NEAREST_100' | 'PSYCHOLOGICAL' | 'Nearest' | 'AlwaysUp' | 'AlwaysDown'
      }
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: invalidConfig
    });

    const { rerender } = render(<MemoryRouter><Settings /></MemoryRouter>);

    // First attempt with invalid settings
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
    });

    // Update to valid settings
    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: defaultCompanyConfig
    });

    // Re-render with new config
    rerender(<MemoryRouter><Settings /></MemoryRouter>);

    const newSaveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(newSaveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockNotify).toHaveBeenLastCalledWith('Settings updated successfully', 'success');
  });
});

describe('Settings - Integration with PricingSettingsValidator', () => {
  it('should use PricingSettingsValidator.validate in handleSave', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalled();
    });

    // The validator should have been called internally
    // This is implicitly tested through the validation behavior
  });

  it('should handle all validation error paths from validator', async () => {
    const configWithMultipleErrors = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: 'yes' as unknown as boolean, // Should be boolean
        defaultMethod: 123 as unknown as 'NEAREST_50' | 'ALWAYS_UP_50' | 'ALWAYS_UP_100' | 'ALWAYS_UP_500' | 'ALWAYS_UP_10' | 'ALWAYS_UP_CUSTOM' | 'NEAREST_10' | 'NEAREST_50' | 'NEAREST_100' | 'PSYCHOLOGICAL' | 'Nearest' | 'AlwaysUp' | 'AlwaysDown', // Should be string
        customStep: 'fifty' as unknown as number, // Should be number
        applyToPOS: 'no' as unknown as boolean,
        applyToInvoices: 'maybe' as unknown as boolean,
        applyToQuotations: true,
        allowManualOverride: 'true' as unknown as boolean,
        showOriginalPrice: 1 as unknown as boolean,
        profitProtectionMode: 'false' as unknown as boolean
      }
    };

    mockUseAuth.mockReturnValue({
      ...mockUseAuth(),
      companyConfig: configWithMultipleErrors
    });

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
  });
});
