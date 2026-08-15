import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FileText, Loader2, AlertTriangle } from 'lucide-react';
import type { PDFPreviewSource } from './pdfPreviewUtils';
import { getPdfErrorMessage, preparePdfBytes } from './pdfPreviewUtils';

let pdfjsLib: any = null;
let pdfjsLoading = false;
let pdfjsPromise: Promise<any> | null = null;

async function ensurePdfjs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsLoading = true;
  pdfjsPromise = (async () => {
    const lib = await import('pdfjs-dist');
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href;
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  })();
  pdfjsLoading = false;
  return pdfjsPromise;
}

interface CanvasPdfViewerProps {
  source?: PDFPreviewSource | null;
  directPath?: string | null;
  title?: string;
  zoom?: number;
  currentPage: number;
  pageCount: number;
  onPageCount: (count: number) => void;
  onLoadSuccess?: () => void;
  onLoadError?: (error: Error) => void;
}

export const CanvasPdfViewer: React.FC<CanvasPdfViewerProps> = ({
  source,
  directPath,
  title = 'PDF Preview',
  zoom = 1,
  currentPage,
  pageCount,
  onPageCount,
  onLoadSuccess,
  onLoadError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    if (!source && !directPath) return;
    let cancelled = false;

    (async () => {
      try {
        let data: ArrayBuffer;
        if (source) {
          const bytes = await preparePdfBytes(source, title);
          data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        } else if (directPath) {
          const resp = await fetch(directPath);
          data = await resp.arrayBuffer();
        } else {
          throw new Error('No PDF source');
        }
        if (!cancelled) setPdfData(data);
      } catch (err: any) {
        if (cancelled) return;
        const msg = getPdfErrorMessage(err);
        setError(msg);
        setPhase('error');
        onLoadError?.(err instanceof Error ? err : new Error(msg));
      }
    })();

    return () => { cancelled = true; };
  }, [source, directPath, title, onLoadError]);

  useEffect(() => {
    if (!pdfData) return;
    let cancelled = false;

    (async () => {
      try {
        setPhase('loading');
        const lib = await ensurePdfjs();

        const pdf = await lib.getDocument({ data: pdfData }).promise;
        if (cancelled) { pdf.destroy(); return; }

        pdfDocRef.current = pdf;
        const count = pdf.numPages;
        onPageCount(count);

        if (!cancelled) {
          setPhase('ready');
          onLoadSuccess?.();
        }
      } catch (err: any) {
        if (cancelled) return;
        const msg = getPdfErrorMessage(err);
        setError(msg);
        setPhase('error');
        onLoadError?.(err instanceof Error ? err : new Error(msg));
      }
    })();

    return () => { cancelled = true; };
  }, [pdfData, onPageCount, onLoadSuccess, onLoadError]);

  const renderPage = useCallback(async () => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!pdf || !canvas || !container) return;

    const page = await pdf.getPage(currentPage);
    const containerWidth = container.clientWidth;
    const baseScale = containerWidth / 794;
    const scale = baseScale * zoom;
    const dpr = window.devicePixelRatio || 1;

    const viewport = page.getViewport({ scale });

    canvas.width = Math.ceil(viewport.width * dpr);
    canvas.height = Math.ceil(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport }).promise;
  }, [currentPage, zoom]);

  useEffect(() => {
    if (phase === 'ready') renderPage();
  }, [phase, renderPage]);

  useEffect(() => {
    return () => {
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy(); } catch {}
        pdfDocRef.current = null;
      }
    };
  }, []);

  if (!pdfData) {
    return (
      <div ref={containerRef} className="flex items-center justify-center" style={{ minHeight: 300 }}>
        <div className="text-center px-4">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-900" />
          <p className="mt-2 text-xs font-medium text-slate-500">Loading PDF data…</p>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div ref={containerRef} className="flex items-center justify-center" style={{ minHeight: 300 }}>
        <div className="text-center px-4">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-900" />
          <p className="mt-2 text-xs font-medium text-slate-500">Rendering page {currentPage}…</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div ref={containerRef} className="flex items-center justify-center" style={{ minHeight: 300 }}>
        <div className="w-full max-w-xs text-center px-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-800">Render failed</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex items-start justify-center w-full h-full">
      <canvas ref={canvasRef} className="block bg-white" />
    </div>
  );
};

export default CanvasPdfViewer;
