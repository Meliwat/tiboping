import { describe, expect, it } from 'vitest';

import {
  genericWebhookEnvelopeSchema,
  normalizedPostSchema,
  notificationSchema,
  routingSchema,
} from '../src/index.js';

const normalizedPost = {
  id: '2077928427936710901',
  authorId: '1888888888',
  authorName: 'Tibo',
  authorUsername: 'thsottiaux',
  text: 'The big button has been pressed.',
  url: 'https://x.com/thsottiaux/status/2077928427936710901',
  createdAt: '2026-08-01T12:00:00.000Z',
  observedAt: '2026-08-01T12:00:02.000Z',
  kind: 'post',
} as const;

describe('normalizedPostSchema', () => {
  it('accepts an authored Tibo post', () => {
    expect(normalizedPostSchema.parse(normalizedPost)).toEqual(normalizedPost);
  });

  it('rejects non-numeric X identifiers', () => {
    expect(() =>
      normalizedPostSchema.parse({ ...normalizedPost, id: 'post-1' }),
    ).toThrow();
  });

  it('rejects a mismatched canonical URL', () => {
    expect(() =>
      normalizedPostSchema.parse({
        ...normalizedPost,
        url: 'https://example.com/not-x',
      }),
    ).toThrow();
  });
});

describe('routingSchema', () => {
  it('accepts Everything without categories', () => {
    expect(routingSchema.parse({ mode: 'everything' })).toEqual({ mode: 'everything' });
  });

  it('accepts unique category selections', () => {
    expect(
      routingSchema.parse({ mode: 'categories', categories: ['codex', 'outages'] }),
    ).toEqual({ mode: 'categories', categories: ['codex', 'outages'] });
  });

  it('rejects an empty or repeated category selection', () => {
    expect(() => routingSchema.parse({ mode: 'categories', categories: [] })).toThrow();
    expect(() =>
      routingSchema.parse({ mode: 'categories', categories: ['codex', 'codex'] }),
    ).toThrow();
  });
});

describe('notification and webhook schemas', () => {
  it('parses a versioned generic webhook envelope', () => {
    const notification = notificationSchema.parse({
      eventId: `x:${normalizedPost.id}`,
      post: normalizedPost,
      categories: ['usage-limits'],
      observedAt: normalizedPost.observedAt,
    });

    const envelope = {
      schema_version: '1',
      event_id: notification.eventId,
      event_type: 'tibo.post',
      post: {
        id: notification.post.id,
        author_name: notification.post.authorName,
        author_username: notification.post.authorUsername,
        text: notification.post.text,
        url: notification.post.url,
        created_at: notification.post.createdAt,
        kind: notification.post.kind,
      },
      categories: notification.categories,
      observed_at: notification.observedAt,
    };

    expect(genericWebhookEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it('rejects unknown webhook schema versions', () => {
    expect(() => genericWebhookEnvelopeSchema.parse({ schema_version: '2' })).toThrow();
  });
});
