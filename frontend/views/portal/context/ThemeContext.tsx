import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system' | 'prime-teal' | 'high-contrast';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_KEY = 'prime-portal-theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null;
      return stored || 'system';
    } catch {
      return 'system';
    }
  });

  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch { /* noop */ }
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const getSystemTheme = () => media.matches ? 'dark' : 'light';

    const update = () => {
      const next = theme === 'system' ? getSystemTheme() : (theme === 'dark' || theme === 'high-contrast' ? 'dark' : 'light');
      setResolved(next);
      document.documentElement.setAttribute('data-theme', theme === 'high-contrast' ? 'high-contrast' : next);
    };

    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
