import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Download,
  Printer,
  Share2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Info,
  CheckCircle2,
  Copy,
  RotateCcw,
  FileDown,
} from 'lucide-react';
import type { DocType, FilePreviewDescriptor } from '../../../../stores/documentStore';
import type { PrimeDocData } from './schemas';
import { attachDocumentSecurity } from '../../../../utils/documentSecurity';
import { getStoredCompanyConfig, initializePrimePdfFonts } from './templateSettings';
import { hydrateCompanyPdfAssets } from '../../../../utils/companyAssetUtils';
import {
  downloadPdfSource,
  getPdfErrorMessage,
  type PDFPreviewSource,
  resolvePdfFilePreviewSource,
} from './pdfPreviewUtils';
import { validateDocumentData } from './documentValidation';
import { getDeviceProfile } from '../../../../utils/documentPreview';
import { Z_LAYERS } from '../../../../constants/layers';

/* ─────────────────────────── constants ─────────────────────────── */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const A4_W = 794;
const A4_H = 1123;

/* ─────────────────────────── types ─────────────────────────── */
interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: DocType;
  data?: PrimeDocData | null;
  file?: FilePreviewDescriptor | null;
  title?: string;
  content?: React.ReactNode;
}

interface ToastMsg {
  id: number;
  text: string;
  kind: 'success' | 'error' | 'info';
}

/* ─────────────────────────── helpers ─────────────────────────── */
const statusPalette = (s: string) => {
  const l = s.toLowerCase();
  if (['paid', 'active', 'completed'].includes(l))
    return { dotColor: '#34d399', bg: 'rgba(16,185,129,0.15)', color: '#6ee7b7', ring: 'rgba(16,185,129,0.35)' };
  if (['pending', 'draft', 'partial'].includes(l))
    return { dotColor: '#fbbf24', bg: 'rgba(245,158,11,0.15)', color: '#fcd34d', ring: 'rgba(245,158,11,0.35)' };
  if (['overdue', 'cancelled', 'void'].includes(l))
    return { dotColor: '#f87171', bg: 'rgba(239,68,68,0.15)', color: '#fca5a5', ring: 'rgba(239,68,68,0.35)' };
  return { dotColor: '#94a3b8', bg: 'rgba(100,116,139,0.15)', color: '#cbd5e1', ring: 'rgba(100,116,139,0.35)' };
};

let toastSeq = 0;

/* ═══════════════════════════════════════════════════════════════════
   PreviewModal – Premium Edition
═══════════════════════════════════════════════════════════════════ */
export const PreviewModal = ({
  isOpen,
  onClose,
  type,
  data = null,
  file = null,
  title: titleProp,
  content,
}: PreviewModalProps) => {
  /* ── state ─────────────────────────────────────────────────── */
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfSource, setPdfSource] = useState<PDFPreviewSource | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [genInfo, setGenInfo] = useState('');
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'width' | 'page' | 'free'>('width');
  const [panelOpen, setPanelOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);

  /* ── refs ──────────────────────────────────────────────────── */
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ridRef = useRef(0);
  const touchRef = useRef<{ dist?: number }>({});
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── device ────────────────────────────────────────────────── */
  const device = useMemo(() => getDeviceProfile(), []);
  const isTouch = device.isMobile || device.isTablet;
  const isAndroid = useMemo(
    () => /android/i.test(navigator.userAgent),
    []
  );

  /* ── derived document metadata ─────────────────────────────── */
  const docMeta = useMemo(() => {
    if (!data) return {};
    const r = data as Record<string, unknown>;
    return {
      number: (r.number || r.invoiceNumber || r.documentNumber || '') as string,
      customer: (r.clientName || r.customerName || (r.billTo as any)?.name || '') as string,
      status: (r.status || r.paymentStatus || '') as string,
      date: (r.date || r.invoiceDate || r.issueDate || '') as string,
      dueDate: (r.dueDate || r.due_date || '') as string,
      total: (r.total || r.totalAmount || r.grandTotal || '') as string | number,
      currency: (r.currency || 'USD') as string,
    };
  }, [data]);

  const previewTitle = useMemo(() => {
    if (file?.title) return file.title;
    if (titleProp) return titleProp;
    if (type === 'FISCAL_REPORT' && data && 'reportName' in data)
      return String((data as any).reportName);
    if (type === 'SUBSCRIPTION') return 'Recurring Invoice';
    if (type === 'POS_RECEIPT') return 'POS Receipt';
    if (type === 'INVOICE' || type === 'EXAMINATION_INVOICE')
      return docMeta.number ? `Invoice ${docMeta.number}` : 'Invoice Preview';
    if (type === 'QUOTATION') return 'Quotation Preview';
    if (type === 'DELIVERY_NOTE') return 'Delivery Note';
    return 'Document Preview';
  }, [data, file?.title, titleProp, type, docMeta.number]);

  const palette = useMemo(
    () => (docMeta.status ? statusPalette(docMeta.status) : null),
    [docMeta.status]
  );

  const hasContent = !!blobUrl;
  const isContentMode = !!content;

  /* ── toast helper ──────────────────────────────────────────── */
  const toast = useCallback((text: string, kind: ToastMsg['kind'] = 'info') => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  /* ── fake progress bar while generating ───────────────────── */
  const startProgress = useCallback(() => {
    setLoadProgress(5);
    progressTimerRef.current = setInterval(() => {
      setLoadProgress((p) => {
        if (p >= 90) { clearInterval(progressTimerRef.current!); return p; }
        return p + Math.random() * 8;
      });
    }, 400);
  }, []);

  const stopProgress = useCallback((success: boolean) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setLoadProgress(success ? 100 : 0);
    if (success) setTimeout(() => setLoadProgress(0), 600);
  }, []);

  /* ── PDF generation ────────────────────────────────────────── */
  const generate = useCallback(
    async (id: number) => {
      if (!data && !file) {
        if (id === ridRef.current) setError('No document data to preview');
        return;
      }
      try {
        if (file) {
          const src = await resolvePdfFilePreviewSource(file, abortRef.current?.signal);
          if (id !== ridRef.current) return;
          setPdfSource(src);
          return;
        }
        if (!data || !type) throw new Error('Missing document data or type');

        const check = validateDocumentData(type, data);
        if (!check.valid) {
          setError(check.error || 'Document validation failed');
          setPreparing(false);
          return;
        }

        setGenInfo('Preparing assets…');
        const config = await hydrateCompanyPdfAssets(getStoredCompanyConfig());
        await initializePrimePdfFonts();
        setGenInfo('Securing document…');
        const secured = await attachDocumentSecurity(data);
        setGenInfo('Generating PDF…');
        const t0 = Date.now();
        const { generatePrimeDocumentBlob } = await import('./generatePrimeDocumentBlob');
        const blob = await generatePrimeDocumentBlob(type, secured as PrimeDocData, config);
        setGenInfo(`Ready in ${Date.now() - t0}ms`);
        if (id !== ridRef.current) return;
        setPdfSource(blob);
      } catch (err: any) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (id !== ridRef.current) return;
        setError(getPdfErrorMessage(err));
        stopProgress(false);
      } finally {
        if (id === ridRef.current) setPreparing(false);
      }
    },
    [data, file, type, stopProgress]
  );

  /* ── lifecycle: open / close ───────────────────────────────── */
  useEffect(() => {
    if (!isOpen) {
      ridRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setPdfSource(null);
      setError(null);
      setGenInfo('');
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setZoom(1);
      setFitMode('width');
      setPanelOpen(false);
      setFullscreen(false);
      stopProgress(false);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    ridRef.current += 1;
    const id = ridRef.current;
    setPreparing(true);
    setError(null);
    setPdfSource(null);
    setGenInfo('');
    setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setZoom(1);
    setFitMode('width');
    startProgress();
    const t = setTimeout(() => generate(id), 80);
    return () => {
      ridRef.current += 1;
      abortRef.current?.abort();
      clearTimeout(t);
    };
  }, [isOpen, data, file, type, generate, retryKey, startProgress, stopProgress]);

  /* ── blob URL ──────────────────────────────────────────────── */
  useEffect(() => {
    if (pdfSource instanceof Blob && pdfSource.size > 0) {
      stopProgress(true);
      const url = URL.createObjectURL(pdfSource);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (pdfSource instanceof Uint8Array || pdfSource instanceof ArrayBuffer) {
      stopProgress(true);
      const buffer = pdfSource instanceof Uint8Array ? pdfSource.buffer : pdfSource;
      const blob = new Blob([buffer as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [pdfSource, stopProgress]);

  /* ── keyboard shortcuts ────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); handlePrint(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleDownload(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); handleZoomIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); handleZoomOut(); }
      if (e.key === 'i') { setPanelOpen((p) => !p); }
      if (e.key === 'f') { handleFullscreen(); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose, blobUrl]);

  /* ── ctrl+wheel zoom ───────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen || !previewRef.current) return;
    const el = previewRef.current;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))));
        setFitMode('free');
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isOpen]);

  /* ── touch pinch-to-zoom ───────────────────────────────────── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchRef.current.dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchRef.current.dist != null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (dist - touchRef.current.dist) * 0.012;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
      setFitMode('free');
      touchRef.current.dist = dist;
    }
  }, []);

  /* ── zoom helpers ──────────────────────────────────────────── */
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))));
    setFitMode('free');
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))));
    setFitMode('free');
  }, []);

  const handleFitWidth = useCallback(() => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth - (panelOpen ? 288 : 0) - 48;
      setZoom(parseFloat(Math.max(MIN_ZOOM, cw / A4_W).toFixed(2)));
      setFitMode('width');
    }
  }, [panelOpen]);

  const handleFitPage = useCallback(() => {
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth - (panelOpen ? 288 : 0) - 48;
      const ch = containerRef.current.clientHeight - 48;
      setZoom(parseFloat(Math.max(MIN_ZOOM, Math.min(cw / A4_W, ch / A4_H)).toFixed(2)));
      setFitMode('page');
    }
  }, [panelOpen]);

  /* ── actions ───────────────────────────────────────────────── */
  const handleDownload = useCallback(() => {
    if (!pdfSource) return;
    downloadPdfSource(pdfSource, previewTitle)
      .then(() => toast(`Downloaded "${previewTitle}.pdf"`, 'success'))
      .catch((e) => { setError(getPdfErrorMessage(e)); toast('Download failed', 'error'); });
  }, [pdfSource, previewTitle, toast]);

  const handlePrint = useCallback(() => {
    if (!blobUrl) return;
    if (isAndroid) {
      // On Android open in a new tab so the user can use the browser print
      window.open(blobUrl, '_blank');
      toast('Opened in browser – use browser Print', 'info');
      return;
    }
    const w = window.open(blobUrl, '_blank');
    if (w) {
      w.onload = () => { try { w.print(); } catch { /* ignored */ } };
    } else {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${previewTitle.replace(/[^a-z0-9]+/gi, '_')}.pdf`;
      a.target = '_blank';
      a.click();
    }
    toast('Print dialog opened', 'success');
  }, [blobUrl, previewTitle, isAndroid, toast]);

  const handleShare = useCallback(async () => {
    if (!pdfSource) return;
    try {
      const rawBuffer =
        pdfSource instanceof Blob
          ? pdfSource
          : pdfSource instanceof Uint8Array
            ? pdfSource.buffer
            : pdfSource;
      const blob =
        rawBuffer instanceof Blob
          ? rawBuffer
          : new Blob([rawBuffer as BlobPart], { type: 'application/pdf' });
      const fileName = `${previewTitle.replace(/[^a-z0-9]+/gi, '_')}.pdf`;
      if (navigator.canShare?.({ files: [new File([blob], fileName, { type: 'application/pdf' })] })) {
        await navigator.share({ title: previewTitle, files: [new File([blob], fileName, { type: 'application/pdf' })] });
        toast('Document shared', 'success');
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        toast('Link copied to clipboard', 'success');
      }
    } catch { /* user cancelled */ }
  }, [pdfSource, previewTitle, toast]);

  const handleCopyNumber = useCallback(() => {
    if (docMeta.number) {
      navigator.clipboard.writeText(docMeta.number).then(() => toast('Invoice number copied', 'success')).catch(() => {});
    }
  }, [docMeta.number, toast]);

  const handleRetry = useCallback(() => {
    setError(null);
    setPreparing(true);
    setRetryKey((k) => k + 1);
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  /* ── early return ──────────────────────────────────────────── */
  if (!isOpen) return null;

  /* ═══════════════════════════════ RENDER ═══════════════════════════ */
  return createPortal(
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: Z_LAYERS.GLOBAL_PREVIEW,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      aria-modal="true"
      role="dialog"
      aria-label={previewTitle}
    >
      {/* ── progress bar ── */}
      {loadProgress > 0 && loadProgress < 100 && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-50 overflow-hidden">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: `${loadProgress}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)',
            }}
          />
        </div>
      )}

      {/* ── toast stack ── */}
      <div className="absolute top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-xl animate-in slide-in-from-right-4 duration-300"
            style={{
              background:
                t.kind === 'success' ? 'rgba(16,185,129,0.18)'
                  : t.kind === 'error' ? 'rgba(239,68,68,0.18)'
                  : 'rgba(99,102,241,0.18)',
              border:
                t.kind === 'success' ? '1px solid rgba(16,185,129,0.35)'
                  : t.kind === 'error' ? '1px solid rgba(239,68,68,0.35)'
                  : '1px solid rgba(99,102,241,0.35)',
              color:
                t.kind === 'success' ? '#34d399'
                  : t.kind === 'error' ? '#f87171'
                  : '#a5b4fc',
              backdropFilter: 'blur(12px)',
            }}
          >
            {t.kind === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {t.kind === 'error' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {t.kind === 'info' && <Info className="h-3.5 w-3.5 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>

      {/* ══════════════════════ TOP BAR ══════════════════════ */}
      <header
        className="flex shrink-0 items-center justify-between px-4 py-3 border-b"
        style={{
          background: 'rgba(15,23,42,0.85)',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Left: close + document identity */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-95"
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)' }}
            title="Close  (Esc)"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Close</span>
          </button>

          {/* Icon badge */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-lg"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
          >
            <FileText className="h-4 w-4 text-white" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className="truncate text-sm font-bold"
                style={{ color: '#e2e8f0' }}
              >
                {previewTitle}
              </h2>
              {palette && docMeta.status && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: palette.bg,
                    color: palette.color,
                    boxShadow: `0 0 0 1px ${palette.ring}`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: palette.dotColor }}
                  />
                  {docMeta.status}
                </span>
              )}
            </div>
            {!isContentMode && (docMeta.number || docMeta.customer) && (
              <p className="text-[10px] truncate mt-0.5" style={{ color: '#64748b' }}>
                {docMeta.number && <span>{docMeta.number}</span>}
                {docMeta.number && docMeta.customer && <span className="mx-1.5 opacity-40">·</span>}
                {docMeta.customer && <span>{docMeta.customer}</span>}
              </p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isContentMode && hasContent && (
            <>
              {/* Download */}
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95 shadow-lg"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}
                title="Download PDF  (Ctrl+S)"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>

              {/* Print */}
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.07)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}
                title="Print  (Ctrl+P)"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print</span>
              </button>

              {/* Share – shown when Web Share API is available OR on touch */}
              {(isTouch || !!navigator.share) && (
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.07)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}
                  title="Share"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Share</span>
                </button>
              )}

              {/* Info panel toggle */}
              <button
                onClick={() => setPanelOpen((p) => !p)}
                className="rounded-lg p-1.5 transition-all active:scale-95"
                style={{
                  background: panelOpen ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.07)',
                  color: panelOpen ? '#a5b4fc' : '#64748b',
                  border: panelOpen ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}
                title="Document Info  (i)"
              >
                <Info className="h-4 w-4" />
              </button>

              {/* Fullscreen (desktop only) */}
              {!isTouch && (
                <button
                  onClick={handleFullscreen}
                  className="rounded-lg p-1.5 transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.07)', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)' }}
                  title="Fullscreen  (f)"
                >
                  {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              )}
            </>
          )}

          {/* Close X */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-all active:scale-95"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
            title="Close  (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ══════════════════════ BODY ══════════════════════ */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">

        {/* ── Main viewport ─────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {isContentMode ? (
            <div className="flex-1 overflow-y-auto p-6" style={{ color: '#e2e8f0' }}>
              <div className="max-w-4xl mx-auto">{content}</div>
            </div>

          ) : preparing && !hasContent ? (
            /* ── Loading state ── */
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="text-center max-w-sm w-full">
                {/* Animated PDF icon */}
                <div className="relative mx-auto mb-6 h-20 w-20">
                  <div
                    className="absolute inset-0 rounded-2xl animate-pulse"
                    style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.3))' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FileText className="h-9 w-9" style={{ color: '#818cf8' }} />
                  </div>
                  <div
                    className="absolute -inset-1 rounded-3xl opacity-30 animate-ping"
                    style={{ background: 'rgba(99,102,241,0.4)', animationDuration: '2s' }}
                  />
                </div>

                <p className="text-sm font-semibold mb-1" style={{ color: '#e2e8f0' }}>
                  Generating Document
                </p>
                <p className="text-xs mb-6" style={{ color: '#475569' }}>
                  {genInfo || 'Preparing your document…'}
                </p>

                <div className="flex items-center gap-2 justify-center" style={{ color: '#64748b' }}>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#818cf8' }} />
                  <span className="text-xs">Please wait</span>
                </div>

                {/* Skeleton pages */}
                <div className="mt-8 grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="rounded-xl animate-pulse"
                      style={{
                        height: 120,
                        background: 'rgba(255,255,255,0.04)',
                        animationDelay: `${i * 150}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

          ) : error ? (
            /* ── Error state ── */
            <div className="flex flex-1 items-center justify-center p-8">
              <div
                className="w-full max-w-md rounded-2xl p-8 text-center shadow-2xl"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  backdropFilter: 'blur(16px)',
                }}
              >
                <div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(239,68,68,0.15)' }}
                >
                  <AlertTriangle className="h-8 w-8" style={{ color: '#f87171' }} />
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: '#fca5a5' }}>
                  Preview Failed
                </h3>
                <p className="text-xs leading-relaxed mb-6" style={{ color: '#94a3b8' }}>{error}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}
                  >
                    <RotateCcw className="h-4 w-4" /> Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.07)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <X className="h-4 w-4" /> Close
                  </button>
                </div>
              </div>
            </div>

          ) : blobUrl ? (
            /* ── PDF viewport ── */
            <div className="flex flex-1 flex-col overflow-hidden">
              <div
                ref={previewRef}
                className="flex flex-1 items-start justify-center overflow-auto"
                style={{ padding: isTouch ? '12px' : '32px' }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
              >
                <div
                  className="rounded-xl overflow-hidden transition-transform duration-75 ease-out"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top center',
                    width: A4_W,
                    maxWidth: '100%',
                    boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
                  }}
                >
                  {/*
                    Android Chrome can't reliably render PDFs in iframes. We use
                    <object> as the primary element there, falling back to a direct
                    link if even that fails.
                  */}
                  {isAndroid ? (
                    <object
                      data={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                      type="application/pdf"
                      style={{ width: A4_W, height: A4_H, maxWidth: '100%', border: 'none', display: 'block', background: '#fff' }}
                      title={previewTitle}
                    >
                      {/* Fallback for Android WebView / devices without inline PDF viewer */}
                      <div
                        className="flex flex-col items-center justify-center gap-4"
                        style={{ width: A4_W, height: 400, maxWidth: '100%', background: '#1e293b' }}
                      >
                        <FileText className="h-12 w-12" style={{ color: '#818cf8' }} />
                        <p className="text-sm text-center px-8" style={{ color: '#94a3b8' }}>
                          Your browser cannot preview this PDF inline.
                        </p>
                        <button
                          onClick={handleDownload}
                          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}
                        >
                          <Download className="h-4 w-4" /> Download PDF
                        </button>
                      </div>
                    </object>
                  ) : (
                    <iframe
                      src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                      title={previewTitle}
                      style={{
                        width: A4_W,
                        height: A4_H,
                        maxWidth: '100%',
                        border: 'none',
                        display: 'block',
                        background: '#fff',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* ── zoom / fit toolbar ── */}
              <div
                className="flex shrink-0 items-center justify-between gap-2 px-4 py-2 border-t"
                style={{
                  background: 'rgba(15,23,42,0.85)',
                  borderColor: 'rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(16px)',
                }}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleZoomOut}
                    disabled={zoom <= MIN_ZOOM}
                    className="rounded-lg p-1.5 transition-all disabled:opacity-30"
                    style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)' }}
                    title="Zoom Out  (Ctrl+-)"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>

                  {/* Preset pills */}
                  <div
                    className="flex items-center rounded-lg overflow-hidden"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    {ZOOM_PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => { setZoom(p); setFitMode('free'); }}
                        className="px-2 py-1 text-[10px] font-semibold transition-all"
                        style={{
                          background: zoom === p && fitMode === 'free'
                            ? 'rgba(99,102,241,0.3)'
                            : 'rgba(255,255,255,0.04)',
                          color: zoom === p && fitMode === 'free' ? '#a5b4fc' : '#64748b',
                        }}
                      >
                        {Math.round(p * 100)}%
                      </button>
                    ))}
                  </div>

                  <span className="min-w-[2.5rem] text-center text-[11px] font-semibold" style={{ color: '#94a3b8' }}>
                    {zoomPercent}%
                  </span>

                  <button
                    onClick={handleZoomIn}
                    disabled={zoom >= MAX_ZOOM}
                    className="rounded-lg p-1.5 transition-all disabled:opacity-30"
                    style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)' }}
                    title="Zoom In  (Ctrl+=)"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>

                  <div className="w-px h-4 mx-1 hidden sm:block" style={{ background: 'rgba(255,255,255,0.1)' }} />

                  {/* Fit-width */}
                  <button
                    onClick={handleFitWidth}
                    className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-all hidden sm:block"
                    style={{
                      background: fitMode === 'width' ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)',
                      color: fitMode === 'width' ? '#a5b4fc' : '#64748b',
                    }}
                    title="Fit Width"
                  >
                    Fit W
                  </button>

                  {/* Fit-page */}
                  <button
                    onClick={handleFitPage}
                    className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-all hidden sm:block"
                    style={{
                      background: fitMode === 'page' ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)',
                      color: fitMode === 'page' ? '#a5b4fc' : '#64748b',
                    }}
                    title="Fit Page"
                  >
                    Fit P
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {genInfo && (
                    <span className="hidden sm:inline text-[10px]" style={{ color: '#334155' }}>
                      {genInfo}
                    </span>
                  )}
                  {isTouch ? (
                    <span className="text-[10px]" style={{ color: '#334155' }}>Pinch to zoom</span>
                  ) : (
                    <span className="hidden sm:inline text-[10px]" style={{ color: '#334155' }}>
                      Ctrl+Scroll · i = Info · f = Fullscreen
                    </span>
                  )}
                </div>
              </div>

              {/* ── Android floating action buttons (bottom sheet) ── */}
              {isAndroid && hasContent && (
                <div
                  className="flex items-center justify-around px-4 py-3 border-t shrink-0"
                  style={{
                    background: 'rgba(15,23,42,0.9)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <button
                    onClick={handleDownload}
                    className="flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition-all active:scale-95"
                    style={{ color: '#a5b4fc', background: 'rgba(99,102,241,0.12)' }}
                  >
                    <Download className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">Download</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition-all active:scale-95"
                    style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)' }}
                  >
                    <Printer className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">Print</span>
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition-all active:scale-95"
                    style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.06)' }}
                  >
                    <Share2 className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">Share</span>
                  </button>
                  <button
                    onClick={() => setPanelOpen((p) => !p)}
                    className="flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition-all active:scale-95"
                    style={{
                      color: panelOpen ? '#a5b4fc' : '#94a3b8',
                      background: panelOpen ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <Info className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">Details</span>
                  </button>
                </div>
              )}
            </div>

          ) : (
            /* ── Empty ── */
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 mb-3 opacity-20" style={{ color: '#94a3b8' }} />
                <p className="text-sm font-medium" style={{ color: '#475569' }}>No document to preview</p>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════ SIDE INFO PANEL ══════════════════════ */}
        {panelOpen && !isContentMode && (
          <aside
            className="shrink-0 flex flex-col border-l overflow-y-auto"
            style={{
              width: isTouch ? '100%' : 280,
              background: 'rgba(15,23,42,0.9)',
              borderColor: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              position: isTouch ? 'absolute' : 'relative',
              inset: isTouch ? '0' : undefined,
              zIndex: isTouch ? 20 : undefined,
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>
                Document Info
              </h3>
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-lg p-1 transition-all"
                style={{ color: '#64748b', background: 'rgba(255,255,255,0.06)' }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1 p-4 flex-1">
              {/* Type badge */}
              <div
                className="flex items-center justify-center rounded-xl py-3 mb-2"
                style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.15))', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#a5b4fc' }}>
                  {type?.replace(/_/g, ' ') || 'Document'}
                </span>
              </div>

              {/* Meta rows */}
              {[
                {
                  label: 'Document No.',
                  value: docMeta.number,
                  action: docMeta.number ? (
                    <button onClick={handleCopyNumber} className="ml-auto opacity-50 hover:opacity-100 transition-opacity" title="Copy">
                      <Copy className="h-3 w-3" style={{ color: '#94a3b8' }} />
                    </button>
                  ) : null,
                },
                { label: 'Customer', value: docMeta.customer },
                { label: 'Status', value: docMeta.status },
                { label: 'Date', value: docMeta.date },
                { label: 'Due Date', value: docMeta.dueDate },
                {
                  label: 'Total',
                  value: docMeta.total
                    ? `${docMeta.currency} ${Number(docMeta.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : undefined,
                },
              ]
                .filter((r) => r.value)
                .map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-2 rounded-lg px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0" style={{ color: '#475569' }}>
                      {row.label}
                    </span>
                    <span className="text-[11px] font-semibold text-right break-all" style={{ color: '#cbd5e1' }}>
                      {row.value}
                    </span>
                    {row.action}
                  </div>
                ))}

              {/* Keyboard hints (desktop only) */}
              {!isTouch && (
                <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#334155' }}>Shortcuts</p>
                  {[
                    ['Esc', 'Close'],
                    ['Ctrl+S', 'Download'],
                    ['Ctrl+P', 'Print'],
                    ['Ctrl+=', 'Zoom In'],
                    ['Ctrl+−', 'Zoom Out'],
                    ['I', 'Toggle Info'],
                    ['F', 'Fullscreen'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px]" style={{ color: '#475569' }}>{label}</span>
                      <kbd
                        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(255,255,255,0.08)', color: '#64748b' }}
                      >
                        {key}
                      </kbd>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>,
    document.body
  );
};

export default PreviewModal;
