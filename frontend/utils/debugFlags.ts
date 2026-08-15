const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const readFlag = (value: unknown) => TRUE_VALUES.has(String(value ?? '').trim().toLowerCase());

const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

export const isVerboseApiLoggingEnabled = () => readFlag(env?.VITE_VERBOSE_API_LOGS);

export const isResponsiveDebugEnabled = () =>
  Boolean(env?.DEV) && readFlag(env?.VITE_SHOW_RESPONSIVE_DEBUG);

export const isPdfDebugLoggingEnabled = () =>
  Boolean(env?.DEV) && readFlag(env?.VITE_VERBOSE_PDF_LOGS);

export const isExaminationDebugLoggingEnabled = () =>
  Boolean(env?.DEV) && readFlag(env?.VITE_VERBOSE_EXAMINATION_LOGS);
