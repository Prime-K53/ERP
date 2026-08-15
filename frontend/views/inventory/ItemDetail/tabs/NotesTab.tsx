import React, { useState } from 'react';
import { MessageSquare, Plus, Trash2, Send, User, Clock } from 'lucide-react';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

interface Props {
  item: any;
}

interface Note {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export const NotesTab: React.FC<Props> = ({ item }) => {
  const [notes, setNotes] = useState<Note[]>(item.notes || []);
  const [newNote, setNewNote] = useState('');

  const handleAdd = () => {
    if (!newNote.trim()) return;
    const note: Note = {
      id: Date.now().toString(),
      text: newNote.trim(),
      author: 'Current User',
      createdAt: new Date().toISOString(),
    };
    setNotes(prev => [note, ...prev]);
    setNewNote('');
  };

  const handleDelete = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const inputStyle: React.CSSProperties = {
    borderRadius: 9,
    border: `1.4px solid ${hairline}`,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    background: paper,
    color: ink,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: "'Inter','DM Sans',sans-serif",
    lineHeight: 1.4,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 672 }}>
      <div className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <textarea
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Add a note about this item..."
              rows={3}
              className="prime-input"
              style={{ ...inputStyle, resize: 'none', width: '100%' }}
            />
          </div>
          <button onClick={handleAdd} className="prime-btn"
            style={{ padding: '8px 16px', background: t[500], color: '#fff', border: 'none', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, height: 'fit-content', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background .15s' }}>
            <Send size={14} /> Add
          </button>
        </div>
      </div>

      {notes.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: inkSoft }}>
          <MessageSquare size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>No Notes</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>No internal notes have been added for this item.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.map((note) => (
          <div key={note.id} className="prime-card" style={{ background: paper, borderRadius: 12, border: `1.4px solid ${hairline}`, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all .15s' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, color: ink, whiteSpace: 'pre-wrap', lineHeight: 1.625 }}>{note.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 10, color: inkSoft }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><User size={10} /> {note.author}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} /> {new Date(note.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <button onClick={() => handleDelete(note.id)} className="prime-btn-secondary"
                style={{ padding: 6, color: inkSoft, background: 'none', border: 'none', borderRadius: 9, cursor: 'pointer', transition: 'all .15s', flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = danger; e.currentTarget.style.background = '#fef2f2'; }}
                onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.background = 'transparent'; }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};