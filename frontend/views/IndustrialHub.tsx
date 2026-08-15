
import React from 'react';
import { Factory, Briefcase, Layers, Clock, MonitorPlay, FileText, Activity, BookTemplate } from 'lucide-react';
import GenericHub from './GenericHub';

const IndustrialHub: React.FC = () => {
  const options = [
    {
      label: 'Work Orders',
      description: 'Create and track production tasks, assignments, and real-time progress.',
      path: '/industrial/work-orders',
      icon: <Briefcase />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'MRP Logic',
      description: 'Material Requirements Planning for automated stock and resource allocation.',
      path: '/industrial/mrp',
      icon: <Layers />,
      color: 'bg-purple-50 text-purple-500'
    },
    {
      label: 'Production Schedule',
      description: 'Timeline management for machines, personnel, and delivery deadlines.',
      path: '/industrial/scheduler',
      icon: <Clock />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Kiosk Terminal',
      description: 'Simplified shop floor interface for worker clock-ins and status updates.',
      path: '/industrial/kiosk',
      icon: <MonitorPlay />,
      color: 'bg-amber-50 text-amber-500'
    },
    {
      label: 'BOM Recipes',
      description: 'Manage Bill of Materials, production costs, and component structures.',
      path: '/industrial/bom-recipes',
      icon: <FileText />,
      color: 'bg-rose-50 text-rose-500'
    },
    {
      label: 'Machine Health',
      description: 'IoT telemetry, predictive maintenance, and equipment efficiency tracking.',
      path: '/industrial/maintenance',
      icon: <Activity />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'Service Recipes',
      description: 'Define service recipes, labor, materials, machines, and overhead costing.',
      path: '/industrial/service-recipes',
      icon: <BookTemplate />,
      color: 'bg-teal-50 text-teal-500'
    }
  ];

  return (
    <GenericHub
      title="Industrial"
      subtitle="Manage your manufacturing floor, resource planning, and production lifecycle."
      options={options}
      accentColor="#8b5cf6"
    />
  );
};

export default IndustrialHub;
