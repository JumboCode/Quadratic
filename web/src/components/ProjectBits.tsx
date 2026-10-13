import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDb, useProfiles, useTeams } from '../lib/queries';
import { HEALTH_META, STATUS_META, type ProjectStats } from '../lib/projects';
import { supabase, unwrap } from '../lib/supabase';
import type { Project, ProjectStatus } from '../lib/types';
import { cn, COLORS, fmtDate } from '../lib/utils';
import { Avatar, Badge, Button, Card, Field, Input, Modal, Progress, Select, Textarea } from './ui';

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const m = STATUS_META[status];
  return <Badge color={m.color}>{m.label}</Badge>;
}

export function ProjectCard({ project, stats }: { project: Project; stats?: ProjectStats }) {
  const { data: profiles = [] } = useProfiles();
  const { data: teams = [] } = useTeams();
  const lead = profiles.find((p) => p.id === project.lead_id);
  const projectTeams = teams.filter((t) => project.project_teams?.some((pt) => pt.team_id === t.id));
  return (
    <Link to={`/projects/${project.id}`}>
      <Card className="group h-full p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl transition group-hover:scale-110" style={{ background: `${project.color}22` }}>
            {project.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display font-bold">{project.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={project.status} />
              {project.health && <span className="text-xs">{HEALTH_META[project.health].emoji} {HEALTH_META[project.health].label}</span>}
            </div>
          </div>
          {lead && <Avatar name={lead.name} src={lead.avatar_url} size={24} />}
        </div>
        {project.description && <p className="mt-3 line-clamp-2 text-sm text-muted">{project.description}</p>}
        {stats && (
          <div className="mt-3 flex items-center gap-3 text-xs text-muted">
            <Progress value={stats.pct} color={project.color} className="flex-1" />
            <span className="tabular-nums">{stats.pct}%</span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          {projectTeams.map((t) => <span key={t.id} title={t.name}>{t.emoji}</span>)}
          {project.target_date && (
            <span className="ml-auto flex items-center gap-1"><CalendarDays className="size-3" /> {fmtDate(project.target_date)}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}

const PROJECT_EMOJIS = ['🚀', '🎨', '🧩', '📱', '🔐', '📊', '🌐', '🧪', '🛠️', '✨', '🗺️', '📣'];

export function CreateProjectModal({ open, onClose, defaultTeamId }: { open: boolean; onClose: () => void; defaultTeamId?: string }) {
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { data: teams = [] } = useTeams();
  const { data: profiles = [] } = useProfiles();
  const db = useDb([['projects']]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🚀');
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState('');
  const [teamIds, setTeamIds] = useState<string[]>(defaultTeamId ? [defaultTeamId] : []);
  const [lead, setLead] = useState(profile?.id ?? '');
  const [start, setStart] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const myTeams = teams.filter((t) => !t.archived && (roles[t.id] || profile?.is_admin));

  const submit = async () => {
    if (!name.trim() || !teamIds.length) return;
    setBusy(true);
    try {
      const [project] = (await db.mutateAsync({
        op: 'insert',
        table: 'projects',
        values: {
          name: name.trim(), emoji, color, description: description || null, lead_id: lead || null,
          start_date: start || null, target_date: target || null, created_by: profile!.id,
          status: start && start <= new Date().toISOString().slice(0, 10) ? 'in_progress' : 'planned',
        },
      })) as Project[];
      unwrap(await supabase.from('project_teams').insert(teamIds.map((team_id) => ({ project_id: project.id, team_id }))));
      onClose();
      navigate(`/projects/${project.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <div className="space-y-4 p-5">
        <div className="flex gap-2">
          <Select value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-16 text-lg" aria-label="Icon">
            {PROJECT_EMOJIS.map((e) => <option key={e}>{e}</option>)}
          </Select>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="font-semibold" />
        </div>
        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn('size-6 rounded-full transition', color === c && 'ring-2 ring-offset-2 ring-offset-surface')}
              style={{ background: c, ['--tw-ring-color' as string]: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this project about?" rows={3} />
        <Field label="Teams" hint="Projects can be shared across teams.">
          <div className="flex flex-wrap gap-1.5">
            {myTeams.map((t) => {
              const on = teamIds.includes(t.id);
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTeamIds(on ? teamIds.filter((x) => x !== t.id) : [...teamIds, t.id])}
                  className={cn('rounded-full border px-3 py-1 text-sm transition', on ? 'border-brand-400 bg-brand-500/10' : 'border-line text-muted')}
                >
                  {t.emoji} {t.name}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Lead">
            <Select value={lead} onChange={(e) => setLead(e.target.value)} className="w-full">
              <option value="">No lead</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.github_login}</option>)}
            </Select>
          </Field>
          <Field label="Start"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Target"><Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim() || !teamIds.length}>Create project</Button>
      </div>
    </Modal>
  );
}
