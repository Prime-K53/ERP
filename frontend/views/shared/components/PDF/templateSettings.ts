import { Font } from '@react-pdf/renderer';
import { logger } from '@/services/logger';
import type { CompanyConfig, InvoiceTemplatesConfig } from '../../../../types.ts';
import { isPdfDebugLoggingEnabled } from '../../../../utils/debugFlags';

export const PRIME_PDF_FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Courier', label: 'Courier' },
  { value: 'Times-Roman', label: 'Times New Roman' },
  { value: 'Comic Sans MS', label: 'Comic Sans MS' },
] as const;

export type PrimePdfFontFamily = typeof PRIME_PDF_FONT_OPTIONS[number]['value'];

export type TemplateEngine = 'Standard' | 'Advanced' | 'Custom' | 'Classic' | 'Modern' | 'Professional' | 'Clean';

export interface PrimeTemplateSettings {
  engine: TemplateEngine;
  accentColor: string;
  companyNameFontSize: number;
  bodyFontSize: number;
  fontFamily: PrimePdfFontFamily;
  logoWidth: number;
  showCompanyLogo: boolean;
  showPaymentTerms: boolean;
  showDueDate: boolean;
  showOutstandingAndWalletBalances: boolean;
  showAccountSummary: boolean;
}

export const DEFAULT_PRIME_TEMPLATE_SETTINGS: PrimeTemplateSettings = {
  engine: 'Classic',
  accentColor: '#3b82f6',
  companyNameFontSize: 18,
  bodyFontSize: 12,
  fontFamily: 'Helvetica',
  logoWidth: 140,
  showCompanyLogo: true,
  showPaymentTerms: true,
  showDueDate: true,
  showOutstandingAndWalletBalances: false,
  showAccountSummary: false,
};

let fontsInitialized = false;
const pdfDebugLoggingEnabled = isPdfDebugLoggingEnabled();

export const resetFontRegistrationState = () => {
  fontsInitialized = false;
};

export const initializePrimePdfFonts = async () => {
  if (fontsInitialized) return;
  fontsInitialized = true;
  
  try {
    // Standard PDF fonts (Helvetica, Courier, Times-Roman) are built-in to @react-pdf/renderer
    // Registering Comic Sans MS which requires custom TTF files
    Font.register({
      family: 'Comic Sans MS',
      fonts: [
        { src: '/fonts/comic.ttf' },
        { src: '/fonts/comicbd.ttf', fontWeight: 'bold' },
        { src: '/fonts/comici.ttf', fontStyle: 'italic' },
        { src: '/fonts/comicz.ttf', fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });
    if (pdfDebugLoggingEnabled) {
      console.log('[PDF Fonts] Custom fonts (Comic Sans MS) registered successfully');
    }
  } catch (error) {
    if (pdfDebugLoggingEnabled) {
      logger.error('[PDF Fonts] Failed to register custom fonts', error);
    }
  }
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const normalizeAccentColor = (value?: string) => {
  const normalized = String(value || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)
    ? normalized
    : DEFAULT_PRIME_TEMPLATE_SETTINGS.accentColor;
};

const normalizeFontFamily = (value?: string): PrimePdfFontFamily => {
  const normalized = String(value || '').trim();
  const found = PRIME_PDF_FONT_OPTIONS.find(opt => opt.value === normalized);
  return found ? (found.value as PrimePdfFontFamily) : 'Helvetica';
};

export const getStoredCompanyConfig = (): CompanyConfig | null => {
  if (typeof window === 'undefined') return null;

  const saved = localStorage.getItem('nexus_company_config');
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch (error) {
    logger.error('Failed to parse company config', error);
    return null;
  }
};

export const resolvePrimeTemplateSettings = (companyConfig?: CompanyConfig | null): PrimeTemplateSettings => {
  const templateConfig: Partial<InvoiceTemplatesConfig> = companyConfig?.invoiceTemplates || {};
  const requestedFontFamily = String(
    templateConfig.fontFamily || DEFAULT_PRIME_TEMPLATE_SETTINGS.fontFamily
  ).trim();

  return {
    engine: (templateConfig.engine || DEFAULT_PRIME_TEMPLATE_SETTINGS.engine) as PrimeTemplateSettings['engine'],
    accentColor: normalizeAccentColor(templateConfig.accentColor),
    companyNameFontSize: clampNumber(
      templateConfig.companyNameFontSize,
      12,
      32,
      DEFAULT_PRIME_TEMPLATE_SETTINGS.companyNameFontSize
    ),
    bodyFontSize: clampNumber(
      templateConfig.bodyFontSize,
      10,
      16,
      DEFAULT_PRIME_TEMPLATE_SETTINGS.bodyFontSize
    ),
    fontFamily: normalizeFontFamily(requestedFontFamily),
    logoWidth: clampNumber(
      templateConfig.logoWidth,
      80,
      220,
      DEFAULT_PRIME_TEMPLATE_SETTINGS.logoWidth
    ),
    showCompanyLogo: templateConfig.showCompanyLogo !== false,
    showPaymentTerms: templateConfig.showPaymentTerms !== false,
    showDueDate: templateConfig.showDueDate !== false,
    showOutstandingAndWalletBalances: Boolean(templateConfig.showOutstandingAndWalletBalances),
    showAccountSummary: Boolean(templateConfig.showAccountSummary),
  };
};

export const getDefaultPaymentTermsLabel = (companyConfig?: CompanyConfig | null) => {
  const termsDays = clampNumber(
    companyConfig?.transactionSettings?.defaultPaymentTermsDays,
    0,
    365,
    30
  );

  return termsDays === 0 ? 'Due on receipt' : `Net ${termsDays}`;
};
