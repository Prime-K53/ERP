import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle, FileText, Loader2, RefreshCw, Download, ExternalLink } from 'lucide-react';
import type { PDFPreviewSource } from './pdfPreviewUtils';
import { downloadPdfSource, formatPdfSize, getPdfErrorMessage, preparePdfBytes } from './pdfPreviewUtils';
import { platform } from '../../../../services/platform';
import { isPdfDebugLoggingEnabled } from '../../../../utils/debugFlags';
import { getDeviceProfile } from '../../../../utils/documentPreview';

const HARD_TIMEOUT_MS = 20000;
const SLOW_WARN_MS = 10000;
const pdfDebugLoggingEnabled = isPdfDebugLoggingEnabled();

interface NativePdfPreviewProps {
  source?: PDFPreviewSource | null;
  directPath?: string | null;
  className?: string;
  title?: string;
  hideHeader?: boolean;
  onLoadSuccess?: () => void;
  onLoadError?: (error: Error) => void;
  pdfWidth?: number;
  pdfHeight?: number;
}

const previewLog = (event: string, meta?: Record<string, unknown>) => {
  if (!pdfDebugLoggingEnabled) return;
  const entry = { ts: Date.now(), event, ...meta };
  if (platform.isDesktop) {
    platform.api.log({ message: `[Preview] ${event}`, ...meta });
  }
  console.log('[Preview]', JSON.stringify(entry));
};

const deviceProfile = getDeviceProfile();
const isIOS = deviceProfile.isIOS;
const isTabletOrMobile = deviceProfile.isTablet || deviceProfile.isMobile;

export const NativePdfPreview: React.FC<NativePdfPreviewProps> = ({
  source = null,
  directPath = null,
  className = '',
  title = 'PDF Preview',
  hideHeader = false,
  onLoadSuccess,
  onLoadError,
  pdfWidth,
  pdfHeight,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const tempFileRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  const [phase, setPhase] = useState<'idle' | 'prepare' | 'load' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<Array<{ label: string; value: string }>>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState(0);
  const [size, setSize] = useState<string>('');
  const cleanup = useCallback(() => {
    loadedRef.current = false;
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    if (tempFileRef.current && platform.isDesktop) {
      platform.api.cleanupTempPdf(tempFileRef.current).catch(() => {});
      tempFileRef.current = null;
    }
  }, []);

  useEffect(() => {
    cleanup();
    setPhase('idle'); setError(null); setDiag([]); setSlow(false); setPreviewUrl(null); setSize('');
    if (!source && !directPath) return;

    let dead = false;
    const d: Array<{ label: string; value: string }> = [];

    (async () => {
      if (directPath) {
        if (platform.isDesktop) {
          tempFileRef.current = directPath;
          const url = platform.api.getPdfPreviewUrl(directPath);
          d.push({ label: 'Engine', value: (platform.type as string) === 'tauri' ? 'Tauri' : 'Electron' });
          setPreviewUrl(url);
          setSize('from worker');
          if (dead) return;
          setDiag(d);
          setPhase('load');
          previewLog('direct-path-loading', { path: directPath });
        } else {
          d.push({ label: 'Engine', value: 'Browser' });
          setPreviewUrl(directPath);
          setSize('');
          if (dead) return;
          setDiag(d);
          setPhase('load');
          previewLog('direct-path-loading', { path: directPath });
        }
        return;
      }

      if (!source) return;
      setPhase('prepare');
      try {
        const bytes = await preparePdfBytes(source, title);
        const kb = (bytes.byteLength / 1024).toFixed(1);
        setSize(`${kb} KB`);
        d.push({ label: 'Size', value: formatPdfSize(bytes.byteLength) });

        if (platform.isDesktop) {
          const r = await platform.api.writeTempPdf(Array.from(bytes), `pv_${Date.now()}.pdf`);
          if (!r?.success) throw new Error(r?.error || 'Temp write failed');
          tempFileRef.current = r.path;
          const url = platform.api.getPdfPreviewUrl(r.path);
          if (!url) throw new Error('Preview URL generation failed');
          d.push({ label: 'Engine', value: (platform.type as string) === 'tauri' ? 'Tauri' : 'Electron' });
          setPreviewUrl(url);
          previewLog('temp-written', { path: r.path, bytes: bytes.byteLength });
        } else {
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          blobUrlRef.current = URL.createObjectURL(blob);
          d.push({ label: 'Engine', value: 'Browser' });
          setPreviewUrl(blobUrlRef.current);
        }

        if (dead) return;
        setDiag(d);
        setPhase('load');
        previewLog('preview-loading', { title });
      } catch (err: any) {
        if (dead) return;
        const msg = getPdfErrorMessage(err);
        d.push({ label: 'Error', value: msg });
        setDiag(d); setError(msg); setPhase('error');
        previewLog('preview-error', { title, error: msg });
        onLoadError?.(err instanceof Error ? err : new Error(msg));
      }
    })();

    return () => { dead = true; cleanup(); previewLog('preview-cancelled', { title }); };
  }, [source, directPath, title, retry, cleanup, onLoadError]);

  useEffect(() => {
    if (phase !== 'load' || !previewUrl) return;

    const el = iframeRef.current;
    loadedRef.current = false;

    const onIframeLoad = () => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      setPhase('done'); setSlow(false);
      previewLog('iframe-loaded', { title });
      onLoadSuccess?.();
    };

    if (el) {
      el.addEventListener('load', onIframeLoad);
    }

    const slowTimer = setTimeout(() => {
      if (!loadedRef.current) setSlow(true);
    }, SLOW_WARN_MS);

    const hardTimeout = setTimeout(() => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      const msg = 'PDF preview timed out — the viewer may not be available in this environment';
      setError(msg); setPhase('error');
      previewLog('timeout', { title });
      onLoadError?.(new Error(msg));
    }, HARD_TIMEOUT_MS);

    return () => {
      if (el) el.removeEventListener('load', onIframeLoad);
      clearTimeout(slowTimer);
      clearTimeout(hardTimeout);
    };
  }, [phase, previewUrl, onLoadSuccess, onLoadError, title]);

  const handleRetry = () => { cleanup(); setError(null); setPhase('idle'); setRetry((k) => k + 1); previewLog('retry', { title }); };

  const handleDownload = () => {
    if (source) downloadPdfSource(source, title).catch((e) => { setError(getPdfErrorMessage(e)); setPhase('error'); });
  };

  const handleOpenSystemViewer = async () => {
    if (!tempFileRef.current || !platform.isDesktop) return;
    try {
      await platform.api.openPdfWithSystemViewer(tempFileRef.current);
      previewLog('system-viewer-opened', { path: tempFileRef.current });
    } catch (err: any) {
      previewLog('system-viewer-error', { error: getPdfErrorMessage(err) });
    }
  };

  if (!source && !directPath) {
    return (
      <div className={`flex min-h-[200px] sm:min-h-[320px] items-center justify-center ${className}`}>
        <div className="text-center text-slate-400 px-4">
          <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-slate-100">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-xs">No preview available</p>
        </div>
      </div>
    );
  }

  if (phase === 'prepare') {
    return (
      <div className={`flex min-h-[200px] sm:min-h-[320px] items-center justify-center ${className}`}>
        <div className="text-center px-4">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-900" />
          <p className="mt-3 text-sm font-semibold text-slate-800">Preparing PDF…</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={`flex min-h-[200px] sm:min-h-[320px] items-center justify-center ${className}`}>
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-4 sm:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Preview failed</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{error}</p>
              {diag.length > 0 && (
                <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-[10px] text-slate-500">
                  {diag.map((d) => (
                    <div key={d.label} className="flex justify-between gap-4">
                      <span className="font-semibold text-slate-600">{d.label}</span>
                      <span className="break-all text-right">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={handleRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 sm:px-4 py-2 sm:py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 min-h-[36px] sm:min-h-0">
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
                {(tempFileRef.current || directPath) && platform.isDesktop && (
                  <button onClick={handleOpenSystemViewer} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 sm:px-4 py-2 sm:py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 min-h-[36px] sm:min-h-0">
                    <ExternalLink className="h-3.5 w-3.5" /> Open in System Viewer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (hideHeader) {
    // iOS devices can't reliably display PDFs in iframes — open in new window instead
    if (isIOS && phase === 'load' && previewUrl) {
      const handleOpenInNewWindow = () => {
        window.open(previewUrl, '_blank');
      };

      return (
        <div className={`flex h-full flex-col items-center justify-center p-4 sm:p-6 ${className}`}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FileText className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base font-bold text-slate-900">PDF Ready</p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Open the PDF in your browser's built-in viewer.</p>
            {size && <p className="mt-2 text-xs text-slate-400">Size: {size}</p>}
            <button
              onClick={handleOpenInNewWindow}
              className="mt-5 sm:mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 sm:px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 min-h-[44px]"
            >
              <ExternalLink className="h-4 w-4" /> View PDF
            </button>
            <button
              onClick={handleDownload}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 sm:px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 min-h-[44px]"
            >
              <Download className="h-4 w-4" /> Download PDF
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`relative flex flex-col overflow-hidden ${className}`}>
        {slow && phase === 'load' && (
          <div className="z-10 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[10px] text-amber-800">
            Preview is taking longer than expected. If it doesn't load, try downloading it.
          </div>
        )}

        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#b5b0a8]">
          {previewUrl && (
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="border-none bg-[#b5b0a8]"
              style={{ width: pdfWidth || '100%', height: pdfHeight || '100%' }}
              title={title}
            />
          )}
          {phase === 'load' && !loadedRef.current && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#f4f1ec]/75">
              <div className="text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-900" />
                <p className="mt-2 text-xs font-medium text-slate-500">
                  {slow ? 'Still loading…' : 'Loading PDF…'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-2 text-xs text-slate-500">
        <div className="flex items-center gap-3 overflow-hidden">
          <FileText className="h-4 w-4 shrink-0 text-blue-600" />
          <span className="truncate font-medium text-slate-700">{title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {size && <span className="text-slate-400">{size}</span>}
          {phase === 'done' && !isTabletOrMobile && <span className="font-medium text-emerald-600">Ready</span>}
          <button onClick={handleDownload} className="rounded-md p-2 sm:p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Download PDF">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isIOS && phase === 'load' && previewUrl && !loadedRef.current && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[10px] text-amber-800">
          <span>iOS may not display PDF previews in-browser. </span>
          <button onClick={handleDownload} className="font-semibold underline">Download</button>
          <span> or </span>
          <button onClick={() => window.open(previewUrl, '_blank')} className="font-semibold underline">Open in new tab</button>
          <span> to view.</span>
        </div>
      )}

      {slow && phase === 'load' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Preview is taking longer than expected. If it doesn't load, try opening in system viewer.
        </div>
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden bg-[#b5b0a8]">
        {previewUrl && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="border-none bg-[#b5b0a8]"
            style={{ width: pdfWidth || '100%', height: pdfHeight || '100%' }}
            title={title}
          />
        )}
        {phase === 'load' && !loadedRef.current && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f4f1ec]/75">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-900" />
              <p className="mt-2 text-xs font-medium text-slate-500">
                {slow ? 'Still loading…' : 'Loading PDF…'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NativePdfPreview;
