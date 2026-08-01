import { describe, expect, it, vi } from 'vitest';

import { XApiClient, XApiError } from '../../src/source/x-api-client.js';

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('XApiClient', () => {
  it('resolves the fixed username with bearer authentication', async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({
        data: {
          id: '1888888888',
          name: 'Tibo',
          username: 'thsottiaux',
          protected: false,
        },
      }),
    );
    const client = new XApiClient({
      bearerToken: 'x-secret',
      fetch: fetchImplementation,
    });

    await expect(client.resolveUser('thsottiaux')).resolves.toEqual({
      id: '1888888888',
      name: 'Tibo',
      username: 'thsottiaux',
      protected: false,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.x.com/2/users/by/username/thsottiaux?user.fields=name%2Cusername%2Cprotected',
      expect.objectContaining({ headers: { authorization: 'Bearer x-secret' } }),
    );
  });

  it('lists, adds, and deletes only explicitly requested stream rules', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            { id: 'rule-1', value: 'cats', tag: 'unrelated' },
            {
              id: 'rule-2',
              value: 'from:thsottiaux -is:retweet',
              tag: 'tiboping:v1:thsottiaux',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: 'rule-3',
              value: 'from:thsottiaux -is:retweet',
              tag: 'tiboping:v1:thsottiaux',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ meta: { summary: { deleted: 1 } } }));
    const client = new XApiClient({
      bearerToken: 'x-secret',
      fetch: fetchImplementation,
    });

    await expect(client.listStreamRules()).resolves.toHaveLength(2);
    await client.addStreamRule({
      value: 'from:thsottiaux -is:retweet',
      tag: 'tiboping:v1:thsottiaux',
    });
    await client.deleteStreamRules(['rule-2']);

    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        add: [{ value: 'from:thsottiaux -is:retweet', tag: 'tiboping:v1:thsottiaux' }],
      }),
    });
    expect(fetchImplementation.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ delete: { ids: ['rule-2'] } }),
    });
  });

  it('requests authored posts with replies included and reposts excluded', async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: '101',
            text: 'reply',
            author_id: '1888888888',
            created_at: '2026-08-01T12:00:00.000Z',
          },
        ],
        meta: { next_token: 'next-page' },
      }),
    );
    const client = new XApiClient({
      bearerToken: 'x-secret',
      fetch: fetchImplementation,
    });

    await expect(
      client.fetchUserPosts('1888888888', {
        sinceId: '100',
        paginationToken: 'page-1',
        maxResults: 100,
      }),
    ).resolves.toMatchObject({ nextToken: 'next-page', posts: [{ id: '101' }] });
    const requested = new URL(String(fetchImplementation.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe('/2/users/1888888888/tweets');
    expect(requested.searchParams.get('since_id')).toBe('100');
    expect(requested.searchParams.get('pagination_token')).toBe('page-1');
    expect(requested.searchParams.get('exclude')).toBe('retweets');
    expect(requested.searchParams.get('tweet.fields')).toContain('referenced_tweets');
    expect(requested.searchParams.get('exclude')).not.toContain('replies');
  });

  it('opens the filtered stream with the fields required for normalization', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('\r\n'));
        controller.close();
      },
    });
    const fetchImplementation = vi.fn(async () => new Response(body, { status: 200 }));
    const client = new XApiClient({
      bearerToken: 'x-secret',
      fetch: fetchImplementation,
    });
    const stream = await client.openFilteredStream(new AbortController().signal);

    expect(stream).toBe(body);
    const requested = new URL(String(fetchImplementation.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe('/2/tweets/search/stream');
    expect(requested.searchParams.get('tweet.fields')).toContain('author_id');
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: 'Bearer x-secret' },
      redirect: 'manual',
    });
  });

  it('exposes rate-limit reset metadata without leaking the bearer token', async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ title: 'Too Many Requests' }, 429, {
        'x-rate-limit-reset': '1785585662',
      }),
    );
    const client = new XApiClient({
      bearerToken: 'x-secret',
      fetch: fetchImplementation,
    });

    const error = await client.resolveUser('thsottiaux').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(XApiError);
    expect(error).toMatchObject({ status: 429, retryAt: 1_785_585_662_000 });
    expect(String(error)).not.toContain('x-secret');
  });
});
