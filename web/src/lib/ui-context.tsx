import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Issue } from './types';

export type IssueDefaults = Partial<Pick<Issue, 'team_id' | 'state_id' | 'cycle_id' | 'project_id' | 'milestone_id' | 'parent_id' | 'assignee_id'>>;

interface UIState {
  createIssue: IssueDefaults | null;
  openCreateIssue: (defaults?: IssueDefaults) => void;
  closeCreateIssue: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const UIContext = createContext<UIState | null>(null);

function readTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [createIssue, setCreateIssue] = useState<IssueDefaults | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState(readTheme);

  const toggleTheme = useCallback(() => {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('quadratic-theme', next);
    } catch {
      // storage unavailable (private mode): theme still applies for this visit
    }
    setTheme(next);
  }, []);

  return (
    <UIContext.Provider
      value={{
        createIssue,
        openCreateIssue: (d = {}) => setCreateIssue(d),
        closeCreateIssue: () => setCreateIssue(null),
        paletteOpen,
        setPaletteOpen,
        theme,
        toggleTheme,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI outside UIProvider');
  return ctx;
}
