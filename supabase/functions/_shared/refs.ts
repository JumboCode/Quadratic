// Pure helpers for linking GitHub activity to planner issues. No Deno/Node APIs so the web app's
// Vitest suite can test them too.

const FOOTER_MARKER = '<!-- quadratic -->';

/** Issue numbers referenced in the same repo: "#12", "fixes #12", "owner/repo#12". */
export function parseIssueNumbers(text: string | null | undefined, repoFullName: string): number[] {
  if (!text) return [];
  const found = new Set<number>();
  const re = /(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/g;
  for (const m of text.matchAll(re)) {
    if (m[1] && m[1].toLowerCase() !== repoFullName.toLowerCase()) continue;
    // ignore things like "abc#12" that aren't a repo reference
    const before = text[m.index! - 1];
    if (!m[1] && before && /\w/.test(before)) continue;
    found.add(Number(m[2]));
  }
  return [...found];
}

/** Planner identifiers like "WEB-42" in titles, bodies or branch names ("web-42-fix-login"). */
export function parseIdentifiers(text: string | null | undefined, teamKeys: string[]): string[] {
  if (!text || teamKeys.length === 0) return [];
  const keys = new Set(teamKeys.map((k) => k.toUpperCase()));
  const found = new Set<string>();
  for (const m of text.matchAll(/(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,5})-(\d+)(?!\d)/g)) {
    const key = m[1].toUpperCase();
    if (keys.has(key)) found.add(`${key}-${Number(m[2])}`);
  }
  return [...found];
}

/**
 * References preceded by a GitHub closing keyword ("fixes #12", "Closes WEB-42"). Only these move an
 * issue when a PR opens or merges; a bare mention ("part of #12", a changelog) just links the PR.
 */
export function parseClosingRefs(
  text: string | null | undefined,
  repoFullName: string,
  teamKeys: string[],
): { numbers: number[]; identifiers: string[] } {
  if (!text) return { numbers: [], identifiers: [] };
  const refs = [...text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+([\w.\/-]*#\d+|[A-Za-z][A-Za-z0-9]{1,5}-\d+)/gi)]
    .map((m) => m[1])
    .join(' ');
  return { numbers: parseIssueNumbers(refs, repoFullName), identifiers: parseIdentifiers(refs, teamKeys) };
}

/** Linear-style branch name: "web-42-fix-login-redirect". */
export function branchName(identifier: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug ? `${identifier.toLowerCase()}-${slug}` : identifier.toLowerCase();
}

/** Body pushed to GitHub: the planner description plus a footer linking back. */
export function buildGithubBody(description: string, identifier: string, url: string): string {
  const footer = `${FOOTER_MARKER}\n---\n<sub>🐘 Tracked in Quadratic as [${identifier}](${url})</sub>`;
  return description.trim() ? `${description.trim()}\n\n${footer}` : footer;
}

export function hasGithubFooter(body: string | null | undefined): boolean {
  return !!body?.includes(FOOTER_MARKER);
}

/** Inverse of buildGithubBody so edits made on GitHub don't accumulate footers. */
export function stripGithubFooter(body: string | null | undefined): string {
  if (!body) return '';
  const i = body.indexOf(FOOTER_MARKER);
  return (i === -1 ? body : body.slice(0, i)).trim();
}
