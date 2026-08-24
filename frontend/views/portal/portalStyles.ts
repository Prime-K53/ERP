import React from 'react';

export const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export const portalStyles = {
  root: {
    fontFamily: F,
    fontSize: 13,
    lineHeight: 1.4,
    color: '#2D3748',
  } as React.CSSProperties,

  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 10,
    border: '1px solid #E9EDF3',
  } as React.CSSProperties,

  cardNoPad: {
    background: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    border: '1px solid #E9EDF3',
    overflow: 'hidden' as const,
  } as React.CSSProperties,

  sectionHeader: {
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
    color: '#1A202C',
  } as React.CSSProperties,

  sectionRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '10px 14px 6px',
  } as React.CSSProperties,

  linkBtn: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 2,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    color: '#008A4C',
    padding: '4px 0',
  } as React.CSSProperties,

  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    padding: '8px 14px',
    borderTop: '1px solid #F3F4F6',
  } as React.CSSProperties,

  iconCircle: (bg: string, c: string) => ({
    width: 28,
    height: 28,
    borderRadius: 7,
    background: bg,
    color: c,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    marginRight: 10,
  } as React.CSSProperties),

  iconSquare: (bg: string, c: string) => ({
    width: 34,
    height: 34,
    borderRadius: 10,
    background: bg,
    color: c,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    marginRight: 10,
  } as React.CSSProperties),

  bodyText: {
    fontSize: 13,
    fontWeight: 500 as const,
    color: '#4A5568',
  } as React.CSSProperties,

  labelText: {
    fontSize: 10.5,
    fontWeight: 600 as const,
    color: '#8A94A6',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
    lineHeight: 1.2,
  } as React.CSSProperties,

  valueText: {
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#718096',
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
  } as React.CSSProperties,

  mutedText: {
    fontSize: 10.5,
    color: '#8A94A6',
  } as React.CSSProperties,

  heading: {
    fontSize: 16,
    fontWeight: 600 as const,
    color: '#1A202C',
    lineHeight: 1.3,
  } as React.CSSProperties,

  subheading: {
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#1A202C',
    lineHeight: 1.3,
  } as React.CSSProperties,

  badge: (bg: string, c: string) => ({
    fontSize: 10,
    fontWeight: 600 as const,
    color: c,
    background: bg,
    padding: '3px 8px',
    borderRadius: 6,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    lineHeight: 1.3,
  } as React.CSSProperties),

  chevron: {
    width: 12,
    height: 12,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: '#CBD5E0',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  } as React.SVGProps<SVGSVGElement>,

  tab: (active: boolean) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '8px 14px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: F,
    fontSize: 13,
    fontWeight: 600 as const,
    background: active ? '#ECFDF5' : 'transparent',
    color: active ? '#0D5047' : '#718096',
    transition: 'all .15s ease',
    lineHeight: 1.4,
  } as React.CSSProperties),

  input: {
    fontFamily: F,
    fontSize: 13,
    padding: '8px 12px',
    border: '1px solid #E9EDF3',
    borderRadius: 10,
    background: '#fff',
    color: '#1A202C',
    outline: 'none',
    width: '100%',
    lineHeight: 1.4,
  } as React.CSSProperties,

  select: {
    fontFamily: F,
    fontSize: 13,
    padding: '8px 32px 8px 12px',
    border: '1px solid #E9EDF3',
    borderRadius: 10,
    background: '#fff',
    color: '#1A202C',
    outline: 'none',
    cursor: 'pointer',
    lineHeight: 1.4,
  } as React.CSSProperties,

  btn: {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600 as const,
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    lineHeight: 1.4,
  } as React.CSSProperties,

  btnPrimary: {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600 as const,
    border: 'none',
    cursor: 'pointer',
    background: '#008A4C',
    color: '#fff',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    lineHeight: 1.4,
  } as React.CSSProperties,

  btnGhost: {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600 as const,
    border: '1px solid #E9EDF3',
    cursor: 'pointer',
    background: '#fff',
    color: '#4A5568',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    lineHeight: 1.4,
  } as React.CSSProperties,

  emptyState: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #E9EDF3',
    padding: '40px 20px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: '#ECFDF5',
    color: '#008A4C',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    margin: '0 auto 12px',
  } as React.CSSProperties,

  errorBanner: {
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    color: '#B91C1C',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 12.5,
    marginBottom: 10,
    lineHeight: 1.4,
  } as React.CSSProperties,

  pagination: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  } as React.CSSProperties,

  pageBtn: (active: boolean) => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    border: active ? 'none' : '1px solid #E9EDF3',
    background: active ? '#008A4C' : '#fff',
    color: active ? '#fff' : '#4A5568',
    fontSize: 12,
    fontWeight: 600 as const,
    cursor: 'pointer',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    lineHeight: 1.4,
  } as React.CSSProperties),

  pageNavBtn: {
    flex: 1,
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid #E9EDF3',
    background: '#fff',
    fontSize: 12,
    fontWeight: 600 as const,
    color: '#4A5568',
    cursor: 'pointer',
    lineHeight: 1.4,
  } as React.CSSProperties,

  statusBar: (c: string) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '6px 10px',
    borderRadius: 6,
    background: c === '#008A4C' ? '#ECFDF5' : c === '#DD6B20' ? '#FFFAF0' : c === '#E53E3E' ? '#FFF5F5' : '#EBF8FF',
    color: c,
    fontSize: 10,
    fontWeight: 600 as const,
    lineHeight: 1.3,
  } as React.CSSProperties),
};
