import React from 'react';
import { Clock, RotateCcw, Download, Eye, GitBranch, User } from 'lucide-react';

interface DocumentVersion {
  id: string;
  version: number;
  createdAt: string;
  createdBy: string;
  size: number;
  changes: string;
  hash: string;
}

interface DocumentVersionHistoryProps {
  documentId: string;
  documentName: string;
}

const DocumentVersionHistory: React.FC<DocumentVersionHistoryProps> = ({ documentId, documentName }) => {
  const versions: DocumentVersion[] = [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-indigo-50 rounded-lg"><GitBranch size={16} className="text-indigo-600" /></div>
        <div><h3 className="font-bold text-slate-900">Version History</h3><p className="text-xs text-slate-400">{documentName}</p></div>
      </div>
      {versions.length === 0 ? (
        <div className="text-center py-8 text-slate-400"><Clock size={32} className="mx-auto mb-2 text-slate-300" /><p className="text-sm">No version history yet. Each save creates a new version.</p></div>
      ) : (
        <div className="space-y-2">
          {versions.map(v => (
            <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">v{v.version}</div>
                <div><p className="text-sm font-medium text-slate-800">{v.changes || 'No description'}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-2"><User size={10} /> {v.createdBy} • {new Date(v.createdAt).toLocaleString()}</p></div>
              </div>
              <div className="flex gap-1">
                <button className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100"><Eye size={14} /></button>
                <button className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100"><RotateCcw size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentVersionHistory;
