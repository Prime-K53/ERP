import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Referrals from '../../views/sales/Referrals';

const mockReferralService = vi.hoisted(() => ({
  getAllReferrals: vi.fn(),
  getPendingRewards: vi.fn(),
  getAllRewards: vi.fn(),
  getAllCampaigns: vi.fn(),
  getAnalytics: vi.fn(),
  getAnalyticsHistory: vi.fn(),
  getAllReversals: vi.fn(),
  approveReward: vi.fn(),
  rejectReward: vi.fn(),
  createReversal: vi.fn(),
  approveReversal: vi.fn(),
  rejectReversal: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaignStatus: vi.fn(),
}));

vi.mock('../../services/referralService', () => ({
  referralService: mockReferralService,
}));

vi.mock('../../services/currencyService', () => ({
  currencyService: {
    getCurrency: vi.fn().mockReturnValue({ symbol: '$' }),
    getBaseCurrency: vi.fn().mockReturnValue('USD'),
  },
}));

vi.mock('../../services/cloudDb', () => ({
  cloudDb: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/whatsappClientService', () => ({
  whatsappClient: {
    getAccount: vi.fn().mockResolvedValue(null),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    companyConfig: { currencySymbol: '$' },
    user: { id: 'user-1', name: 'Test User' },
    notify: vi.fn(),
  }),
}));

const mockReferral = {
  id: 'ref-1',
  customerId: 'cust-1',
  referredById: 'referrer-1',
  referredByName: 'John Doe',
  referralCode: 'ABC12345',
  status: 'active',
  date: '2026-01-15T00:00:00.000Z',
  createdAt: '2026-01-15T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReferralService.getAllReferrals.mockResolvedValue([mockReferral]);
  mockReferralService.getPendingRewards.mockResolvedValue([]);
  mockReferralService.getAllRewards.mockResolvedValue([]);
  mockReferralService.getAllCampaigns.mockResolvedValue([]);
  mockReferralService.getAnalytics.mockResolvedValue(null);
  mockReferralService.getAnalyticsHistory.mockResolvedValue([]);
  mockReferralService.getAllReversals.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Referrals Component', () => {
  it('renders without crashing', async () => {
    render(<Referrals />);
    await waitFor(() => {
      expect(screen.getByText(/Referral Management/i)).toBeInTheDocument();
    });
  });

  it('shows the header with title', async () => {
    render(<Referrals />);
    await waitFor(() => {
      expect(screen.getByText(/Referral Management/i)).toBeInTheDocument();
    });
  });

  it('renders KPI cards', async () => {
    render(<Referrals />);
    await waitFor(() => {
      expect(screen.getByText(/Total Referrals/i) || screen.getByText(/Active/i)).toBeInTheDocument();
    });
  });

  it('renders tab buttons', async () => {
    render(<Referrals />);
    await waitFor(() => {
      expect(screen.getByText(/Approval Queue/i)).toBeInTheDocument();
    });
  });

  it('renders the Referrals tab by default', async () => {
    render(<Referrals />);
    await waitFor(() => {
      const tabs = screen.getAllByText(/Referrals/i);
      expect(tabs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
