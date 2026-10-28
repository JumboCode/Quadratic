import { describe, expect, it } from 'vitest';
import {
  branchName, buildGithubBody, parseClosingRefs, parseIdentifiers, parseIssueNumbers, stripGithubFooter,
} from '../../../supabase/functions/_shared/refs';

describe('parseIssueNumbers', () => {
  it('finds plain and keyword references', () => {
    expect(parseIssueNumbers('Fixes #12 and closes #7', 'jumbocode/app').sort()).toEqual([12, 7].sort());
  });
  it('accepts same-repo qualified refs and ignores other repos', () => {
    expect(parseIssueNumbers('jumbocode/app#3 other/repo#4', 'JumboCode/App')).toEqual([3]);
  });
  it('ignores anchors glued to words', () => {
    expect(parseIssueNumbers('see page#2 and color #fff', 'a/b')).toEqual([]);
  });
});

describe('parseClosingRefs', () => {
  it('only returns references after a closing keyword', () => {
    const text = 'Fixes #12, part of #13. Closes: WEB-4, see WEB-5. resolved jumbocode/app#6 other/repo#7';
    expect(parseClosingRefs(text, 'jumbocode/app', ['WEB'])).toEqual({ numbers: [12, 6], identifiers: ['WEB-4'] });
  });
  it('ignores bare mentions such as changelogs', () => {
    expect(parseClosingRefs('Bump lib: crash fix (#5), see #9', 'a/b', ['WEB'])).toEqual({ numbers: [], identifiers: [] });
  });
});

describe('parseIdentifiers', () => {
  it('matches team keys in titles and branch names, case-insensitively', () => {
    expect(parseIdentifiers('web-42-fix-login', ['WEB'])).toEqual(['WEB-42']);
    expect(parseIdentifiers('[WEB-7] tweak header, also des-3', ['WEB', 'DES'])).toEqual(['WEB-7', 'DES-3']);
  });
  it('ignores unknown keys and partial matches', () => {
    expect(parseIdentifiers('utf-8 and XWEB-4', ['WEB'])).toEqual([]);
  });
  it('normalizes leading zeros', () => {
    expect(parseIdentifiers('WEB-007', ['WEB'])).toEqual(['WEB-7']);
  });
});

describe('branchName', () => {
  it('slugifies the title', () => {
    expect(branchName('WEB-42', 'Fix login redirect on Safari!')).toBe('web-42-fix-login-redirect-on-safari');
  });
  it('handles empty titles', () => {
    expect(branchName('WEB-1', '???')).toBe('web-1');
  });
});

describe('GitHub body footer', () => {
  it('round-trips without accumulating footers', () => {
    const body = buildGithubBody('Hello **world**', 'WEB-1', 'https://x/#/issue/WEB-1');
    expect(body).toContain('Tracked in Quadratic');
    expect(stripGithubFooter(body)).toBe('Hello **world**');
    const twice = buildGithubBody(stripGithubFooter(body), 'WEB-1', 'u');
    expect(twice.match(/Tracked in Quadratic/g)).toHaveLength(1);
  });
  it('works with an empty description', () => {
    expect(stripGithubFooter(buildGithubBody('', 'WEB-1', 'u'))).toBe('');
  });
});
