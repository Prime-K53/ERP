import React, { useState } from 'react';
import { X, History, ChevronDown, ChevronUp } from 'lucide-react';
import { DocumentVersionRecord } from '../../../services/portalApiClient';
import { formatK } from '../constants';

interface Props {
  open: boolean;
  onClose: () => void;
  versions: DocumentVersionRecord[];
  loading: boolean;
}

const VersionHistoryModal: React.FC<Props> = ({ open, onClose, versions, loading }) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History size={16} className="text-slate-500" /> Revision History
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-400">Loading versions...</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-slate-400">No revision history for this document.</p>
          ) : (
            <div className="space-y-3">
              {[...versions].reverse().map((version, index) => {
                const isExpanded = expanded === version.version;
                const isCurrent = index === 0;
                return (
                  <div key={version.id} className={`border rounded-xl overflow-hidden ${isCurrent ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200/70'}`}>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : version.version)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-white text-xs font-bold shrink-0">
                          V{version.version}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">
                            Version {version.version}
                            {isCurrent && <span className="ml-2 text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Current</span>}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {version.reason || 'Document version'} • {new Date(version.created_at).toLocaleString()}
                            {version.created_by_name ? ` • by ${version.created_by_name}` : ''}
                          </p>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4">
                        <div className="rounded-xl bg-white border border-slate-200/60 overflow-hidden">
                          <table className="w-full text-left text-[12px]">
                            <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                <th className="px-3 py-2 font-bold text-[10px] uppercase tracking-wider">Item</th>
                                <th className="px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-right">Qty</th>
                                <th className="px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-right">Unit Price</th>
                                <th className="px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(version.snapshot.items || []).map((item, i) => (
                                <tr key={i} className="text-slate-700">
                                  <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                                  <td className="px-3 py-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(item.unitPrice || 0)}</td>
                                  <td className="px-3 py-2 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(item.lineTotal ?? item.quantity * item.unitPrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="px-3 py-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                            <div className="flex justify-between"><span>Subtotal</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(version.snapshot.subtotal || 0)}</span></div>
{Number(version.snapshot.discount || 0) > 0 && (
  <div className="flex justify-between"><span>Discount</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>- {formatK(version.snapshot.discount)}</span></div>
)}
{Number(version.snapshot.taxAmount || 0) > 0 && (
  <div className="flex justify-between"><span>Tax</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(version.snapshot.taxAmount)}</span></div>
)}
                            <div className="flex justify-between font-bold text-slate-800"><span>Total</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatK(version.snapshot.total || 0)}</span></div>
                            {version.snapshot.validUntil && (
                              <div className="flex justify-between"><span>Valid until</span><span>{new Date(version.snapshot.validUntil).toLocaleDateString()}</span></div>
                            )}
                            {version.snapshot.paymentTerms && (
                              <div className="flex justify-between"><span>Payment terms</span><span>{version.snapshot.paymentTerms}</span></div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryModal;
