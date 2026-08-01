// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../src/api/query.js';
import { DashboardPage } from '../src/pages/DashboardPage.js';

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { 'content-type': 'application/json' },
  });

const source = {
  mode: 'x',
  state: 'monitoring',
  configured: true,
  active: true,
  credentialSource: 'environment',
  credentialEditable: false,
};

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('destination operations', () => {
  it('pauses, resumes, rotates, and deletes with explicit confirmation', async () => {
    let state: 'active' | 'paused' = 'active';
    let deleted = false;
    const destination = () => ({
      id: 'destination-1',
      type: 'generic',
      name: 'Community relay',
      routing: { mode: 'everything' },
      state,
      ...(state === 'paused' ? { pauseReason: 'paused-by-operator' } : {}),
      hasConfiguration: true,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    });
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      if (path === '/api/status') {
        return json({
          source,
          database: { status: 'ready' },
          queue: { pending: 0, sending: 0, delivered: 0, failed: 0, cancelled: 0 },
          destinations: {
            active: state === 'active' && !deleted ? 1 : 0,
            paused: state === 'paused' && !deleted ? 1 : 0,
          },
        });
      }
      if (path === '/api/destinations' && method === 'GET') {
        return json({ items: deleted ? [] : [destination()] });
      }
      if (path.startsWith('/api/posts?')) return json({ items: [] });
      if (path.endsWith('/pause') && method === 'POST') {
        state = 'paused';
        return json({ destination: destination() });
      }
      if (path.endsWith('/resume') && method === 'POST') {
        state = 'active';
        return json({ destination: destination() });
      }
      if (path.endsWith('/rotate-secret') && method === 'POST') {
        return json({
          destination: destination(),
          signingSecret: Buffer.alloc(32, 9).toString('base64'),
        });
      }
      if (path === '/api/destinations/destination-1' && method === 'DELETE') {
        deleted = true;
        return json(undefined, 204);
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <DashboardPage onNavigate={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Community relay' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Pause/i }));
    expect(await screen.findByText('paused-by-operator', { exact: false })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Resume/i }));
    expect(await screen.findByText('active', { selector: '.status-pill' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Secret/i }));
    expect(await screen.findByLabelText('New signing secret')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Delete/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Community relay?' });
    expect(dialog).toHaveTextContent('Pending deliveries will be cancelled');
    await user.click(screen.getByRole('button', { name: 'Delete destination' }));
    expect(await screen.findByText('No destinations connected')).toBeVisible();
  });
});
