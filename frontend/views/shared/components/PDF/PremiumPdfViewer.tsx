import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, FileText, Loader2, AlertTriangle, Download, ExternalLink, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { PDFPreviewSource } from './pdfPreviewUtils';
import { downloadPdfSource, formatPdfSize, getPdfErrorMessage, preparePdfBytes } from './pdfPreviewUtils';
import { platform } from '../../../../services/platform';
import { getDeviceProfile } from '../../../../utils/documentPreview';
import { getPdfPageCount } from './pdfPageUtils';
import { CanvasPdfViewer } from './CanvasPdfViewer';

const HARD_TIMEOUT_MS = 20000;
const SLOW_WARN_MS = 10000;

const deviceProfile = getDeviceProfile();
const isIOS = deviceProfile.isIOS;

interface PremiumPdfViewerProps {
  source?: PDFPreviewSource | null;
  directPath?: string | null;
  className?: string;
  title?: string;
  hideHeader?: boolean;
  onLoadSuccess?: () => void;
  onLoadError?: (error: Error) => void;
  sheetWidth?: number;
  sheetHeight?: number;
  zoom?: number;
}

export const PremiumPdfViewer: React.FC<PremiumPdfViewerProps> = ({
  source = null,
  directPath = null,
  className = '',
  title = 'PDF Preview',
  hideHeader = false,
  onLoadSuccess,
  onLoadError,
  sheetWidth = 794,
  sheetHeight = 1123,
  zoom = 1,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const tempFileRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const canvasLoadSuccessRef = useRef(false);

  const [phase, setPhase] = useState<'idle' | 'prepare' | 'load' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSidebar, setShowSidebar] = useState(true);
  const [size, setSize] = useState('');
  const [useCanvas, setUseCanvas] = useState(true);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);

  const changePage = useCallback((page: number) => {
    const target = Math.max(1, Math.min(page, pageCount || 1));
    setCurrentPage(target);
    if (!useCanvas && previewUrl && iframeRef.current) {
      iframeRef.current.src = previewUrl + '#toolbar=0&navpanes=0&page=' + target;
    }
  }, [pageCount, previewUrl, useCanvas]);

  const cleanup = useCallback(() => {
    loadedRef.current = false;
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    blobRef.current = null;
    if (tempFileRef.current && platform.isDesktop) {
      platform.api.cleanupTempPdf(tempFileRef.current).catch(() => {});
      tempFileRef.current = null;
    }
  }, []);

  useEffect(() => {
    cleanup();
    setPhase('idle'); setError(null); setSlow(false); setPreviewUrl(null); setSize('');
    setPageCount(0); setCurrentPage(1); setPdfBytes(null);
    if (!source && !directPath) return;

    let dead = false;

    (async () => {
      if (directPath && !platform.isDesktop) {
        setPreviewUrl(directPath);
        setSize('');
        if (dead) return;
        setPhase('load');
        return;
      }

      if (!source) return;
      setPhase('prepare');
      try {
        const bytes = await preparePdfBytes(source, title);
        const kb = (bytes.byteLength / 1024).toFixed(1);
        setSize(`${kb} KB`);


        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        blobRef.current = blob;

        const count = await getPdfPageCount(blob);
        setPageCount(count);

        if (platform.isDesktop && source) {
          const r = await platform.api.writeTempPdf(Array.from(bytes), `pv_${Date.now()}.pdf`);
          if (!r?.success) throw new Error(r?.error || 'Temp write failed');
          tempFileRef.current = r.path;
          const url = platform.api.getPdfPreviewUrl(r.path);
          if (!url) throw new Error('Preview URL generation failed');
          setPreviewUrl(url);
        } else {
          blobUrlRef.current = URL.createObjectURL(blob);
          setPreviewUrl(blobUrlRef.current);
        }

        if (dead) return;
        setPdfBytes(bytes);
        setPhase('load');
      } catch (err: any) {
        if (dead) return;
        const msg = getPdfErrorMessage(err);
        setError(msg); setPhase('error');
        onLoadError?.(err instanceof Error ? err : new Error(msg));
      }
    })();

    return () => { dead = true; cleanup(); };
  }, [source, directPath, title, retry, cleanup, onLoadError]);

  useEffect(() => {
    if (!useCanvas && phase !== 'load' || !previewUrl) return;
    if (useCanvas) return; // canvas mode handles its own loading
    const el = iframeRef.current;
    loadedRef.current = false;

    const onIframeLoad = () => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      setPhase('done'); setSlow(false);
      onLoadSuccess?.();
    };

    if (el) el.addEventListener('load', onIframeLoad);

    const slowTimer = setTimeout(() => {
      if (!loadedRef.current) setSlow(true);
    }, SLOW_WARN_MS);

    const hardTimeout = setTimeout(() => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      const msg = 'PDF preview timed out';
      setError(msg); setPhase('error');
      onLoadError?.(new Error(msg));
    }, HARD_TIMEOUT_MS);

    return () => {
      if (el) el.removeEventListener('load', onIframeLoad);
      clearTimeout(slowTimer);
      clearTimeout(hardTimeout);
    };
  }, [useCanvas, phase, previewUrl, onLoadSuccess, onLoadError]);

  const handleRetry = () => {
    cleanup();
    setUseCanvas(true);
    setError(null); setPhase('idle');
    setRetry(k => k + 1);
  };

  const handleDownload = () => {
    if (source) downloadPdfSource(source, title).catch(e => { setError(getPdfErrorMessage(e)); setPhase('error'); });
  };

  const handleCanvasReady = useCallback(() => {
    if (canvasLoadSuccessRef.current) return;
    canvasLoadSuccessRef.current = true;
    setPhase('done'); setSlow(false);
    loadedRef.current = true;
    onLoadSuccess?.();
  }, [onLoadSuccess]);

  const handleCanvasError = useCallback((err: Error) => {
    setUseCanvas(false);
    setPhase('load');
    onLoadError?.(err);
  }, [onLoadError]);

  if (!source && !directPath) {
    return (
      <div className={`flex min-h-[200px] items-center justify-center ${className}`}>
        <div className="text-center text-slate-400 px-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-xs">No preview available</p>
        </div>
      </div>
    );
  }

  if (phase === 'prepare') {
    return (
      <div className={`flex min-h-[200px] items-center justify-center ${className}`}>
        <div className="text-center px-4">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-900" />
          <p className="mt-3 text-sm font-semibold text-slate-800">Preparing PDF…</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={`flex min-h-[200px] items-center justify-center ${className}`}>
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Preview failed</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={handleRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  Retry
                </button>
                {(tempFileRef.current || directPath) && platform.isDesktop && (
                  <button onClick={() => platform.isDesktop && tempFileRef.current && platform.api.openPdfWithSystemViewer(tempFileRef.current)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100">
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

  const thumbnails = [];
  for (let i = 1; i <= pageCount; i++) {
    thumbnails.push(
      <button
        key={i}
        onClick={() => changePage(i)}
        className={`flex items-center justify-center rounded-lg border text-xs font-semibold transition-all min-h-[48px] ${
          currentPage === i
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
        }`}
      >
        {i}
      </button>
    );
  }

  return (
    <div className={`relative flex flex-col ${className}`} style={{ width: sheetWidth, minHeight: sheetHeight }}>
      {slow && phase === 'load' && !useCanvas && (
        <div className="z-10 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Preview is taking longer than expected. Try downloading instead.
        </div>
      )}

      <div className="flex" style={{ minHeight: sheetHeight }}>
        {showSidebar && pageCount > 1 && (
          <div className="flex flex-col gap-1.5 border-r border-slate-200 bg-slate-50/50 p-2 w-12 shrink-0" style={{ minHeight: sheetHeight }}>
            {thumbnails}
          </div>
        )}

        <div className="relative flex-1 bg-white" style={{ minHeight: sheetHeight }}>
          {useCanvas && pdfBytes ? (
            <CanvasPdfViewer
              source={source}
              directPath={directPath}
              title={title}
              zoom={zoom}
              currentPage={currentPage}
              pageCount={pageCount}
              onPageCount={setPageCount}
              onLoadSuccess={handleCanvasReady}
              onLoadError={handleCanvasError}
            />
          ) : previewUrl && (
            <iframe
              ref={iframeRef}
              src={previewUrl + '#toolbar=0&navpanes=0&scrollbar=0&page=' + currentPage}
              className="border-none bg-white"
              style={{ width: '100%', minHeight: sheetHeight }}
              title={title}
            />
          )}
          {phase === 'load' && !loadedRef.current && !useCanvas && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/75">
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

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(s => !s)}
              className="rounded-md p-1 text-slate-400 hover:text-slate-700 transition-colors"
              title={showSidebar ? 'Hide thumbnails' : 'Show thumbnails'}
            >
              {showSidebar ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="rounded-md p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-medium text-slate-700 tabular-nums">
              {currentPage} / {pageCount}
            </span>
            <button
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage >= pageCount}
              className="rounded-md p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {size && <span className="text-slate-400">{size}</span>}
            <button onClick={handleDownload} className="rounded-md p-1 text-slate-400 hover:text-slate-700 transition-colors" title="Download">
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PremiumPdfViewer;
