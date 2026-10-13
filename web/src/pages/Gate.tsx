import { motion } from 'framer-motion';
import { Github, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Mascot } from '../components/Mascot';
import { Button, Card } from '../components/ui';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-6">
      {/* soft green blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-brand-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[28rem] rounded-full bg-brand-500/20 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 24 }} className="relative w-full max-w-md">
        <Card className="p-8 text-center shadow-xl shadow-brand-900/5">{children}</Card>
      </motion.div>
    </div>
  );
}

export function Login() {
  const { signIn } = useAuth();
  return (
    <Shell>
      <motion.div animate={{ rotate: [0, -4, 4, 0] }} transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }} className="mx-auto mb-4 w-fit">
        <Mascot className="size-28" />
      </motion.div>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Quadratic</h1>
      <p className="mt-2 text-muted">
        JumboCode's planning HQ. Sprints, projects and roadmaps for team leadership, synced to GitHub and Slack.
      </p>
      <Button variant="primary" className="mt-6 h-11 w-full text-base" onClick={signIn} icon={<Github className="size-5" />}>
        Sign in with GitHub
      </Button>
      <p className="mt-4 text-xs text-muted">For PMs, tech leads and designers. Devs: your issues live on GitHub 💚</p>
    </Shell>
  );
}

export function NoAccess() {
  const { profile, signOut } = useAuth();
  return (
    <Shell>
      <Mascot className="mx-auto mb-4 size-24" />
      <h1 className="font-display text-2xl font-bold">You're not on a team yet</h1>
      <p className="mt-2 text-sm text-muted">
        Ask a JumboCode admin or one of your team's leads to invite <b className="text-ink">@{profile?.github_login}</b>. You'll get
        access as soon as they do, so just refresh this page.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => location.reload()}>Refresh</Button>
        <Button variant="ghost" onClick={signOut} icon={<LogOut className="size-4" />}>Sign out</Button>
      </div>
    </Shell>
  );
}

export function SetupNeeded() {
  return (
    <Shell>
      <Mascot className="mx-auto mb-4 size-24" />
      <h1 className="font-display text-2xl font-bold">Almost there!</h1>
      <p className="mt-2 text-sm text-muted">
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>web/.env.local</code> (or as GitHub
        Actions variables for the deployed site). See <code>docs/SETUP.md</code>.
      </p>
    </Shell>
  );
}
