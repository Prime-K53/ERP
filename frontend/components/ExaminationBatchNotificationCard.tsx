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
  Bell,
  AlertCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { ExaminationBatchNotification } from '../types';
import { useNotifications } from '../context/NotificationContext';
import { NotificationBadge, ReadStatusIcon } from './NotificationBadge';

interface ExaminationBatchNotificationCardProps {
  notification: ExaminationBatchNotification;
  onDismiss?: () => void;
  className?: string;
}

export const ExaminationBatchNotificationCard: React.FC<ExaminationBatchNotificationCardProps> = ({
  notification,
  onDismiss,
  className = ''
}) => {
  const navigate = useNavigate();
  const { markAsRead, dismissNotification } = useNotifications();
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const {
    id,
    title,
    message,
    priority,
    batch_details,
    is_read,
    created_at,
    notification_type
  } = notification;

  const formattedDate = new Date(created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleViewBatch = () => {
    // Navigate to batch detail page
    navigate(`/examination/batches/${batch_details.batchId}`);
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

  // Priority-based border and background styling
  const priorityStyles = {
    Low: 'border-l-slate-400 bg-slate-50 hover:bg-slate-100',
    Medium: 'border-l-blue-400 bg-blue-50 hover:bg-blue-100',
    High: 'border-l-amber-400 bg-amber-50 hover:bg-amber-100',
    Urgent: 'border-l-red-500 bg-red-50 hover:bg-red-100 animate-pulse'
  };

  const priorityIconMap = {
    Low: Info,
    Medium: Bell,
    High: AlertCircle,
    Urgent: AlertTriangle
  };

  const PriorityIcon = priorityIconMap[priority];

  return (
    <div
      className={`
        relative border-l-4 rounded-r-lg p-4 shadow-sm transition-all duration-200
        ${priorityStyles[priority]}
        ${!is_read ? 'ring-1 ring-blue-200' : ''}
        ${className}
      `}
      onClick={handleViewBatch}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left side: Icon and content */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Priority icon */}
          <div className={`mt-0.5 shrink-0 ${is_read ? 'opacity-50' : ''}`}>
            <PriorityIcon
              size={20}
              className={
                priority === 'Urgent' ? 'text-red-600' :
                priority === 'High' ? 'text-amber-600' :
                priority === 'Medium' ? 'text-blue-600' :
                'text-slate-500'
              }
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-semibold text-sm truncate ${is_read ? 'text-slate-600' : 'text-slate-900'}`}>
                {title}
              </h4>
              {!is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              {message}
            </p>

            {/* Batch details grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {batch_details.schoolName && (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="font-medium">School:</span>
                  <span className="truncate">{batch_details.schoolName}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-slate-600">
                <Calendar size={12} className="shrink-0" />
                <span>{batch_details.examinationDate?.split('T')[0] || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <Users size={12} className="shrink-0" />
                <span>{batch_details.numberOfStudents?.toLocaleString() || 0} students</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <Hash size={12} className="shrink-0" />
                <span className="font-mono text-[10px]">{batch_details.batchId}</span>
              </div>
            </div>

            {/* Footer with timestamp and actions */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200">
              <span className="text-[10px] text-slate-400">{formattedDate}</span>

              <div className="flex items-center gap-1">
                {!is_read && (
                  <button
                    onClick={handleMarkAsRead}
                    disabled={isMarkingRead}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                    title="Mark as read"
                  >
                    <Check size={12} />
                    <span>Read</span>
                  </button>
                )}

                <button
                  onClick={handleViewBatch}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded transition-colors"
                  title="View batch details"
                >
                  <ExternalLink size={12} />
                  <span>View</span>
                </button>

                <button
                  onClick={handleDismiss}
                  disabled={isDismissing}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 rounded transition-colors disabled:opacity-50"
                  title="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Read status indicator */}
        <div className="shrink-0 mt-0.5">
          <ReadStatusIcon isRead={is_read} size={18} />
        </div>
      </div>
    </div>
  );
};