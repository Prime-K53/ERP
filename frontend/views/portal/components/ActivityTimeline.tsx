import React from 'react';
import { CheckCircle2, Circle, Clock, FileText, Paperclip, MessageSquare } from 'lucide-react';

interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  status: 'completed' | 'current' | 'pending';
  user?: { name: string; avatar?: string };
  attachments?: { name: string; type: string }[];
  comments?: { author: string; text: string }[];
}

interface ActivityTimelineProps {
  events: TimelineEvent[];
  title?: string;
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ events, title }) => {
  return (
    <div className="glass-panel rounded-[var(--radius-md)] p-6">
      {title && <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6">{title}</h3>}
      <div className="relative">
        {events.map((event, index) => {
          const isLast = index === events.length - 1;
          const Icon = event.status === 'completed' ? CheckCircle2 : event.status === 'current' ? Clock : Circle;
          const iconColor = event.status === 'completed' ? '#059669' : event.status === 'current' ? '#1f8577' : '#94a3b8';
          const bgColor = event.status === 'completed' ? '#ecfdf5' : event.status === 'current' ? '#eef7f6' : '#f8fafc';

          return (
            <div key={event.id} className="flex gap-4 relative">
              {/* Timeline line */}
              {!isLast && (
                <div className="absolute left-[15px] top-10 bottom-0 w-px bg-slate-200" />
              )}

              {/* Icon */}
              <div className="relative z-10">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: bgColor, color: iconColor }}>
                  <Icon.size size={16} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pb-8 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900">{event.title}</h4>
                    {event.description && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{event.description}</p>
                    )}
                    {event.user && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #1f8577, #0f544c)' }}>
                          {event.user.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-slate-600 font-medium">{event.user.name}</span>
                      </div>
                    )}
                    {event.attachments && event.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {event.attachments.map((att, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200/60">
                            <Paperclip.size size={12} />
                            {att.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {event.comments && event.comments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {event.comments.map((comment, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-slate-200/60">
                            <MessageSquare.size size={14} className="text-slate-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-700">{comment.author}</span>
                              <p className="text-xs text-slate-500 mt-0.5">{comment.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <time className="text-[10px] text-slate-400 font-medium whitespace-nowrap mt-0.5">
                    {new Date(event.timestamp).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </time>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityTimeline;
