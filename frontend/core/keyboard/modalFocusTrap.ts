import { getFocusableElements, focusFirstFormField } from './focusManager';

interface TrapState {
  container: HTMLElement;
  previouslyFocused: HTMLElement | null;
  onKeyDown: (e: KeyboardEvent) => void;
}

let activeTrap: TrapState | null = null;

export function trapFocus(
  container: HTMLElement,
  options?: { initialFocus?: string; focusFirstField?: boolean }
): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  if (options?.focusFirstField !== false) {
    const focused = focusFirstFormField(container);
    if (!focused) {
      getFocusableElements(container)[0]?.focus();
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const elements = getFocusableElements(container);
    if (elements.length === 0) return;

    const first = elements[0];
    const last = elements[elements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', onKeyDown);

  activeTrap = { container, previouslyFocused, onKeyDown };

  return () => {
    document.removeEventListener('keydown', onKeyDown);
    if (activeTrap?.container === container) {
      activeTrap = null;
    }
    previouslyFocused?.focus();
  };
}

export function releaseFocus(): void {
  if (activeTrap) {
    document.removeEventListener('keydown', activeTrap.onKeyDown);
    activeTrap.previouslyFocused?.focus();
    activeTrap = null;
  }
}

export function isFocusTrapped(): boolean {
  return activeTrap !== null;
}
