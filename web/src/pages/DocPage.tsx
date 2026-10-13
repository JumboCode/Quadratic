import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced autosave
  useEffect(() => {
    if (title === doc.title && content === doc.content && emoji === doc.emoji) return;
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus('saving');
      unwrap(await supabase.from('documents').update({ title, content, emoji, updated_by: profile?.id }).eq('id', doc.id));
      qc.invalidateQueries({ queryKey: ['documents'] });
      setStatus('saved');
    }, 800);
    return () => clearTimeout(timer.current);
  }, [title, content, emoji, doc, profile?.id, qc]);

  const back = project ? `/projects/${project.id}` : team ? `/team/${team.key}/docs` : '/';

  const remove = async () => {
    if (!confirm(`Delete "${title}"?`)) return;
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
          {status === 'saved' ? `Saved · edited ${ago(doc.updated_at)}` : status === 'saving' ? 'Saving…' : 'Unsaved changes'}
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
