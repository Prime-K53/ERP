/**
 * Design system tokens for Prime ERP Dashboard
 * Inspired by Stripe, Linear, Notion - clean, minimal SaaS UI
 */

// ============================================================
// COLOR SYSTEM
// ============================================================
export const COLORS = {
  // Primary - Indigo
  primary: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },
  // Secondary - Cyan
  secondary: {
    50: '#ECFEFF',
    100: '#CFFAFE',
    200: '#A5F3FC',
    300: '#67E8F9',
    400: '#22D3EE',
    500: '#06B6D4',
    600: '#0891B2',
    700: '#0E7490',
    800: '#155E75',
    900: '#164E63',
  },
  // Success - Green
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },
  // Warning - Amber
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  // Danger - Red
  danger: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
  // Neutral grays
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
    950: '#030712',
  },
} as const;

// ============================================================
// SEMANTIC COLORS
// ============================================================
export const SEMANTIC_COLORS = {
  income: COLORS.success[500],
  expenditure: COLORS.danger[500],
  profit: COLORS.success[600],
  loss: COLORS.danger[600],
  neutral: COLORS.gray[400],
  textPrimary: COLORS.gray[900],
  textSecondary: COLORS.gray[500],
  textMuted: COLORS.gray[400],
  background: '#F5F7FB',
  cardBg: '#FFFFFF',
  cardHover: '#FAFBFC',
  borderLight: '#E5E7EB',
  borderLighter: '#F3F4F6',
} as const;

// ============================================================
// SHADOWS (subtle elevation)
// ============================================================
export const SHADOWS = {
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  soft: '0 2px 8px 0 rgba(0, 0, 0, 0.04)',
  card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)',
  cardHover: '0 4px 16px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.06)',
  tooltip: '0 4px 12px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)',
} as const;

// ============================================================
// BORDER RADIUS (12px-16px for cards, 8px for elements)
// ============================================================
export const RADIUS = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  full: '9999px',
} as const;

// ============================================================
// SPACING (8px grid system)
// ============================================================
export const SPACING = {
  0: '0px',
  1: '4px',   // 0.25 unit
  2: '8px',   // 0.5 unit
  3: '12px',  // 0.75 unit
  4: '16px',  // 1 unit
  5: '20px',  // 1.25 unit
  6: '24px',  // 1.5 unit
  7: '28px',  // 1.75 unit
  8: '32px',  // 2 units
  10: '40px', // 2.5 units
  12: '48px', // 3 units
  14: '56px', // 3.5 units
  16: '64px', // 4 units
  20: '80px', // 5 units
  24: '96px', // 6 units
} as const;

// ============================================================
// TYPOGRAPHY
// ============================================================
export const TYPOGRAPHY = {
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
    '4xl': '2.25rem', // 36px
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

// ============================================================
// TRANSITIONS
// ============================================================
export const TRANSITIONS = {
  fast: '150ms ease',
  base: '200ms ease',
  slow: '300ms ease',
  slowest: '500ms ease',
} as const;

// ============================================================
// CHART SPECIFIC
// ============================================================
export const CHART_COLORS_ARRAY = [
  '#4F46E5', // Primary indigo
  '#06B6D4', // Secondary cyan
  '#22C55E', // Success green
  '#F59E0B', // Warning amber
  '#EF4444', // Danger red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
] as const;