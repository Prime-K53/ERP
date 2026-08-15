import React from 'react';

/**
 * Sleek Design Tokens — PrimePrinting Customer Portal
 * Based on the Prime-portal reference app "Sleek" palette.
 */

// ── Font ──────────────────────────────────────────────
export const FONT_FAMILY = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

// ── Color Palette ─────────────────────────────────────
export const colors = {
  // Primary — deep executive navy
  navy: {
    50:  '#EFF3F9',
    100: '#D6E1F0',
    200: '#ADC3E0',
    300: '#7A9CCB',
    400: '#4A76B5',
    500: '#0F2C59',
    600: '#0D254D',
    700: '#0A1F42',
    800: '#071836',
    900: '#04102B',
  },
  // Secondary — slate grays
  slate: {
    50:  '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  // Tertiary — emerald
  emerald: {
    50:  '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#059669',
    600: '#047857',
    700: '#065F46',
    800: '#064E3B',
    900: '#022C22',
  },
  // Semantic
  white: '#FFFFFF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  outline: '#E2E8F0',
  error: '#DC2626',
  errorLight: '#FEF2F2',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  success: '#059669',
  successLight: '#ECFDF5',
  info: '#2563EB',
  infoLight: '#EFF6FF',
} as const;

// ── Shadows ───────────────────────────────────────────
export const shadows = {
  xs:  '0 1px 2px rgba(15,23,42,0.04)',
  sm:  '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
  md:  '0 4px 6px -1px rgba(15,23,42,0.07), 0 2px 4px -2px rgba(15,23,42,0.05)',
  lg:  '0 10px 15px -3px rgba(15,23,42,0.08), 0 4px 6px -4px rgba(15,23,42,0.04)',
  xl:  '0 20px 25px -5px rgba(15,23,42,0.1), 0 8px 10px -6px rgba(15,23,42,0.06)',
  card: '0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.02)',
  elevated: '0 4px 12px -2px rgba(15,23,42,0.1)',
} as const;

// ── Border Radius ─────────────────────────────────────
export const radius = {
  xs:   4,
  sm:   6,
  md:   8,
  lg:   12,
  xl:   16,
  '2xl': 20,
  full: 9999,
} as const;

// ── Spacing Scale ─────────────────────────────────────
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ── Typography ────────────────────────────────────────
// Portal module spec: 13.5px base, 13px table body, 13.5–14.4px table
// headers, 20–24px titles, 12–13px labels, line-height 1.4–1.5,
// weights 400–600 for hierarchy.
export const typography = {
  fontFamily: FONT_FAMILY,
  sizes: {
    xs:   11,
    label: 12,
    sm:   12.5,
    base: 13.5,
    tableBody: 13,
    tableHeader: 13.5,
    md:   14,
    lg:   16,
    xl:   18,
    '2xl': 20,
    '3xl': 24,
    title: 20,
    titleLg: 24,
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.45,
    table: 1.4,
    relaxed: 1.6,
  },
} as const;

// ── Component Tokens ──────────────────────────────────
export const componentTokens = {
  // Cards
  card: {
    background: colors.white,
    border: `1px solid ${colors.outline}`,
    borderRadius: radius.lg,
    padding: spacing[3],
    shadow: shadows.card,
  },
  // Inputs
  input: {
    background: colors.white,
    border: `1px solid ${colors.outline}`,
    borderRadius: radius.md,
    padding: '8px 12px',
    fontSize: typography.sizes.base,
    focusBorder: colors.navy[500],
    focusRing: `0 0 0 3px ${colors.navy[100]}`,
  },
  // Buttons
  button: {
    primary: {
      background: `linear-gradient(135deg, ${colors.navy[500]} 0%, ${colors.navy[700]} 100%)`,
      color: colors.white,
      border: 'none',
      shadow: `0 2px 8px -1px ${colors.navy[500]}40`,
    },
    secondary: {
      background: colors.white,
      color: colors.navy[700],
      border: `1px solid ${colors.outline}`,
      shadow: shadows.xs,
    },
    success: {
      background: `linear-gradient(135deg, ${colors.emerald[500]} 0%, ${colors.emerald[700]} 100%)`,
      color: colors.white,
      border: 'none',
      shadow: `0 2px 8px -1px ${colors.emerald[500]}40`,
    },
    danger: {
      background: `linear-gradient(135deg, ${colors.error} 0%, #B91C1C 100%)`,
      color: colors.white,
      border: 'none',
      shadow: `0 2px 8px -1px ${colors.error}40`,
    },
  },
  // Nav
  sidebar: {
    background: `linear-gradient(180deg, ${colors.navy[500]}, ${colors.navy[800]})`,
    width: 286,
    collapsedWidth: 64,
    activeIndicator: colors.emerald[500],
    hoverBg: 'rgba(255,255,255,0.05)',
    sectionLabel: 'rgba(255,255,255,0.35)',
    itemDefault: 'rgba(255,255,255,0.55)',
    itemHover: 'rgba(255,255,255,0.85)',
    itemActive: colors.white,
  },
} as const;
