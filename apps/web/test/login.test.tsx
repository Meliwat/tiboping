// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../src/api/query.js';
import { App } from '../src/app.js';

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const completeSetup = {
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
};

const renderApp = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  );

const memoryStorage = (): Storage => ({
  length: 0,
  clear: vi.fn(),
  getItem: vi.fn(() => null),
  key: vi.fn(() => null),
  removeItem: vi.fn(),
  setItem: vi.fn(),
});

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryStorage(),
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: memoryStorage(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('login', () => {
  it('focuses the password after an expired session and submits with the keyboard', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(401, {
          error: { code: 'authentication-required', message: 'Sign in to continue' },
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          authenticated: true,
          csrfToken: 'csrf-token',
          expiresAt: '2026-08-01T20:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(response(200, completeSetup));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    const password = await screen.findByLabelText('Admin password');
    expect(password).toHaveFocus();
    await user.type(password, 'a long admin password{Enter}');

    expect(
      await screen.findByRole('heading', { name: 'Signal desk ready.' }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ credentials: 'same-origin', method: 'POST' }),
    );
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('shows a useful invalid-password message and restores input focus', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(401, { error: { code: 'authentication-required' } }),
      )
      .mockResolvedValueOnce(response(401, { error: { code: 'invalid-credentials' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    const password = await screen.findByLabelText('Admin password');
    await user.type(password, 'wrong password{Enter}');

    expect(
      await screen.findByText('That password did not unlock the desk.'),
    ).toBeVisible();
    await waitFor(() => expect(password).toHaveFocus());
  });

  it('distinguishes rate limiting from a bad password', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(401, { error: { code: 'authentication-required' } }),
      )
      .mockResolvedValueOnce(response(429, { error: { code: 'rate-limit-exceeded' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Admin password'), 'wrong{Enter}');
    expect(
      await screen.findByText(
        'Too many attempts. Let the signal cool down for a minute, then try again.',
      ),
    ).toBeVisible();
  });

  it('shows an authenticated session without exposing its CSRF token', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          response(200, {
            authenticated: true,
            csrfToken: 'never-render-this-token',
            expiresAt: '2026-08-01T20:00:00.000Z',
          }),
        )
        .mockResolvedValueOnce(response(200, completeSetup)),
    );
    const rendered = renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Signal desk ready.' }),
    ).toBeVisible();
    expect(rendered.container).not.toHaveTextContent('never-render-this-token');
  });
});
