import React from 'react';
import { Paperclip, File, FileImage, FileText, Download, Eye } from 'lucide-react';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: any;
}

const getFileIcon = (mime?: string) => {
  if (!mime) return <File size={20} style={{ color: inkSoft }} />;
  if (mime.startsWith('image/')) return <FileImage size={20} style={{ color: '#8b5cf6' }} />;
  if (mime.includes('pdf')) return <FileText size={20} style={{ color: danger }} />;
  return <File size={20} style={{ color: t[500] }} />;
};

export const AttachmentsTab: React.FC<Props> = ({ item }) => {
  const attachments: { id?: string; name?: string; url?: string; type?: string; size?: number; uploadedAt?: string }[] = item.attachments || [];

  if (attachments.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: inkSoft }}>
        <Paperclip size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>No Attachments</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>No files have been attached to this item.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {attachments.map((att, i) => (
          <div key={att.id || i} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all .15s' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ padding: 10, background: t[50], borderRadius: 12 }}>{getFileIcon(att.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name || `Attachment ${i + 1}`}</p>
                <p style={{ fontSize: 12, color: inkSoft, marginTop: 2 }}>
                  {att.type || 'Unknown type'}
                  {att.size ? ` · ${(att.size / 1024).toFixed(1)} KB` : ''}
                  {att.uploadedAt ? ` · ${new Date(att.uploadedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>
            {att.url && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1.4px solid ${hairline}` }}>
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="prime-btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: t[50], color: t[600], border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', transition: 'background .15s' }}>
                  <Eye size={12} /> View
                </a>
                <a href={att.url} download className="prime-btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: t[50], color: inkSoft, border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', transition: 'background .15s' }}>
                  <Download size={12} /> Download
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};