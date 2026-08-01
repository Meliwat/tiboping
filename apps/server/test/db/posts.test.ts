import { describe, expect, it } from 'vitest';

import { CursorRepository } from '../../src/db/repositories/cursors.js';
import { PostRepository } from '../../src/db/repositories/posts.js';
import { firstPost } from '../fixtures/posts.js';
import { createTestDatabase } from '../helpers/database.js';

describe('post and cursor repositories', () => {
  it('stores immutable classified posts and safely replays the same ID', () => {
    const testDatabase = createTestDatabase();
    const posts = new PostRepository(testDatabase.database);

    try {
      expect(
        posts.insert(firstPost, {
          version: 1,
          categories: ['codex', 'usage-limits'],
          matchedRuleIds: ['codex.keyword', 'usage-limits.big-button'],
        }),
      ).toBe(true);
      expect(
        posts.insert(
          { ...firstPost, text: 'A replay with changed text' },
          {
            version: 1,
            categories: [],
            matchedRuleIds: [],
          },
        ),
      ).toBe(false);

      expect(posts.get(firstPost.id)).toMatchObject({
        ...firstPost,
        classifierVersion: 1,
        categories: ['codex', 'usage-limits'],
        matchedRuleIds: ['codex.keyword', 'usage-limits.big-button'],
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  it('advances a text cursor monotonically without losing X snowflake precision', () => {
    const testDatabase = createTestDatabase();
    const cursors = new CursorRepository(testDatabase.database);

    try {
      cursors.advance('x:thsottiaux', '2077928427936710901', '2026-08-01T12:00:02.000Z');
      cursors.advance('x:thsottiaux', '2077928427936710899', '2026-08-01T12:00:03.000Z');
      expect(cursors.get('x:thsottiaux')).toEqual({
        source: 'x:thsottiaux',
        latestPostId: '2077928427936710901',
        updatedAt: '2026-08-01T12:00:02.000Z',
      });

      cursors.advance('x:thsottiaux', '2077928427936711000', '2026-08-01T12:00:04.000Z');
      expect(cursors.get('x:thsottiaux')?.latestPostId).toBe('2077928427936711000');
    } finally {
      testDatabase.cleanup();
    }
  });

  it('lists recent posts newest first with a stable cursor', () => {
    const testDatabase = createTestDatabase();
    const posts = new PostRepository(testDatabase.database);

    try {
      posts.insert(firstPost, { version: 1, categories: ['codex'], matchedRuleIds: [] });
      const second = {
        ...firstPost,
        id: '2077928427936711000',
        url: 'https://x.com/thsottiaux/status/2077928427936711000',
        createdAt: '2026-08-01T12:01:00.000Z',
      };
      posts.insert(second, { version: 1, categories: [], matchedRuleIds: [] });

      expect(posts.listRecent({ limit: 1 })).toMatchObject({
        items: [{ id: second.id }],
        nextCursor: second.id,
      });
      expect(posts.listRecent({ limit: 2, beforeId: second.id }).items).toMatchObject([
        { id: firstPost.id },
      ]);
    } finally {
      testDatabase.cleanup();
    }
  });
});
