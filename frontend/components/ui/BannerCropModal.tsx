import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crop, Check, Loader2, RotateCcw, X, ZoomIn, ZoomOut, ShieldCheck } from 'lucide-react';
import {
  BANNER_SPEC,
  aspectConformance,
  canvasToWebPBlob,
  clampPan,
  coverTransform,
  cropRectFromTransform,
  renderBannerCanvas,
} from '../../services/bannerImage';

interface BannerCropModalProps {
  image: HTMLImageElement;
  sourceName: string;
  onCancel: () => void;
  onConfirm: (blob: Blob, output: { width: number; height: number }) => void;
}

const teal = {
  100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294',
  500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a',
};
const amber = { 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const SAFE_AREA_W = 0.9; // safe area keeps the central 90% horizontally
const SAFE_AREA_H = 0.8; // and the middle 80% vertically

/**
 * Interactive 4:1 crop tool for customer portal banners.
 *
 * A fixed 4:1 crop window sits over the image; the user drags the image to
 * position it and zooms with the slider / wheel. A visible safe-area guide
 * protects logos, text and promotional content. The confirmed crop is
 * rendered to an exact 1600 × 400 WebP — the same proportions the portal
 * displays — and returned to the caller for upload.
 */
export const BannerCropModal: React.FC<BannerCropModalProps> = ({ image, sourceName, onCancel, onConfirm }) => {
  const srcW = image.naturalWidth;
  const srcH = image.naturalHeight;
  const conformant = aspectConformance(srcW, srcH);

  const stageRef = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState({ scale: 1, panX: 0, panY: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Fixed 4:1 crop window sized to fit the stage (padding 40px each side).
  const windowSize = useMemo(() => {
    if (win.w <= 0 || win.h <= 0) return { w: 0, h: 0 };
    let w = win.w - 40;
    let h = w / BANNER_SPEC.targetRatio;
    if (h > win.h - 40) {
      h = win.h - 40;
      w = h * BANNER_SPEC.targetRatio;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }, [win]);

  const minScale = useMemo(
    () => (windowSize.w > 0 && srcW > 0 ? Math.max(windowSize.w / srcW, windowSize.h / srcH) : 1),
    [windowSize, srcW, srcH],
  );
  const maxScale = minScale * 4;

  const resetTransform = useCallback(() => {
    setTransform(coverTransform(srcW, srcH, windowSize.w, windowSize.h));
  }, [srcW, srcH, windowSize]);

  // Measure the stage and keep the crop window centered/4:1.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setWin((prev) =>
        prev.w === Math.round(rect.width) && prev.h === Math.round(rect.height) ? prev : { w: Math.round(rect.width), h: Math.round(rect.height) }
      );
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // Re-fit when the window size changes.
  useEffect(() => {
    if (windowSize.w > 0 && windowSize.h > 0) resetTransform();
  }, [windowSize, resetTransform]);

  // Escape closes the crop tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const clamp = (panX: number, panY: number, scale: number) =>
    clampPan(panX, panY, scale, srcW, srcH, windowSize.w, windowSize.h);

  const setZoom = useCallback((next: number) => {
    const scale = Math.max(minScale, Math.min(maxScale, next));
    setTransform((t) => ({ ...clamp(t.panX, t.panY, scale), scale }));
  }, [minScale, maxScale, clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, panX: transform.panX, panY: transform.panY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setTransform((t) => ({ ...clamp(drag.current!.panX + dx, drag.current!.panY + dy, t.scale), scale: t.scale }));
  };
  const onPointerUp = () => { drag.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const scale = Math.max(minScale, Math.min(maxScale, transform.scale * factor));
    setTransform((t) => ({ ...clamp(t.panX, t.panY, scale), scale }));
  };

  const sliderValue = maxScale > minScale ? ((transform.scale - minScale) / (maxScale - minScale)) * 100 : 0;

  // Geometry of the crop window inside the stage.
  const imgDisplayW = srcW * transform.scale;
  const imgDisplayH = srcH * transform.scale;
  const winLeft = (win.w - windowSize.w) / 2;
  const winTop = (win.h - windowSize.h) / 2;
  const imgLeft = win.w / 2 - imgDisplayW / 2 + transform.panX;
  const imgTop = win.h / 2 - imgDisplayH / 2 + transform.panY;

  // Live mini preview (scales the stage geometry into a 320 px wide 4:1 box).
  const previewK = 320 / windowSize.w;
  const safeArea = {
    w: Math.round(windowSize.w * SAFE_AREA_W),
    h: Math.round(windowSize.h * SAFE_AREA_H),
    x: Math.round((windowSize.w - windowSize.w * SAFE_AREA_W) / 2),
    y: Math.round((windowSize.h - windowSize.h * SAFE_AREA_H) / 2),
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const rect = cropRectFromTransform(transform, srcW, srcH, windowSize.w, windowSize.h);
      const canvas = renderBannerCanvas(image, rect);
      const blob = await canvasToWebPBlob(canvas);
      onConfirm(blob, { width: canvas.width, height: canvas.height });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="banner-crop-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8, 14, 20, 0.72)',
        padding: '32px 20px',
        fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
      }}
    >
      <div
        style={{
          width: 920, maxWidth: '100%', maxHeight: '94vh',
          background: paper, borderRadius: 16,
          boxShadow: '0 40px 90px -24px rgba(0,0,0,.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px 14px', borderBottom: `1px solid ${hairline}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Crop size={18} color="#fff" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: teal[800] }}>
              Crop to 4:1 banner
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {sourceName} &middot; {srcW} × {srcH} px &middot; aspect {srcW / srcH < 10 ? (srcW / srcH).toFixed(2) : '4.00'} : 1
              {conformant ? ' (already 4:1)' : ' — needs a 4:1 crop'}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close crop tool" style={{
            width: 32, height: 32, borderRadius: 8, border: `1px solid ${hairline}`, background: paper,
            color: inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', gap: 0, flex: 1, minHeight: 0, flexDirection: 'column' }}>
          <div style={{ padding: '12px 22px 0' }}>
            <p style={{ margin: 0, fontSize: 12, color: inkSoft, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={14} color={teal[600]} />
              Drag the image to position it. Use the slider or mouse wheel to zoom.
              Keep <b style={{ color: ink }}>logos, text and promotional content</b> inside the safe area so they stay visible on every portal viewport.
              Banners are never stretched — the final asset is prepared at exactly 4:1.
            </p>
          </div>

          {/* Stage */}
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            style={{
              position: 'relative', flex: 1, minHeight: 320, margin: '14px 22px',
              borderRadius: 12, overflow: 'hidden', cursor: 'grab', touchAction: 'none',
              background: '#0d1420',
              userSelect: 'none',
            }}
          >
            {win.w > 0 && windowSize.w > 0 && (
              <>
                {/* The image — draggable behind the fixed 4:1 window */}
                <img
                  src={image.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: imgLeft, top: imgTop,
                    width: imgDisplayW, height: imgDisplayH,
                    maxWidth: 'none',
                    userSelect: 'none', pointerEvents: 'none',
                  }}
                />
                {/* Scrim outside the crop window */}
                <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: winTop, background: 'rgba(6,10,16,.66)' }} />
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: win.h - winTop - windowSize.h, background: 'rgba(6,10,16,.66)' }} />
                <div style={{ position: 'absolute', left: 0, top: winTop, width: winLeft, height: windowSize.h, background: 'rgba(6,10,16,.66)' }} />
                <div style={{ position: 'absolute', right: 0, top: winTop, width: win.w - winLeft - windowSize.w, height: windowSize.h, background: 'rgba(6,10,16,.66)' }} />
                {/* Crop window frame */}
                <div style={{
                  position: 'absolute', left: winLeft, top: winTop,
                  width: windowSize.w, height: windowSize.h,
                  border: '1.5px solid rgba(255,255,255,.95)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
                  pointerEvents: 'none',
                }}>
                  {/* Safe area guide */}
                  <div style={{
                    position: 'absolute', left: safeArea.x, top: safeArea.y,
                    width: safeArea.w, height: safeArea.h,
                    border: `1.5px dashed ${amber[300]}`,
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                  }}>
                    <span style={{
                      position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: amber[300], background: 'rgba(8,14,20,.75)', padding: '2px 8px', borderRadius: 999,
                      whiteSpace: 'nowrap',
                    }}>
                      Safe area — keep content inside
                    </span>
                    <span style={{ position: 'absolute', right: -8, bottom: -8, width: 14, height: 14, borderRadius: '50%', background: amber[500], border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.5)' }} />
                  </div>
                </div>
                {/* Corner ticks */}
                {[
                  { left: winLeft - 4, top: winTop - 4 },
                  { left: winLeft + windowSize.w - 10, top: winTop - 4 },
                  { left: winLeft - 4, top: winTop + windowSize.h - 10 },
                  { left: winLeft + windowSize.w - 10, top: winTop + windowSize.h - 10 },
                ].map((p, i) => (
                  <div key={i} style={{ position: 'absolute', width: 14, height: 14, left: p.left, top: p.top, border: '2.5px solid #fff', pointerEvents: 'none' }} />
                ))}
              </>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px 14px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setZoom(transform.scale / 1.12)} aria-label="Zoom out" style={controlBtnStyle}>
              <ZoomOut size={15} />
            </button>
            <input
              type="range" min={0} max={100} step={0.5} value={sliderValue}
              onChange={(e) => {
                const v = Number(e.target.value);
                setZoom(minScale + (v / 100) * (maxScale - minScale));
              }}
              aria-label="Zoom"
              style={{ flex: '1 1 160px', accentColor: teal[600], cursor: 'pointer' }}
            />
            <button type="button" onClick={() => setZoom(transform.scale * 1.12)} aria-label="Zoom in" style={controlBtnStyle}>
              <ZoomIn size={15} />
            </button>
            <button type="button" onClick={resetTransform} style={{ ...controlBtnStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RotateCcw size={13} /> Reset
            </button>
            <span style={{ fontSize: 10.5, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
              {Math.round(transform.scale * 100)}%
            </span>
          </div>

          {/* Output info + preview + actions */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, padding: '14px 22px 18px', borderTop: `1px solid ${hairline}`, background: '#faf9f6', flexWrap: 'wrap' }}>
            <div style={{ width: 320, maxWidth: '100%' }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: teal[700], marginBottom: 5 }}>
                Final banner (4:1) — preview
              </div>
              <div style={{ aspectRatio: '4 / 1', borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#0d1420', boxShadow: '0 4px 12px -4px rgba(0,0,0,.3)' }}>
                {win.w > 0 && windowSize.w > 0 && (
                  <img
                    src={image.src}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: imgLeft * previewK, top: imgTop * previewK,
                      width: imgDisplayW * previewK, height: imgDisplayH * previewK,
                      maxWidth: 'none',
                    }}
                  />
                )}
              </div>
              <div style={{ fontSize: 10, color: inkSoft, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {BANNER_SPEC.recommendedWidth} × {BANNER_SPEC.recommendedHeight} px &middot; WebP
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, fontSize: 11, color: inkSoft, lineHeight: 1.5 }}>
                Output: <b style={{ color: ink }}>{BANNER_SPEC.recommendedWidth} × {BANNER_SPEC.recommendedHeight} px</b>, exactly 4:1 &middot; optimized WebP &middot; ready for the portal banner area.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
              <button type="button" onClick={onCancel} style={{
                padding: '10px 18px', borderRadius: 10, border: `1.4px solid ${hairline}`,
                fontWeight: 600, fontSize: 13, color: ink, background: 'transparent', cursor: 'pointer', lineHeight: 1.4,
              }}>
                Cancel
              </button>
              <button type="button" onClick={handleConfirm} disabled={busy} style={{
                padding: '10px 20px', borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
                background: `linear-gradient(135deg, ${teal[500]}, ${teal[700]})`, color: '#fff',
                fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.4,
                boxShadow: '0 8px 20px -8px rgba(15,84,76,.55)',
              }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {busy ? 'Preparing…' : 'Crop & Prepare'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const controlBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, border: `1.4px solid ${hairline}`,
  background: paper, color: inkSoft, cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

export default BannerCropModal;
