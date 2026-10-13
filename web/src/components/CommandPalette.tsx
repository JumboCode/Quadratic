import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarRange, FileText, Folder, Home, Inbox, KanbanSquare, Moon, Plus, RefreshCcw, Search, Settings, Shield,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSearchIssues, useTeams } from '../lib/queries';
import { useUI } from '../lib/ui-context';

export function CommandPalette() {
  const ui = useUI();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: teams = [] } = useTeams();
  const [search, setSearch] = useState('');
  const { data: issues = [] } = useSearchIssues(search);

  const close = () => {
    ui.setPaletteOpen(false);
    setSearch('');
  };
  const go = (path: string) => {
    navigate(path);
    close();
  };

  const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-brand-500/12';
  const group = 'px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted';
  const activeTeams = teams.filter((t) => !t.archived);

  return (
    <AnimatePresence>
      {ui.paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
          <motion.div className="fixed inset-0 bg-brand-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <Command label="Command menu" shouldFilter={true} onKeyDown={(e) => e.key === 'Escape' && close()}>
              <div className="flex items-center gap-2 border-b border-line px-4">
                <Search className="size-4 text-muted" />
                <Command.Input
                  autoFocus
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search issues, jump to a team, or run a command…"
                  className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
                />
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-1">
                <Command.Empty className="py-8 text-center text-sm text-muted">No results. Try an issue ID like WEB-12.</Command.Empty>

                {issues.length > 0 && (
                  <Command.Group heading="Issues" className={group}>
                    {issues.map((i) => (
                      <Command.Item key={i.id} value={`${i.identifier} ${i.title}`} onSelect={() => go(`/issue/${i.identifier}`)} className={item}>
                        <span className="w-16 shrink-0 font-mono text-xs text-muted">{i.identifier}</span>
                        <span className="truncate">{i.title}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group heading="Actions" className={group}>
                  <Command.Item onSelect={() => { close(); ui.openCreateIssue(); }} className={item}>
                    <Plus className="size-4" /> Create new issue
                  </Command.Item>
                  <Command.Item onSelect={() => { ui.toggleTheme(); close(); }} className={item}>
                    <Moon className="size-4" /> Toggle dark mode
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Go to" className={group}>
                  <Command.Item onSelect={() => go('/')} className={item}><Home className="size-4" /> My work</Command.Item>
                  <Command.Item onSelect={() => go('/inbox')} className={item}><Inbox className="size-4" /> Inbox</Command.Item>
                  <Command.Item onSelect={() => go('/roadmap')} className={item}><CalendarRange className="size-4" /> Club roadmap</Command.Item>
                  {profile?.is_admin && (
                    <Command.Item onSelect={() => go('/admin')} className={item}><Shield className="size-4" /> Admin</Command.Item>
                  )}
                </Command.Group>

                {activeTeams.map((t) => (
                  <Command.Group key={t.id} heading={`${t.emoji} ${t.name}`} className={group}>
                    {[
                      { to: 'board', label: 'Board', icon: KanbanSquare },
                      { to: 'cycles', label: 'Sprints', icon: RefreshCcw },
                      { to: 'projects', label: 'Projects', icon: Folder },
                      { to: 'roadmap', label: 'Timeline', icon: CalendarRange },
                      { to: 'docs', label: 'Docs', icon: FileText },
                      { to: 'settings', label: 'Settings', icon: Settings },
                    ].map((l) => (
                      <Command.Item key={l.to} value={`${t.name} ${t.key} ${l.label}`} onSelect={() => go(`/team/${t.key}/${l.to}`)} className={item}>
                        <l.icon className="size-4" /> {t.name} · {l.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
