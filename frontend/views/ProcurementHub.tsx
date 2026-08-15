
import React from 'react';
import { CreditCard, FileText, Share2, TrendingUp, Users, Wallet } from 'lucide-react';
import GenericHub from './GenericHub';

const ProcurementHub: React.FC = () => {
  const options = [
    {
      label: 'Vendor Bills',
      description: 'Record incoming supplier invoices and manage accounts payable.',
      path: '/procurement/bills',
      icon: <FileText />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Supplier Payments',
      description: 'Process payments for bills, manage credit notes, and view payment history.',
      path: '/procurement/payments',
      icon: <Wallet />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Subcontracting',
      description: 'Manage external manufacturing partners and service level agreements.',
      path: '/procurement/subcontracting',
      icon: <Share2 />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'Expense Log',
      description: 'Track internal company expenditures and staff reimbursement requests.',
      path: '/procurement/expenses',
      icon: <TrendingUp />,
      color: 'bg-rose-50 text-rose-500'
    }
  ];

  return (
    <GenericHub 
      title="Procurement" 
      subtitle="Handle supplier relationships, purchasing workflows, and accounts payable."
      options={options}
      accentColor="#3b82f6"
    />
  );
};

export default ProcurementHub;
