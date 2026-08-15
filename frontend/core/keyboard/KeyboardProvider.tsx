import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { KeyboardContext, type KeyboardContextType } from './KeyboardContext';
import type { ShortcutDef } from './shortcuts';
import { matchShortcut } from './shortcuts';
import { getFormFields, isFormField, isLastFormField, FOCUSABLE_SELECTOR } from './focusManager';

interface Props {
  children: ReactNode;
}

const FORM_FIELD_SEL =
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]):not([data-enter-default]), select:not([disabled]):not([tabindex="-1"]):not([data-enter-default]), textarea:not([disabled]):not([tabindex="-1"]):not([data-enter-default])';

export function KeyboardProvider({ children }: Props) {
  const shortcutsRef = useRef<Map<string, ShortcutDef>>(new Map());

  const registerShortcut = useCallback((shortcut: ShortcutDef): (() => void) => {
    if (!shortcut.key) {
      console.warn(`[Keyboard] Shortcut "${shortcut.id}" registered without a key — ignoring`);
      return () => {};
    }
    shortcutsRef.current.set(shortcut.id, shortcut);
    return () => {
      shortcutsRef.current.delete(shortcut.id);
    };
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    shortcutsRef.current.delete(id);
  }, []);

  const getNextField = useCallback((current: HTMLElement): HTMLElement | null => {
    const form = current.closest('form') || current.closest('[data-form-group]') || document.body;
    const fields = Array.from(form.querySelectorAll<HTMLElement>(FORM_FIELD_SEL));
    const idx = fields.indexOf(current);
    if (idx >= 0 && idx < fields.length - 1) return fields[idx + 1];
    return null;
  }, []);

  const getPrevField = useCallback((current: HTMLElement): HTMLElement | null => {
    const form = current.closest('form') || current.closest('[data-form-group]') || document.body;
    const fields = Array.from(form.querySelectorAll<HTMLElement>(FORM_FIELD_SEL));
    const idx = fields.indexOf(current);
    if (idx > 0) return fields[idx - 1];
    return null;
  }, []);

  const handleEnterKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (!isFormField(target)) return;
    if (target.hasAttribute('data-enter-default')) return;
    if (target.tagName === 'TEXTAREA') {
      if (e.shiftKey) return;
      e.preventDefault();
      const next = getNextField(target);
      if (next) {
        next.focus();
      } else {
        const form = target.closest('form');
        if (form) {
          const submitBtn = form.querySelector<HTMLElement>('[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      }
      return;
    }
    e.preventDefault();
    const next = getNextField(target);
    if (next) {
      next.focus();
    } else {
      const form = target.closest('form');
      if (form) {
        const isLast = isLastFormField(target, form);
        if (isLast) {
          const submitBtn = form.querySelector<HTMLElement>('[type="submit"]');
          if (submitBtn) submitBtn.click();
        }
      }
    }
  }, [getNextField]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const shortcuts = Array.from(shortcutsRef.current.values()) as ShortcutDef[];
    shortcuts.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const shortcut of shortcuts) {
      if (matchShortcut(e, shortcut)) {
        if (!shortcut.when || shortcut.when()) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.handler(e);
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      handleEnterKey(e);
      return;
    }

    if (e.key === 'Escape') {
      for (const shortcut of shortcuts) {
        if (shortcut.key === 'Escape' && (!shortcut.when || shortcut.when())) {
          e.preventDefault();
          shortcut.handler(e);
          return;
        }
      }
    }
  }, [handleEnterKey]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  const ctx: KeyboardContextType = {
    registerShortcut,
    unregisterShortcut,
    getNextField,
    getPrevField,
  };

  return (
    <KeyboardContext.Provider value={ctx}>
      {children}
    </KeyboardContext.Provider>
  );
}
