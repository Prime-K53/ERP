
import React from 'react';
import { Users, UserPlus, CheckSquare, MessageSquare, Shield } from 'lucide-react';
import GenericHub from './GenericHub';
import { useData, REFRESH_INTERVAL } from '../context/DataContext';
import { useModuleRefresh } from '../hooks/useModuleRefresh';

const CustomersHub: React.FC = () => {
  const { refreshAllData } = useData();
  
  // 5-minute poll + focus refresh
  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });
  
  const options = [
    {
      label: 'Clients',
      description: 'Manage client relationships, credit limits, and detailed transaction history.',
      path: '/sales-flow/clients',
      icon: <UserPlus />,
      color: 'bg-blue-50 text-blue-600'
    },
    {
      label: 'Suppliers',
      description: 'Manage vendor database, banking details, and procurement performance.',
      path: '/procurement/suppliers',
      icon: <Users />,
      color: 'bg-indigo-50 text-indigo-600'
    },
    {
      label: 'Portal Users',
      description: 'Create and manage customer portal accounts for self-service access.',
      path: '/portal/users',
      icon: <Shield />,
      color: 'bg-emerald-50 text-emerald-600'
    },
    {
      label: 'Task Manager',
      description: 'Track team activities, set reminders, and manage daily operations.',
      path: '/sales-flow/tasks',
      icon: <CheckSquare />,
      color: 'bg-emerald-50 text-emerald-600'
    },
    {
      label: 'CRM Comms',
      description: 'Automated SMS/Email marketing and customer relationship management.',
      path: '/internal-tools/chat',
      icon: <MessageSquare />,
      color: 'bg-amber-50 text-amber-500'
    }
  ];

  return (
    <GenericHub 
      title="Customers & Relationships" 
      subtitle="Centralized management of clients, suppliers, and communication workflows."
      options={options}
      accentColor="#3b82f6"
    />
  );
};

export default CustomersHub;
