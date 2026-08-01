import { describe, expect, it } from 'vitest';

import { createDiscordAdapter } from '../../src/destinations/discord.js';
import { notificationFixture } from '../fixtures/notification.js';
import { FakeHttpTransport, resolvePublicAddress, response } from '../helpers/http.js';

const config = { webhookUrl: 'https://discord.com/api/webhooks/123/secret-token' };

describe('Discord destination adapter', () => {
  it('renders an embed and disables every allowed mention', async () => {
    const transport = new FakeHttpTransport(response(204));
    const adapter = createDiscordAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });
    const notification = {
      ...notificationFixture,
      post: { ...notificationFixture.post, text: '@everyone Codex is back, <@123>.' },
    };

    await expect(adapter.send(notification, config)).resolves.toEqual({
      kind: 'success',
    });
    const payload = JSON.parse(transport.requests[0]?.body ?? '') as {
      allowed_mentions: { parse: string[] };
      embeds: Array<{ description: string; url: string; timestamp: string }>;
    };

    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds[0]).toMatchObject({
      description: '@everyone Codex is back, <@123>.',
      url: notificationFixture.post.url,
      timestamp: notificationFixture.post.createdAt,
    });
  });

  it('truncates descriptions to Discord limits', async () => {
    const transport = new FakeHttpTransport(response(204));
    const adapter = createDiscordAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });

    await adapter.send(
      {
        ...notificationFixture,
        post: { ...notificationFixture.post, text: 'x'.repeat(10_000) },
      },
      config,
    );
    const payload = JSON.parse(transport.requests[0]?.body ?? '') as {
      embeds: Array<{ description: string; url: string }>;
    };
    expect(payload.embeds[0]?.description.length).toBeLessThanOrEqual(4096);
    expect(payload.embeds[0]?.url).toBe(notificationFixture.post.url);
  });

  it('treats revoked webhooks as permanent failures', async () => {
    const transport = new FakeHttpTransport(response(401));
    const adapter = createDiscordAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });

    await expect(adapter.send(notificationFixture, config)).resolves.toMatchObject({
      kind: 'permanent-failure',
      code: 'invalid-webhook',
    });
  });
});
