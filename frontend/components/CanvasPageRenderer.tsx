import React, { useEffect, useRef } from 'react';
import { RenderPage, RenderNode, RenderText, RenderLine, RenderSecurity } from '../../contracts/RenderModel';

interface CanvasPageRendererProps {
  page: RenderPage;
  scale: number;
  security?: RenderSecurity;
  className?: string;
}

/**
 * CanvasPageRenderer converts a RenderPage object into physical pixels on a Canvas element.
 * It handles the conversion from mm to px based on the current scale.
 */
const CanvasPageRenderer: React.FC<CanvasPageRendererProps> = ({ page, scale, security, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Standard DPI for screen rendering (96 DPI is common, but we'll use a consistent ratio)
  // 1mm = ~3.78px at 96 DPI
  const MM_TO_PX = 3.7795275591;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Set canvas dimensions based on page size (mm) and scale
    const widthPx = page.width * MM_TO_PX * scale;
    const heightPx = page.height * MM_TO_PX * scale;
    
    // Support High DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = widthPx * dpr;
    canvas.height = heightPx * dpr;
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;
    
    ctx.scale(dpr * scale * MM_TO_PX, dpr * scale * MM_TO_PX);

    // 2. Clear background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);

    // 3. Render Watermark
    if (security?.watermark) {
      ctx.save();
      ctx.translate(page.width / 2, page.height / 2);
      ctx.rotate((security.watermark.angle * Math.PI) / 180);
      ctx.font = 'bold 20pt Inter, system-ui, sans-serif';
      ctx.fillStyle = `rgba(150, 150, 150, ${security.watermark.opacity})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(security.watermark.text, 0, 0);
      ctx.restore();
    }

    // 4. Render Elements
    page.elements.forEach((node: RenderNode) => {
      ctx.save();
      
      // Apply basic styles
      const style = node.style || {};
      ctx.fillStyle = style.color || '#000000';
      ctx.strokeStyle = style.color || '#000000';
      
      if (node.type === 'text') {
        const textNode = node as RenderText;
        const fontSize = style.fontSize || 10;
        const fontWeight = style.fontWeight || 'normal';
        const fontFamily = style.fontFamily || 'Inter, system-ui, sans-serif';
        
        ctx.font = `${fontWeight} ${fontSize}pt ${fontFamily}`;
        ctx.textBaseline = 'top';
        
        if (style.textAlign === 'center') {
          ctx.textAlign = 'center';
          ctx.fillText(textNode.content, textNode.box.x + textNode.box.width / 2, textNode.box.y);
        } else if (style.textAlign === 'right') {
          ctx.textAlign = 'right';
          ctx.fillText(textNode.content, textNode.box.x + textNode.box.width, textNode.box.y);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(textNode.content, textNode.box.x, textNode.box.y);
        }
      } else if (node.type === 'line') {
        const lineNode = node as RenderLine;
        ctx.lineWidth = lineNode.thickness;
        ctx.beginPath();
        ctx.moveTo(lineNode.box.x, lineNode.box.y);
        ctx.lineTo(lineNode.box.x + lineNode.box.width, lineNode.box.y + lineNode.box.height);
        ctx.stroke();
      } else if (node.type === 'rect') {
        if (style.backgroundColor) {
          ctx.fillStyle = style.backgroundColor;
          ctx.fillRect(node.box.x, node.box.y, node.box.width, node.box.height);
        }
        if (style.border) {
          ctx.lineWidth = style.border.width;
          ctx.strokeStyle = style.border.color;
          ctx.strokeRect(node.box.x, node.box.y, node.box.width, node.box.height);
        }
      }

      ctx.restore();
    });
  }, [page, scale]);

  return (
    <div className={`shadow-2xl bg-white mx-auto transition-transform duration-200 ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default CanvasPageRenderer;
