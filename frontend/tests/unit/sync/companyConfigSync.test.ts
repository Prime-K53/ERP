import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../../services/db', () => ({
  dbService: {
    getSetting: mocks.getSetting,
    saveSetting: mocks.saveSetting,
  },
}));

import {
  COMPANY_CONFIG_SETTINGS_KEY,
  normalizeStoredCompanyConfig,
  loadStoredCompanyConfig,
  persistCompanyConfig,
  patchStoredCompanyConfig,
  isIdenticalToDefaults,
  hasGenuineChange,
  registerCompanyConfigContextProvider,
} from '../../../utils/companyConfigSync';

const defaults: any = {
  companyName: 'Prime Company',
  defaultCurrency: 'USD',
  transactionSettings: {
    numbering: { shared: { prefix: 'INV', padding: 4 } },
  },
  security: { passwordRequired: true },
  vat: { enabled: false, rate: 0 },
  pricingSettings: {
    roundingMethod: 'Nearest',
    defaultMarkup: 25,
  },
  notificationSettings: { smsGatewayEnabled: false },
};

const cloudConfig: any = {
  companyName: 'ACME Printers',
  vat: { enabled: true, rate: 16 },
  pricingSettings: { roundingMethod: 'Truncate', defaultMarkup: 40 },
};

let storageBacking: Record<string, unknown>;

function installLegacyLocalStorage(seed: Record<string, string> = {}) {
  const backing = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => { backing.set(key, value); },
    removeItem: (key: string) => { backing.delete(key); },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() { return backing.size; },
  });
}

function unregisterAllProviders() {
  const provider: any = null;
  registerCompanyConfigContextProvider(provider);
}

beforeEach(() => {
  mocks.getSetting.mockReset();
  mocks.saveSetting.mockReset();
  storageBacking = {};
  mocks.getSetting.mockImplementation(async (key: string) => storageBacking[key]);
  mocks.saveSetting.mockImplementation(async (key: string, value: unknown) => { storageBacking[key] = value; });
  vi.unstubAllGlobals();
  unregisterAllProviders();
});

afterEach(() => {
  vi.unstubAllGlobals();
  unregisterAllProviders();
});

describe('normalizeStoredCompanyConfig', () => {
  it('returns null for empty / garbage input', () => {
    expect(normalizeStoredCompanyConfig(undefined as any, defaults)).toBeNull();
    expect(normalizeStoredCompanyConfig(null as any, defaults)).toBeNull();
    expect(normalizeStoredCompanyConfig({} as any, defaults)).toBeNull();
    expect(normalizeStoredCompanyConfig([1, 2] as any, defaults)).toBeNull();
    expect(normalizeStoredCompanyConfig('string' as any, defaults)).toBeNull();
  });

  it('merges cloud values over defaults (cloud wins) and keeps defaults for missing keys', () => {
    const merged = normalizeStoredCompanyConfig(cloudConfig, defaults)!;
    expect(merged.companyName).toBe('ACME Printers');
    expect(merged.vat.enabled).toBe(true);
    expect(merged.vat.rate).toBe(16);
    expect(merged.pricingSettings.defaultMarkup).toBe(40);
    expect(merged.security.passwordRequired).toBe(true);
  });
});

describe('loadStoredCompanyConfig (Windows -> cloud -> tablet)', () => {
  it('hydrates a cloud-sourced settings row', async () => {
    mocks.getSetting.mockResolvedValueOnce(cloudConfig);
    const loaded = await loadStoredCompanyConfig(defaults);
    expect(loaded?.companyName).toBe('ACME Printers');
    expect(mocks.getSetting).toHaveBeenCalledWith(COMPANY_CONFIG_SETTINGS_KEY);
  });

  it('returns null when the store is empty / never configured (fresh tablet)', async () => {
    mocks.getSetting.mockResolvedValueOnce(undefined);
    expect(await loadStoredCompanyConfig(defaults)).toBeNull();
  });

  it('does not upload defaults when a device has empty local storage', async () => {
    mocks.getSetting.mockResolvedValueOnce(undefined);
    const loaded = await loadStoredCompanyConfig(defaults);
    expect(loaded).toBeNull();
    expect(mocks.saveSetting).not.toHaveBeenCalled();
  });
});

describe('persistCompanyConfig (Device A full save)', () => {
  it('persists a full normalized config through the settings store', async () => {
    const full = normalizeStoredCompanyConfig({ companyName: 'Saved Co', ...cloudConfig }, defaults)!;
    await persistCompanyConfig(full);
    expect(mocks.saveSetting).toHaveBeenCalledWith(COMPANY_CONFIG_SETTINGS_KEY, full);
  });
});

describe('patchStoredCompanyConfig — first-edit row creation (new company)', () => {
  it('Test 1: first genuine patch creates the complete normalized cloud row', async () => {
    registerCompanyConfigContextProvider({
      getDefaults: () => defaults as any,
      getCurrentConfig: () => null,
    });
    const result = await patchStoredCompanyConfig({ vat: { enabled: true, rate: 18 } });
    expect(result).toBe('applied');
    const stored = storageBacking[COMPANY_CONFIG_SETTINGS_KEY] as any;
    expect(stored).toBeTruthy();
    expect(stored.vat).toEqual({ enabled: true, rate: 18 });
    expect(stored.companyName).toBe('Prime Company');
    expect(stored.pricingSettings.roundingMethod).toBe('Nearest');
    expect(stored.security.passwordRequired).toBe(true);
  });

  it('Test 2: empty patch {} creates nothing and returns skipped', async () => {
    registerCompanyConfigContextProvider({
      getDefaults: () => defaults as any,
      getCurrentConfig: () => null,
    });
    const result = await patchStoredCompanyConfig({});
    expect(result).toBe('skipped');
    expect(storageBacking[COMPANY_CONFIG_SETTINGS_KEY]).toBeUndefined();
  });

  it('Test 3: first patch preserves genuine legacy device-local values', async () => {
    installLegacyLocalStorage({
      nexus_company_config: JSON.stringify({
        companyName: 'Legacy Co',
        vat: { enabled: true, rate: 16 },
      }),
    });
    registerCompanyConfigContextProvider({
      getDefaults: () => defaults as any,
      getCurrentConfig: () => null,
    });
    const result = await patchStoredCompanyConfig({ notificationSettings: { smsGatewayEnabled: true } });
    expect(result).toBe('applied');
    const stored = storageBacking[COMPANY_CONFIG_SETTINGS_KEY] as any;
    expect(stored.companyName).toBe('Legacy Co');
    expect(stored.vat.rate).toBe(16);
    expect(stored.notificationSettings.smsGatewayEnabled).toBe(true);
  });

  it('Test 4: second device (empty store) receives the same first edit', async () => {
    registerCompanyConfigContextProvider({
      getDefaults: () => defaults as any,
      getCurrentConfig: () => null,
    });
    const result = await patchStoredCompanyConfig({ vat: { enabled: true, rate: 18 } });
    expect(result).toBe('applied');
    const stored = storageBacking[COMPANY_CONFIG_SETTINGS_KEY] as any;
    expect(stored.vat).toEqual({ enabled: true, rate: 18 });
    expect(stored.companyName).toBe('Prime Company');
  });

  it('Test 5: concurrent first patches serialize and both slices survive', async () => {
    registerCompanyConfigContextProvider({
      getDefaults: () => defaults as any,
      getCurrentConfig: () => null,
    });
    const [r1, r2] = await Promise.all([
      patchStoredCompanyConfig({ vat: { enabled: true, rate: 18 } }),
      patchStoredCompanyConfig({ engagementSettings: { enabled: true } }),
    ]);
    expect([r1, r2]).toEqual(['applied', 'applied']);
    const stored = storageBacking[COMPANY_CONFIG_SETTINGS_KEY] as any;
    expect(stored.vat).toEqual({ enabled: true, rate: 18 });
    expect(stored.engagementSettings).toEqual({ enabled: true });
  });

  it('Test 6: existing cloud row merges patch without touching other fields', async () => {
    registerCompanyConfigContextProvider({
      getDefaults: () => defaults as any,
      getCurrentConfig: () => null,
    });
    storageBacking[COMPANY_CONFIG_SETTINGS_KEY] = cloudConfig;
    const result = await patchStoredCompanyConfig({ vat: { enabled: false, rate: 0 } });
    expect(result).toBe('applied');
    const stored = storageBacking[COMPANY_CONFIG_SETTINGS_KEY] as any;
    expect(stored.companyName).toBe('ACME Printers');
    expect(stored.vat).toEqual({ enabled: false, rate: 0 });
    expect(stored.pricingSettings.defaultMarkup).toBe(40);
  });

  it('Test 7: defaults-only snapshots are never uploaded (boot / no genuine change)', async () => {
    registerCompanyConfigContextProvider({
      getDefaults: () => defaults as any,
      getCurrentConfig: () => withNormalizedDefaults(),
    });
    const result = await patchStoredCompanyConfig({ vat: { enabled: false, rate: 0 } });
    expect(result).toBe('skipped');
    expect(storageBacking[COMPANY_CONFIG_SETTINGS_KEY]).toBeUndefined();
  });
});

describe('patchStoredCompanyConfig — existing cloud row (tablet edits)', () => {
  it('applies a nested patch without losing other cloud fields', async () => {
    storageBacking[COMPANY_CONFIG_SETTINGS_KEY] = {
      ...cloudConfig,
      engagementSettings: { enabled: false },
    };
    await patchStoredCompanyConfig({ vat: { enabled: true, rate: 18 } });
    const [key, payload] = mocks.saveSetting.mock.calls[0] as [string, any];
    expect(key).toBe(COMPANY_CONFIG_SETTINGS_KEY);
    expect(payload.vat).toEqual({ enabled: true, rate: 18 });
    expect(payload.companyName).toBe('ACME Printers');
    expect(payload.engagementSettings).toEqual({ enabled: false });
  });
});

describe('hasGenuineChange', () => {
  it('false for empty/undefined patches', () => {
    expect(hasGenuineChange(undefined as any, defaults as any)).toBe(false);
    expect(hasGenuineChange({} as any, defaults as any)).toBe(false);
    expect(hasGenuineChange(null as any, defaults as any)).toBe(false);
  });

  it('true when patch introduces a real user change', () => {
    expect(hasGenuineChange({ vat: { enabled: true, rate: 18 } }, defaults as any)).toBe(true);
    expect(hasGenuineChange({ companyName: 'Renamed Co' }, defaults as any)).toBe(true);
  });

  it('false when patch matches defaults exactly', () => {
    expect(hasGenuineChange({ vat: { enabled: false, rate: 0 } }, defaults as any)).toBe(false);
  });
});

describe('stale-cache protection', () => {
  it('flags a degenerate defaults-only cache so it never replaces cloud settings', () => {
    const canonicalDefaults = normalizeStoredCompanyConfig(
      JSON.parse(JSON.stringify(defaults)),
      defaults
    )!;
    const normalized = normalizeStoredCompanyConfig(defaults, defaults)!;
    expect(isIdenticalToDefaults(normalized, canonicalDefaults)).toBe(true);
    expect(isIdenticalToDefaults(normalizeStoredCompanyConfig(cloudConfig, defaults)!, canonicalDefaults)).toBe(false);
  });
});

function withNormalizedDefaults(): any {
  return normalizeStoredCompanyConfig(defaults, defaults);
}