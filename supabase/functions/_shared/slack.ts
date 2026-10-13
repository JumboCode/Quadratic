import { admin, HttpError } from './http.ts';

// deno-lint-ignore no-explicit-any
export type Block = Record<string, any>;

export interface SlackInstall {
  access_token: string;
  team_id: string;
  team_name: string;
  bot_user_id: string;
}

export async function getSlackInstall(): Promise<SlackInstall | null> {
  const { data } = await admin.from('integration_secrets').select('value').eq('key', 'slack').maybeSingle();
  return (data?.value as SlackInstall) ?? null;
}

// deno-lint-ignore no-explicit-any
export async function slackApi(method: string, body: Record<string, unknown>, token?: string): Promise<any> {
  const tok = token ?? (await getSlackInstall())?.access_token;
  if (!tok) throw new HttpError(400, 'Slack is not connected yet');
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new HttpError(502, `Slack ${method} failed: ${data.error}`);
  return data;
}

export async function postMessage(channel: string, text: string, blocks?: Block[]) {
  return slackApi('chat.postMessage', { channel, text, blocks, unfurl_links: false });
}

/** DM a Slack user. chat.postMessage to a user ID opens the bot's DM with them. */
export async function sendDm(slackUserId: string, text: string, blocks?: Block[]) {
  return postMessage(slackUserId, text, blocks);
}

export const section = (text: string): Block => ({ type: 'section', text: { type: 'mrkdwn', text } });
export const context = (text: string): Block => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });
export const divider: Block = { type: 'divider' };
export const button = (text: string, url: string): Block => ({
  type: 'actions',
  elements: [{ type: 'button', text: { type: 'plain_text', text, emoji: true }, url, style: 'primary' }],
});

/** Escape user text for Slack mrkdwn. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
