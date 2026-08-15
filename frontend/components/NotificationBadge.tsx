import React from 'react';
import { AlertCircle, AlertTriangle, Bell, Info, CheckCircle } from 'lucide-react';
import { NotificationPriority } from '../types';

interface NotificationBadgeProps {
  priority: NotificationPriority;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const priorityConfig = {
  Low: {
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-300',
    textColor: 'text-slate-700',
    icon: Info,
    label: 'Low'
  },
  Medium: {
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    icon: Bell,
    label: 'Medium'
  },
  High: {
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
    icon: AlertCircle,
    label: 'High'
  },
  Urgent: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    icon: AlertTriangle,
    label: 'Urgent'
  }
};

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  priority,
  size = 'md',
  showLabel = false,
  className = ''
}) => {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs',
    lg: 'px-2.5 py-1.5 text-sm'
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium
        ${config.bgColor} ${config.borderColor} ${config.textColor}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      <Icon size={iconSizes[size]} className="shrink-0" />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};

interface UnreadIndicatorProps {
  className?: string;
}

export const UnreadIndicator: React.FC<UnreadIndicatorProps> = ({ className = '' }) => {
  return (
    <span
      className={`
        inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse
        ${className}
      `}
    />
  );
};

interface ReadStatusIconProps {
  isRead: boolean;
  size?: number;
  className?: string;
}

export const ReadStatusIcon: React.FC<ReadStatusIconProps> = ({ isRead, size = 16, className = '' }) => {
  if (isRead) {
    return <CheckCircle size={size} className="text-green-500" />;
  }
  return <div className={`w-2 h-2 rounded-full bg-red-500 animate-pulse ${className}`} />;
};