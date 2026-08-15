import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, AlertTriangle, AlertCircle, Info, X, ArrowRight } from 'lucide-react';

interface AIInsight {
  id: string;
  type: 'positive' | 'warning' | 'critical' | 'info';
  title: string;
  description: string;
  confidence: number;
  actionable?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  date?: string;
}

interface AIInsightsProps {
  insights: AIInsight[];
  title?: string;
  maxHeight?: string;
  loading?: boolean;
  onDismiss?: (id: string) => void;
}

const typeConfig: Record<AIInsight['type'], { border: string; bg: string; icon: React.ReactNode; bar: string }> = {
  positive: {
    border: '#16a34a',
    bg: '#f0fdf4',
    icon: <TrendingUp size={18} color="#16a34a" />,
    bar: '#16a34a',
  },
  warning: {
    border: '#f59e0b',
    bg: '#fffbeb',
    icon: <AlertTriangle size={18} color="#f59e0b" />,
    bar: '#f59e0b',
  },
  critical: {
    border: '#dc2626',
    bg: '#fef2f2',
    icon: <AlertCircle size={18} color="#dc2626" />,
    bar: '#dc2626',
  },
  info: {
    border: '#3b82f6',
    bg: '#eff6ff',
    icon: <Info size={18} color="#3b82f6" />,
    bar: '#3b82f6',
  },
};

const containerVariants: any = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants: any = {
  hidden: { opacity: 0, x: -20, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 24 },
  },
  exit: {
    opacity: 0,
    x: 40,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
};

const SkeletonCard: React.FC = () => (
  <div
    style={{
      padding: 12,
      borderRadius: 12,
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    <div
      className="animate-pulse"
      style={{
        height: 14,
        width: '55%',
        borderRadius: 6,
        background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }}
    />
    <div
      className="animate-pulse"
      style={{
        height: 10,
        width: '90%',
        borderRadius: 6,
        background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }}
    />
    <div
      className="animate-pulse"
      style={{
        height: 10,
        width: '70%',
        borderRadius: 6,
        background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite',
      }}
    />
    <div
      className="animate-pulse"
      style={{
        height: 6,
        width: '100%',
        borderRadius: 3,
        background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease-in-out infinite',
        marginTop: 4,
      }}
    />
  </div>
);

const AIInsights: React.FC<AIInsightsProps> = ({
  insights,
  title = 'AI Insights',
  maxHeight = '520px',
  loading = false,
  onDismiss,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderRadius: 16,
        padding: 20,
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 8px 32px rgba(31,38,135,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        maxHeight,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: '#6366f118',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6366f1',
            flexShrink: 0,
          }}
        >
          <Sparkles size={18} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', flex: 1 }}>{title}</span>
        {!loading && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#6366f1',
              background: '#6366f112',
              padding: '2px 10px',
              borderRadius: 20,
              letterSpacing: '0.02em',
            }}
          >
            {insights.length}
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflowY: 'auto',
          flex: 1,
          paddingRight: 4,
        }}
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : insights.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '40px 20px',
              color: '#94a3b8',
              textAlign: 'center',
            }}
          >
            <Sparkles size={40} strokeWidth={1.2} opacity={0.5} />
            <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 260, lineHeight: 1.5 }}>
              No insights yet. Data analysis will appear here.
            </span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <AnimatePresence mode="popLayout">
                {insights.map((insight) => {
                  const config = typeConfig[insight.type];
                  return (
                    <motion.div
                      key={insight.id}
                      variants={itemVariants}
                      layout
                      exit="exit"
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: '#f8fafc',
                        borderLeft: `3px solid ${config.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        position: 'relative',
                      }}
                    >
                      {onDismiss && (
                        <button
                          onClick={() => onDismiss(insight.id)}
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: 'none',
                            background: 'transparent',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingRight: onDismiss ? 22 : 0 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            background: config.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {config.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>
                              {insight.title}
                            </span>
                            {insight.date && (
                              <span style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8' }}>
                                {insight.date}
                              </span>
                            )}
                          </div>
                          <p
                            style={{
                              margin: '3px 0 0',
                              fontSize: 12,
                              fontWeight: 500,
                              color: '#64748b',
                              lineHeight: 1.45,
                            }}
                          >
                            {insight.description}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            background: '#e2e8f0',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, insight.confidence))}%`,
                              height: '100%',
                              borderRadius: 2,
                              background: config.bar,
                              transition: 'width 0.5s ease',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', minWidth: 32, textAlign: 'right' }}>
                          {Math.round(Math.min(100, Math.max(0, insight.confidence)))}%
                        </span>
                      </div>

                      {insight.actionable && insight.actionLabel && insight.onAction && (
                        <button
                          onClick={insight.onAction}
                          style={{
                            alignSelf: 'flex-start',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#6366f1',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {insight.actionLabel || 'View Details'}
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default AIInsights;
