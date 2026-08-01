// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../src/api/query.js';
import { App } from '../src/app.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const source = {
  mode: 'demo',
  state: 'demo',
  configured: true,
  active: true,
  credentialSource: 'none',
  credentialEditable: false,
};

const renderApp = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  );

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('operations dashboard', () => {
  it('shows explicit health states and emits a demo fixture through the controls', async () => {
    let emitted = false;
    const post = {
      id: '1990000000000000001',
      authorId: '127000000000000001',
      authorName: 'Tibo',
      authorUsername: 'thsottiaux',
      text: 'Codex CLI v2 is rolling out today.',
      url: 'https://x.com/thsottiaux/status/1990000000000000001',
      createdAt: '2026-08-01T12:00:01.000Z',
      observedAt: '2026-08-01T12:00:02.000Z',
      kind: 'post',
      classifierVersion: 1,
      categories: ['codex'],
      matchedRuleIds: ['codex.keyword'],
      ingestedAt: '2026-08-01T12:00:02.000Z',
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path === '/api/auth/session') {
        return json({
          authenticated: true,
          csrfToken: 'dashboard-csrf',
          expiresAt: '2026-08-01T20:00:00.000Z',
        });
      }
      if (path === '/api/setup') {
        return json({
          complete: true,
          source,
          destinations: { count: 0, testedCount: 0 },
          readyToActivate: true,
        });
      }
      if (path === '/api/status') {
        return json({
          source,
          database: { status: 'ready' },
          queue: {
            pending: 0,
            sending: 0,
            delivered: emitted ? 1 : 0,
            failed: 0,
            cancelled: 0,
          },
          destinations: { active: 0, paused: 0 },
          ...(emitted ? { lastPost: post } : {}),
        });
      }
      if (path === '/api/destinations') return json({ items: [] });
      if (path.startsWith('/api/posts?')) {
        return json({ items: emitted ? [post] : [] });
      }
      if (path === '/api/demo/fixtures') {
        return json({
          items: [
            {
              name: 'codex',
              text: post.text,
              categories: ['codex'],
            },
          ],
        });
      }
      if (path === '/api/demo/emit' && init?.method === 'POST') {
        emitted = true;
        return json({ accepted: true, postId: post.id }, 202);
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Signal report.' })).toBeVisible();
    expect(screen.getByText('Fixture transmitter standing by')).toBeVisible();
    expect(screen.getByText('All clear.')).toBeVisible();

    await user.click(await screen.findByRole('button', { name: /codex/i }));
    expect(await screen.findByText(/entered the delivery pipeline/i)).toBeVisible();
    expect(await screen.findByText(post.text)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/demo/emit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }),
    );
  });

  it('renders degraded source status with words and recovery context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const path = String(input);
        if (path === '/api/auth/session') {
          return json({
            authenticated: true,
            csrfToken: 'csrf',
            expiresAt: '2026-08-01T20:00:00.000Z',
          });
        }
        if (path === '/api/setup') {
          return json({
            complete: true,
            source: { ...source, mode: 'x', state: 'degraded' },
            destinations: { count: 0, testedCount: 0 },
            readyToActivate: true,
          });
        }
        if (path === '/api/status') {
          return json({
            source: {
              ...source,
              mode: 'x',
              state: 'degraded',
              credentialSource: 'environment',
            },
            database: { status: 'ready' },
            queue: { pending: 0, sending: 0, delivered: 0, failed: 0, cancelled: 0 },
            destinations: { active: 0, paused: 0 },
          });
        }
        if (path === '/api/destinations') return json({ items: [] });
        if (path.startsWith('/api/posts?')) return json({ items: [] });
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    renderApp();

    expect(await screen.findByText('The X signal needs attention')).toBeVisible();
    expect(screen.getByText(/keep reconnecting and catch up/i)).toBeVisible();
  });
});
