import React from 'react';
import { FileText, FileCheck, Banknote as PaymentIcon, RefreshCw, Printer, Target, CheckSquare, Inbox } from 'lucide-react';
import GenericHub from './GenericHub';

const options = [
  {
    label: 'Quotation Requests',
    description: 'Review customer requests, issue official quotations, and convert accepted quotes into orders.',
    path: '/sales-flow/requests',
    icon: Inbox,
  },
  {
    label: 'Quotations',
    description: 'Generate professional estimates and track customer approval status.',
    path: '/sales-flow/quotations',
    icon: FileText,
  },
  {
    label: 'Orders',
    description: 'Manage customer orders, track fulfillment status, and handle bulk operations.',
    path: '/sales-flow/orders',
    icon: CheckSquare,
  },
  {
    label: 'Billing / Invoices',
    description: 'Official invoicing, credit notes, and payment status tracking.',
    path: '/sales-flow/invoices',
    icon: FileCheck,
  },
  {
    label: 'Payment Management',
    description: 'Record and track payments received from your customers.',
    path: '/sales-flow/payments',
    icon: PaymentIcon,
  },
  {
    label: 'Subscriptions',
    description: 'Manage recurring billing, membership tiers, and automated renewals.',
    path: '/sales-flow/subscriptions',
    icon: RefreshCw,
  },
  {
    label: 'Sales Exchanges',
    description: 'Manage print replacements, exchange requests, and reprint job tracking.',
    path: '/sales-flow/exchanges',
    icon: RefreshCw,
  },
  {
    label: 'Job Tickets',
    description: 'Manage print jobs, photocopy orders, and production tracking.',
    path: '/sales-flow/job-tickets',
    icon: Printer,
  },
  {
    label: 'Lead Board',
    description: 'Track leads by stage, follow-up dates, and estimated deal value.',
    path: '/sales-flow/leads',
    icon: Target,
  },
];

const SalesFlowHub: React.FC = () => {
  return (
    <GenericHub
      title="Sales Flow"
      subtitle="Optimize your revenue generation, customer billing, and retail operations."
      options={options}
      accentColor="#2eb12e"
    />
  );
};

export default SalesFlowHub;
