import { CompanyConfig } from '../types';
import { DEFAULT_PRICING_SETTINGS } from '../services/pricingRoundingService';
import { withNormalizedSecurityConfig } from './securitySettings';
import { normalizeCompanyNumberingConfig } from './numbering';
import { dbService } from '../services/db';

/**
 * Single authoritative persistence key for the full company configuration.
 * Lives in the IndexedDB `settings` store, which is synced to the Supabase
 * `public.settings` table (company-scoped) by the existing sync engine and
 * propagated to every other device of the company via pull + realtime.
 * Local storage / IndexedDB act only as an offline cache of this value.
 */
export const COMPANY_CONFIG_SETTINGS_KEY = 'companyConfig';

const LEGACY_LOCAL_CONFIG_KEY = 'nexus_company_config';

/**
 * In-memory source of the live company config and its factory defaults.
 * AuthContext registers itself so slice patchers (VAT / AI / engagement)
 * can build a complete, normalized config when a brand-new company makes
 * its very first edit before any cloud row exists.
 */
export interface CompanyConfigContextProvider {
  getDefaults: () => CompanyConfig;
  getCurrentConfig: () => CompanyConfig | null;
}

let companyConfigProvider: CompanyConfigContextProvider | null = null;

/**
 * Register the live company-config context (AuthContext owns the state).
 * Returns an unregister function; SafeModule operates without a provider
 * by falling back to null/empty values instead of crashing.
 */
export function registerCompanyConfigContextProvider(
  provider: CompanyConfigContextProvider | null
): () => void {
  companyConfigProvider = provider;
  return () => {
    if (companyConfigProvider === provider) {
      companyConfigProvider = null;
    }
  };
}

/**
 * Merge a partial company config (from the sync store or a legacy local
 * cache) over the application defaults, applying the same normalization the
 * Settings save path applies. Cloud values win; defaults only fill in keys
 * the incoming object does not provide.
 */
export function normalizeStoredCompanyConfig(
  raw: unknown,
  defaults: CompanyConfig
): CompanyConfig | null {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length === 0
  ) {
    return null;
  }

  const partial = raw as Partial<CompanyConfig>;

  return withNormalizedSecurityConfig(normalizeCompanyNumberingConfig({
    ...defaults,
    ...partial,
    pricingSettings: {
      ...DEFAULT_PRICING_SETTINGS,
      ...(partial.pricingSettings || {}),
    },
  }));
}

/**
 * True when a candidate object is byte-for-byte identical to the factory
 * defaults — used to decide whether legacy local caches are genuine user
 * configuration (eligible for migration) or untouched defaults (never
 * uploaded to the cloud store).
 */
export function isIdenticalToDefaults(
  candidate: CompanyConfig,
  defaults: CompanyConfig
): boolean {
  try {
    return JSON.stringify(candidate) === JSON.stringify(defaults);
  } catch {
    return false;
  }
}

/**
 * True when merging a patch slice onto the factory defaults would actually
 * produce a different company configuration than the untouched defaults.
 * The creation decision for a brand-new cloud row is based on this check so
 * pure defaults are never uploaded automatically.
 */
export function hasGenuineChange(
  patch: unknown,
  defaults: CompanyConfig
): boolean {
  if (
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch) ||
    Object.keys(patch).length === 0
  ) {
    return false;
  }

  const canonical = normalizeStoredCompanyConfig(defaults, defaults);
  if (!canonical) return true;

  const merged = normalizeStoredCompanyConfig(
    { ...defaults, ...(patch as object) } as CompanyConfig,
    defaults
  );
  return merged !== null && !isIdenticalToDefaults(merged, canonical);
}

/**
 * Read the authoritative company configuration from the sync store.
 * Returns null when no configuration has ever been persisted (fresh device /
 * empty cache) so callers can safely fall back to defaults without uploading.
 */
export async function loadStoredCompanyConfig(
  defaults: CompanyConfig
): Promise<CompanyConfig | null> {
  try {
    const stored = await dbService.getSetting<Partial<CompanyConfig>>(
      COMPANY_CONFIG_SETTINGS_KEY
    );
    return normalizeStoredCompanyConfig(stored, defaults);
  } catch {
    return null;
  }
}

/**
 * Persist the full normalized company configuration through
 * dbService.saveSetting, which mirrors it into localStorage (offline cache)
 * and enqueues it on the durable sync queue for upload to public.settings.
 */
export async function persistCompanyConfig(
  config: CompanyConfig
): Promise<void> {
  await dbService.saveSetting(COMPANY_CONFIG_SETTINGS_KEY, config);
}

/**
 * Read the legacy device-local cache (nexus_company_config) as a candidate
 * base for a first-edit cloud row. Null when absent, unreadable, or
 * byte-identical to the factory defaults (never migrate defaults).
 */
function readGenuineLegacyLocalConfig(
  defaults: CompanyConfig
): CompanyConfig | null {
  try {
    if (typeof localStorage === 'undefined' || !localStorage.getItem) {
      return null;
    }
    const raw = localStorage.getItem(LEGACY_LOCAL_CONFIG_KEY);
    if (!raw) return null;

    const backend = defaults;
    const normalized = normalizeStoredCompanyConfig(JSON.parse(raw), backend);
    if (!normalized) return null;

    const canonical = normalizeStoredCompanyConfig(backend, backend);
    if (canonical && isIdenticalToDefaults(normalized, canonical)) return null;

    return normalized;
  } catch {
    return null;
  }
}

/**
 * Read the registered in-memory current config (AuthContext state) as a
 * fallback base when no genuine legacy cache exists. Never returns a
 * defaults-only snapshot.
 */
function readInMemoryCurrentConfig(
  defaults: CompanyConfig
): CompanyConfig | null {
  if (!companyConfigProvider) return null;
  try {
    const current = companyConfigProvider.getCurrentConfig();
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    const normalized = normalizeStoredCompanyConfig(current, defaults);
    if (!normalized) return null;

    const canonical = normalizeStoredCompanyConfig(defaults, defaults);
    if (canonical && isIdenticalToDefaults(normalized, canonical)) return null;

    return normalized;
  } catch {
    return null;
  }
}

function resolveDefaults(): CompanyConfig {
  return companyConfigProvider?.getDefaults() ?? ({} as CompanyConfig);
}

/**
 * Serialize the read-modify-write steps of patchStoredCompanyConfig so two
 * slice patches racing on the same brand-new device (e.g. VAT + engagement
 * saved in quick succession) cannot both build a row from an empty store and
 * overwrite each other.
 */
let patchQueue: Promise<void> = Promise.resolve();

function enqueueSerialized<T>(task: () => Promise<T>): Promise<T> {
  const result = patchQueue.then(task, task);
  patchQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * Patch a nested slice of the persisted configuration (e.g. `{ aiConfig }`,
 * `{ vat }`, `{ engagementSettings }`) without rebasing missing keys
 * device-locally.
 *
 * Existing cloud row  -> merge the slice into the stored config and save.
 * No row + genuine change  -> create the row with the complete normalized
 *                             configuration (defaults + legacy local values +
 *                             in-memory current + the new slice).
 * No row + empty patch     -> 'skipped'; nothing is ever uploaded until a
 *                             genuine user edit exists.
 */
export async function patchStoredCompanyConfig(
  patch: Partial<CompanyConfig>
): Promise<'applied' | 'skipped'> {
  return enqueueSerialized(async () => {
    try {
      const defaults = resolveDefaults();
      const stored = await dbService.getSetting<Partial<CompanyConfig>>(
        COMPANY_CONFIG_SETTINGS_KEY
      );
      const current = normalizeStoredCompanyConfig(stored, defaults);

      if (current) {
        await dbService.saveSetting(COMPANY_CONFIG_SETTINGS_KEY, {
          ...current,
          ...patch,
        });
        return 'applied';
      }

      if (!hasGenuineChange(patch, defaults)) return 'skipped';

      const base =
        readGenuineLegacyLocalConfig(defaults) ??
        readInMemoryCurrentConfig(defaults) ??
        defaults;

      const merged = normalizeStoredCompanyConfig(
        { ...base, ...patch } as CompanyConfig,
        defaults
      );
      if (!merged) return 'skipped';

      const canonical = normalizeStoredCompanyConfig(defaults, defaults);
      if (canonical && isIdenticalToDefaults(merged, canonical)) {
        return 'skipped';
      }

      await dbService.saveSetting(COMPANY_CONFIG_SETTINGS_KEY, merged);
      return 'applied';
    } catch {
      return 'skipped';
    }
  });
}