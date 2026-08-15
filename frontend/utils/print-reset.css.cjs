/**
 * ERP Identity Print Reset (CJS Version)
 * Centralized styles that "lock" the visual language across all document types.
 * Optimized for Puppeteer rendering consistency.
 */
const PRINT_RESET_CSS = `
:root {
  --erp-primary-color: #2563EB;
  --erp-text-main: #1E293B;
  --erp-border-color: #E2E8F0;
  --erp-muted-color: #94A3B8;
  --erp-base-font-size: 10pt;
}

* {
  box-sizing: border-box !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

html, body {
  margin: 0;
  padding: 0;
  font-size: var(--erp-base-font-size);
  color: var(--erp-text-main);
  line-height: 1.4;
  font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
}

/* Ensure borders are visible and consistent in PDFs */
.border, 
.border-t, 
.border-b, 
.border-l, 
.border-r,
[class*='border-'] {
  border-width: 1pt !important;
  border-style: solid;
  border-color: var(--erp-border-color);
}

/* Data Density Optimization */
.text-[10px] { font-size: 8pt !important; }
.text-xs { font-size: 8pt !important; }
.text-sm { font-size: 9pt !important; }
.text-base { font-size: 10pt !important; }
.text-lg { font-size: 12pt !important; }

/* Text Wrapping and Overflow Protection */
.text-wrap-safe {
  word-break: break-word !important;
  overflow-wrap: break-word !important;
  white-space: normal !important;
  max-width: 100%;
  min-width: 0;
}

/* Table Specifics */
table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  background-color: #f8fafc;
  color: #64748b;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 8pt;
  padding: 8pt 12pt;
  border-bottom: 2pt solid #e2e8f0;
}

td {
  padding: 8pt 12pt;
  border-bottom: 1pt solid #f1f5f9;
  font-size: 9pt;
}

.text-right { text-align: right; }
.text-center { text-align: center; }
.font-bold { font-weight: 700; }
.font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

/* Document Shell Specifics */
.document-shell {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  position: relative;
}

.print-table {
  width: 100%;
}

.header-spacer { height: 40mm; }
.footer-spacer { height: 30mm; }

.fixed-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 35mm;
  padding: 12.7mm;
  background: white;
  z-index: 1000;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.fixed-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 25mm;
  padding: 0 12.7mm 12.7mm 12.7mm;
  background: white;
  z-index: 1000;
}

@media print {
  @page {
    margin: 0;
    size: A4;
  }
  
  .fixed-header, .fixed-footer {
    position: fixed;
  }
}
`;

module.exports = { PRINT_RESET_CSS };
