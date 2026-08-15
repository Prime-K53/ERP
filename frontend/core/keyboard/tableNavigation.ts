import { useCallback, useEffect, useRef, useState } from 'react';

export interface TableNavOptions {
  rowCount: number;
  columnCount?: number;
  onRowActivate?: (rowIndex: number) => void;
  onRowSelect?: (rowIndex: number, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  enabled?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
}

export interface TableNavState {
  activeRow: number;
  activeCol: number;
  selectedRows: Set<number>;
}

export function useTableKeyboardNav(options: TableNavOptions) {
  const {
    rowCount,
    columnCount = 1,
    onRowActivate,
    onRowSelect,
    onSelectAll,
    enabled = true,
    containerRef,
  } = options;

  const [state, setState] = useState<TableNavState>({
    activeRow: -1,
    activeCol: 0,
    selectedRows: new Set(),
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || rowCount === 0) return;

      const { activeRow, activeCol, selectedRows } = stateRef.current;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextRow = Math.min(activeRow + 1, rowCount - 1);
          setState(prev => ({ ...prev, activeRow: nextRow }));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevRow = Math.max(activeRow - 1, 0);
          setState(prev => ({ ...prev, activeRow: prevRow }));
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const nextCol = Math.min(activeCol + 1, columnCount - 1);
          setState(prev => ({ ...prev, activeCol: nextCol }));
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const prevCol = Math.max(activeCol - 1, 0);
          setState(prev => ({ ...prev, activeCol: prevCol }));
          break;
        }
        case 'Enter': {
          if (activeRow >= 0 && activeRow < rowCount) {
            e.preventDefault();
            onRowActivate?.(activeRow);
          }
          break;
        }
        case ' ': {
          if (activeRow >= 0 && activeRow < rowCount) {
            e.preventDefault();
            const newSelected = new Set(selectedRows);
            if (newSelected.has(activeRow)) {
              newSelected.delete(activeRow);
            } else {
              newSelected.add(activeRow);
            }
            setState(prev => ({ ...prev, selectedRows: newSelected }));
            onRowSelect?.(activeRow, newSelected.has(activeRow));
          }
          break;
        }
        case 'a': {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (selectedRows.size === rowCount) {
              setState(prev => ({ ...prev, selectedRows: new Set() }));
              onSelectAll?.(false);
            } else {
              const all = new Set(Array.from({ length: rowCount }, (_, i) => i));
              setState(prev => ({ ...prev, selectedRows: all }));
              onSelectAll?.(true);
            }
          }
          break;
        }
      }
    },
    [enabled, rowCount, columnCount, onRowActivate, onRowSelect, onSelectAll]
  );

  useEffect(() => {
    const el = containerRef?.current || window;
    const target = el === window ? window : el;
    target.addEventListener('keydown', handleKeyDown);
    return () => target.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, containerRef]);

  const resetNavigation = useCallback(() => {
    setState({ activeRow: -1, activeCol: 0, selectedRows: new Set() });
  }, []);

  const clearSelection = useCallback(() => {
    setState(prev => ({ ...prev, selectedRows: new Set() }));
  }, []);

  return {
    activeRow: state.activeRow,
    activeCol: state.activeCol,
    selectedRows: state.selectedRows,
    setActiveRow: (row: number) => setState(prev => ({ ...prev, activeRow: row })),
    setActiveCol: (col: number) => setState(prev => ({ ...prev, activeCol: col })),
    resetNavigation,
    clearSelection,
  };
}
