import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDoc, useProject, useTeams } from '../lib/queries';
import { supabase, unwrap } from '../lib/supabase';
import type { Doc } from '../lib/types';
import { ago } from '../lib/utils';
import { Button, Empty, PageLoader } from '../components/ui';
import { MarkdownEditor } from '../components/Markdown';

export function DocPage() {
  const { docId } = useParams();
  const { data: doc, isLoading } = useDoc(docId);
  if (isLoading) return <PageLoader />;
  if (!doc) return <Empty title="Doc not found" />;
  return <DocEditor key={doc.id} doc={doc} />;
}

const EMOJIS = ['📄', '📝', '📐', '🧭', '🔁', '👋', '💡', '📣', '🧪', '🗺️'];

function DocEditor({ doc }: { doc: Doc }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: teams = [] } = useTeams();
  const { data: project } = useProject(doc.project_id ?? undefined);
  const team = teams.find((t) => t.id === doc.team_id);
  const [title, setTitle] = useState(doc.title);
  const [emoji, setEmoji] = useState(doc.emoji);
  const [content, setContent] = useState(doc.content);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [savedAt, setSavedAt] = useState(doc.updated_at);

  // What the database has, per our last save or load. Autosave compares against this, never
  // against the `doc` prop: that prop can be an older cached copy, and comparing against it
  // once wrote the stale template back over a user's text.
  const saved = useRef({ title: doc.title, content: doc.content, emoji: doc.emoji, updated_at: doc.updated_at });
  const latest = useRef({ title, content, emoji });
  latest.current = { title, content, emoji };
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const deleted = useRef(false);

  const isDirty = () => {
    const s = saved.current;
    const l = latest.current;
    return l.title !== s.title || l.content !== s.content || l.emoji !== s.emoji;
  };

  const save = async () => {
    if (deleted.current || !isDirty()) return;
    const values = { ...latest.current };
    setStatus('saving');
    try {
      const row = unwrap(
        await supabase.from('documents').update({ ...values, updated_by: profile?.id }).eq('id', doc.id).select().single(),
      ) as Doc;
      saved.current = { title: row.title, content: row.content, emoji: row.emoji, updated_at: row.updated_at };
      setSavedAt(row.updated_at);
      // Keep the cached copy current so reopening the doc shows what was just saved.
      qc.setQueryData(['document', doc.id], row);
      qc.invalidateQueries({ queryKey: ['documents'] });
      setStatus(isDirty() ? 'dirty' : 'saved');
    } catch (e) {
      setStatus('dirty');
      toast.error(`Couldn't save: ${(e as Error).message}`);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Debounced autosave
  useEffect(() => {
    if (!isDirty()) return;
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveRef.current(), 800);
    return () => clearTimeout(timer.current);
  }, [title, content, emoji]);

  // Leaving the page (in-app) mid-debounce: save right away instead of dropping the last edits.
  // Closing the tab with unsaved changes: ask first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimeout(timer.current);
      void saveRef.current();
    };
  }, []);

  // A newer version arrived from the server (a teammate's edit, or a refetch). Adopt it, but
  // only when there are no local unsaved changes to clobber.
  useEffect(() => {
    if (doc.updated_at === saved.current.updated_at || isDirty()) return;
    saved.current = { title: doc.title, content: doc.content, emoji: doc.emoji, updated_at: doc.updated_at };
    setTitle(doc.title);
    setContent(doc.content);
    setEmoji(doc.emoji);
    setSavedAt(doc.updated_at);
  }, [doc]);

  const back = project ? `/projects/${project.id}` : team ? `/team/${team.key}/docs` : '/';

  const remove = async () => {
    if (!confirm(`Delete "${title}"?`)) return;
    deleted.current = true; // don't let the leave-page save resurrect it
    clearTimeout(timer.current);
    unwrap(await supabase.from('documents').delete().eq('id', doc.id));
    qc.invalidateQueries({ queryKey: ['documents'] });
    navigate(back);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <div className="flex items-center gap-3 text-sm">
        <Link to={back} className="flex items-center gap-1 text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> {project ? `${project.emoji} ${project.name}` : team ? `${team.emoji} ${team.name} docs` : 'Back'}
        </Link>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          {status === 'saving' ? <Loader2 className="size-3 animate-spin" /> : status === 'saved' ? <Check className="size-3 text-brand-500" /> : null}
          {status === 'saved' ? `Saved · edited ${ago(savedAt)}` : status === 'saving' ? 'Saving…' : 'Unsaved changes'}
        </span>
        <Button variant="ghost" size="sm" className="text-red-600" onClick={remove} icon={<Trash2 className="size-3.5" />} aria-label="Delete doc" />
      </div>
      <div className="flex items-center gap-2">
        <select value={emoji} onChange={(e) => setEmoji(e.target.value)} className="rounded-lg bg-transparent text-3xl outline-none hover:bg-surface-2" aria-label="Icon">
          {EMOJIS.map((e) => <option key={e}>{e}</option>)}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent font-display text-3xl font-extrabold outline-none"
          placeholder="Untitled"
          aria-label="Title"
        />
      </div>
      <MarkdownEditor value={content} onChange={setContent} placeholder="Start writing… (markdown supported)" minRows={20} startInPreview={!!doc.content} />
    </div>
  );
}
