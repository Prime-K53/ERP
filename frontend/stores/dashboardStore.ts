import { create } from 'zustand';

export interface DashboardWidget {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

interface DashboardState {
  widgets: DashboardWidget[];
  customizeOpen: boolean;
  initialized: boolean;
  loadDefaults: () => void;
  toggleWidget: (id: string) => void;
  reorderWidgets: (fromIndex: number, toIndex: number) => void;
  setCustomizeOpen: (open: boolean) => void;
  resetDefaults: () => void;
}

const STORAGE_KEY = 'prime_erp_dashboard_widgets';

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'info-card', label: 'Info Card (Jobs/Portal)', visible: true, order: 0 },
  { id: 'collection', label: "Today's Collection", visible: true, order: 1 },
  { id: 'revenue', label: 'Revenue', visible: true, order: 2 },
  { id: 'unpaid', label: 'Unpaid Invoices', visible: true, order: 3 },
  { id: 'chart', label: 'Financial Performance Chart', visible: true, order: 4 },
  { id: 'recent-activity', label: 'Recent Activity', visible: true, order: 5 },
  { id: 'requests', label: 'Sales Request Pipeline', visible: true, order: 6 },
];

function persist(widgets: DashboardWidget[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets)); } catch {}
}

function load(): DashboardWidget[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DashboardWidget[];
  } catch {}
  return null;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: [],
  customizeOpen: false,
  initialized: false,

  loadDefaults: () => {
    const saved = load();
    if (saved && saved.length > 0) {
      const merged = DEFAULT_WIDGETS.map((def) => saved.find((w) => w.id === def.id) || def);
      set({ widgets: merged, initialized: true });
    } else {
      set({ widgets: [...DEFAULT_WIDGETS], initialized: true });
    }
  },

  toggleWidget: (id: string) => {
    const widgets = get().widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
    persist(widgets);
    set({ widgets });
  },

  reorderWidgets: (fromIndex: number, toIndex: number) => {
    const widgets = [...get().widgets];
    const [moved] = widgets.splice(fromIndex, 1);
    widgets.splice(toIndex, 0, moved);
    const reindexed = widgets.map((w, i) => ({ ...w, order: i }));
    persist(reindexed);
    set({ widgets: reindexed });
  },

  setCustomizeOpen: (open: boolean) => set({ customizeOpen: open }),

  resetDefaults: () => {
    persist(DEFAULT_WIDGETS);
    set({ widgets: [...DEFAULT_WIDGETS] });
  },
}));
