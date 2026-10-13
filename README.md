# Quadratic 🐘

JumboCode's planning workspace, inspired by Linear. Each team's leadership (PMs, tech leads and designers) plans sprints, projects and the year's timeline here. Devs just see issues show up on GitHub. Reminders and updates go out on Slack.

## What it does

- **Team workspaces.** Each team has its own board, issue list, sprints, projects, timeline, docs and settings. Access is limited to that team's leadership, and club admins see everything.
- **Issues.** Statuses, priorities, estimates, labels, due dates, sub-issues, templates, markdown, comments (public or leadership-only), and a ⌘K command palette.
- **Sprints.** Plan a whole semester of sprints at once. The burndown and velocity charts update as work moves, and unfinished work rolls over to the next sprint automatically.
- **Projects.** Projects can be shared across teams. Each one has milestones, progress charts, a predicted finish date, health updates, dependencies, and PRDs/specs written in place.
- **Timeline.** A drag-to-reschedule Gantt chart of projects and milestones, with sprints and the club calendar (breaks, finals, demo day) overlaid. There's a club-wide view for admins.
- **GitHub two-way sync.**
  - Issues created here open on GitHub. Edits, assignees, labels, open/closed state and comments sync both ways.
  - PRs link through the branch name, `closes #12`, or the issue ID, and move issues through *In Progress → In Review → Done*.
  - Issues opened directly on GitHub land in a Triage inbox.
- **Slack.** Due-soon and overdue DMs to devs, sprint start and end digests, and a real-time activity feed. Each team turns each of these on or off.

## Stack

| | |
|---|---|
| Web app | Vite, React 19, TypeScript, Tailwind CSS 4, TanStack Query, dnd-kit, Recharts, Framer Motion. Served from **GitHub Pages** |
| Backend | **Supabase**: Postgres with row level security, GitHub sign-in, Deno Edge Functions, pg_cron + pg_net |
| Integrations | A GitHub App installed on the JumboCode org, and a Slack app |

```
web/                     React app (HashRouter, so it works on GitHub Pages)
supabase/migrations/     Schema, RLS policies, triggers, cron schedules
supabase/functions/      github-webhook · github-api · dispatch · cron-tick · slack-api · slack-oauth
supabase/tests/          Database tests (in-memory Postgres via PGlite)
.github/workflows/       CI, Pages deploy, Supabase deploy
docs/SETUP.md            Step-by-step setup
```

### How sync works

Postgres triggers write side effects (push to GitHub, post to Slack) into a `jobs` outbox and ping the `dispatch` function. If a push fails, it's retried with backoff. GitHub webhooks write back through `github_upsert_issue()`, which flags the change as coming from GitHub so it isn't echoed back. `cron-tick` runs every 15 minutes and sends reminders and sprint digests in each team's timezone. A `notification_log` table makes sure the same reminder is never sent twice.

## Getting started

See **[docs/SETUP.md](docs/SETUP.md)**. The short version:

1. Create a Supabase project.
2. Create a GitHub OAuth App (for login), a GitHub App (for sync) and a Slack app.
3. Set the secrets, then run `supabase db push && supabase functions deploy`.
4. Turn on GitHub Pages (source: GitHub Actions), set the two `VITE_` variables, and push.
5. Sign in. The first user becomes admin.

```sh
cd web && npm install && npm run dev
```
