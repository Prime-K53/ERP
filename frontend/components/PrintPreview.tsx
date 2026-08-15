import React, { useEffect } from 'react';

type PrintPreviewProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export default function PrintPreview({ isOpen, onClose, title, children }: PrintPreviewProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="font-bold text-slate-800">{title || 'Print Preview'}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 text-xs font-bold uppercase tracking-wider bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 p-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
