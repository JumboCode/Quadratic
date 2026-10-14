// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc } from '../lib/types';

// --- mocks -----------------------------------------------------------------

const TEMPLATE = '## Attendees\n- \n\n## Agenda\n1. ';
const baseDoc: Doc = {
  id: 'doc-1', team_id: 'team-1', project_id: null, title: 'Meeting notes', emoji: '📝',
  content: TEMPLATE, updated_by: null, created_at: '2026-10-14T10:00:00Z', updated_at: '2026-10-14T10:00:00Z',
};

let currentDoc: Doc = baseDoc;
const updates: Record<string, unknown>[] = [];

vi.mock('../lib/queries', () => ({
  useDoc: () => ({ data: currentDoc, isLoading: false }),
  useTeams: () => ({ data: [{ id: 'team-1', key: 'WEB', name: 'Web', emoji: '🐘' }] }),
  useProject: () => ({ data: undefined }),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }));
vi.mock('../lib/supabase', () => ({
  unwrap: (r: { data: unknown }) => r.data,
  supabase: {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        const row = { ...currentDoc, ...values, updated_at: `2026-10-14T10:00:0${updates.length}Z` };
        const chain = { eq: () => chain, select: () => chain, single: async () => ({ data: row, error: null }) };
        return chain;
      },
      delete: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  },
}));

const { DocPage } = await import('./DocPage');

function renderDoc() {
  const qc = new QueryClient();
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/docs/doc-1']}>
        <Routes>
          <Route path="/docs/:docId" element={<DocPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}

function typeContent(text: string) {
  // Docs with content open in preview; switch to editing first.
  const edit = screen.queryByRole('button', { name: 'Edit' });
  if (edit) fireEvent.click(edit);
  const textarea = document.querySelector('textarea')!;
  fireEvent.change(textarea, { target: { value: text } });
}

beforeEach(() => {
  vi.useFakeTimers();
  currentDoc = baseDoc;
  updates.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// --- tests -----------------------------------------------------------------

describe('doc autosave', () => {
  it('saves edits after the debounce', async () => {
    renderDoc();
    typeContent('My real notes');
    expect(updates).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(updates).toHaveLength(1);
    expect(updates[0].content).toBe('My real notes');
  });

  it('never writes an older copy of the doc back over saved text', async () => {
    const { rerender, qc } = renderDoc();
    typeContent('My real notes');
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(updates).toHaveLength(1);

    // A refetch delivers the stale cached copy (the template, older timestamp).
    currentDoc = { ...baseDoc };
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/docs/doc-1']}>
          <Routes>
            <Route path="/docs/:docId" element={<DocPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(updates).toHaveLength(1); // no second save of the template
    expect(updates.some((u) => u.content === TEMPLATE)).toBe(false);
  });

  it('updates the cached doc so reopening shows the saved text', async () => {
    const { qc } = renderDoc();
    typeContent('My real notes');
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(qc.getQueryData<Doc>(['document', 'doc-1'])?.content).toBe('My real notes');
  });

  it('saves pending edits when leaving the page before the debounce fires', async () => {
    const { unmount } = renderDoc();
    typeContent('Typed and left quickly');
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(updates.map((u) => u.content)).toEqual(['Typed and left quickly']);
  });

  it('adopts a newer version from a teammate when there are no local edits', async () => {
    const { rerender, qc } = renderDoc();
    currentDoc = { ...baseDoc, content: 'Teammate wrote this', updated_at: '2026-10-14T11:00:00Z' };
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/docs/doc-1']}>
          <Routes>
            <Route path="/docs/:docId" element={<DocPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByText('Teammate wrote this')).toBeTruthy();
    expect(updates).toHaveLength(0);
  });

  it('opens a saved doc rendered as markdown, not in the raw editor', () => {
    currentDoc = { ...baseDoc, content: '# Big heading\n\n**bold** text' };
    renderDoc();
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Big heading' })).toBeTruthy();
  });
});

