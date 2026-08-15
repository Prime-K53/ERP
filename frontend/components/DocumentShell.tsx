import React from 'react';
import { COMPANY_LOGO_BASE64, DocumentStyles } from '../utils/brandAssets';
import { OfflineImage } from './OfflineImage';

interface DocumentShellProps {
  children: React.ReactNode;
  title: string;
  legalInfo?: string;
  bankDetails?: React.ReactNode;
  terms?: string;
  companyAddress?: string;
  companyLogo?: string;
  companyName?: string;
  logoPosition?: 'left' | 'right' | 'center';
}

/**
 * DocumentShell Component
 * Implements the repeating header/footer pattern for multi-page PDF generation.
 * Uses table-header-group and table-footer-group for Puppeteer/Chrome print compatibility.
 */
const DocumentShell: React.FC<DocumentShellProps> = ({
  children,
  title,
  legalInfo = 'Prime ERP Systems Ltd | Registered in UK #9876543',
  bankDetails,
  terms = 'Standard Payment Terms: Net 30 days. Please include document ID in bank transfers.',
  companyAddress,
  companyLogo,
  companyName = 'Prime ERP System',
  logoPosition = 'left'
}) => {
  const logoSrc = companyLogo || COMPANY_LOGO_BASE64;

  const renderLogo = (isCenter = false) => (
    <OfflineImage
      src={logoSrc}
      alt="Logo"
      className="object-contain"
      style={{ height: DocumentStyles.layout.logoHeight }}
      fallback={
        <div style={{ height: DocumentStyles.layout.logoHeight, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#2563eb' }}>{companyName}</span>
        </div>
      }
    />
  );

  return (
    <div className="document-shell">
      <table className="print-table">
        <thead className="display-table-header-group">
          <tr>
            <td>
              <div className="header-spacer" />
            </td>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>
              <div className="main-content">
                {children}
              </div>
            </td>
          </tr>
        </tbody>

        <tfoot className="display-table-footer-group">
          <tr>
            <td>
              <div className="footer-spacer" />
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Actual Fixed Header */}
      <header className="fixed-header">
        <div className={`flex w-full ${logoPosition === 'center' ? 'flex-col items-center gap-4' : 'justify-between items-start'}`}>
          {logoPosition === 'left' && (
            <div className="flex items-center gap-4">
              {renderLogo()}
              <div className="h-8 w-[1px] bg-slate-200" />
              <div>
                <h1 className="text-xl font-black tracking-tighter text-blue-600 leading-none">
                  {title}
                </h1>
                <p className="text-[8px] text-slate-400 font-medium mt-1 uppercase tracking-widest">
                  {legalInfo}
                </p>
              </div>
            </div>
          )}

          {logoPosition === 'right' && (
            <>
              <div>
                <h1 className="text-xl font-black tracking-tighter text-blue-600 leading-none">
                  {title}
                </h1>
                <p className="text-[8px] text-slate-400 font-medium mt-1 uppercase tracking-widest">
                  {legalInfo}
                </p>
              </div>
              {renderLogo()}
            </>
          )}

          {logoPosition === 'center' && (
            <>
              {renderLogo()}
              <div className="text-center">
                <h1 className="text-xl font-black tracking-tighter text-blue-600 leading-none">
                  {title}
                </h1>
                <p className="text-[8px] text-slate-400 font-medium mt-1 uppercase tracking-widest">
                  {legalInfo}
                </p>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Actual Fixed Footer */}
      <footer className="fixed-footer">
        <div className="border-t border-slate-200 pt-2 flex justify-between items-end gap-6">
          <div className="space-y-1">
            <div className="text-[8px] text-slate-500 max-w-[400px]">
              <p className="font-bold uppercase text-slate-400 mb-0.5">Terms & Conditions</p>
              <p>{terms}</p>
            </div>
            {companyAddress && (
              <div className="text-[8px] text-slate-500">
                <p className="font-bold uppercase text-slate-400 mb-0.5">Company Address</p>
                <p>{companyAddress}</p>
              </div>
            )}
            {bankDetails && (
              <div className="text-[8px] text-slate-500">
                <p className="font-bold uppercase text-slate-400 mb-0.5">Bank Details</p>
                {bankDetails}
              </div>
            )}
          </div>
          <div className="text-right text-[9px] text-slate-400">
            <p className="font-bold text-slate-600 uppercase">{companyName}</p>
            <p className="page-number-display">Page <span className="pageNumber" /> of <span className="totalPages" /></p>
          </div>
        </div>
      </footer>

      <style>{`
        .document-shell {
          width: 100%;
        }

        .print-table {
          width: 100%;
          border-collapse: collapse;
        }

        /* Fixed Header & Footer styles */
        .fixed-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 60px; /* Adjust as needed */
          z-index: 100;
          background: white;
          padding-bottom: 10px;
        }

        .fixed-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 80px; /* Adjust as needed */
          z-index: 100;
          background: white;
          padding-top: 10px;
        }

        /* Spacers to prevent content overlap */
        .header-spacer {
          height: 70px;
        }

        .footer-spacer {
          height: 90px;
        }

        .display-table-header-group {
          display: table-header-group;
        }

        .display-table-footer-group {
          display: table-footer-group;
        }

        @media screen {
          .fixed-header, .fixed-footer {
            position: relative;
            height: auto;
          }
          .header-spacer, .footer-spacer {
            display: none;
          }
        }

        @media print {
          .fixed-header {
            position: fixed;
            top: 0;
          }
          .fixed-footer {
            position: fixed;
            bottom: 0;
          }
          /* Hide default page numbers if needed */
          @page {
            margin: 12.7mm;
          }
        }
      `}</style>
    </div>
  );
};

export default DocumentShell;
