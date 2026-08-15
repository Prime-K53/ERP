import React, { useState } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  Hash,
  ExternalLink,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Info,
  Bell
} from 'lucide-react';
import { ExaminationBatchNotification } from '../types';
import { useNotifications } from '../context/NotificationContext';

interface ExaminationBatchNotificationCardCompactProps {
  notification: ExaminationBatchNotification;
  onDismiss?: () => void;
}

export const ExaminationBatchNotificationCardCompact: React.FC<ExaminationBatchNotificationCardCompactProps> = ({
  notification,
  onDismiss
}) => {
  const navigate = useNavigate();
  const { markAsRead, dismissNotification } = useNotifications();
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const {
    id,
    title,
    priority,
    batch_details,
    is_read,
    created_at,
    notification_type
  } = notification;

  const formattedTime = new Date(created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleViewBatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/examination/batches/${batch_details?.batchId}`);
  };

  const handleMarkAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (is_read || isMarkingRead) return;
    setIsMarkingRead(true);
    try {
      await markAsRead(id);
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
    } finally {
      setIsMarkingRead(false);
    }
  };

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDismissing) return;
    setIsDismissing(true);
    try {
      await dismissNotification(id);
      onDismiss?.();
    } catch (error) {
      logger.error('Failed to dismiss notification:', error);
      setIsDismissing(false);
    }
  };

  // Priority colors
  const priorityColors = {
    Low: { bg: 'bg-slate-100', border: 'border-slate-300', dot: 'bg-slate-400', text: 'text-slate-600' },
    Medium: { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', text: 'text-blue-700' },
    High: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700' },
    Urgent: { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', text: 'text-red-700' }
  };

  const priorityIcons = {
    Low: Info,
    Medium: Bell,
    High: AlertCircle,
    Urgent: AlertTriangle
  };

  const colors = priorityColors[priority];
  const PriorityIcon = priorityIcons[priority];

  // Get notification type label
  const typeLabels: Record<string, string> = {
    BATCH_CREATED: 'Created',
    BATCH_CALCULATED: 'Calculated',
    BATCH_APPROVED: 'Approved',
    BATCH_INVOICED: 'Invoiced',
    DEADLINE_REMINDER: 'Reminder'
  };

  return (
    <div
      className={`
        relative flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer
        ${colors.bg} ${colors.border}
        ${!is_read ? 'shadow-sm' : 'opacity-75'}
        hover:shadow-md hover:scale-[1.01]
      `}
      onClick={handleViewBatch}
    >
      {/* Priority indicator dot */}
      <div className="relative shrink-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${is_read ? 'bg-white/50' : 'bg-white'}`}>
          <PriorityIcon size={16} className={colors.text} />
        </div>
        {!is_read && (
          <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 ${colors.dot} rounded-full border-2 border-white`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[11px] font-semibold ${is_read ? 'text-slate-500' : 'text-slate-800'}`}>
            {typeLabels[notification_type] || notification_type}
          </span>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border} shrink-0`}>
            {priority}
          </span>
        </div>
        
        {/* Sentence form details */}
        <p className={`text-[10px] leading-relaxed ${is_read ? 'text-slate-400' : 'text-slate-600'}`}>
          {batch_details?.schoolName && (
            <>
              <span className="font-medium">{batch_details.schoolName}</span>
              {batch_details?.numberOfStudents && (
                <span> with <span className="font-semibold">{batch_details.numberOfStudents.toLocaleString()} students</span></span>
              )}
              {notification_type === 'BATCH_CREATED' && <span> has been created</span>}
              {notification_type === 'BATCH_CALCULATED' && <span> has been calculated</span>}
              {notification_type === 'BATCH_APPROVED' && <span> has been approved</span>}
              {notification_type === 'BATCH_INVOICED' && <span> invoice has been generated</span>}
              {notification_type === 'DEADLINE_REMINDER' && <span> deadline is approaching</span>}
              {batch_details?.examinationDate && (
                <span> for exam on <span className="font-medium">{batch_details.examinationDate.split('T')[0]}</span></span>
              )}
              <span>.</span>
            </>
          )}
          {!batch_details?.schoolName && title}
        </p>
      </div>

      {/* Time and actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[9px] text-slate-400">{formattedTime}</span>
        
        {!is_read && (
          <button
            onClick={handleMarkAsRead}
            disabled={isMarkingRead}
            className="p-1 rounded hover:bg-white/50 transition-colors disabled:opacity-50"
            title="Mark as read"
          >
            <Check size={12} className="text-blue-600" />
          </button>
        )}
        
        <button
          onClick={handleDismiss}
          disabled={isDismissing}
          className="p-1 rounded hover:bg-white/50 transition-colors disabled:opacity-50"
          title="Dismiss"
        >
          <X size={12} className="text-slate-400" />
        </button>
      </div>
    </div>
  );
};

export default ExaminationBatchNotificationCardCompact;
