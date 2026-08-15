import React from 'react';
import { usePwaInstall } from '../context/PwaInstallContext';
import { Download, X, Share2, ExternalLink } from 'lucide-react';

const PwaInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePwaInstall();
  const [dismissed, setDismissed] = React.useState(false);
  const [showIOSGuide, setShowIOSGuide] = React.useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);

  if (isInstalled || dismissed) return null;

  if (isIOS && showIOSGuide) {
    return (
      <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300 max-w-sm">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Install on iOS</h3>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
            <li className="flex gap-2 items-start">
              <span className="font-bold text-blue-600 shrink-0">1.</span>
              <span>Tap <strong>Share</strong> <Share2 className="w-3.5 h-3.5 inline" /></span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="font-bold text-blue-600 shrink-0">2.</span>
              <span>Scroll down & tap <strong>Add to Home Screen</strong></span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="font-bold text-blue-600 shrink-0">3.</span>
              <span>Tap <strong>Add</strong></span>
            </li>
          </ol>
          <button
            onClick={() => setShowIOSGuide(false)}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 pr-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-sm">
              <p className="font-medium text-gray-900 dark:text-gray-100">Install Prime ERP</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Add to Home Screen</p>
            </div>
          </div>
          <button
            onClick={() => setShowIOSGuide(true)}
            className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!isInstallable) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 pr-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-gray-900 dark:text-gray-100">Install Prime ERP</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Add to your device</p>
          </div>
        </div>
        <button
          onClick={install}
          className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Install
        </button>
        <a
          href="/#/install"
          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Install page"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PwaInstallBanner;
