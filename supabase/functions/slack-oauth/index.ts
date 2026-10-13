// Slack OAuth redirect target: exchanges the code for a bot token and stores it server-side.
import { admin, appUrl, env } from '../_shared/http.ts';
import { verifyState } from '../_shared/state.ts';

const back = (status: string) => Response.redirect(appUrl(`/admin?slack=${status}`), 302);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('error')) return back('cancelled');

  const userId = await verifyState(url.searchParams.get('state'));
  if (!userId) return back('expired');
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', userId).single();
  if (!profile?.is_admin) return back('forbidden');

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('SLACK_CLIENT_ID'),
      client_secret: env('SLACK_CLIENT_SECRET'),
      code: url.searchParams.get('code') ?? '',
      redirect_uri: `${env('SUPABASE_URL')}/functions/v1/slack-oauth`,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error('slack oauth failed', data.error);
    return back('error');
  }

  await admin.from('integration_secrets').upsert({
    key: 'slack',
    value: {
      access_token: data.access_token,
      bot_user_id: data.bot_user_id,
      team_id: data.team?.id,
      team_name: data.team?.name,
    },
    updated_at: new Date().toISOString(),
  });
  return back('connected');
});
