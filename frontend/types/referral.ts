export interface Referral {
  id: string
  customerId: string
  referredById?: string
  referredByName?: string
  referralCode: string
  status: 'active' | 'converted' | 'expired' | 'cancelled'
  date: string
  convertedAt?: string
  convertedInvoiceId?: string
  pendingInvoiceId?: string
  pendingInvoiceAmount?: number
  notes?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: any
}

export interface ReferralReward {
  id: string
  referralId: string
  customerId: string
  invoiceId: string
  invoiceAmount: number
  amount: number
  status: 'pending' | 'approved' | 'paid' | 'cancelled'
  date: string
  approvedAt?: string
  approvedBy?: string
  cancelledAt?: string
  cancelledBy?: string
  cancelReason?: string
  walletTransactionId?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: any
}

export interface ReferralSettings {
  enabled: boolean
  rewardType: 'fixed' | 'percentage' | 'hybrid'
  rewardValue: number
  rewardPercentage: number
  minPurchaseAmount: number
  maxRewardAmount: number
  requireApproval: boolean
  autoApproveThreshold: number
  selfReferralPrevention: boolean
  expiryDays: number
  allowMultipleRewards: boolean
}

export interface ReferralCommission {
  id: string;
  referralId: string;
  customerId: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  date: string;
  [key: string]: any;
}

export interface ReferralTransaction {
  id: string;
  referralId: string;
  customerId: string;
  type: 'earned' | 'paid' | 'reversed';
  amount: number;
  balance: number;
  date: string;
  [key: string]: any;
}

export interface ReferralLog {
  id: string;
  referralId: string;
  action: string;
  details: string;
  timestamp: string;
  [key: string]: any;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  enabled: true,
  rewardType: 'percentage',
  rewardValue: 0,
  rewardPercentage: 5,
  minPurchaseAmount: 0,
  maxRewardAmount: 0,
  requireApproval: true,
  autoApproveThreshold: 100,
  selfReferralPrevention: true,
  expiryDays: 365,
  allowMultipleRewards: true,
}
