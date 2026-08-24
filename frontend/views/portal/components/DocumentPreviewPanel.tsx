import React, { useEffect, useRef } from 'react';
import { Download, Share2, Printer, Mail, MessageCircle, History, X, ChevronLeft } from 'lucide-react';

interface DocumentPreviewPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  docNumber: string;
  status: string;
  amount?: string;
  children?: React.ReactNode;
}

const DocumentPreviewPanel: React.FC<DocumentPreviewPanelProps> = ({
  open, onClose, title, docNumber, status, amount, children
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 bottom-0 w-full max-w-2xl glass-modal shadow-2xl flex flex-col outline-none"
        style={{ animation: 'slideInRight .25s cubic-bezier(.4,0,.2,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Close preview">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500">{docNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-200/60 overflow-x-auto">
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all whitespace-nowrap">
            <Download.size size={14} /> Download
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all whitespace-nowrap">
            <Share2.size size={14} /> Share
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all whitespace-nowrap">
            <Printer.size size={14} /> Print
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all whitespace-nowrap">
            <Mail.size size={14} /> Email
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all whitespace-nowrap">
            <MessageCircle.size size={14} /> WhatsApp
          </button>
          <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all whitespace-nowrap">
            <History.size size={14} /> History
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start justify-between mb-8">
              <div>
                <div className="text-2xl font-bold text-slate-900">{amount || 'K 0.00'}</div>
                <div className="text-xs text-slate-500 mt-1">Status: {status}</div>
              </div>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1f8577, #0f544c)', boxShadow: '0 4px 14px -4px rgba(15,84,76,.4)' }}>
                <FileText size={24} color="white" />
              </div>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentPreviewPanel;
