/**
 * useHighlight — Row highlight hook for DocLink navigation.
 *
 * On mount, reads `?highlight=<rowId>` from the URL search params.
 * If found, it:
 *   1. Scrolls the element into view
 *   2. Adds the `.highlight-row` CSS class to trigger the fade animation
 *   3. Removes the class after the animation so it can be re-triggered
 *   4. Cleans the query param from the URL (no history entry added)
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useHighlight(): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rowId = params.get('highlight');
    if (!rowId) return;

    // Remove the query param cleanly without pushing a new history entry
    params.delete('highlight');
    const nextSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' },
      { replace: true }
    );

    // Wait a tick for the list to render, then animate
    const timer = setTimeout(() => {
      const el = document.getElementById(rowId);
      if (!el) return;

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Force class removal first so re-triggering always works
      el.classList.remove('highlight-row');

      // Micro-task to restart the animation after removal
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add('highlight-row');

          const ANIMATION_DURATION_MS = 2600;
          const cleanup = setTimeout(() => {
            el.classList.remove('highlight-row');
          }, ANIMATION_DURATION_MS);

          // Cleanup if component unmounts mid-animation
          return () => clearTimeout(cleanup);
        });
      });
    }, 150); // 150ms: enough for lazy-loaded list to paint

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
}
