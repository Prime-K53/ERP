import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  X,
  AlertTriangle,
  Info,
  TrendingUp,
  CreditCard,
  Award,
  Settings,
  AlertCircle,
  CheckCheck,
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'anomaly' | 'alert' | 'insight' | 'payment' | 'milestone' | 'system';
  title: string;
  message: string;
  timestamp: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  read: boolean;
  actionable?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClear: (id: string) => void;
  anchorEl: HTMLElement | null;
}

type Tab = 'all' | 'unread';

const typeIconMap: Record<Notification['type'], React.ReactNode> = {
  anomaly: <AlertTriangle size={16} />,
  alert: <AlertCircle size={16} />,
  insight: <TrendingUp size={16} />,
  payment: <CreditCard size={16} />,
  milestone: <Award size={16} />,
  system: <Settings size={16} />,
};

const typeColorMap: Record<Notification['type'], string> = {
  anomaly: '#f59e0b',
  alert: '#ef4444',
  insight: '#3b82f6',
  payment: '#10b981',
  milestone: '#8b5cf6',
  system: '#64748b',
};

const severityBorderMap: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

function getRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const dropdownVariants: any = {
  hidden: { opacity: 0, y: -8, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', damping: 28, stiffness: 350 },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.97,
    transition: { duration: 0.12, ease: 'easeIn' },
  },
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClear,
  anchorEl,
}) => {
  const [tab, setTab] = useState<Tab>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchorEl]);

  const visible = useMemo(() => {
    if (tab === 'unread') return notifications.filter((n) => !n.read);
    return notifications;
  }, [notifications, tab]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 1200,
    width: '380px',
    maxHeight: '500px',
    backgroundColor: '#FEFDFB',
    borderRadius: '14px',
    boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
    border: '1px solid #e4ddd1',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: "'Inter', system-ui, sans-serif",
  });

  useEffect(() => {
    if (!isOpen || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openDown = spaceBelow >= 520 || spaceBelow >= rect.top;
    setDropdownStyle((prev) => ({
      ...prev,
      top: openDown ? rect.bottom + 8 : rect.top - 8 - 500,
      left: Math.max(12, rect.left + rect.width - 380),
    }));
  }, [isOpen, anchorEl]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    fontSize: '13px',
    fontWeight: 600,
    color: active ? '#0f172a' : '#94a3b8',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid #146b60' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
    fontFamily: "'Inter', system-ui, sans-serif",
    textAlign: 'center' as const,
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dropdownRef}
          key="nc-dropdown"
          variants={dropdownVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={dropdownStyle}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0b3e39' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '20px',
                    height: '20px',
                    padding: '0 6px',
                    borderRadius: '10px',
                    backgroundColor: '#146b60',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#146b60',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(20,107,96,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              padding: '8px 20px 0',
                  borderBottom: '1px solid #e4ddd1',
            }}
          >
            <button style={tabStyle(tab === 'all')} onClick={() => setTab('all')}>
              All
            </button>
            <button style={tabStyle(tab === 'unread')} onClick={() => setTab('unread')}>
              Unread
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {visible.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '48px 20px',
                  color: '#94a3b8',
                  gap: '12px',
                }}
              >
                <Bell size={36} strokeWidth={1.5} color="#cbd5e1" />
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748b' }}>No notifications</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {tab === 'unread' ? 'All caught up!' : "You're all set"}
                </span>
              </div>
            )}

            {visible.map((n) => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  backgroundColor: n.read ? 'transparent' : 'rgba(20,107,96,0.04)',
                  borderLeft: `3px solid ${n.severity ? severityBorderMap[n.severity] : typeColorMap[n.type]}`,
                  marginBottom: '4px',
                  position: 'relative',
                  transition: 'background-color 0.15s',
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = n.read ? 'rgba(148,163,184,0.04)' : 'rgba(20,107,96,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = n.read
                      ? 'transparent'
                      : 'rgba(20,107,96,0.04)';
                  }}
                onClick={() => {
                  if (!n.read) onMarkRead(n.id);
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: `${typeColorMap[n.type]}15`,
                    color: typeColorMap[n.type],
                    flexShrink: 0,
                  }}
                >
                  {typeIconMap[n.type]}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#0b3e39',
                        lineHeight: 1.3,
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {n.title}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                      color: '#64748b',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {getRelativeTime(n.timestamp)}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '12px',
                      color: '#64748b',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {n.message}
                  </p>
                  {n.actionable && n.actionLabel && n.onAction && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        n.onAction?.();
                      }}
                      style={{
                        marginTop: '8px',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                    color: '#146b60',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(20,107,96,0.2)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontFamily: "'Inter', system-ui, sans-serif",
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(20,107,96,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {n.actionLabel}
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                >
                  {!n.read && (
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#6366f1',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClear(n.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      padding: 0,
                      visibility: n.read ? 'visible' : 'hidden',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(148,163,184,0.1)';
                      e.currentTarget.style.color = '#94a3b8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#475569';
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationCenter;
