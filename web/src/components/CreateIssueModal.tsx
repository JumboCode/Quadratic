import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Github } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  useCreateIssue, useCycles, useLabels, usePeople, useProjects, useRepos, useStates, useTeams, useTemplates,
} from '../lib/queries';
import { useUI } from '../lib/ui-context';
import { Button, Input, Modal, Select, Switch } from './ui';
import { MarkdownEditor } from './Markdown';
import {
  AssigneePicker, CyclePicker, DueDateInput, EstimateInput, LabelPicker, PriorityPicker, ProjectPicker, StatePicker,
} from './issue/pickers';

export function CreateIssueModal() {
  const ui = useUI();
  const open = ui.createIssue !== null;
  return (
    <Modal open={open} onClose={ui.closeCreateIssue} title="New issue" wide>
      {open && <CreateIssueForm />}
    </Modal>
  );
}

function CreateIssueForm() {
  const ui = useUI();
  const defaults = ui.createIssue ?? {};
  const navigate = useNavigate();
  const { roles, profile } = useAuth();
  const { data: allTeams = [] } = useTeams();
  const teams = allTeams.filter((t) => !t.archived && (roles[t.id] || profile?.is_admin));

  const [teamId, setTeamId] = useState(defaults.team_id ?? teams[0]?.id ?? '');
  const { data: states = [] } = useStates(teamId);
  const { data: labels = [] } = useLabels(teamId);
  const { data: people = [] } = usePeople(teamId);
  const { data: cycles = [] } = useCycles(teamId);
  const { data: projects = [] } = useProjects(teamId);
  const { data: templates = [] } = useTemplates(teamId);
  const { data: repos = [] } = useRepos(teamId);
  const create = useCreateIssue();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stateId, setStateId] = useState(defaults.state_id ?? '');
  const [priority, setPriority] = useState(0);
  const [assignee, setAssignee] = useState<string | null>(defaults.assignee_id ?? null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(defaults.cycle_id ?? null);
  const [projectId, setProjectId] = useState<string | null>(defaults.project_id ?? null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(false);

  // Pick a sensible default status once the team's states load (Todo, or Backlog).
  const defaultState = useMemo(
    () => states.find((s) => s.category === 'unstarted') ?? states.find((s) => s.category === 'backlog'),
    [states],
  );
  useEffect(() => {
    if (!states.some((s) => s.id === stateId) && defaultState) setStateId(defaultState.id);
  }, [states, stateId, defaultState]);

  useEffect(() => {
    if (!teamId && teams[0]) setTeamId(teams[0].id);
  }, [teamId, teams]);

  const switchTeam = (id: string) => {
    setTeamId(id);
    setLabelIds([]);
    setAssignee(null);
    setCycleId(null);
    setProjectId(null);
  };

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle((cur) => (cur.startsWith(t.title) ? cur : t.title + cur));
    setDescription(t.description);
    setPriority(t.priority);
    setLabelIds(t.label_ids);
  };

  const defaultRepo = repos.find((r) => r.is_default);

  const submit = async () => {
    if (!title.trim() || !teamId || !stateId) return;
    const issue = await create.mutateAsync({
      issue: {
        team_id: teamId,
        title: title.trim(),
        description,
        state_id: stateId,
        priority,
        assignee_id: assignee,
        cycle_id: cycleId,
        project_id: projectId,
        milestone_id: defaults.milestone_id ?? null,
        parent_id: defaults.parent_id ?? null,
        estimate,
        due_date: due,
      },
      labelIds,
    });
    toast.success(`Created ${issue.identifier}`, {
      description: defaultRepo ? `Opening on GitHub in ${defaultRepo.full_name}…` : undefined,
      action: { label: 'Open', onClick: () => navigate(`/issue/${issue.identifier}`) },
    });
    if (createMore) {
      setTitle('');
      setDescription('');
    } else {
      ui.closeCreateIssue();
    }
  };

  if (teams.length === 0) {
    return <div className="p-6 text-sm text-muted">You're not on a team yet, so there's nowhere to put issues.</div>;
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
    >
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={teamId} onChange={(e) => switchTeam(e.target.value)} className="h-8 text-[13px]">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>
            ))}
          </Select>
          {templates.length > 0 && (
            <Select value="" onChange={(e) => applyTemplate(e.target.value)} className="h-8 text-[13px]">
              <option value="">Use a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
        </div>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          className="h-11 border-none px-0 text-lg font-semibold shadow-none focus:ring-0"
        />
        <MarkdownEditor value={description} onChange={setDescription} placeholder="Add a description… (markdown supported)" minRows={5} />
        <div className="flex flex-wrap gap-1.5">
          {states.length > 0 && <StatePicker states={states} value={stateId} onChange={setStateId} />}
          <PriorityPicker value={priority} onChange={setPriority} />
          <AssigneePicker people={people} value={assignee} onChange={setAssignee} />
          <LabelPicker labels={labels} value={labelIds} onChange={setLabelIds} />
          <EstimateInput value={estimate} onChange={setEstimate} />
          <DueDateInput value={due} onChange={setDue} />
          <CyclePicker cycles={cycles} value={cycleId} onChange={setCycleId} />
          <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-5 py-3">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Github className="size-3.5" />
          {defaultRepo ? `Syncs to ${defaultRepo.full_name}` : 'No GitHub repo linked — planner only'}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <Switch checked={createMore} onChange={setCreateMore} label="Create more" /> Create more
        </label>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!title.trim()}>
          Create issue
        </Button>
      </div>
    </form>
  );
}
