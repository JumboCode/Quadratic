import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useDb, useDocs, useProfiles } from '../../lib/queries';
import { ago } from '../../lib/utils';
import { Button, Card, Empty, PageLoader } from '../../components/ui';
import { useTeamCtx } from './TeamLayout';

const TEMPLATES = [
  { title: 'Meeting notes', emoji: '📝', content: '## Attendees\n- \n\n## Agenda\n1. \n\n## Notes\n\n## Action items\n- [ ] ' },
  { title: 'Retro', emoji: '🔁', content: '## What went well 🎉\n- \n\n## What could be better 🤔\n- \n\n## Action items\n- [ ] ' },
  { title: 'Onboarding guide', emoji: '👋', content: '## Welcome to the team!\n\n## Setup\n1. Clone the repo\n2. \n\n## Who to ask\n- PM: \n- Tech lead: \n- Designer: \n\n## Useful links\n- ' },
];

export function Docs() {
  const { team } = useTeamCtx();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: docs = [], isLoading } = useDocs({ teamId: team.id });
  const { data: profiles = [] } = useProfiles();
  const db = useDb([['documents']]);

  const create = async (title = 'Untitled', content = '', emoji = '📄') => {
    const [doc] = (await db.mutateAsync({
      op: 'insert',
      table: 'documents',
      values: { team_id: team.id, title, content, emoji, created_by: profile?.id, updated_by: profile?.id },
    })) as { id: string }[];
    navigate(`/docs/${doc.id}`);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="font-display text-xl font-bold">Docs</h2>
          <p className="text-sm text-muted">Team notes, retros and guides. Project specs live on each project.</p>
        </div>
        {TEMPLATES.map((t) => (
          <Button key={t.title} size="sm" onClick={() => create(t.title, t.content, t.emoji)}>{t.emoji} {t.title}</Button>
        ))}
        <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => create()}>New doc</Button>
      </div>
      {docs.length === 0 ? (
        <Empty title="No docs yet">Start with meeting notes or an onboarding guide for new devs.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {docs.map((d) => {
            const editor = profiles.find((p) => p.id === d.updated_by);
            return (
              <Link key={d.id} to={`/docs/${d.id}`}>
                <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:border-brand-300">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="text-lg">{d.emoji}</span>
                    <span className="truncate">{d.title}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{d.content.replace(/[#*_`>-]/g, '').slice(0, 160) || 'Empty'}</p>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                    <FileText className="size-3" /> Edited {ago(d.updated_at)}{editor ? ` by ${editor.name}` : ''}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
