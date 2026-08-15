import React from 'react';
import { X, FileText, Download } from 'lucide-react';
import { portalTheme } from '../constants';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onDownload?: () => void;
  downloading?: boolean;
}

const DocumentPreviewModal: React.FC<Props> = ({ open, onClose, title, children, onDownload, downloading }) => {
  if (!open) return null;

  return (
    <div
      className="doc-preview-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="doc-preview-panel" role="dialog" aria-modal="true" aria-labelledby="doc-preview-title">
        <div className="doc-preview-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `linear-gradient(155deg, ${portalTheme.teal[500]}, ${portalTheme.teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 10px -3px rgba(15,84,76,.6)',
            }}>
              <FileText size={16} color="#fff" />
            </div>
            <h2 id="doc-preview-title" style={{ fontSize: 15, fontWeight: 700, color: portalTheme.ink, margin: 0 }}>
              {title}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onDownload && (
              <button
                onClick={onDownload}
                disabled={downloading}
                style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  border: '1.4px solid #e4ddd1', background: portalTheme.paper,
                  color: portalTheme.teal[600], fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                  opacity: downloading ? 0.6 : 1,
                }}
              >
                {downloading ? 'Generating...' : <><Download size={13} /> Download</>}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 6, borderRadius: 8, color: portalTheme.inkSoft,
                display: 'flex', alignItems: 'center',
              }}
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="doc-preview-body">
          {children}
        </div>
      </div>
    </div>
  );
};

export default DocumentPreviewModal;
