import React from 'react';
import { TrendingUp, Calculator, MessageSquare, Gift, BadgePercent, Megaphone } from 'lucide-react';
import GenericHub from './GenericHub';

const SmartOperationsHub: React.FC = () => {
  const options = [
    {
      label: 'Market Adjustments',
      description: 'Manage global cost layers, inflation adjustments, and logistics surcharges.',
      path: '/smart-operations/adjustments',
      icon: <TrendingUp />,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      label: 'Smart Pricing Engine',
      description: 'Calculate item prices with market adjustments and generate revenue reports.',
      path: '/smart-operations/pricing',
      icon: <Calculator />,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      label: 'Marketing Messages',
      description: 'WhatsApp automation, bulk campaigns, and customer communications.',
      path: '/smart-operations/messages',
      icon: <MessageSquare />,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      label: 'Referrals',
      description: 'Manage referral programs, rewards, campaigns, and referral analytics.',
      path: '/smart-operations/referrals',
      icon: <Gift />,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      label: 'Promotions',
      description: 'Manage discounts and promotional campaigns.',
      path: '/smart-operations/promotions',
      icon: <BadgePercent />,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      label: 'Ads',
      description: 'Create, schedule and generate portal banner ads with AI.',
      path: '/smart-operations/ads',
      icon: <Megaphone />,
      color: 'bg-violet-50 text-violet-600'
    }
  ];

  return (
    <GenericHub 
      title="Smart Operations" 
      subtitle="Smart Operations"
      options={options}
      accentColor="#6366f1"
    />
  );
};

export default SmartOperationsHub;
