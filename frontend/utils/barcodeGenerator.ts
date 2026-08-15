import JsBarcode from 'jsbarcode';

export interface BarcodeOptions {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  background?: string;
  lineColor?: string;
}

const defaultOptions: BarcodeOptions = {
  format: 'CODE128',
  width: 2,
  height: 60,
  displayValue: true,
  fontSize: 12,
  margin: 10,
  marginTop: 8,
  marginBottom: 8,
  background: '#ffffff',
  lineColor: '#000000',
};

export function generateBarcodeDataUrl(text: string, options?: BarcodeOptions): string {
  if (!text) return '';
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, text, { ...defaultOptions, ...options });
  return canvas.toDataURL('image/png');
}

export function saveBarcodeAsImage(text: string, filename?: string, options?: BarcodeOptions): void {
  const dataUrl = generateBarcodeDataUrl(text, options);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.download = filename || `barcode-${text}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadCanvasAsImage(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
