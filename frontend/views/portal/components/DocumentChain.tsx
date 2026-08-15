import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FileCheck2, ShoppingCart, CornerUpLeft, Loader2 } from 'lucide-react';
import { portalLifecycle, DocumentChainEntry } from '../../../services/portalApiClient';

interface Props {
  docType: 'request' | 'quotation' | 'order';
  docId: string;
}

const entryRoute = (entry: DocumentChainEntry) => {
  switch (entry.docType) {
    case 'request': return `/portal/requests/${entry.docId}`;
    case 'quotation': return `/portal/quotations/${entry.docId}`;
    case 'order': return `/portal/orders/${entry.docId}`;
  }
};

const entryIcon = (docType: DocumentChainEntry['docType']) => {
  switch (docType) {
    case 'request': return <FileText size={15} />;
    case 'quotation': return <FileCheck2 size={15} />;
    case 'order': return <ShoppingCart size={15} />;
  }
};

const DocumentChain: React.FC<Props> = ({ docType, docId }) => {
  const navigate = useNavigate();
  const [chain, setChain] = useState<DocumentChainEntry[]>([]);
  const [originOrder, setOriginOrder] = useState<DocumentChainEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await portalLifecycle.documentChain.get(docType, docId);
      setChain((result?.chain || []).filter((e) => e && e.docId));
      setOriginOrder(result?.originOrder || null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [docType, docId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="mb-6 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 size={14} className="animate-spin" /> Loading document chain…
      </div>
    );
  }

  if (failed || chain.length <= 1) return null;

  return (
    <div className="mb-6 bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 p-4">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Document Chain</p>
      <div className="flex items-center gap-2">
        {chain.map((entry, i) => {
          const isLast = i === chain.length - 1;
          const active = entry.docId === docId && entry.docType === docType;
          return (
            <React.Fragment key={`${entry.docType}-${entry.docId}`}>
              <button
                onClick={() => navigate(entryRoute(entry))}
                className={`group flex flex-col items-center flex-1 min-w-0 rounded-xl p-2.5 transition-all ${
                  active ? 'bg-teal-50 ring-1 ring-teal-200' : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-teal-100 group-hover:text-teal-700'
                  }`}
                >
                  {entryIcon(entry.docType)}
                </div>
                <span className={`mt-1.5 text-[10px] font-bold text-center truncate w-full ${active ? 'text-teal-700' : 'text-slate-700'}`}>
                  {entry.title}
                </span>
                <span className="text-[9px] font-mono text-slate-400 text-center truncate w-full">{entry.docNumber}</span>
                <span className="mt-1 inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-slate-100 text-slate-500">
                  {entry.status}
                </span>
              </button>
              {!isLast && <div className="h-px flex-1 max-w-6 bg-slate-200" />}
            </React.Fragment>
          );
        })}
      </div>
      {originOrder && (
        <button
          onClick={() => navigate(entryRoute(originOrder))}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-teal-700 transition-colors"
        >
          <CornerUpLeft size={13} /> Reorder of Order #{originOrder.docNumber}
        </button>
      )}
    </div>
  );
};

export default DocumentChain;
