import React from 'react';

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
  icon?: React.ReactNode;
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  items: ActivityItem[];
  onMarkAllRead?: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ open, onClose, items, onMarkAllRead }) => {
  if (!open) return null;
  const unread = items.filter(i => !i.read).length;
  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
      <div
        className="absolute right-4 md:right-8 top-16 w-[calc(100%-2rem)] md:w-[420px] glass-modal rounded-2xl shadow-2xl overflow-hidden"
        style={{ maxHeight: 'min(560px, 70vh)', animation: 'scaleIn .2s cubic-bezier(.4,0,.2,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60">
          <div>
            <span className="text-sm font-bold text-slate-900">Notifications</span>
            {unread > 0 && (
              <span className="ml-2 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {unread} unread
              </span>
            )}
          </div>
          {unread > 0 && onMarkAllRead && (
            <button onClick={onMarkAllRead} className="text-xs font-bold text-brand-600 hover:text-brand-700 transition-colors">
              Mark all read
            </button>
          )}
        </div>
        <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(70vh - 60px)' }}>
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No notifications yet.</div>
          ) : (
            <div className="divide-y divide-slate-100/80">
              {items.map((item) => (
                <button key={item.id} className={`w-full text-left px-5 py-3.5 hover:bg-slate-50/80 transition-colors flex gap-3 ${item.read ? 'opacity-70' : 'bg-brand-50/30'}`}>
                  {item.icon && (
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white border border-slate-200/60 text-slate-600">
                      {item.icon}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.description}</div>
                    <div className="text-[10px] text-slate-400 mt-1 font-medium">{item.time}</div>
                  </div>
                  {!item.read && <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
