import { describe, expect, it } from 'vitest';

import { normalizeXPost } from '../../src/source/normalize-post.js';
import type { XPost } from '../../src/source/types.js';

const basePost: XPost = {
  id: '2077928427936710901',
  text: 'A normal post',
  author_id: '1888888888',
  created_at: '2026-08-01T12:00:00.000Z',
};

const normalize = (post: XPost) =>
  normalizeXPost(post, {
    targetUserId: '1888888888',
    observedAt: '2026-08-01T12:00:02.000Z',
  });

describe('normalizeXPost', () => {
  it('normalizes originals, replies, and quote posts', () => {
    expect(normalize(basePost)).toMatchObject({ kind: 'post', text: 'A normal post' });
    expect(
      normalize({
        ...basePost,
        referenced_tweets: [{ type: 'replied_to', id: '100' }],
      }),
    ).toMatchObject({ kind: 'reply', inReplyToPostId: '100' });
    expect(
      normalize({
        ...basePost,
        referenced_tweets: [{ type: 'quoted', id: '99' }],
      }),
    ).toMatchObject({ kind: 'quote', quotedPostId: '99' });
  });

  it('prefers full note text over truncated compatibility text', () => {
    expect(
      normalize({
        ...basePost,
        text: 'short…',
        note_tweet: { text: 'the complete post' },
      })?.text,
    ).toBe('the complete post');
  });

  it('ignores reposts and posts from every other author', () => {
    expect(
      normalize({
        ...basePost,
        referenced_tweets: [{ type: 'retweeted', id: '98' }],
      }),
    ).toBeUndefined();
    expect(normalize({ ...basePost, author_id: '9999999999' })).toBeUndefined();
  });

  it('rejects malformed source data rather than creating a partial post', () => {
    expect(() => normalize({ ...basePost, created_at: 'yesterday' })).toThrow();
  });
});
