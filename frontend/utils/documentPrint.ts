export const printDocumentUrl = (url: string, title = 'Document'): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Printing is only available in the browser.'));
      return;
    }

    let settled = false;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', `${title} print frame`);
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    const cleanup = () => {
      iframe.onload = null;
      iframe.onerror = null;
      window.clearTimeout(timeoutId);
      iframe.remove();
    };

    const finalize = (callback?: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback?.();
    };

    const timeoutId = window.setTimeout(() => {
      finalize(() => reject(new Error('The document took too long to become printable.')));
    }, 15000);

    iframe.onerror = () => {
      finalize(() => reject(new Error('The print frame could not be loaded.')));
    };

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        finalize(() => reject(new Error('The print frame is unavailable.')));
        return;
      }

      const finishAfterPrint = () => finalize(resolve);
      frameWindow.addEventListener('afterprint', finishAfterPrint, { once: true });

      window.setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
          window.setTimeout(() => finalize(resolve), 2000);
        } catch (error) {
          finalize(() => reject(error instanceof Error ? error : new Error('Printing failed.')));
        }
      }, 300);
    };

    iframe.src = url;
    document.body.appendChild(iframe);
  });
