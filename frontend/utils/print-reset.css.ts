/**
 * ERP Identity Print Reset
 * Centralized styles that "lock" the visual language across all document types.
 * Optimized for Puppeteer rendering consistency.
 */
export const PRINT_RESET_CSS = `
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
}

/* Ensure borders are visible and consistent in PDFs */
.border, 
.border-t, 
.border-b, 
.border-l, 
.border-r,
[class*='border-'] {
  border-width: 1pt !important; /* Minimum 1pt for PDF clarity */
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
  
  /* Print-specific resets */
@media print {
  @page {
    margin: 0;
    size: A4;
  }
  
  .master-document {
    width: 210mm;
    height: 297mm;
    page-break-after: always;
  }

  .break-inside-avoid {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
}
`;
