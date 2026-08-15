export const primeTeal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};

export const primeAmber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };

export const primeColors = {
  paper: '#FEFDFB',
  ink: '#23282A',
  inkSoft: '#5c6567',
  hairline: '#e4ddd1',
  danger: '#b5493f',
};

export const primeFonts = {
  heading: "'DM Serif Display','Georgia',serif",
  body: "'Inter',sans-serif",
  mono: "'JetBrains Mono',monospace",
};

export const primeInput: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter',sans-serif", fontSize: 13.5,
  color: primeColors.ink, background: primeColors.paper,
  border: `1.4px solid ${primeColors.hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

export const primeSelect: React.CSSProperties = {
  ...primeInput,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};

export const primeLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: primeTeal[800],
  marginBottom: 6, letterSpacing: 0.01
};

export const primeBtn: React.CSSProperties = {
  fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  border: '1.4px solid transparent',
  background: `linear-gradient(155deg, ${primeTeal[500]}, ${primeTeal[700]})`,
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
  transition: 'all .15s ease'
};

export const primeBtnSecondary: React.CSSProperties = {
  fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: primeColors.paper, border: `1.4px solid ${primeColors.hairline}`,
  color: primeColors.inkSoft, display: 'flex', alignItems: 'center', gap: 7,
  transition: 'all .15s ease'
};

export const primeSectionLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  margin: '26px 0 14px'
};
