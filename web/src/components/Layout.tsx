import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarRange, ChevronRight, FileText, Folder, Home, Inbox, KanbanSquare, List, LogOut, Menu, Moon, Plus,
  RefreshCcw, Search, Settings, Shield, Sun,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTeams } from '../lib/queries';
import { useUI } from '../lib/ui-context';
import { cn } from '../lib/utils';
import { Avatar, Kbd } from './ui';
import { Logo } from './Mascot';
import { CommandPalette } from './CommandPalette';
import { CreateIssueModal } from './CreateIssueModal';

const TEAM_LINKS = [
  { to: 'board', label: 'Board', icon: KanbanSquare },
  { to: 'issues', label: 'Issues', icon: List },
  { to: 'cycles', label: 'Sprints', icon: RefreshCcw },
  { to: 'projects', label: 'Projects', icon: Folder },
  { to: 'roadmap', label: 'Timeline', icon: CalendarRange },
  { to: 'docs', label: 'Docs', icon: FileText },
  { to: 'settings', label: 'Settings', icon: Settings },
];

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function Layout() {
  const { profile, roles, signOut } = useAuth();
  const { data: teams = [] } = useTeams();
  const ui = useUI();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentKey = location.pathname.match(/^\/team\/([^/]+)/)?.[1]?.toUpperCase();
  const currentTeam = teams.find((t) => t.key === currentKey);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Teams I lead first; admins also see other active teams below.
  const myTeams = teams.filter((t) => roles[t.id] && !t.archived);
  const otherTeams = teams.filter((t) => !roles[t.id] && !t.archived);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'c') {
        e.preventDefault();
        ui.openCreateIssue(currentTeam ? { team_id: currentTeam.id } : {});
      } else if (e.key === '/') {
        e.preventDefault();
        ui.setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui, currentTeam]);

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <button onClick={() => navigate('/')} className="mb-2 px-1.5 py-1 text-left">
        <Logo />
      </button>

      <div className="mb-2 flex gap-1.5">
        <button
          onClick={() => ui.setPaletteOpen(true)}
          className="flex h-9 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-[13px] text-muted hover:border-brand-300"
        >
          <Search className="size-3.5" /> Search <span className="ml-auto"><Kbd>⌘K</Kbd></span>
        </button>
        <button
          onClick={() => ui.openCreateIssue(currentTeam ? { team_id: currentTeam.id } : {})}
          className="flex size-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm shadow-brand-500/30 hover:bg-brand-600"
          title="New issue (C)"
          aria-label="New issue"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <SideLink to="/" icon={Home} label="My work" end />
      <SideLink to="/inbox" icon={Inbox} label="Inbox" />
      <SideLink to="/roadmap" icon={CalendarRange} label="Club roadmap" />
      {profile?.is_admin && <SideLink to="/admin" icon={Shield} label="Admin" />}

      {[{ title: 'Your teams', list: myTeams }, { title: 'All teams', list: otherTeams }].map(
        (group) =>
          group.list.length > 0 && (
            <div key={group.title} className="mt-4">
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.title}</div>
              {group.list.map((t) => {
                const open = expanded[t.id] ?? t.key === currentKey;
                return (
                  <div key={t.id}>
                    <button
                      onClick={() => setExpanded((e) => ({ ...e, [t.id]: !open }))}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-2"
                    >
                      <span className="flex size-5 items-center justify-center rounded-md text-xs" style={{ background: `${t.color}26` }}>
                        {t.emoji}
                      </span>
                      <span className="flex-1 truncate text-left">{t.name}</span>
                      <ChevronRight className={cn('size-3.5 text-muted transition', open && 'rotate-90')} />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden pl-4"
                        >
                          {TEAM_LINKS.map((l) => (
                            <SideLink key={l.to} to={`/team/${t.key}/${l.to}`} icon={l.icon} label={l.label} small />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ),
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        <Avatar name={profile?.name ?? profile?.github_login} src={profile?.avatar_url} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{profile?.name ?? profile?.github_login}</div>
          <div className="truncate text-xs text-muted">@{profile?.github_login}</div>
        </div>
        <button onClick={ui.toggleTheme} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Toggle theme">
          {ui.theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button onClick={signOut} className="rounded-lg p-1.5 text-muted hover:bg-surface-2" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface/60 md:block">{sidebar}</aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-surface md:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 md:hidden">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 hover:bg-surface-2" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Logo />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      <CommandPalette />
      <CreateIssueModal />
    </div>
  );
}

function SideLink({
  to, icon: Icon, label, end, small,
}: { to: string; icon: typeof Home; label: string; end?: boolean; small?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2 font-medium transition',
          small ? 'py-1 text-[13px]' : 'py-1.5 text-sm',
          isActive ? 'bg-brand-500/12 text-brand-700 dark:text-brand-300' : 'text-ink/80 hover:bg-surface-2',
        )
      }
    >
      <Icon className={small ? 'size-3.5' : 'size-4'} />
      {label}
    </NavLink>
  );
}
