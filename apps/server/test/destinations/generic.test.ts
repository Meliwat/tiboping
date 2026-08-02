import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createGenericWebhookAdapter } from '../../src/destinations/generic.js';
import { notificationFixture } from '../fixtures/notification.js';
import { FakeHttpTransport, resolvePublicAddress, response } from '../helpers/http.js';

const secret = Buffer.alloc(32, 11);
const config = {
  url: 'https://receiver.example/events',
  signingSecret: secret.toString('base64'),
};

describe('generic webhook adapter', () => {
  it('sends the stable version-1 envelope with a verifiable raw-body signature', async () => {
    const transport = new FakeHttpTransport(response(202));
    const adapter = createGenericWebhookAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
      now: () => 1_785_585_602_000,
    });

    await expect(adapter.send(notificationFixture, config)).resolves.toEqual({
      kind: 'success',
    });
    const request = transport.requests[0];
    const body = request?.body ?? '';
    expect(JSON.parse(body)).toEqual({
      schema_version: '1',
      event_id: notificationFixture.eventId,
      event_type: 'tibo.post',
      post: {
        id: notificationFixture.post.id,
        author_name: 'Tibo',
        author_username: 'thsottiaux',
        text: notificationFixture.post.text,
        url: notificationFixture.post.url,
        created_at: notificationFixture.post.createdAt,
        kind: notificationFixture.post.kind,
      },
      categories: notificationFixture.categories,
      observed_at: notificationFixture.observedAt,
    });
    expect(request?.headers['x-tiboping-event']).toBe(notificationFixture.eventId);
    expect(request?.headers['x-tiboping-timestamp']).toBe('1785585602');
    const expected = createHmac('sha256', secret)
      .update(`1785585602.${body}`)
      .digest('hex');
    expect(request?.headers['x-tiboping-signature']).toBe(`v1=${expected}`);
  });

  it('validates an exact 32-byte base64 signing secret', async () => {
    const transport = new FakeHttpTransport(response(200));
    const adapter = createGenericWebhookAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });

    await expect(
      adapter.validateConfig({ ...config, signingSecret: 'short' }),
    ).rejects.toThrow(/32/);
  });
});
