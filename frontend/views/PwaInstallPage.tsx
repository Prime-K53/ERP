import React from 'react';
import { usePwaInstall } from '../context/PwaInstallContext';
import { Download, Smartphone, Monitor, Apple, Chrome, CheckCircle, X, Share2, Compass } from 'lucide-react';
import { isFileProtocol, resolveAppAssetUrl } from '../utils/runtime';

const PwaInstallPage: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePwaInstall();
  const [dismissed, setDismissed] = React.useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const fileProtocol = isFileProtocol();

  if (isStandalone || dismissed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-blue-100 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2">Prime ERP is Installed</h1>
          <p className="text-slate-500 mb-6">You are running the app in standalone mode. Enjoy the full experience!</p>
          <button
            onClick={() => {
              window.location.hash = '#/';
            }}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
          >
            Go to Dashboard
          </button>
          <button
            onClick={() => setDismissed(false)}
            className="block mx-auto mt-4 text-sm text-slate-400 hover:text-slate-600 underline"
          >
            Show install info anyway
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      <header className="relative z-10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={resolveAppAssetUrl('/pwa-icon-192x192.png')} alt="Prime ERP" className="w-10 h-10 rounded-xl shadow-lg shadow-blue-200" />
                  <span className="font-bold text-slate-700 text-lg">Prime ERP</span>
                </div>
        <button
          onClick={() => window.history.back()}
          className="p-2 hover:bg-white/50 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center px-4 py-8 max-w-3xl mx-auto w-full">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-200/50">
            <Download className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-slate-800 mb-3">Install Prime ERP</h1>
          <p className="text-lg text-slate-500 max-w-lg mx-auto">
            Install Prime ERP on your device for a faster, offline-capable experience with full access to all features.
          </p>
        </div>

        {isInstallable && !fileProtocol && (
          <button
            onClick={install}
            className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-xl shadow-blue-200/50 transition-all active:scale-95 mb-10"
          >
            <span className="flex items-center gap-3">
              <Download className="w-6 h-6" />
              Install Now
            </span>
          </button>
        )}

        <div className="w-full grid md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-bold text-slate-800">Desktop (Chrome/Edge)</h3>
            </div>
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><span className="font-bold text-blue-600">1.</span> Click the install icon <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs"><Download className="w-3 h-3" /> in the address bar</span></li>
              <li className="flex gap-2"><span className="font-bold text-blue-600">2.</span> Click <strong>Install</strong> in the dialog</li>
              <li className="flex gap-2"><span className="font-bold text-blue-600">3.</span> Launch from desktop or start menu</li>
            </ol>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Chrome className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-bold text-slate-800">Android (Chrome)</h3>
            </div>
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><span className="font-bold text-green-600">1.</span> Tap the Chrome menu <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs">⋮</span></li>
              <li className="flex gap-2"><span className="font-bold text-green-600">2.</span> Tap <strong>Add to Home screen</strong></li>
              <li className="flex gap-2"><span className="font-bold text-green-600">3.</span> Tap <strong>Install</strong> in the prompt</li>
            </ol>
          </div>

          {isIOS && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm md:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                  <Compass className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-slate-800">iOS (Safari)</h3>
              </div>
              <ol className="space-y-2 text-sm text-slate-600">
                <li className="flex gap-2"><span className="font-bold text-gray-800">1.</span> Tap the <strong>Share</strong> button <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs"><Share2 className="w-3 h-3" /></span></li>
                <li className="flex gap-2"><span className="font-bold text-gray-800">2.</span> Scroll down and tap <strong>Add to Home Screen</strong></li>
                <li className="flex gap-2"><span className="font-bold text-gray-800">3.</span> Tap <strong>Add</strong> in the top-right corner</li>
              </ol>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm md:col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="font-bold text-slate-800">Benefits</h3>
            </div>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm text-slate-600">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> Offline access to cached data</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> Faster load times</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> Works like a native app</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> Automatic updates</li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Prime ERP v1.0.0 &middot; {fileProtocol ? 'Desktop installer mode active' : isInstallable ? 'Ready to install' : isStandalone ? 'Running as installed app' : 'Open this page in Chrome, Edge, or Safari to install'}
        </p>
      </main>
    </div>
  );
};

export default PwaInstallPage;
