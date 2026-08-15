export const Z_LAYERS = {
  BASE_MODAL: 50,
  NESTED_MODAL: 60,
  DOCUMENT_PREVIEW: 70,
  HEADER: 100,
  SIDEBAR: 110,
  GLOBAL_PREVIEW: 9999,
} as const;

export type ZLayer = (typeof Z_LAYERS)[keyof typeof Z_LAYERS];
