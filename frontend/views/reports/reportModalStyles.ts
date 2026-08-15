import { FileText, Settings2, SlidersHorizontal, Trash2, Play, Save } from 'lucide-react';

export const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
export const amber = { 100: '#fbead0', 500: '#d99a3f' };
export const paper = '#FEFDFB';
export const ink = '#23282A';
export const inkSoft = '#5c6567';
export const hairline = '#e4ddd1';
export const danger = '#b5493f';

export const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
  padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
};

export const modalCard: React.CSSProperties = {
  width: 560, maxWidth: '100%', maxHeight: '92vh',
  background: paper, borderRadius: 14,
  boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
};

export const accentBar: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 4,
  background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`,
};

export const modalHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '22px 28px 18px', borderBottom: `1px solid ${hairline}`, background: paper,
};

export const iconBox: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 10,
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0,
};

export const modalTitle: React.CSSProperties = {
  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
  fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2,
};

export const modalSubtitle: React.CSSProperties = {
  margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02,
};

export const closeBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: `1px solid ${hairline}`, background: paper, color: inkSoft,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', transition: 'all .15s ease', fontSize: 16,
};

export const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01,
};

export const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease',
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer',
};

export const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease',
};

export const tealBtn: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
  transition: 'all .15s ease',
};

export const modalBody: React.CSSProperties = {
  padding: '24px 28px 8px', overflowY: 'auto', flex: 1,
};

export const modalFooter: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
  gap: 10, padding: '16px 28px',
  borderTop: `1px solid ${hairline}`, background: paper,
};

export const sectionTitle: React.CSSProperties = {
  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
  fontSize: 18, margin: '0 0 4px', color: teal[800], letterSpacing: 0.2,
};

export const sectionSubtitle: React.CSSProperties = {
  margin: '0 0 18px', fontSize: 12, color: inkSoft, letterSpacing: 0.02,
};

export const formGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18,
};

export const emptyStateIcon: React.CSSProperties = {
  width: 48, height: 48, borderRadius: '50%', background: teal[50], display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
};

export const iconMap: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  column: Settings2,
  filter: SlidersHorizontal,
  delete: Trash2,
  run: Play,
  save: Save,
  file: FileText,
};
