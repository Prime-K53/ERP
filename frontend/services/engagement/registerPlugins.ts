import { engagementEngine } from '../engagementEngine'
import { loyaltyPlugin } from './loyaltyPlugin'
import { cashbackPlugin } from './cashbackPlugin'
import { membershipPlugin } from './membershipPlugin'
import { giftCardPlugin } from './giftCardPlugin'
import { affiliatePlugin } from './affiliatePlugin'
import { promotionPlugin } from './promotionPlugin'
import { rewardsPlugin } from './rewardsPlugin'
import { logger } from '../logger'

export function initializeEngagementPlugins(): void {
  const plugins = [
    loyaltyPlugin,
    cashbackPlugin,
    membershipPlugin,
    giftCardPlugin,
    affiliatePlugin,
    promotionPlugin,
    rewardsPlugin,
  ]

  for (const plugin of plugins) {
    engagementEngine.register(plugin)
  }

  logger.info(`Engagement plugins initialized: ${plugins.length} plugins registered`)
}
