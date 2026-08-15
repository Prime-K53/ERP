import React from 'react';
import { Badge } from '../../../components/Badge';
import { 
  Clock, 
  CheckCircle, 
  DollarSign, 
  AlertTriangle, 
  FileText, 
  Calendar,
  RefreshCw
} from 'lucide-react';

interface StatusBadgeProps {
  status: 'Draft' | 'Calculated' | 'Overridden' | 'Approved' | 'Invoiced';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Draft':
        return {
          variant: 'secondary' as const,
          color: 'text-gray-700',
          bgColor: 'bg-gray-100',
          icon: <Clock className="h-3 w-3" />
        };
      case 'Calculated':
        return {
          variant: 'default' as const,
          color: 'text-blue-700',
          bgColor: 'bg-blue-100',
          icon: <FileText className="h-3 w-3" />
        };
      case 'Overridden':
        return {
          variant: 'default' as const,
          color: 'text-yellow-700',
          bgColor: 'bg-yellow-100',
          icon: <AlertTriangle className="h-3 w-3" />
        };
      case 'Approved':
        return {
          variant: 'default' as const,
          color: 'text-green-700',
          bgColor: 'bg-green-100',
          icon: <CheckCircle className="h-3 w-3" />
        };
      case 'Invoiced':
        return {
          variant: 'success' as const,
          color: 'text-green-700',
          bgColor: 'bg-green-100',
          icon: <DollarSign className="h-3 w-3" />
        };
      default:
        return {
          variant: 'secondary' as const,
          color: 'text-gray-700',
          bgColor: 'bg-gray-100',
          icon: <RefreshCw className="h-3 w-3" />
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <Badge variant={config.variant} className={`${config.color} ${config.bgColor} flex items-center space-x-1`}>
      {config.icon}
      <span className="text-xs font-medium">{status}</span>
    </Badge>
  );
};

export default StatusBadge;
