import { ReferralReward } from '../types/referral'
import { ReversalRequest } from '../types/referral-extended'
import { dbService } from './db'
import { generateId } from './transactions/_internal'
import { referralEventBus } from './referralEventBus'
import { referralAuditService } from './referralAuditService'
import { logger } from './logger'

const getGLConfig = () => {
  const saved = localStorage.getItem('nexus_company_config')
  const defaultConfig = {
    defaultSalesAccount: '4000',
    defaultInventoryAccount: '1200',
    defaultCOGSAccount: '5000',
    cashDrawerAccount: '1000',
    customerDepositAccount: '2100',
    marketingExpenseAccount: '6100',
  }
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      return { ...defaultConfig, ...(parsed.glMapping || {}) }
    } catch { }
  }
  return defaultConfig
}

const toMoney = (v: number): number => Math.round(v * 100) / 100

export const referralReversalService = {
  async requestReversal(params: {
    rewardId: string
    reason: string
    requestedBy: string
    notes?: string
  }): Promise<ReversalRequest> {
    const allRewards = (await dbService.getAll<ReferralReward>('referralRewards')) || []
    const reward = allRewards.find(r => r.id === params.rewardId)
    if (!reward) throw new Error('Reward not found')
    if (reward.status === 'cancelled') throw new Error('Reward is already cancelled')

    const all = (await dbService.getAll<ReversalRequest>('referralReversals')) || []
    const existing = all.find(r => r.rewardId === params.rewardId && r.status === 'pending')
    if (existing) throw new Error('A reversal request for this reward is already pending')

    const reversal: ReversalRequest = {
      id: generateId('REV'),
      rewardId: params.rewardId,
      reason: params.reason,
      status: 'pending',
      requestedBy: params.requestedBy,
      requestedAt: new Date().toISOString(),
      notes: params.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await dbService.put('referralReversals', reversal)

    await referralAuditService.log({
      entityType: 'reversal',
      entityId: reversal.id,
      action: 'created',
      actorId: params.requestedBy,
      reason: params.reason,
    })

    return reversal
  },

  async approveReversal(reversalId: string, approvedBy: string): Promise<ReversalRequest> {
    const all = (await dbService.getAll<ReversalRequest>('referralReversals')) || []
    const reversal = all.find(r => r.id === reversalId)
    if (!reversal) throw new Error('Reversal request not found')
    if (reversal.status !== 'pending') throw new Error('Reversal is not in pending status')

    reversal.status = 'approved'
    reversal.approvedBy = approvedBy
    reversal.approvedAt = new Date().toISOString()
    reversal.updatedAt = new Date().toISOString()
    await dbService.put('referralReversals', reversal)

    const allRewards = (await dbService.getAll<ReferralReward>('referralRewards')) || []
    const reward = allRewards.find(r => r.id === reversal.rewardId)
    if (!reward) throw new Error('Associated reward not found')

    const allReferrals = (await dbService.getAll<any>('referrals')) || []
    const referral = allReferrals.find((r: any) => r.id === reward.referralId)
    const referrerCustomerId = referral?.referredById

    const gl = getGLConfig()
    const walletTxId = generateId('WLT-REV')
    const ledgerEntryId = generateId('LG-REV')

    const walletTx = {
      id: walletTxId,
      customerId: referrerCustomerId,
      amount: reward.amount,
      type: 'Deduction',
      date: new Date().toISOString(),
      reference: `Reversal of referral reward for invoice #${reward.invoiceId}`,
      description: `Referral reward reversal - ${reversal.reason}`,
    }

    if (referrerCustomerId) {
      const customers = (await dbService.getAll<any>('customers')) || []
      const referrer = customers.find((c: any) => c.id === referrerCustomerId)
      if (referrer) {
        referrer.walletBalance = toMoney((referrer.walletBalance || 0) - reward.amount)
        await dbService.put('customers', referrer)
      }
    }

    const ledgerEntry = {
      id: ledgerEntryId,
      date: new Date().toISOString(),
      description: `Reversal of referral reward - ${reversal.reason}`,
      debitAccountId: gl.customerDepositAccount,
      creditAccountId: gl.marketingExpenseAccount || gl.cashDrawerAccount,
      amount: reward.amount,
      referenceId: reward.invoiceId,
      customerId: referrerCustomerId,
    }

    reward.status = 'cancelled'
    reward.cancelledAt = new Date().toISOString()
    reward.cancelledBy = approvedBy
    reward.cancelReason = reversal.reason
    reward.updatedAt = new Date().toISOString()

    reversal.status = 'completed'
    reversal.completedAt = new Date().toISOString()
    reversal.walletTransactionId = walletTxId
    reversal.ledgerEntryId = ledgerEntryId
    reversal.updatedAt = new Date().toISOString()

    await Promise.all([
      dbService.put('walletTransactions', walletTx),
      dbService.put('ledger', ledgerEntry),
      dbService.put('referralRewards', reward),
      dbService.put('referralReversals', reversal),
    ])

    await referralEventBus.emit('reward.reversed', {
      source: 'referralReversalService',
      entityType: 'reward',
      entityId: reward.id,
      data: { reversalId: reversal.id, reason: reversal.reason, amount: reward.amount },
      actorId: approvedBy,
    })

    await referralAuditService.log({
      entityType: 'reversal',
      entityId: reversal.id,
      action: 'reversed',
      actorId: approvedBy,
      reason: reversal.reason,
      fieldName: 'status',
      oldValue: 'pending',
      newValue: 'completed',
    })

    return reversal
  },

  async rejectReversal(reversalId: string, rejectedBy: string, rejectReason: string): Promise<ReversalRequest> {
    const all = (await dbService.getAll<ReversalRequest>('referralReversals')) || []
    const reversal = all.find(r => r.id === reversalId)
    if (!reversal) throw new Error('Reversal request not found')
    if (reversal.status !== 'pending') throw new Error('Reversal is not in pending status')

    reversal.status = 'rejected'
    reversal.rejectedBy = rejectedBy
    reversal.rejectedAt = new Date().toISOString()
    reversal.rejectReason = rejectReason
    reversal.updatedAt = new Date().toISOString()
    await dbService.put('referralReversals', reversal)

    await referralAuditService.log({
      entityType: 'reversal',
      entityId: reversal.id,
      action: 'updated',
      actorId: rejectedBy,
      fieldName: 'status',
      oldValue: 'pending',
      newValue: 'rejected',
      reason: rejectReason,
    })

    return reversal
  },

  async getPendingReversals(): Promise<ReversalRequest[]> {
    const all = (await dbService.getAll<ReversalRequest>('referralReversals')) || []
    return all.filter(r => r.status === 'pending')
  },

  async getAllReversals(): Promise<ReversalRequest[]> {
    return (await dbService.getAll<ReversalRequest>('referralReversals')) || []
  },
}

export default referralReversalService
