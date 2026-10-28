// GitHub actions the browser can't do itself (they need the App's private key).
import { admin, HttpError, json, requireTeamMember, requireUser, serve } from '../_shared/http.ts';
import { githubApp, installationOctokit, issueSyncArgs, splitRepo } from '../_shared/github.ts';

serve(async (req) => {
  const caller = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  switch (body.action) {
    case 'status': {
      const app = githubApp();
      const { data } = await app.octokit.request('GET /app');
      if (!data) throw new HttpError(500, 'GitHub App not found; check GITHUB_APP_ID');
      const { data: installs } = await app.octokit.request('GET /app/installations');
      return json({
        slug: data.slug,
        name: data.name,
        installUrl: `${data.html_url}/installations/new`,
        installations: installs.map((i) => ({ id: i.id, account: i.account && 'login' in i.account ? i.account.login : null })),
      });
    }

    case 'list_repos': {
      // Every repo the App can see, so leads can pick which ones belong to their team.
      const app = githubApp();
      const repos: unknown[] = [];
      const { data: installs } = await app.octokit.request('GET /app/installations');
      for (const inst of installs) {
        const octokit = await installationOctokit(inst.id);
        for (let page = 1; ; page++) {
          const { data } = await octokit.request('GET /installation/repositories', { per_page: 100, page });
          for (const r of data.repositories) {
            repos.push({
              github_repo_id: r.id,
              installation_id: inst.id,
              full_name: r.full_name,
              default_branch: r.default_branch,
              private: r.private,
            });
          }
          if (data.repositories.length < 100) break;
        }
      }
      return json({ repos });
    }

    case 'import_issues': {
      const { data: repo } = await admin.from('repos').select('*').eq('id', body.repo_id).single();
      if (!repo) throw new HttpError(404, 'repo not found');
      await requireTeamMember(caller, repo.team_id);

      const octokit = await installationOctokit(repo.installation_id);
      const { owner, repo: name } = splitRepo(repo.full_name);
      const issues = [];
      for (let page = 1; ; page++) {
        const { data } = await octokit.request('GET /repos/{owner}/{repo}/issues', {
          owner, repo: name, state: body.include_closed ? 'all' : 'open', per_page: 100, page,
        });
        issues.push(...data);
        if (data.length < 100) break;
      }
      let imported = 0;
      for (const issue of issues) {
        if (issue.pull_request) continue;
        const { error } = await admin.rpc('github_upsert_issue', {
          p_team: repo.team_id,
          p_repo: repo.id,
          ...issueSyncArgs(issue),
          p_create_if_missing: true,
        });
        if (error) throw error;
        imported++;
      }
      return json({ imported });
    }

    default:
      throw new HttpError(400, `unknown action ${body.action}`);
  }
});
