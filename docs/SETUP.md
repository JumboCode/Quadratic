# Setting up Quadratic

This takes about 45 minutes the first time. You need admin access to the JumboCode GitHub org and permission to install apps in the JumboCode Slack.

Throughout, replace `<ref>` with your Supabase project ref (the `abcd1234` in `https://abcd1234.supabase.co`).

## How the pieces fit

```
GitHub Pages (web/)  ──►  Supabase: Postgres + Auth + Edge Functions + pg_cron
                                ▲                 │
               GitHub App webhooks          Slack Web API
```

GitHub Pages only serves static files, so everything that needs a secret or has to run on a schedule lives in Supabase. That covers GitHub webhooks, creating GitHub issues, Slack messages and reminders. The free tier is enough for the club.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (free plan). Save the **database password**.
2. Open **Project settings → API** and note the **Project URL** and the **anon public key**.

## 2. GitHub login (OAuth App)

This is what leads use to sign in.

1. Go to **github.com/organizations/JumboCode/settings/applications** and create a **New OAuth App** with these values:
   - Homepage URL: `https://jumbocode.github.io/Quadratic/`
   - Authorization callback URL: `https://<ref>.supabase.co/auth/v1/callback`
2. Generate a client secret.
3. In Supabase, open **Authentication → Sign In / Providers → GitHub**, enable it, and paste the client ID and secret.
4. In Supabase, open **Authentication → URL Configuration** and set:
   - Site URL: `https://jumbocode.github.io/Quadratic/`
   - Redirect URLs: add `https://jumbocode.github.io/Quadratic/` and `http://localhost:5173/`

## 3. GitHub App (issue sync)

This is what creates issues and listens to PRs. It's separate from the OAuth App so it can act as a bot.

1. Go to **github.com/organizations/JumboCode/settings/apps** and create a **New GitHub App** with these settings:
   - Name: e.g. `Quadratic JumboCode`. The slug (lowercase, dashes) becomes `GITHUB_APP_SLUG`.
   - Homepage URL: `https://jumbocode.github.io/Quadratic/`
   - Leave **Callback URL / Redirect URI** empty, and leave "Request user authorization (OAuth)" unchecked. Sign-in uses the separate OAuth App from step 2.
   - Under **Webhook**, check "Active" and set:
     - **Webhook URL:** `https://<ref>.supabase.co/functions/v1/github-webhook`. Put this here, not in the Callback URL field.
     - **Webhook secret:** a long random string. This becomes `GITHUB_WEBHOOK_SECRET`.
   - **Repository permissions:**
     - Issues: *Read & write*
     - Pull requests: *Read*
     - Contents: *Read* (needed for push events)
     - Metadata: *Read*
   - **Subscribe to events:** Issues, Issue comment, Pull request, Pull request review, Push.
   - Where can it be installed: *Only on this account*.
2. After creating it, note the **App ID**.
3. Generate a **private key**. GitHub downloads a `.pem` file. Open it in a text editor, copy **everything** (including the `-----BEGIN…` and `-----END…` lines), and paste it into Supabase as the `GITHUB_APP_PRIVATE_KEY` secret (Edge Functions → Secrets). You don't need to convert it or escape the newlines; the functions handle any paste format. Delete the `.pem` file afterwards.
4. Click **Install App** and install it on the JumboCode org. You can pick only the client project repos.

## 4. Slack app (reminders)

1. Go to [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App → From a manifest**, pick the JumboCode workspace, and paste this manifest:
   ```yaml
   display_information:
     name: Quadratic
     description: Sprint digests and due-date reminders for JumboCode teams
     background_color: "#2ead5b"
   features:
     bot_user:
       display_name: Quadratic
       always_online: true
   oauth_config:
     redirect_urls:
       - https://<ref>.supabase.co/functions/v1/slack-oauth
     scopes:
       bot: [chat:write, chat:write.public, im:write, users:read, users:read.email, channels:read, channels:join]
   settings:
     org_deploy_enabled: false
     socket_mode_enabled: false
   ```
2. Under **Basic Information → App Credentials**, note the **Client ID** and **Client Secret**.
3. You don't need to install it yet. An admin connects it from inside Quadratic (step 8).

## 5. Secrets

Copy `supabase/functions/.env.example` to `supabase/functions/.env` and fill it in. `INTERNAL_SECRET` can be any long random string, e.g. `openssl rand -hex 32`. Then:

```sh
npx supabase login
npx supabase link --project-ref <ref>
npx supabase secrets set --env-file supabase/functions/.env
```

Then tell the database how to reach the functions. Run this in the Supabase **SQL editor**, using the same `INTERNAL_SECRET`:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'project_url');
select vault.create_secret('<INTERNAL_SECRET>', 'internal_secret');
```

Until these Vault secrets exist, nothing breaks. Sync jobs just queue up in the `jobs` table.

## 6. Deploy the backend

You can deploy once by hand:

```sh
npx supabase db push               # creates tables, security policies, cron jobs
npx supabase functions deploy      # deploys all Edge Functions
```

Or let GitHub Actions do it on every push to `main` that touches `supabase/`. In the repo, open **Settings → Secrets and variables → Actions** and add:

- Secret `SUPABASE_ACCESS_TOKEN`: from [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
- Secret `SUPABASE_DB_PASSWORD`: from step 1
- Variable `SUPABASE_PROJECT_REF`: `<ref>`

## 7. Deploy the website (GitHub Pages)

1. In the repo, open **Settings → Pages** and set Source to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the anon key. It's public by design; row level security protects the data.
3. Push to `main`. The site appears at `https://jumbocode.github.io/Quadratic/`.

## 8. First run

1. Sign in with GitHub. **The first person to sign in becomes the club admin.**
2. Open **Admin → Integrations** and click **Connect Slack**, then approve.
3. Open **Admin → Club calendar** and add semester start, breaks, finals and demo day.
4. Open **Admin → Teams** and create each team, e.g. key `BFB`, which gives issues like `BFB-12`.
5. For each team, open **Settings → Leadership** and invite the PMs, tech leads and designers by GitHub username.
6. Each team's leads then set up their team:
   - **Settings → GitHub:** link their repo(s) and optionally import existing issues.
   - **Settings → Developers:** add devs with GitHub usernames and Tufts emails, then click **Match Slack by email**.
   - **Settings → Slack:** pick a channel, send a test message, and choose which notifications to keep on.
   - **Sprints:** plan the semester's sprints.

## How devs link their work

Devs never sign in. Any of these links a PR to an issue:

- Branch name from the issue's **Copy branch name** button, e.g. `bfb-12-fix-login`
- `closes #34` / `fixes #34` in the PR description (the GitHub issue number)
- The issue ID, e.g. `BFB-12`, in the PR title

When a PR opens, the issue moves to *In Progress*. Requesting review moves it to *In Review*, and merging into the default branch moves it to *Done*. Teams can change these mappings under Settings → GitHub.

## Local development

```sh
cd web
cp .env.example .env.local      # point at your Supabase project (or a local one)
npm install
npm run dev                     # http://localhost:5173
```

To run Supabase locally (needs Docker): `npx supabase start`, then use the printed URL and anon key in `.env.local`. Run `npx supabase functions serve` to run the Edge Functions locally.

Tests:

```sh
cd web && npm test                         # unit tests (GitHub reference parsing, etc.)
cd supabase/tests && npm install && npm test  # schema, RLS and sync logic on an in-memory Postgres
```

## Troubleshooting

- **Issues don't appear on GitHub.** In the SQL editor, run `select * from jobs order by id desc`. Then check `last_error` and the `dispatch` function logs. The usual causes are missing Vault secrets (step 5) or a repo the App isn't installed on.
- **"GitHub App isn't configured".** The message says what's wrong. "Truncated" or "ASN.1 DER message is incomplete" means only the first line of the private key was saved, so re-paste the whole `.pem` in Supabase → Edge Functions → Secrets.
- **No Slack DMs.** The dev needs a Slack ID (Settings → Developers), the toggle must be on, and reminders only send during the team's chosen hour.
- **Login loops back to the sign-in page.** The site URL must be listed under Supabase → Authentication → URL Configuration → Redirect URLs.
