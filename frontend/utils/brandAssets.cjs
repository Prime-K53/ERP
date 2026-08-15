/**
 * Brand Assets Utility (CJS Version)
 */

const COMPANY_LOGO_BASE64 = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjUwIiB2aWV3Qm94PSIwIDAgMjAwIDUwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjUwIiByeD0iOCIgZmlsbD0iIzI1NjNFRiIvPgo8cGF0aCBkPSJNMjUgMTVMNDAgMjVMMjUgMzVWMTVaIiBmaWxsPSJ3aGl0ZSIvPgo8dGV4dCB4PSI1MCIgeT0iMzIiIGZpbGw9IndoaXRlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIGZvbnQtd2VpZ2h0PSJib2xkIj5QUklNRSBFUlA8L3RleHQ+Cjwvc3ZnPg==`;

const DocumentStyles = {
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
    fontFamily: "'Inter', 'Segoe UI', Helvetica, Arial, sans-serif"
  },
  layout: {
    logoHeight: '12mm',
    narrowMargin: '12.7mm',
    headerPadding: '1rem',
    sectionGap: '1.5rem'
  }
};

module.exports = { COMPANY_LOGO_BASE64, DocumentStyles };
