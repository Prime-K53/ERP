import { createContext, useContext } from 'react';
import type { ShortcutDef } from './shortcuts';

export interface KeyboardContextType {
  registerShortcut: (shortcut: ShortcutDef) => () => void;
  unregisterShortcut: (id: string) => void;
  getNextField: (current: HTMLElement) => HTMLElement | null;
  getPrevField: (current: HTMLElement) => HTMLElement | null;
}

const defaultContext: KeyboardContextType = {
  registerShortcut: () => () => {},
  unregisterShortcut: () => {},
  getNextField: () => null,
  getPrevField: () => null,
};

export const KeyboardContext = createContext<KeyboardContextType>(defaultContext);

export function useKeyboardContext(): KeyboardContextType {
  return useContext(KeyboardContext);
}
