import { useEffect } from 'react';
import { useKeyboardContext } from './KeyboardContext';
import type { ShortcutDef } from './shortcuts';

export function useKeyboard(shortcuts: ShortcutDef[], deps: any[] = []): void {
  const { registerShortcut, unregisterShortcut } = useKeyboardContext();

  useEffect(() => {
    const unregisters = shortcuts.map(s => registerShortcut(s));
    return () => {
      unregisters.forEach(u => u());
    };
  }, deps);
}
