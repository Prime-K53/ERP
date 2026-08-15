import React from 'react';
import { Wrench, CreditCard, Barcode, Upload, MessageSquare, TrendingUp, Database, Package, FileText, Activity } from 'lucide-react';
import GenericHub from './GenericHub';

const InternalToolsHub: React.FC = () => {
  const options = [
    {
      label: 'Cheque manager',
      description: 'Design and print company cheques with automated numbering and logs.',
      path: '/internal-tools/cheques',
      icon: <CreditCard />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Barcode printer',
      description: 'Generate and print thermal labels for inventory and POS items.',
      path: '/internal-tools/barcodes',
      icon: <Barcode />,
      color: 'bg-slate-50 text-slate-500'
    },
    {
      label: 'Data migration',
      description: 'Bulk import/export tools for Excel and CSV data synchronization.',
      path: '/internal-tools/import',
      icon: <Upload />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Chat hub',
      description: 'Internal team communication and real-time support messaging.',
      path: '/internal-tools/chat',
      icon: <MessageSquare />,
      color: 'bg-amber-50 text-amber-500'
    },
    {
      label: 'Legacy Migration',
      description: 'Populate productType, inventoryRole, and Variant data from legacy Item records.',
      path: '/internal-tools/legacy-migration',
      icon: <Database />,
      color: 'bg-amber-50 text-amber-500'
    },
    {
      label: 'Asset Management',
      description: 'Track printers, vehicles, equipment, and other physical assets.',
      path: '/internal-tools/assets',
      icon: <Package />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'Document Templates',
      description: 'Design custom document layouts for invoices, receipts, and reports.',
      path: '/internal-tools/template-builder',
      icon: <FileText />,
      color: 'bg-purple-50 text-purple-500'
    },
    {
      label: 'API Usage Monitor',
      description: 'Monitor API consumption, rate limits, latency, and error rates.',
      path: '/internal-tools/api-usage',
      icon: <Activity />,
      color: 'bg-rose-50 text-rose-500'
    }
  ];

  return (
    <GenericHub
      title="Internal tools"
      subtitle="Utility modules for administrative tasks, data management, and automation."
      options={options}
      accentColor="#64748b"
    />
  );
};

export default InternalToolsHub;
