import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { portalLifecycle, DocumentCommentRecord } from '../../../services/portalApiClient';
import ErrorBanner from './ErrorBanner';

interface Props {
  docType: 'request' | 'quotation' | 'order';
  docId: string;
}

const DocumentDiscussion: React.FC<Props> = ({ docType, docId }) => {
  const [comments, setComments] = useState<DocumentCommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await portalLifecycle.comments.list(docType, docId);
      setComments(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load discussion');
    } finally {
      setLoading(false);
    }
  }, [docType, docId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      unsubscribe = await portalLifecycle.subscribe({
        onEvent: (type, payload) => {
          if (type === 'entity_changed' && payload.docType === docType && payload.docId === docId && payload.event === 'comment') load();
        },
      });

    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [docType, docId, load]);

  const post = async () => {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      const data = await portalLifecycle.comments.add(docType, docId, text);
      setComments(data || []);
      setBody('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/60 p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <MessageSquare size={15} className="text-slate-400" /> Discussion
      </h2>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 size={13} className="animate-spin" /> Loading messages...
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-400 mb-4">No messages yet. Ask a question about this document.</p>
      ) : (
        <div className="space-y-3 mb-4 max-h-72 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <div key={comment.id} className={`flex ${comment.author_type === 'customer' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  comment.author_type === 'customer'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">{comment.body}</p>
                <p className={`mt-1 text-[10px] ${comment.author_type === 'customer' ? 'text-emerald-100' : 'text-slate-400'}`}>
                  {comment.author_name || (comment.author_type === 'customer' ? 'You' : 'Prime Team')} •{' '}
                  {new Date(comment.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Write a message for our team..."
          className="flex-1 px-3 py-2.5 bg-white/70 backdrop-blur-xl border border-white/60 rounded-2xl text-sm text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
        />
        <button
          onClick={post}
          disabled={!body.trim() || posting}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all"
        >
          {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
};

export default DocumentDiscussion;
