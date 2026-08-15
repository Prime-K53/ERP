import { IEngagementPlugin, EngagementPluginContext } from '../../types/engagement-plugin'
import { EngagementPluginResult, Promotion, ENGAGEMENT_EVENT_TYPES } from '../../types/engagement'
import { generateId } from '../transactions/_internal'
import { dbService } from '../db'
import { logger } from '../logger'
import { referralEventBus } from '../referralEventBus'

export const promotionPlugin: IEngagementPlugin = {
  id: 'promotion',
  name: 'Promotions & Discounts',
  supportedEvents: ['invoice.paid'],
  priority: 90,

  async enabled(context: EngagementPluginContext): Promise<boolean> {
    return context.companyConfig?.engagementSettings?.promotionsEnabled ?? false
  },

  async execute(event: any, context: EngagementPluginContext): Promise<EngagementPluginResult | null> {
    const { customer, companyConfig } = context
    if (!customer?.id) return null
    if (event.eventType !== 'invoice.paid') return null

    const paidAmount = event.data?.paidAmount ?? event.data?.amount ?? 0
    if (paidAmount <= 0) return null

    // Safety: if this invoice already carries a promotion snapshot (a portal
    // order that was discounted server-side by the promotion engine), never
    // apply a second client-side discount here.
    const hasPortalPromotion = Boolean(
      event.data?.promotion ||
      event.data?.promotionApplied ||
      (event.data?.items || []).some((i: any) => i.promotionId || i.promotionCode)
    )
    if (hasPortalPromotion) return null

    const settings = companyConfig?.engagementSettings
    const stackingRule = settings?.promotionDefaultStacking ?? 'best_only'
    const maxStacked = settings?.promotionMaxStacked ?? 3
    const maxTotalDiscountPct = settings?.promotionMaxTotalDiscount ?? 50

    const invoiceCustomerId = customer.id
    const invoiceTotal = event.data?.total ?? paidAmount
    const invoiceCategory = event.data?.category
    const invoiceBrand = event.data?.brand
    const items = event.data?.items ?? []

    try {
      const allPromotions = await dbService.getAll<Promotion>('engagementPromotions')
      const now = new Date()

      let applicablePromotions = allPromotions.filter((p: any) => {
        if (p.status !== 'active') return false
        // PORTAL-channel promotions are applied server-side by the promotion
        // engine at order creation. Skipping them here prevents double
        // discounting on portal orders.
        if (String(p.channel ?? p.channel ?? 'BOTH').toUpperCase() === 'PORTAL') return false
        if (p.startsAt && new Date(p.startsAt) > now) return false
        if (p.expiresAt && new Date(p.expiresAt) < now) return false
        if (p.maxUses > 0 && (p.currentUses ?? 0) >= p.maxUses) return false
        if (p.minPurchase > 0 && invoiceTotal < p.minPurchase) return false

        if (p.customerIds?.length > 0 && !p.customerIds.includes(invoiceCustomerId)) return false

        if (p.tierIds?.length > 0) {
          try {
            const customerTiers = context.companyConfig?.engagementSettings as any
            const tiers = customerTiers?.engagementCustomerTiers
          } catch { }
        }

        if (p.type === 'category' && p.categoryId && invoiceCategory !== p.categoryId) return false
        if (p.type === 'brand' && p.brand && invoiceBrand !== p.brand) return false

        return true
      })

      if (applicablePromotions.length === 0) return null

      applicablePromotions.sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))

      if (stackingRule === 'exclusive') {
        applicablePromotions = [applicablePromotions[0]]
      } else if (stackingRule === 'best_only') {
        applicablePromotions = [findBestPromotion(applicablePromotions, invoiceTotal, items)]
      } else {
        applicablePromotions = applicablePromotions.slice(0, maxStacked)
      }

      let totalDiscount = 0
      const appliedPromotions: Array<{ id: string; name: string; discount: number }> = []

      for (const promo of applicablePromotions) {
        const discount = calculatePromotionDiscount(promo, invoiceTotal, items)
        if (discount <= 0) continue

        const discountedDiscount = promo.maxDiscount > 0 ? Math.min(discount, promo.maxDiscount) : discount
        totalDiscount += discountedDiscount

        promo.currentUses = (promo.currentUses ?? 0) + 1
        await dbService.put('engagementPromotions', promo as any)

        appliedPromotions.push({ id: promo.id, name: promo.name, discount: discountedDiscount })
      }

      const maxTotalDiscount = invoiceTotal * (maxTotalDiscountPct / 100)
      if (totalDiscount > maxTotalDiscount) totalDiscount = maxTotalDiscount

      if (totalDiscount <= 0) return null
      totalDiscount = Math.round(totalDiscount * 100) / 100

      referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.PROMOTION_APPLIED, {
        source: 'promotionPlugin',
        entityType: 'promotion',
        entityId: appliedPromotions.map((p) => p.id).join(','),
        data: { totalDiscount, appliedPromotions, invoiceId: event.data?.id },
        actorId: event.actorId,
        correlationId: event.correlationId,
      })

      return {
        applied: true,
        description: `Discount $${totalDiscount} applied (${appliedPromotions.map((p) => p.name).join(', ')})`,
        discount: totalDiscount,
        metadata: { appliedPromotions, totalDiscount, stackingRule },
      }
    } catch (err) {
      logger.error('PromotionPlugin: failed:', err)
      return null
    }
  },
}

function findBestPromotion(promotions: Promotion[], invoiceTotal: number, items: any[]): Promotion {
  let best = promotions[0]
  let bestDiscount = 0

  for (const promo of promotions) {
    const discount = calculatePromotionDiscount(promo, invoiceTotal, items)
    if (discount > bestDiscount) {
      bestDiscount = discount
      best = promo
    }
  }

  return best
}

function calculatePromotionDiscount(promo: Promotion, invoiceTotal: number, _items: any[]): number {
  switch (promo.type) {
    case 'percentage':
      return invoiceTotal * ((promo.value ?? 0) / 100)

    case 'fixed':
      return promo.value ?? 0

    case 'category':
    case 'brand':
      return invoiceTotal * ((promo.value ?? 0) / 100)

    case 'buy_x_get_y': {
      if (promo.buyXQty && promo.getYQty && _items.length > 0) {
        const eligibleItems = _items.filter((i: any) => i.qty >= promo.buyXQty!)
        if (eligibleItems.length > 0) {
          const cheapestItem = Math.min(...eligibleItems.map((i: any) => i.price ?? i.unitPrice ?? 0))
          return cheapestItem * promo.getYQty * ((promo.getYDiscount ?? 100) / 100)
        }
      }
      return 0
    }

    case 'tier':
      return invoiceTotal * ((promo.value ?? 0) / 100)

    case 'coupon':
      return promo.value ?? 0

    default:
      return 0
  }
}

export default promotionPlugin
