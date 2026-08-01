// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../src/api/query.js';
import { App } from '../src/app.js';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('delivery operations', () => {
  it('shows actionable failure context and retries a failed delivery', async () => {
    window.history.replaceState({}, '', '/deliveries');
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
    let state: 'failed' | 'pending' = 'failed';
    const delivery = () => ({
      id: 'delivery-1',
      postId: '1990000000000000001',
      destinationId: 'destination-1',
      state,
      attemptCount: state === 'failed' ? 7 : 0,
      nextAttemptAt: '2026-08-01T12:00:00.000Z',
      ...(state === 'failed'
        ? {
            lastErrorCode: 'invalid-webhook',
            lastErrorMessage: 'Replace the destination webhook',
          }
        : {}),
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    });
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path === '/api/auth/session') {
        return json({
          authenticated: true,
          csrfToken: 'delivery-csrf',
          expiresAt: '2026-08-01T20:00:00.000Z',
        });
      }
      if (path === '/api/setup') {
        return json({
          complete: true,
          source: {
            mode: 'demo',
            state: 'demo',
            configured: true,
            active: true,
            credentialSource: 'none',
            credentialEditable: false,
          },
          destinations: { count: 1, testedCount: 1 },
          readyToActivate: true,
        });
      }
      if (path === '/api/destinations') {
        return json({
          items: [
            {
              id: 'destination-1',
              type: 'slack',
              name: 'Codex community',
              routing: { mode: 'everything' },
              state: 'paused',
              pauseReason: 'invalid-webhook',
              hasConfiguration: true,
              createdAt: '2026-08-01T12:00:00.000Z',
              updatedAt: '2026-08-01T12:00:00.000Z',
            },
          ],
        });
      }
      if (path.startsWith('/api/deliveries?')) return json({ items: [delivery()] });
      if (path === '/api/deliveries/delivery-1/retry' && init?.method === 'POST') {
        state = 'pending';
        return json({ delivery: delivery() });
      }
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('invalid-webhook')).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Codex community' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Retry/i }));
    expect(
      await screen.findByText('pending', { selector: '.status-pill' }),
    ).toBeVisible();
    const retryRequest = fetchMock.mock.calls.find(
      ([path]) => String(path) === '/api/deliveries/delivery-1/retry',
    );
    expect(new Headers(retryRequest?.[1]?.headers).get('x-csrf-token')).toBeTruthy();
  });
});
