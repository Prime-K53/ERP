/**
 * Brand Assets Utility
 * Provides high-resolution Base64 assets and global document styles 
 * for offline-first ERP document generation.
 */

// Use a tiny PNG placeholder instead of SVG because the PDF/image preview stack
// rejects the inline SVG data URI as an invalid base64 image in desktop preview mode.
export const COMPANY_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s6lGtQAAAAASUVORK5CYII=';

export const DocumentStyles = {
  colors: {
    primary: '#2563EB',
    secondary: '#64748B',
    accent: '#F59E0B',
    border: '#E2E8F0',
    text: '#1E293B',
    muted: '#94A3B8'
  },
  typography: {
    headerSize: '24pt',
    bodySize: '11pt',
    footerSize: '8pt',
    fontFamily: "'Lato', 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif"
  },
  layout: {
    logoHeight: '12mm',
    narrowMargin: '12.7mm',
    headerPadding: '1rem',
    sectionGap: '1.5rem'
  }
};
