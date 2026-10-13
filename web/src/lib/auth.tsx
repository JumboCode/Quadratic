import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from './supabase';
import type { Profile, TeamRole } from './types';

interface AuthState {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  /** team_id → my role on that team */
  roles: Record<string, TeamRole>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      // Drop the ?code= left behind by the OAuth redirect.
      if (location.search.includes('code=')) {
        history.replaceState(null, '', location.pathname + location.hash);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id;
  const profileQ = useQuery({
    queryKey: ['me', userId],
    enabled: !!userId,
    queryFn: async () => {
      const profile = unwrap(await supabase.from('profiles').select('*').eq('id', userId!).single()) as Profile;
      const memberships = unwrap(await supabase.from('team_members').select('team_id, role').eq('user_id', userId!)) as {
        team_id: string;
        role: TeamRole;
      }[];
      return { profile, roles: Object.fromEntries(memberships.map((m) => [m.team_id, m.role])) };
    },
  });

  const value: AuthState = {
    session,
    loading: !ready || (!!userId && profileQ.isLoading),
    profile: profileQ.data?.profile ?? null,
    roles: profileQ.data?.roles ?? {},
    signIn: async () => {
      await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: location.origin + location.pathname },
      });
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
