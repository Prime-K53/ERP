
import { useState, useEffect, useCallback } from 'react';

interface UseKeyboardListNavigationProps {
  itemCount: number;
  onSelect: (index: number) => void;
  columns?: number; // For grid navigation
  isActive?: boolean;
}

export function useKeyboardListNavigation({
  itemCount,
  onSelect,
  columns = 1,
  isActive = true
}: UseKeyboardListNavigationProps) {
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isActive || itemCount === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + columns, itemCount - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - columns, 0));
        break;
      case 'ArrowRight':
        if (columns > 1) {
          e.preventDefault();
          setActiveIndex(prev => Math.min(prev + 1, itemCount - 1));
        }
        break;
      case 'ArrowLeft':
        if (columns > 1) {
          e.preventDefault();
          setActiveIndex(prev => Math.max(prev - 1, 0));
        }
        break;
      case 'Enter':
        if (activeIndex >= 0) {
          e.preventDefault();
          onSelect(activeIndex);
        }
        break;
      case 'Escape':
        setActiveIndex(-1);
        break;
    }
  }, [itemCount, activeIndex, columns, onSelect, isActive]);

  useEffect(() => {
    if (isActive) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, isActive]);

  return { activeIndex, setActiveIndex };
}
