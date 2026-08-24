import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';

type SyncStatus = 'online' | 'offline' | 'syncing';

const OfflineIndicator: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>('online');
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [pendingChanges, setPendingChanges] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      setStatus('syncing');
      setTimeout(() => {
        setStatus('online');
        setLastSync(new Date());
        setPendingChanges(0);
      }, 1500);
    };

    const handleOffline = () => {
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Simulate periodic sync
    const interval = setInterval(() => {
      if (status === 'online') {
        setLastSync(new Date());
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [status]);

  const getStatusConfig = () => {
    switch (status) {
      case 'online':
        return {
          icon: <Wifi size={14} />,
          label: 'Online',
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
          dot: 'bg-emerald-500',
        };
      case 'offline':
        return {
          icon: <WifiOff size={14} />,
          label: `Offline${pendingChanges > 0 ? ` • ${pendingChanges} pending` : ''}`,
          bg: 'bg-amber-50',
          text: 'text-amber-700',
          border: 'border-amber-200',
          dot: 'bg-amber-500',
        };
      case 'syncing':
        return {
            icon: <RefreshCw size={14} className="animate-spin" />,
          label: 'Syncing...',
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          border: 'border-blue-200',
          dot: 'bg-blue-500',
        };
    }
  };

  const config = getStatusConfig();
  const timeAgo = Math.floor((Date.now() - lastSync.getTime()) / 1000);

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      <span className="relative flex h-2 w-2">
        {status === 'online' && <span className="absolute inset-0 rounded-full opacity-75 animate-ping" style={{ background: config.dot }} />}
      <span className="relative rounded-full" style={{ background: config.dot, width: 8, height: 8 }} />
      </span>
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
};

export default OfflineIndicator;
