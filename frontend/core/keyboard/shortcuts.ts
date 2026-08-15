export interface ShortcutDef {
  id: string;
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  handler: (e: KeyboardEvent) => void;
  when?: () => boolean;
  priority?: number;
  description: string;
  category?: string;
}

export function matchShortcut(e: KeyboardEvent, s: ShortcutDef): boolean {
  if (!s.key || typeof e.key !== 'string') return false;
  if (e.key !== s.key && e.key.toLowerCase() !== s.key.toLowerCase()) return false;
  if (s.ctrl && !e.ctrlKey) return false;
  if (s.alt && !e.altKey) return false;
  if (s.shift && !e.shiftKey) return false;
  if (s.meta && !e.metaKey) return false;
  if (!s.ctrl && e.ctrlKey) return false;
  if (!s.alt && e.altKey) return false;
  if (!s.shift && e.shiftKey) return false;
  if (!s.meta && e.metaKey) return false;
  return true;
}

export function formatShortcut(s: Pick<ShortcutDef, 'ctrl' | 'alt' | 'shift' | 'meta' | 'key'>): string {
  const parts: string[] = [];
  if (s.ctrl) parts.push('Ctrl');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Shift');
  if (s.meta) parts.push('Cmd');
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join('+');
}
