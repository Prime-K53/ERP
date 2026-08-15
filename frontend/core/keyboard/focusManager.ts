export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

export const FORM_FIELD_SELECTOR =
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"])';

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function getFormFields(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FORM_FIELD_SELECTOR));
}

export function getNextFocusable(
  current: HTMLElement,
  container: HTMLElement = document.body
): HTMLElement | null {
  const elements = getFocusableElements(container);
  const idx = elements.indexOf(current);
  return idx >= 0 && idx < elements.length - 1 ? elements[idx + 1] : null;
}

export function getPrevFocusable(
  current: HTMLElement,
  container: HTMLElement = document.body
): HTMLElement | null {
  const elements = getFocusableElements(container);
  const idx = elements.indexOf(current);
  return idx > 0 ? elements[idx - 1] : null;
}

export function focusFirst(container: HTMLElement): boolean {
  const elements = getFocusableElements(container);
  if (elements.length > 0) {
    elements[0].focus();
    return true;
  }
  return false;
}

export function focusFirstFormField(container: HTMLElement): boolean {
  const fields = getFormFields(container);
  if (fields.length > 0) {
    fields[0].focus();
    return true;
  }
  return false;
}

export function focusLast(container: HTMLElement): boolean {
  const elements = getFocusableElements(container);
  if (elements.length > 0) {
    elements[elements.length - 1].focus();
    return true;
  }
  return false;
}

export function isFormField(el: HTMLElement): boolean {
  return FORM_FIELD_SELECTOR.split(',').some(sel => {
    const trimmed = sel.trim();
    if (!el.matches) return false;
    try {
      return el.matches(trimmed);
    } catch {
      return false;
    }
  });
}

export function isLastFormField(el: HTMLElement, container: HTMLElement): boolean {
  const fields = getFormFields(container);
  return fields.length > 0 && fields[fields.length - 1] === el;
}
