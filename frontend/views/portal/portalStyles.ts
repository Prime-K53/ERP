import React from 'react';

export const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export const portalStyles = {
  root: {
    fontFamily: F,
    fontSize: 13,
    lineHeight: 1.4,
    color: '#1E293B',
  } as React.CSSProperties,

  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 10,
    border: '1px solid #E2E8F0',
    boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
  } as React.CSSProperties,

  cardNoPad: {
    background: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    border: '1px solid #E2E8F0',
    overflow: 'hidden' as const,
    boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
  } as React.CSSProperties,

  sectionHeader: {
    fontSize: 14,
    fontWeight: 600,
    margin: 0,
    color: '#0F2C59',
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
    color: '#059669',
    padding: '4px 0',
  } as React.CSSProperties,

  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    padding: '8px 14px',
    borderTop: '1px solid #F1F5F9',
  } as React.CSSProperties,

  iconCircle: (bg: string, c: string) => ({
    width: 28,
    height: 28,
    borderRadius: 8,
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
    color: '#334155',
  } as React.CSSProperties,

  labelText: {
    fontSize: 10.5,
    fontWeight: 600 as const,
    color: '#64748B',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
    lineHeight: 1.2,
  } as React.CSSProperties,

  valueText: {
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#475569',
    fontVariantNumeric: 'tabular-nums' as const,
    textAlign: 'right' as const,
  } as React.CSSProperties,

  mutedText: {
    fontSize: 10.5,
    color: '#94A3B8',
  } as React.CSSProperties,

  heading: {
    fontSize: 16,
    fontWeight: 600 as const,
    color: '#0F2C59',
    lineHeight: 1.3,
  } as React.CSSProperties,

  subheading: {
    fontSize: 13,
    fontWeight: 600 as const,
    color: '#1E293B',
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
    stroke: '#CBD5E1',
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
    background: active ? '#EFF6FF' : 'transparent',
    color: active ? '#0F2C59' : '#64748B',
    transition: 'all .15s ease',
    lineHeight: 1.4,
  } as React.CSSProperties),

  input: {
    fontFamily: F,
    fontSize: 13,
    padding: '8px 12px',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    background: '#fff',
    color: '#1E293B',
    outline: 'none',
    width: '100%',
    lineHeight: 1.4,
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  } as React.CSSProperties,

  select: {
    fontFamily: F,
    fontSize: 13,
    padding: '8px 32px 8px 12px',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    background: '#fff',
    color: '#1E293B',
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
    background: 'linear-gradient(135deg, #0F2C59, #0A1F42)',
    color: '#fff',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    lineHeight: 1.4,
    boxShadow: '0 2px 8px -1px rgba(15,44,89,0.4)',
  } as React.CSSProperties,

  btnGhost: {
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600 as const,
    border: '1px solid #E2E8F0',
    cursor: 'pointer',
    background: '#fff',
    color: '#334155',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    lineHeight: 1.4,
  } as React.CSSProperties,

  emptyState: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #E2E8F0',
    padding: '40px 20px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: '#EFF6FF',
    color: '#0F2C59',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    margin: '0 auto 12px',
  } as React.CSSProperties,

  errorBanner: {
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    color: '#DC2626',
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
    border: active ? 'none' : '1px solid #E2E8F0',
    background: active ? '#0F2C59' : '#fff',
    color: active ? '#fff' : '#475569',
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
    border: '1px solid #E2E8F0',
    background: '#fff',
    fontSize: 12,
    fontWeight: 600 as const,
    color: '#475569',
    cursor: 'pointer',
    lineHeight: 1.4,
  } as React.CSSProperties,

  statusBar: (c: string) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '6px 10px',
    borderRadius: 6,
    background: c === '#059669' ? '#ECFDF5' : c === '#D97706' ? '#FFFBEB' : c === '#DC2626' ? '#FEF2F2' : '#EFF6FF',
    color: c,
    fontSize: 10,
    fontWeight: 600 as const,
    lineHeight: 1.3,
  } as React.CSSProperties),
};
