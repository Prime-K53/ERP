const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

export function escapeAttribute(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

export function sanitizeText(input: unknown): string {
  if (input == null) return '';
  if (typeof input !== 'string') return String(input);
  return escapeHtml(input);
}
