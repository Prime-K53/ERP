import React from 'react';
import { Sun, Moon, Monitor, Palette, Contrast } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const themes: { value: string; label: string; icon: React.ElementType }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'prime-teal', label: 'Prime Teal', icon: Palette },
  { value: 'high-contrast', label: 'High Contrast', icon: Contrast },
];

const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="glass-panel rounded-[var(--radius-md)] p-4">
      <h3 className="text-sm font-bold text-slate-900 mb-3">Appearance</h3>
      <div className="grid grid-cols-2 gap-2">
        {themes.map((t) => {
          const Icon = t.icon;
          const isActive = theme === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTheme(t.value as any)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-brand-50 text-brand-700 border border-brand-200'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeSwitcher;
