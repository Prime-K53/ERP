import { useEffect } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  enabled?: boolean;
}

export const useKeyboard = (shortcuts: KeyboardShortcut[], deps?: any[]) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        if (typeof e.key !== 'string' || typeof s.key !== 'string') continue;
        const ctrlOrMeta = s.ctrl || s.meta;
        const match =
          e.key.toLowerCase() === s.key.toLowerCase() &&
          (ctrlOrMeta ? (e.ctrlKey || e.metaKey) : true) &&
          (s.shift ? e.shiftKey : !e.shiftKey) &&
          (s.alt ? e.altKey : !e.altKey);
        if (match && (s.enabled ?? true)) {
          e.preventDefault();
          s.handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, deps || [shortcuts]);
};
