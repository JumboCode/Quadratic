// Slack actions for the settings pages.
import { admin, env, HttpError, json, requireTeamMember, requireUser, serve } from '../_shared/http.ts';
import { context, getSlackInstall, postMessage, section, slackApi } from '../_shared/slack.ts';
import { signState } from '../_shared/state.ts';

const SCOPES = ['chat:write', 'chat:write.public', 'im:write', 'users:read', 'users:read.email', 'channels:read', 'channels:join'];

serve(async (req) => {
  const caller = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case 'authorize_url': {
      if (!caller.isAdmin) throw new HttpError(403, 'only admins can connect Slack');
      const url = new URL('https://slack.com/oauth/v2/authorize');
      url.searchParams.set('client_id', env('SLACK_CLIENT_ID'));
      url.searchParams.set('scope', SCOPES.join(','));
      url.searchParams.set('redirect_uri', `${env('SUPABASE_URL')}/functions/v1/slack-oauth`);
      url.searchParams.set('state', await signState(caller.user.id));
      return json({ url: url.toString() });
    }

    case 'disconnect': {
      if (!caller.isAdmin) throw new HttpError(403, 'only admins can disconnect Slack');
      await admin.from('integration_secrets').delete().eq('key', 'slack');
      return json({ ok: true });
    }

    case 'channels': {
      const channels: { id: string; name: string }[] = [];
      let cursor: string | undefined;
      do {
        const res = await slackApi('conversations.list', {
          types: 'public_channel', exclude_archived: true, limit: 1000, cursor,
        });
        channels.push(...res.channels.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        cursor = res.response_metadata?.next_cursor || undefined;
      } while (cursor);
      channels.sort((a, b) => a.name.localeCompare(b.name));
      return json({ channels });
    }

    case 'test': {
      await requireTeamMember(caller, body.team_id);
      const { data: team } = await admin.from('teams').select('name, emoji, slack_channel_id').eq('id', body.team_id).single();
      if (!team?.slack_channel_id) throw new HttpError(400, 'pick a Slack channel first');
      const text = `👋 Quadratic is connected to ${team.emoji} *${team.name}*! Reminders and updates will show up here.`;
      // chat:write.public lets us post without being invited, but joining makes it show in the member list.
      await slackApi('conversations.join', { channel: team.slack_channel_id }).catch(() => {});
      await postMessage(team.slack_channel_id, text, [section(text), context('Change what gets posted in Team settings → Notifications.')]);
      return json({ ok: true });
    }

    case 'match_people': {
      // Fill in Slack IDs for devs from their email so reminders can DM them.
      await requireTeamMember(caller, body.team_id);
      if (!(await getSlackInstall())) throw new HttpError(400, 'Slack is not connected yet');
      const { data: people } = await admin
        .from('people')
        .select('id, email')
        .eq('team_id', body.team_id)
        .is('slack_user_id', null)
        .not('email', 'is', null);
      let matched = 0;
      const missing: string[] = [];
      for (const p of people ?? []) {
        try {
          const res = await slackApi('users.lookupByEmail', { email: p.email });
          await admin.from('people').update({ slack_user_id: res.user.id }).eq('id', p.id);
          matched++;
        } catch {
          missing.push(p.email!);
        }
      }
      return json({ matched, missing });
    }

    default:
      throw new HttpError(400, `unknown action ${body.action}`);
  }
});
