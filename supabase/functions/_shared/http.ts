import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Missing secret ${name}. See docs/SETUP.md.`);
  return v;
}

/** Service-role client. Bypasses RLS: only use after checking who is calling. */
export const admin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Wraps a handler with CORS preflight and error → JSON conversion. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      return await handler(req);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, status);
    }
  });
}

/** For functions called by pg_cron / triggers. */
export function requireInternal(req: Request) {
  if (req.headers.get('x-internal-secret') !== env('INTERNAL_SECRET')) {
    throw new HttpError(401, 'unauthorized');
  }
}

export interface Caller {
  user: User;
  isAdmin: boolean;
}

export async function requireUser(req: Request): Promise<Caller> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) throw new HttpError(401, 'not signed in');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'not signed in');
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', data.user.id).single();
  return { user: data.user, isAdmin: !!profile?.is_admin };
}

export async function requireTeamMember(caller: Caller, teamId: string) {
  if (caller.isAdmin) return;
  const { data } = await admin
    .from('team_members')
    .select('team_id')
    .eq('team_id', teamId)
    .eq('user_id', caller.user.id)
    .maybeSingle();
  if (!data) throw new HttpError(403, 'not a member of this team');
}

export function appUrl(path = ''): string {
  const base = (Deno.env.get('APP_URL') ?? 'http://localhost:5173/').replace(/\/?$/, '/');
  return `${base}#${path}`;
}
