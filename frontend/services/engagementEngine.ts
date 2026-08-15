import { ReferralEvent } from '../types/referral-extended'
import { EngagementPluginResult } from '../types/engagement'
import { IEngagementPlugin, EngagementPluginContext } from '../types/engagement-plugin'
import { referralEventBus } from './referralEventBus'
import { referralRuleEngine } from './referralRuleEngine'
import { dbService } from './db'
import { logger } from './logger'
import { engagementTimelineService } from './engagementTimelineService'
import { engagementAuditService } from './engagementAuditService'
import { initializeEngagementPlugins } from './engagement/registerPlugins'

class CustomerEngagementEngine {
  private plugins: Map<string, IEngagementPlugin> = new Map()
  private unsubscribers: Array<() => void> = []

  register(plugin: IEngagementPlugin): void {
    if (this.plugins.has(plugin.id)) {
      logger.warn(`Engagement plugin "${plugin.id}" already registered — skipping`)
      return
    }
    this.plugins.set(plugin.id, plugin)

    for (const eventType of plugin.supportedEvents) {
      const unsub = referralEventBus.on(eventType, (event) => {
        this.dispatch(event).catch(err => {
          logger.error(`Engagement dispatch error for plugin "${plugin.id}" on ${eventType}:`, err)
        })
      })
      this.unsubscribers.push(unsub)
    }

    logger.info(`Engagement plugin registered: ${plugin.name} (${plugin.id}), events: [${plugin.supportedEvents.join(', ')}]`)
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  getPlugin(pluginId: string): IEngagementPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  getAllPlugins(): IEngagementPlugin[] {
    return Array.from(this.plugins.values())
  }

  emit(eventType: string, data: { source: string; entityType: string; entityId: string; data?: any; actorId?: string; correlationId?: string }): Promise<string> {
    return referralEventBus.emit(eventType, data)
  }

  destroy(): void {
    for (const unsub of this.unsubscribers) {
      try { unsub() } catch { }
    }
    this.unsubscribers = []
    this.plugins.clear()
  }

  private async dispatch(event: ReferralEvent): Promise<void> {
    const sortedPlugins = Array.from(this.plugins.values())
      .filter(p => p.supportedEvents.includes(event.eventType))
      .sort((a, b) => b.priority - a.priority)

    if (sortedPlugins.length === 0) return

    let customer: any = null
    const customerId = event.data?.customerId || event.data?.customer?.id || event.entityId

    try {
      if (customerId) {
        const customers = await dbService.getAll<any>('customers')
        customer = customers.find((c: any) => c.id === customerId)
      }
    } catch { }

    const companyConfigStr = typeof window !== 'undefined' ? localStorage.getItem('nexus_company_config') : null
    let companyConfig: any = {}
    if (companyConfigStr) {
      try { companyConfig = JSON.parse(companyConfigStr) } catch { }
    }

    const engagementSettings = companyConfig.engagementSettings
    if (!engagementSettings?.enabled) return

    const baseContext: Omit<EngagementPluginContext, 'customer'> = {
      event,
      companyConfig,
      ruleEngine: referralRuleEngine,
      eventBus: referralEventBus,
      dbService,
      logger,
      now: new Date(),
    }

    for (const plugin of sortedPlugins) {
      try {
        if (!customer) {
          if (event.data?.customer) {
            customer = event.data.customer
          }
          if (!customer) continue
        }

        const context: EngagementPluginContext = {
          ...baseContext,
          customer,
        }

        const enabled = await plugin.enabled(context)
        if (!enabled) continue

        const result = await plugin.execute(event, context)
        if (result && result.applied) {
          await this.applyResult(result, context, plugin)
        }
      } catch (err) {
        logger.error(`Engagement plugin "${plugin.id}" execution error:`, err)
      }
    }
  }

  private async applyResult(result: EngagementPluginResult, context: EngagementPluginContext, plugin: IEngagementPlugin): Promise<void> {
    const customerId = context.customer?.id
    if (!customerId) return

    try {
      await engagementTimelineService.addEntry({
        customerId,
        eventType: context.event.eventType || plugin.id,
        title: result.description || `${plugin.name} action`,
        description: result.description,
        amount: result.cashback,
        points: result.points,
        referenceType: plugin.id,
        referenceId: context.event.entityId,
        metadata: { ...result.metadata, pluginId: plugin.id },
        actorId: context.event.actorId,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      logger.error('Failed to add engagement timeline entry:', err)
    }

    try {
      await engagementAuditService.log({
        entityType: plugin.id === 'loyalty' ? 'loyalty' :
          plugin.id === 'cashback' ? 'cashback' :
          plugin.id === 'membership' ? 'membership' :
          plugin.id === 'giftcard' ? 'giftcard' :
          plugin.id === 'affiliate' ? 'affiliate' :
          plugin.id === 'promotion' ? 'promotion' : 'reward',
        entityId: context.event.entityId || customerId,
        action: 'updated',
        actorId: context.event.actorId || 'system',
        newValue: result,
        correlationId: context.event.correlationId,
      })
    } catch (err) {
      logger.error('Failed to log engagement audit:', err)
    }

    try {
      await referralEventBus.emit(`engagement.${plugin.id}.applied`, {
        source: 'engagementEngine',
        entityType: plugin.id,
        entityId: context.event.entityId || customerId,
        data: { result, customerId },
        actorId: context.event.actorId,
        correlationId: context.event.correlationId,
      })
    } catch (err) {
      logger.error('Failed to emit engagement applied event:', err)
    }
  }
}

export const engagementEngine = new CustomerEngagementEngine()
export default engagementEngine

initializeEngagementPlugins()
