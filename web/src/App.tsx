import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { Login, NoAccess, SetupNeeded } from './pages/Gate';
import { Home } from './pages/Home';
import { Inbox } from './pages/Inbox';
import { IssuePage } from './pages/IssuePage';
import { TeamLayout } from './pages/team/TeamLayout';
import { Board } from './pages/team/Board';
import { IssuesPage } from './pages/team/IssuesPage';
import { Cycles } from './pages/team/Cycles';
import { CycleDetail } from './pages/team/CycleDetail';
import { Projects } from './pages/team/Projects';
import { TeamRoadmap } from './pages/team/TeamRoadmap';
import { Docs } from './pages/team/Docs';
import { Settings } from './pages/team/Settings';
import { ProjectPage } from './pages/ProjectPage';
import { DocPage } from './pages/DocPage';
import { ClubRoadmap } from './pages/ClubRoadmap';
import { Admin } from './pages/Admin';

export default function App() {
  const { session, loading, profile, roles } = useAuth();

  if (!isConfigured) return <SetupNeeded />;
  if (loading) return <PageLoader />;
  if (!session) return <Login />;
  // Leadership-only: you need a team (or admin) to get in.
  if (profile && !profile.is_admin && Object.keys(roles).length === 0) return <NoAccess />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="roadmap" element={<ClubRoadmap />} />
        <Route path="admin" element={<Admin />} />
        <Route path="issue/:identifier" element={<IssuePage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="docs/:docId" element={<DocPage />} />
        <Route path="team/:teamKey" element={<TeamLayout />}>
          <Route index element={<Navigate to="board" replace />} />
          <Route path="board" element={<Board />} />
          <Route path="issues" element={<IssuesPage />} />
          <Route path="cycles" element={<Cycles />} />
          <Route path="cycles/:cycleId" element={<CycleDetail />} />
          <Route path="projects" element={<Projects />} />
          <Route path="roadmap" element={<TeamRoadmap />} />
          <Route path="docs" element={<Docs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/:tab" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
