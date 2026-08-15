import React from 'react';
import { WifiOff } from 'lucide-react';
import { usePwaInstall } from '../context/PwaInstallContext';

const OfflineBanner: React.FC = () => {
  const { isOnline } = usePwaInstall();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (isOnline) {
      setDismissed(false);
    }
  }, [isOnline]);

  if (isOnline || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[99999] animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-2 text-sm">
        <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-amber-800 font-medium">
          You are offline - showing cached data. Changes will sync automatically when reconnected.
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 p-1 text-amber-500 hover:text-amber-700 rounded hover:bg-amber-100 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="h-0.5 bg-amber-300/50">
        <div className="h-full bg-amber-400 animate-progress-indeterminate" />
      </div>
    </div>
  );
};

export default OfflineBanner;
