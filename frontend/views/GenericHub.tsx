import React from 'react';
import { useNavigate } from 'react-router-dom';

interface HubOption {
  label: string;
  description: string;
  path?: string;
  onClick?: () => void;
  icon:
    | React.ComponentType<{ size?: number; color?: string }>
    | React.ReactElement<{ size?: number; color?: string }>;
}

interface GenericHubProps {
  title: string;
  subtitle: string;
  options: HubOption[];
  accentColor?: string;
  extraContent?: React.ReactNode;
}

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

const GenericHub: React.FC<GenericHubProps> = ({ title, subtitle, options, accentColor = '#2eb12e', extraContent }) => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: paper, padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", color: ink
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        overflow: 'hidden', maxWidth: 1200, width: '100%', margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center', marginBottom: 36, animation: 'fadeInUp 0.6s ease-out',
          flexShrink: 0
        }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
            fontSize: 36, margin: '0 0 8px', letterSpacing: 0.2,
            background: 'linear-gradient(160deg, #0f544c, #3fa294)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {title} <span style={{ background: 'linear-gradient(160deg, #0f544c, #d99a3f)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Command</span>
          </h1>
          <p style={{
            margin: 0, fontSize: 13.5, color: inkSoft, fontWeight: 500,
            lineHeight: 1.5, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto'
          }}>
            {subtitle}
          </p>
        </div>

      <div style={{
        width: '100%',
        maxWidth: 1200,
        padding: '32px 24px'
      }}>
        {/* Navigation Grid */}
        <div style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16
        }}>
          {options.map((option, index) => (
            <button
              key={option.label}
              onClick={() => {
                if (option.onClick) {
                  option.onClick();
                } else if (option.path) {
                  navigate(option.path);
                }
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                padding: '24px 20px',
                background: paper,
                borderRadius: 14,
                border: '1px solid ' + hairline,
                boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                cursor: 'pointer',
                transition: 'all .2s ease',
                textAlign: 'center',
                width: '100%',
                position: 'relative',
                animation: `fadeInUp 0.5s ease-out ${index * 0.05}s both`
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = teal[200];
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(31,133,119,.08)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = hairline;
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(155deg, ' + teal[500] + ', ' + teal[700] + ')',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)',
                flexShrink: 0
              }}>
                {React.isValidElement(option.icon)
                  ? React.cloneElement(option.icon, { size: 22, color: '#fff' })
                  : React.createElement(option.icon as React.ComponentType, { size: 22, color: '#fff' })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: teal[800],
                  margin: 0,
                  letterSpacing: 0.01
                }}>
                  {option.label}
                </h3>
                <p style={{
                  fontSize: '11px',
                  color: inkSoft,
                  lineHeight: 1.5,
                  margin: 0
                }}>
                  {option.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Extra content */}
        {extraContent && (
          <div style={{
            marginTop: 28, width: '100%', maxWidth: 960,
            animation: 'fadeInUp 0.5s ease-out 0.3s both'
          }}>
            {extraContent}
          </div>
        )}
      </div>
    </div>

    {/* Footer */}
    <div style={{
      marginTop: 32, display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 14, flexShrink: 0
    }}>
      <div style={{ width: 40, height: 1, background: hairline }} />
      <span style={{
        fontSize: 9, fontWeight: 800, color: inkSoft,
        textTransform: 'uppercase', letterSpacing: 0.3
      }}>
        Operational Neural Link
      </span>
      <div style={{ width: 40, height: 1, background: hairline }} />
    </div>
  </div>
  );
};

export default GenericHub;
