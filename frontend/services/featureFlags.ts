const EXAM_FLAG_KEYS = {
  exam_cost_breakdown_v2_ui: 'VITE_EXAM_COST_BREAKDOWN_V2_UI',
  exam_backend_meta_source: 'VITE_EXAM_BACKEND_META_SOURCE',
  exam_invoice_sync_v2: 'VITE_EXAM_INVOICE_SYNC_V2',
  formula_engine_ast_v2: 'VITE_FORMULA_ENGINE_AST_V2'
} as const;

export type ExamFeatureFlag = keyof typeof EXAM_FLAG_KEYS;

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return null;
};

const readOverrideMap = (): Record<string, unknown> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('prime_feature_flags');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const isExamFeatureEnabled = (flag: ExamFeatureFlag): boolean => {
  const envKey = EXAM_FLAG_KEYS[flag];
  const envValue = toBoolean(import.meta.env?.[envKey]);

  if (typeof window !== 'undefined') {
    const overrideMap = readOverrideMap();
    const directOverride = toBoolean(
      overrideMap[flag]
      ?? localStorage.getItem(`feature.${flag}`)
    );
    if (directOverride !== null) return directOverride;
  }

  if (envValue !== null) return envValue;
  return false;
};

export const examFeatureFlags = {
  exam_cost_breakdown_v2_ui: () => isExamFeatureEnabled('exam_cost_breakdown_v2_ui'),
  exam_backend_meta_source: () => isExamFeatureEnabled('exam_backend_meta_source'),
  exam_invoice_sync_v2: () => isExamFeatureEnabled('exam_invoice_sync_v2'),
  formula_engine_ast_v2: () => isExamFeatureEnabled('formula_engine_ast_v2')
};

