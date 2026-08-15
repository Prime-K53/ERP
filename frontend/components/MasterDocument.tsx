import React from 'react';
import { COMPANY_LOGO_BASE64, DocumentStyles } from '../utils/brandAssets';
import { EMBEDDED_FONTS_CSS } from '../utils/embeddedFonts';
import { PRINT_RESET_CSS } from '../utils/print-reset.css';
import DocumentShell from './DocumentShell';

interface MasterDocumentProps {
  title: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  content: React.ReactNode;
  watermark?: string;
  debugMode?: boolean;
  companyLogo?: string;
  companyAddress?: string;
  companyName?: string;
  logoPosition?: 'left' | 'right' | 'center';
}

/**
 * MasterDocument Component
 * A standardized layout for A4 documents within the ERP system.
 * Features a 12.7mm (narrow) margin and dynamic header/footer/content areas.
 */
const MasterDocument: React.FC<MasterDocumentProps> = ({
  title,
  header,
  footer,
  content,
  watermark,
  debugMode = false,
  companyLogo,
  companyAddress,
  companyName,
  logoPosition
}) => {
  return (
    <DocumentShell
      title={title}
      companyLogo={companyLogo}
      companyAddress={companyAddress}
      companyName={companyName}
      logoPosition={logoPosition}
    >
      <div 
        className={`master-document flex flex-col min-h-full bg-white text-slate-900 relative overflow-hidden ${debugMode ? 'debug-mode' : ''}`}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          height: '100%'
        }}
      >
        {/* Watermark Overlay */}
        {watermark && (
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
            style={{
              opacity: watermark === 'CANCELLED' ? 0.18 : 0.1,
              transform: 'rotate(-35deg)',
              whiteSpace: 'nowrap'
            }}
          >
            <span className={`text-[100px] font-black tracking-widest border-[12px] ${watermark === 'CANCELLED' ? 'border-red-500 text-red-600' : 'border-slate-300 text-slate-400'} px-12 py-6 rounded-[40px] uppercase`}>
              {watermark}
            </span>
          </div>
        )}

        {/* Custom Header Section (Sub-header) */}
        {header && (
          <div className="mb-6 border-b border-slate-100 pb-4">
            {header}
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 mb-8 flex flex-col">
          {content}
        </main>

        {/* Custom Footer Section (Sub-footer) */}
        {footer && (
          <footer className="mt-auto pt-4 border-t border-slate-100">
            {footer}
          </footer>
        )}

        {/* Internal CSS for print consistency within this component scope */}
        <style>{`
          ${PRINT_RESET_CSS}
          ${EMBEDDED_FONTS_CSS}
          
          .master-document {
            font-family: ${DocumentStyles.typography.fontFamily};
            position: relative;
            color: var(--erp-text-main);
          }

          .master-document.debug-mode {
            overflow: visible !important;
          }

          .master-document.debug-mode::before {
            content: '';
            position: absolute;
            inset: 0;
            outline: 2px solid rgba(255, 0, 0, 0.5);
            outline-offset: -1px;
            pointer-events: none;
            z-index: 9999;
          }

          .master-document.debug-mode::after {
            content: 'DEBUG: 12.7mm MARGIN BOUNDARY (CONTENT AREA)';
            position: absolute;
            top: 2mm;
            left: 2mm;
            font-size: 8px;
            color: red;
            font-weight: bold;
            z-index: 9999;
          }

          .master-document.debug-mode *:hover {
            outline: 1px solid red !important;
          }

          /* Highlight elements that might cause horizontal overflow */
          .master-document.debug-mode * {
            position: relative;
          }
          
          .master-document.debug-mode *:not(svg):not(path) {
            outline: 1px solid rgba(255, 0, 0, 0.1);
          }

          .master-document.debug-mode .overflow-check,
          .master-document.debug-mode [data-overflow="true"] {
             outline: 2px solid red !important;
             background: rgba(255, 0, 0, 0.05);
          }
          
          .master-document table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
          }
          .master-document table th {
            background-color: #ffffff;
            text-align: left;
            padding: 8px;
            font-size: 9pt;
            text-transform: uppercase;
            color: var(--erp-muted-color);
            border-bottom: 2pt solid var(--erp-border-color);
          }
          .master-document table td {
            padding: 8px;
            border-bottom: 1pt solid var(--erp-border-color);
            font-size: 10pt;
            background-color: #ffffff;
          }
          @media print {
            .master-document {
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
            }
            p {
              widows: 3;
              orphans: 3;
            }
          }
        `}</style>
      </div>
    </DocumentShell>
  );
};

export default MasterDocument;
