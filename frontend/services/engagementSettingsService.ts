import { EngagementSettings, DEFAULT_ENGAGEMENT_SETTINGS } from '../types/engagement'
import { logger } from './logger'
import { dbService } from './db'
import { patchStoredCompanyConfig, loadStoredCompanyConfig } from '../utils/companyConfigSync'
import { CompanyConfig } from '../types'

const SETTINGS_KEY = 'engagementSettings'

function getCompanyConfig(): any {
  try {
    const raw = localStorage.getItem('nexus_company_config')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCompanyConfig(config: any): void {
  try {
    localStorage.setItem('nexus_company_config', JSON.stringify(config))
  } catch (err) {
    logger.error('Failed to save company config:', err)
  }
}

async function persistSettingsToDb(settings: EngagementSettings): Promise<void> {
  try {
    await dbService.put('settings', { id: SETTINGS_KEY, value: settings, updatedAt: new Date().toISOString() })
  } catch (err) {
    logger.error('Failed to persist engagement settings to DB:', err)
  }
}

async function loadSettingsFromDb(): Promise<EngagementSettings | null> {
  try {
    const record = await dbService.get<any>('settings', SETTINGS_KEY)
    if (record?.value) return record.value as EngagementSettings
  } catch { /* ignore */ }
  return null
}

export const engagementSettingsService = {
  getSettings(): EngagementSettings {
    const config = getCompanyConfig()
    return { ...DEFAULT_ENGAGEMENT_SETTINGS, ...config.engagementSettings }
  },

  async getSettingsAsync(): Promise<EngagementSettings> {
    // Prefer the authoritative company-config store (cloud-wins), then the
    // legacy dedicated row, then the local cache.
    try {
      const companyConfig = await loadStoredCompanyConfig({} as CompanyConfig)
      const authoritative = companyConfig?.engagementSettings
      if (authoritative) return { ...DEFAULT_ENGAGEMENT_SETTINGS, ...authoritative }
    } catch { /* ignore */ }
    const dbSettings = await loadSettingsFromDb()
    if (dbSettings) return { ...DEFAULT_ENGAGEMENT_SETTINGS, ...dbSettings }
    return this.getSettings()
  },

  async updateSettings(updates: Partial<EngagementSettings>): Promise<EngagementSettings> {
    const config = getCompanyConfig()
    const current = config.engagementSettings || {}
    const merged = { ...current, ...updates }
    config.engagementSettings = merged
    saveCompanyConfig(config)
    await persistSettingsToDb(merged)
    // Sync through the authoritative company-config store so every device of
    // the company receives the change (patch-only; no defaults upload).
    await patchStoredCompanyConfig({ engagementSettings: merged })
    return merged
  },

  isEnabled(): boolean {
    return this.getSettings().enabled ?? false
  },

  isModuleEnabled(module: keyof EngagementSettings): boolean {
    const settings = this.getSettings()
    if (!settings.enabled) return false
    switch (module) {
      case 'pointsEnabled': return settings.pointsEnabled ?? false
      case 'cashbackEnabled': return settings.cashbackEnabled ?? false
      case 'membershipEnabled': return settings.membershipEnabled ?? false
      case 'giftCardsEnabled': return settings.giftCardsEnabled ?? false
      case 'affiliateEnabled': return settings.affiliateEnabled ?? false
      case 'promotionsEnabled': return settings.promotionsEnabled ?? false
      case 'rewardsEnabled': return settings.rewardsEnabled ?? false
      default: return false
    }
  },

  async resetSettings(): Promise<EngagementSettings> {
    const config = getCompanyConfig()
    config.engagementSettings = { ...DEFAULT_ENGAGEMENT_SETTINGS }
    saveCompanyConfig(config)
    await persistSettingsToDb(DEFAULT_ENGAGEMENT_SETTINGS)
    await patchStoredCompanyConfig({ engagementSettings: { ...DEFAULT_ENGAGEMENT_SETTINGS } })
    return config.engagementSettings
  },
}

export default engagementSettingsService
