// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../src/api/query.js';
import { App } from '../src/app.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const session = {
  authenticated: true,
  csrfToken: 'setup-csrf-token',
  expiresAt: '2026-08-01T20:00:00.000Z',
};

const demoSource = {
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
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('setup wizard', () => {
  it('completes demo setup through destination, topics, test, and activation', async () => {
    let destination:
      | {
          id: string;
          type: 'generic';
          name: string;
          routing: { mode: 'everything' } | { mode: 'categories'; categories: string[] };
          state: 'active';
          hasConfiguration: true;
          createdAt: string;
          updatedAt: string;
        }
      | undefined;
    let tested = false;
    let complete = false;
    const timestamp = '2026-08-01T12:00:00.000Z';
    const setup = () => ({
      complete,
      source: demoSource,
      destinations: { count: destination ? 1 : 0, testedCount: tested ? 1 : 0 },
      readyToActivate: Boolean(destination && tested),
    });

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      if (path === '/api/auth/session') return json(session);
      if (path === '/api/setup' && method === 'GET') return json(setup());
      if (path === '/api/destinations' && method === 'GET') {
        return json({ items: destination ? [destination] : [] });
      }
      if (path === '/api/destinations' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as {
          name: string;
          routing: { mode: 'everything' };
        };
        destination = {
          id: 'destination-1',
          type: 'generic',
          name: body.name,
          routing: body.routing,
          state: 'active',
          hasConfiguration: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return json(
          {
            destination,
            signingSecret: Buffer.alloc(32, 4).toString('base64'),
          },
          201,
        );
      }
      if (path === '/api/destinations/destination-1' && method === 'PATCH') {
        const body = JSON.parse(String(init?.body)) as {
          routing: typeof destination extends undefined ? never : object;
        };
        if (!destination) throw new Error('Destination was not created');
        if ('routing' in body) {
          destination = { ...destination, routing: body.routing as never };
        }
        return json({ destination });
      }
      if (path === '/api/destinations/destination-1/test' && method === 'POST') {
        tested = true;
        return json({ outcome: { kind: 'success' } });
      }
      if (path === '/api/setup/activate' && method === 'POST') {
        complete = true;
        return json(setup());
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Your demo transmitter is ready.' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Continue to destination' }));

    await user.click(screen.getByRole('radio', { name: /Generic/i }));
    await user.type(screen.getByLabelText('Display name'), 'Community relay');
    await user.type(
      screen.getByLabelText(/Webhook endpoint/),
      'https://relay.example/tibo',
    );
    await user.click(screen.getByRole('button', { name: 'Save destination' }));

    const secret = await screen.findByLabelText('One-time signing secret');
    expect(secret).toHaveTextContent('Copy once');
    await user.click(screen.getByRole('checkbox', { name: /Codex \+ releases/i }));
    await user.click(screen.getByRole('button', { name: 'Save topics' }));

    await user.click(screen.getByRole('button', { name: 'Send test notification' }));
    expect(await screen.findByText('Destination acknowledged the ping.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Continue/i }));
    expect(screen.queryByLabelText('One-time signing secret')).not.toBeInTheDocument();

    const finale = await screen.findByRole('heading', { name: 'Put the desk on air.' });
    expect(finale).toBeVisible();
    expect(within(finale.closest('section')!).getByText('1 topics')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Activate monitoring' }));

    expect(
      await screen.findByRole('heading', { name: 'Signal desk ready.' }),
    ).toBeVisible();
    const mutationRequests = fetchMock.mock.calls.filter(
      ([, init]) => init?.method && init.method !== 'GET',
    );
    expect(
      mutationRequests.every(
        ([, init]) =>
          new Headers(init?.headers).get('x-csrf-token') === 'setup-csrf-token',
      ),
    ).toBe(true);
  });

  it('recovers a tested setup at the activation step after refresh', async () => {
    const destination = {
      id: 'destination-1',
      type: 'discord',
      name: 'Announcements',
      routing: { mode: 'categories', categories: ['outages'] },
      state: 'active',
      hasConfiguration: true,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        if (String(input) === '/api/auth/session') return json(session);
        if (String(input) === '/api/setup') {
          return json({
            complete: false,
            source: demoSource,
            destinations: { count: 1, testedCount: 1 },
            readyToActivate: true,
          });
        }
        if (String(input) === '/api/destinations') return json({ items: [destination] });
        throw new Error(`Unexpected request: ${String(input)}`);
      }),
    );
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Put the desk on air.' }),
    ).toBeVisible();
    expect(screen.getByText('Announcements')).toBeVisible();
  });
});
