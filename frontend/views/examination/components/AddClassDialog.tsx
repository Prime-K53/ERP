import React, { useState } from 'react';
import { X, BookOpen, ChevronRight } from 'lucide-react';
import { logger } from '@/services/logger';

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};
const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

interface AddClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { class_name: string; number_of_learners: number }) => Promise<void>;
}

export const AddClassDialog: React.FC<AddClassDialogProps> = ({ open, onOpenChange, onAdd }) => {
  const [className, setClassName] = useState('');
  const [learners, setLearners] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!className || !className.trim()) {
      setError('Class name is required');
      return;
    }
    if (!learners) {
      setError('Number of learners is required');
      return;
    }
    const learnersNum = parseInt(learners, 10);
    if (isNaN(learnersNum) || learnersNum <= 0) {
      setError('Number of learners must be a positive number');
      return;
    }
    setLoading(true);
    try {
      await onAdd({ class_name: className, number_of_learners: learnersNum });
      setClassName('');
      setLearners('');
      setError(null);
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to add class';
      setError(errorMsg);
      logger.error('Failed to add class:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }} onClick={() => onOpenChange(false)}>
      <div style={{
        width: 500, maxWidth: '100%', maxHeight: '92vh',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: `1px solid ${hairline}`, background: paper
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
            }}>
              <BookOpen size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>
                Add New Class
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                Create a new class for this examination batch
              </p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
          }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '24px 28px 8px', overflowY: 'auto' }}>
          <form id="add-class-form" onSubmit={handleSubmit}>
            {error && (
              <div style={{
                padding: 12, borderRadius: 9, marginBottom: 18,
                background: `${danger}10`, border: `1px solid ${danger}30`,
                color: danger, fontSize: 12
              }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>
                Class Name <span style={{ color: danger, fontWeight: 700 }}>*</span>
              </label>
              <input
                value={className}
                onChange={(e) => { setClassName(e.target.value); setError(null); }}
                placeholder="e.g., Form 1A"
                style={inputStyle}
                required
                disabled={loading}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>
                Number of Learners <span style={{ color: danger, fontWeight: 700 }}>*</span>
              </label>
              <input
                type="number"
                value={learners}
                onChange={(e) => { setLearners(e.target.value); setError(null); }}
                placeholder="0"
                required
                min="1"
                style={inputStyle}
                disabled={loading}
              />
            </div>
          </form>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '16px 28px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
          <button type="button" onClick={() => onOpenChange(false)} disabled={loading}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
              background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
              display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
            Cancel
          </button>
          <button type="submit" form="add-class-form" disabled={loading}
            style={{
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
              transition: 'all .15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}>
            {loading ? 'Adding...' : 'Add Class'}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
