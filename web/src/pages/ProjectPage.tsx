import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Diamond, FileText, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  useAllStates, useDb, useDependencies, useDocs, useIssues, useMilestones, useProfiles, useProject, useProjects,
  useProjectUpdates, useTeams,
} from '../lib/queries';
import { HEALTH_META, lateness, predictCompletion, progressSeries, projectStats, STATUS_META } from '../lib/projects';
import { supabase, unwrap } from '../lib/supabase';
import { useTeamBundle } from '../lib/team-bundle';
import type { Issue, Milestone, Project, ProjectHealth } from '../lib/types';
import { useUI } from '../lib/ui-context';
import { ago, cn, fmtDate } from '../lib/utils';
import { Avatar, Button, Card, Empty, Input, PageLoader, Progress, Select, Tabs, Textarea } from '../components/ui';
import { Markdown, MarkdownEditor } from '../components/Markdown';
import { ProgressChart } from '../components/Charts';
import { IssueList, useOpenIssue } from '../components/issue/IssueViews';
import { IssuePanel } from '../components/issue/IssueDetail';

export function ProjectPage() {
  const { projectId } = useParams();
  const { data: project, isLoading } = useProject(projectId);
  const { openId, close } = useOpenIssue();
  if (isLoading) return <PageLoader />;
  if (!project) return <Empty title="Project not found">It may have been deleted, or it belongs to teams you're not on.</Empty>;
  return (
    <>
      <ProjectBody key={project.id} project={project} />
      <IssuePanel identifier={openId} onClose={close} />
    </>
  );
}

type Tab = 'overview' | 'issues' | 'updates' | 'docs';

function ProjectBody({ project }: { project: Project }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ui = useUI();
  const { data: profiles = [] } = useProfiles();
  const { data: teams = [] } = useTeams();
  const { data: issues = [] } = useIssues({ projectId: project.id });
  const { data: states = [] } = useAllStates();
  const stateById = new Map(states.map((s) => [s.id, s]));
  const db = useDb([['project', project.id], ['projects']]);
  const [tab, setTab] = useState<Tab>('overview');
  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.name]);

  const teamIds = project.project_teams?.map((pt) => pt.team_id) ?? [];
  const projectTeams = teams.filter((t) => teamIds.includes(t.id));
  const stats = projectStats(issues, stateById);
  const save = (values: Partial<Project>) => db.mutate({ op: 'update', table: 'projects', match: { id: project.id }, values });

  const remove = async () => {
    if (!confirm(`Delete "${project.name}"? Its issues stay, they just lose the project.`)) return;
    unwrap(await supabase.from('projects').delete().eq('id', project.id));
    qc.invalidateQueries({ queryKey: ['projects'] });
    navigate(projectTeams[0] ? `/team/${projectTeams[0].key}/projects` : '/');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {projectTeams.map((t) => (
          <Link key={t.id} to={`/team/${t.key}/projects`} className="hover:text-ink">{t.emoji} {t.name}</Link>
        ))}
        <span>/ Projects</span>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl text-3xl" style={{ background: `${project.color}22` }}>
          {project.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== project.name && save({ name: name.trim() })}
            className="w-full bg-transparent font-display text-3xl font-extrabold outline-none"
            aria-label="Project name"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={project.status} onChange={(e) => save({ status: e.target.value as Project['status'] })} className="h-8 text-[13px]">
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </Select>
            <Select value={project.lead_id ?? ''} onChange={(e) => save({ lead_id: e.target.value || null })} className="h-8 text-[13px]">
              <option value="">No lead</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>Lead: {p.name ?? p.github_login}</option>)}
            </Select>
            <label className="flex items-center gap-1 text-[13px] text-muted">
              Start <Input type="date" value={project.start_date ?? ''} onChange={(e) => save({ start_date: e.target.value || null })} className="h-8 w-36" />
            </label>
            <label className="flex items-center gap-1 text-[13px] text-muted">
              Target <Input type="date" value={project.target_date ?? ''} onChange={(e) => save({ target_date: e.target.value || null })} className="h-8 w-36" />
            </label>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-red-600" onClick={remove} icon={<Trash2 className="size-3.5" />}>Delete</Button>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'issues', label: `Issues · ${stats.total}` },
          { value: 'updates', label: 'Updates' },
          { value: 'docs', label: 'Docs' },
        ]}
      />

      {tab === 'overview' && <Overview project={project} issues={issues} stateById={stateById} save={save} />}
      {tab === 'issues' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => ui.openCreateIssue({ team_id: teamIds[0], project_id: project.id })}>
              Add issue
            </Button>
          </div>
          {projectTeams.map((t) => (
            <TeamIssueGroup key={t.id} teamId={t.id} title={`${t.emoji} ${t.name}`} issues={issues.filter((i) => i.team_id === t.id)} />
          ))}
        </div>
      )}
      {tab === 'updates' && <Updates project={project} />}
      {tab === 'docs' && <ProjectDocs project={project} />}
    </div>
  );
}

function TeamIssueGroup({ teamId, title, issues }: { teamId: string; title: string; issues: Issue[] }) {
  const bundle = useTeamBundle(teamId);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">{title}</div>
      <IssueList issues={issues} bundle={bundle} teamId={teamId} emptyText="No issues from this team yet." />
    </Card>
  );
}

function Overview({
  project, issues, stateById, save,
}: { project: Project; issues: Issue[]; stateById: Map<string, import('../lib/types').WorkflowState>; save: (v: Partial<Project>) => void }) {
  const [desc, setDesc] = useState(project.description ?? '');
  const stats = projectStats(issues, stateById);
  const series = progressSeries(issues, stateById, project.start_date);
  const prediction = predictCompletion(issues, stateById);
  const late = prediction ? lateness(prediction.date, project.target_date) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <MarkdownEditor
            value={desc}
            onChange={setDesc}
            onBlur={() => desc !== (project.description ?? '') && save({ description: desc })}
            placeholder="Describe the project: goals, scope, who it's for…"
            startInPreview
          />
        </Card>
        <Card className="p-4">
          <div className="mb-1 text-sm font-semibold">Progress</div>
          {series.length ? <ProgressChart data={series} /> : <p className="py-6 text-center text-sm text-muted">Add issues to see progress over time.</p>}
        </Card>
        <MilestonesCard project={project} issues={issues} stateById={stateById} />
      </div>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted">Completion</div>
          <div className="mt-1 font-display text-4xl font-bold tabular-nums">{stats.pct}%</div>
          <Progress value={stats.pct} color={project.color} className="mt-3" />
          <div className="mt-2 text-xs text-muted">{stats.done} of {stats.total} issues done</div>
          <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium"><Sparkles className="size-4 text-brand-500" /> Prediction</div>
            {prediction ? (
              <p className="mt-1 text-muted">
                At the current pace, done by <b className="text-ink">{fmtDate(prediction.date, 'MMM d, yyyy')}</b>
                {late != null && (
                  <span className={cn('ml-1 font-medium', late > 0 ? 'text-red-600' : 'text-brand-600')}>
                    ({late > 0 ? `${late}d after target` : late === 0 ? 'right on target' : `${-late}d early`})
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-muted">Not enough recent progress to predict yet.</p>
            )}
          </div>
          {project.health && (
            <div className="mt-3 text-sm">
              Latest health: {HEALTH_META[project.health].emoji} <b>{HEALTH_META[project.health].label}</b>
            </div>
          )}
        </Card>
        <DependenciesCard project={project} />
      </div>
    </div>
  );
}

function MilestonesCard({ project, issues, stateById }: { project: Project; issues: Issue[]; stateById: Map<string, import('../lib/types').WorkflowState> }) {
  const { data: milestones = [] } = useMilestones([project.id]);
  const db = useDb([['milestones']]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await db.mutateAsync({
      op: 'insert',
      table: 'milestones',
      values: { project_id: project.id, name: name.trim(), target_date: date || null, position: milestones.length },
    });
    setName('');
    setDate('');
  };

  return (
    <Card className="p-4">
      <div className="mb-3 text-sm font-semibold">Milestones</div>
      <div className="space-y-2">
        {milestones.map((m: Milestone) => {
          const s = projectStats(issues.filter((i) => i.milestone_id === m.id), stateById);
          return (
            <div key={m.id} className="group flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              <Diamond className={cn('size-4', s.total && s.pct === 100 ? 'fill-brand-500 text-brand-500' : 'text-muted')} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="text-xs text-muted">{m.target_date ? fmtDate(m.target_date, 'MMM d, yyyy') : 'No date'} · {s.done}/{s.total} issues</div>
              </div>
              <Progress value={s.pct} className="w-20" />
              <Input
                type="date"
                value={m.target_date ?? ''}
                onChange={(e) => db.mutate({ op: 'update', table: 'milestones', match: { id: m.id }, values: { target_date: e.target.value || null } })}
                className="hidden h-7 w-32 text-xs sm:block"
                aria-label="Milestone date"
              />
              <button
                onClick={() => db.mutate({ op: 'delete', table: 'milestones', match: { id: m.id } })}
                className="rounded p-1 text-muted opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                aria-label="Delete milestone"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New milestone, e.g. “Beta launch”" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Button onClick={add} icon={<Plus className="size-4" />}>Add</Button>
      </div>
    </Card>
  );
}

function DependenciesCard({ project }: { project: Project }) {
  const { data: deps = [] } = useDependencies();
  const { data: all = [] } = useProjects();
  const db = useDb([['project_dependencies']]);
  const byId = new Map(all.map((p) => [p.id, p]));
  const blockedBy = deps.filter((d) => d.blocked_project_id === project.id).map((d) => byId.get(d.blocking_project_id)).filter(Boolean) as Project[];
  const blocks = deps.filter((d) => d.blocking_project_id === project.id).map((d) => byId.get(d.blocked_project_id)).filter(Boolean) as Project[];
  const candidates = all.filter((p) => p.id !== project.id && !blockedBy.includes(p));

  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold">Dependencies</div>
      {[{ title: 'Blocked by', list: blockedBy, dir: 'in' }, { title: 'Blocks', list: blocks, dir: 'out' }].map((g) => (
        <div key={g.title} className="mb-2">
          <div className="text-xs text-muted">{g.title}</div>
          {g.list.length === 0 && <div className="text-xs text-muted/70">Nothing</div>}
          {g.list.map((p) => (
            <div key={p.id} className="group flex items-center gap-2 py-1 text-sm">
              <Link to={`/projects/${p.id}`} className="flex-1 truncate hover:underline">{p.emoji} {p.name}</Link>
              <button
                onClick={() =>
                  db.mutate({
                    op: 'delete',
                    table: 'project_dependencies',
                    match: g.dir === 'in'
                      ? { blocking_project_id: p.id, blocked_project_id: project.id }
                      : { blocking_project_id: project.id, blocked_project_id: p.id },
                  })
                }
                className="text-muted opacity-0 hover:text-red-600 group-hover:opacity-100"
                aria-label="Remove dependency"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ))}
      <Select
        value=""
        onChange={(e) =>
          e.target.value &&
          db.mutate({ op: 'insert', table: 'project_dependencies', values: { blocking_project_id: e.target.value, blocked_project_id: project.id } })
        }
        className="mt-1 h-8 w-full text-[13px]"
      >
        <option value="">+ Add a project this is blocked by…</option>
        {candidates.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
      </Select>
    </Card>
  );
}

function Updates({ project }: { project: Project }) {
  const { profile } = useAuth();
  const { data: updates = [] } = useProjectUpdates(project.id);
  const { data: profiles = [] } = useProfiles();
  const db = useDb([['project_updates', project.id], ['project', project.id], ['projects']], 'Update posted');
  const [health, setHealth] = useState<ProjectHealth>(project.health ?? 'on_track');
  const [body, setBody] = useState('');

  const post = async () => {
    if (!body.trim()) return;
    await db.mutateAsync({ op: 'insert', table: 'project_updates', values: { project_id: project.id, health, body, author_id: profile?.id } });
    unwrap(await supabase.from('projects').update({ health }).eq('id', project.id));
    setBody('');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="p-4">
        <div className="mb-2 flex gap-1.5">
          {(Object.keys(HEALTH_META) as ProjectHealth[]).map((h) => (
            <button
              key={h}
              onClick={() => setHealth(h)}
              className={cn('rounded-full border px-3 py-1 text-sm transition', health === h ? 'border-current font-medium' : 'border-line text-muted')}
              style={health === h ? { color: HEALTH_META[h].color, background: `${HEALTH_META[h].color}14` } : undefined}
            >
              {HEALTH_META[h].emoji} {HEALTH_META[h].label}
            </button>
          ))}
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="How's it going? What shipped, what's blocked, what's next?" />
        <div className="mt-2 flex justify-end">
          <Button variant="primary" onClick={post} loading={db.isPending} disabled={!body.trim()}>Post update</Button>
        </div>
      </Card>
      {updates.map((u) => {
        const author = profiles.find((p) => p.id === u.author_id);
        return (
          <Card key={u.id} className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <Avatar name={author?.name} src={author?.avatar_url} size={22} />
              <b>{author?.name ?? 'Someone'}</b>
              <span style={{ color: HEALTH_META[u.health].color }}>{HEALTH_META[u.health].emoji} {HEALTH_META[u.health].label}</span>
              <span className="ml-auto text-xs text-muted">{ago(u.created_at)}</span>
            </div>
            <Markdown>{u.body}</Markdown>
          </Card>
        );
      })}
      {updates.length === 0 && <p className="text-center text-sm text-muted">No updates yet. Post one weekly to keep everyone in the loop.</p>}
    </div>
  );
}

function ProjectDocs({ project }: { project: Project }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: docs = [] } = useDocs({ projectId: project.id });
  const db = useDb([['documents']]);

  const create = async (title: string, content: string) => {
    const [doc] = (await db.mutateAsync({
      op: 'insert',
      table: 'documents',
      values: { project_id: project.id, title, content, created_by: profile?.id, updated_by: profile?.id },
    })) as { id: string }[];
    navigate(`/docs/${doc.id}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => create('Untitled', '')}>New doc</Button>
        <Button size="sm" onClick={() => create(`${project.name} — PRD`, PRD_TEMPLATE)}>PRD template</Button>
        <Button size="sm" onClick={() => create(`${project.name} — Tech spec`, SPEC_TEMPLATE)}>Tech spec template</Button>
      </div>
      {docs.length === 0 && <p className="py-6 text-center text-sm text-muted">Write briefs, PRDs and specs right next to the work.</p>}
      {docs.map((d) => (
        <Link key={d.id} to={`/docs/${d.id}`}>
          <Card className="mb-2 flex items-center gap-3 p-3 hover:border-brand-300">
            <FileText className="size-4 text-muted" />
            <span className="flex-1 truncate font-medium">{d.emoji} {d.title}</span>
            <span className="text-xs text-muted">edited {ago(d.updated_at)}</span>
            <ArrowRight className="size-4 text-muted" />
          </Card>
        </Link>
      ))}
    </div>
  );
}

const PRD_TEMPLATE = `## Problem
What problem are we solving, and for whom?

## Goals
-

## Non-goals
-

## User stories
- As a ___, I want ___ so that ___.

## Requirements
| Priority | Requirement |
|---|---|
| P0 | |

## Open questions
-
`;

const SPEC_TEMPLATE = `## Overview

## Architecture

## Data model

## API

## Rollout plan

## Risks
`;
