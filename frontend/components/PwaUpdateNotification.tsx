import React from 'react';
import { RefreshCw, X } from 'lucide-react';

interface PwaUpdateNotificationProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

const PwaUpdateNotification: React.FC<PwaUpdateNotificationProps> = ({ onUpdate, onDismiss }) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-blue-200 dark:border-blue-800 p-3 pr-2 max-w-sm">
        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="text-sm min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100">Update Available</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">A new version is ready</p>
        </div>
        <button
          onClick={onUpdate}
          className="ml-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          Update
        </button>
        <button
          onClick={onDismiss}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PwaUpdateNotification;
