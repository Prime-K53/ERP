import { ReferralEvent } from './referral-extended'
import { Customer } from '../types'
import { CompanyConfig } from '../types'
import { EngagementPluginResult } from './engagement'
import { logger } from '../services/logger'
import { referralRuleEngine } from '../services/referralRuleEngine'
import { referralEventBus } from '../services/referralEventBus'
import { dbService } from '../services/db'

export interface EngagementPluginContext {
  event: ReferralEvent
  customer: Customer
  companyConfig: CompanyConfig
  ruleEngine: typeof referralRuleEngine
  eventBus: typeof referralEventBus
  dbService: typeof dbService
  logger: typeof logger
  now: Date
}

export interface IEngagementPlugin {
  id: string
  name: string
  supportedEvents: string[]
  priority: number

  enabled(context: EngagementPluginContext): boolean | Promise<boolean>
  execute(event: ReferralEvent, context: EngagementPluginContext): Promise<EngagementPluginResult | null>
}
