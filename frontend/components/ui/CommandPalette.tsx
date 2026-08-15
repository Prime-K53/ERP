import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  category?: string;
  onClick: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandItem[];
  recentItems?: CommandItem[];
}

const overlayVariants: any = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const paletteVariants: any = {
  hidden: { opacity: 0, scale: 0.92, y: -20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', damping: 30, stiffness: 350 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    transition: { duration: 0.12, ease: 'easeIn' },
  },
};

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, items, recentItems = [] }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.description && it.description.toLowerCase().includes(q))
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const it of filtered) {
      const cat = it.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(it);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const flatFiltered = useMemo(() => filtered, [filtered]);

  const showRecent = !query.trim() && recentItems.length > 0;

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % flatFiltered.length);
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + flatFiltered.length) % flatFiltered.length);
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const target = showRecent ? recentItems[selectedIndex] : flatFiltered[selectedIndex];
        if (target) {
          target.onClick();
          onClose();
        }
      }
    },
    [isOpen, onClose, flatFiltered, showRecent, recentItems, selectedIndex]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector<HTMLDivElement>(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const displayList = showRecent ? recentItems : flatFiltered;

  const renderItem = (it: CommandItem, idx: number) => {
    const selected = idx === selectedIndex;
    return (
      <div
        key={it.id}
        data-index={idx}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          borderRadius: '8px',
          cursor: 'pointer',
          backgroundColor: selected ? 'rgba(99,102,241,0.2)' : 'transparent',
          transition: 'background-color 0.1s',
          scrollMargin: '4px',
        }}
        onMouseEnter={() => setSelectedIndex(idx)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          it.onClick();
          onClose();
        }}
      >
        {it.icon && (
          <span style={{ color: '#94a3b8', flexShrink: 0, display: 'flex' }}>
            {it.icon}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#f1f5f9',
              lineHeight: 1.3,
            }}
          >
            {it.label}
          </div>
          {it.description && (
            <div
              style={{
                fontSize: '12px',
                color: '#64748b',
                lineHeight: 1.3,
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {it.description}
            </div>
          )}
        </div>
        {it.shortcut && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#475569',
              backgroundColor: '#334155',
              padding: '2px 7px',
              borderRadius: '4px',
              lineHeight: '18px',
              flexShrink: 0,
              letterSpacing: '0.3px',
            }}
          >
            {it.shortcut}
          </span>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="cp-backdrop"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '80px 16px',
            backgroundColor: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            key="cp-content"
            variants={paletteVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '600px',
              maxHeight: '500px',
              backgroundColor: '#1e293b',
              borderRadius: '16px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              fontFamily: "'Inter', system-ui, sans-serif",
              border: '1px solid rgba(148,163,184,0.08)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(148,163,184,0.1)',
              }}
            >
              <Search size={18} color="#64748b" style={{ flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search commands, pages, or anything…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  fontSize: '15px',
                  color: '#f1f5f9',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  lineHeight: '24px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.outline = 'none';
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  backgroundColor: '#334155',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  lineHeight: '20px',
                  flexShrink: 0,
                  letterSpacing: '0.3px',
                }}
              >
                ESC
              </span>
            </div>

            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px',
              }}
            >
              {showRecent && (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#64748b',
                      letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                      padding: '10px 16px 6px',
                    }}
                  >
                    Recent
                  </div>
                  {recentItems.map((it, idx) => renderItem(it, idx))}
                </div>
              )}

              {!showRecent && grouped.length === 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '48px 20px',
                    color: '#64748b',
                    gap: '8px',
                  }}
                >
                  <Search size={32} strokeWidth={1.5} />
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>No results found</span>
                  <span style={{ fontSize: '12px', color: '#475569' }}>
                    Try a different search term
                  </span>
                </div>
              )}

              {!showRecent &&
                grouped.map(([category, catItems]) => (
                  <div key={category}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#64748b',
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase',
                        padding: '10px 16px 6px',
                      }}
                    >
                      {category}
                    </div>
                    {catItems.map((it) => renderItem(it, flatFiltered.indexOf(it)))}
                  </div>
                ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
