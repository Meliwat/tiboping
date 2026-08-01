import { describe, expect, it, vi } from 'vitest';

import { FetchHttpTransport } from '../../src/destinations/http-client.js';

describe('FetchHttpTransport', () => {
  it('refuses redirects and returns bounded response text', async () => {
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(new Response('provider response', { status: 302 })),
    );
    const transport = new FetchHttpTransport({ fetch: fetchImplementation });

    const response = await transport.send({
      method: 'POST',
      url: 'https://receiver.example/events',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      timeoutMs: 1000,
      maxResponseBytes: 1024,
      redirect: 'manual',
    });

    expect(response).toMatchObject({ status: 302, body: 'provider response' });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://receiver.example/events',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('aborts when the provider response exceeds the configured cap', async () => {
    const transport = new FetchHttpTransport({
      fetch: async () => new Response('x'.repeat(1025), { status: 500 }),
    });

    await expect(
      transport.send({
        method: 'POST',
        url: 'https://receiver.example/events',
        headers: {},
        body: '{}',
        timeoutMs: 1000,
        maxResponseBytes: 1024,
        redirect: 'manual',
      }),
    ).rejects.toThrow(/response.*large/iu);
  });
});
