import { App } from 'npm:@octokit/app@15';
import { env, HttpError } from './http.ts';
import { normalizePrivateKey } from './pem.ts';
import { hasGithubFooter, stripGithubFooter } from './refs.ts';

let app: App | null = null;

export function githubApp(): App {
  if (!app) {
    let privateKey: string;
    try {
      // Handles any paste format, and converts GitHub's PKCS#1 key to the PKCS#8 WebCrypto needs.
      privateKey = normalizePrivateKey(env('GITHUB_APP_PRIVATE_KEY'));
    } catch (e) {
      throw new HttpError(500, (e as Error).message);
    }
    app = new App({ appId: env('GITHUB_APP_ID'), privateKey });
  }
  return app;
}

export function installationOctokit(installationId: number) {
  return githubApp().getInstallationOctokit(installationId);
}

/** The bot account our App acts as. Webhooks it triggers are ignored to avoid sync loops. */
export function botLogin(): string {
  return `${env('GITHUB_APP_SLUG')}[bot]`;
}

// deno-lint-ignore no-explicit-any
type GithubIssue = any;

/** Arguments for the github_upsert_issue RPC from a GitHub issue (webhook payload or API response). */
export function issueSyncArgs(issue: GithubIssue) {
  return {
    p_github_id: issue.id,
    p_number: issue.number,
    p_url: issue.html_url,
    p_title: issue.title,
    p_body: stripGithubFooter(issue.body),
    p_has_footer: hasGithubFooter(issue.body),
    p_open: issue.state === 'open',
    p_state_reason: issue.state_reason ?? null,
    p_assignee_logins: (issue.assignees ?? []).map((a: { login: string }) => a.login),
    p_label_names: (issue.labels ?? [])
      .map((l: string | { name?: string }) => (typeof l === 'string' ? l : l.name ?? ''))
      .filter(Boolean),
    p_updated_at: issue.updated_at,
  };
}

export function splitRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/');
  return { owner, repo };
}

/** Constant-time check of the X-Hub-Signature-256 header. */
export async function verifyWebhookSignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env('GITHUB_WEBHOOK_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = 'sha256=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
