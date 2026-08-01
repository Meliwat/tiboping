import type { StoredPost } from '../../src/db/repositories/posts.js';
import { describe, expect, it } from 'vitest';

import { CursorRepository } from '../../src/db/repositories/cursors.js';
import { PostRepository } from '../../src/db/repositories/posts.js';
import { SourceCoordinator } from '../../src/source/source-coordinator.js';
import type { TiboPostSource, XPost, XUser } from '../../src/source/types.js';
import { createTestDatabase } from '../helpers/database.js';

const user: XUser = {
  id: '1888888888',
  name: 'Tibo',
  username: 'thsottiaux',
  protected: false,
};

const rawPost = (id: string, overrides: Partial<XPost> = {}): XPost => ({
  id,
  text: `Post ${id}`,
  author_id: user.id,
  created_at: '2026-08-01T12:00:00.000Z',
  ...overrides,
});

class FakeSource implements TiboPostSource {
  public latest: XPost[] = [];
  public catchup: XPost[] = [];
  public stream: XPost[] = [];
  public consumeCalls = 0;
  public failFirstStream = false;

  public async prepare(): Promise<XUser> {
    return user;
  }
  public async fetchLatest(): Promise<XPost[]> {
    return this.latest;
  }
  public async fetchAfter(): Promise<XPost[]> {
    return this.catchup;
  }
  public async consumeStream(
    _signal: AbortSignal,
    onPost: (post: XPost) => Promise<void>,
  ): Promise<void> {
    this.consumeCalls += 1;
    if (this.failFirstStream && this.consumeCalls === 1)
      throw new Error('stream disconnected');
    for (const post of this.stream) await onPost(post);
  }
}

describe('SourceCoordinator', () => {
  it('checkpoints the newest first-page post without broadcasting history', async () => {
    const testDatabase = createTestDatabase();
    const source = new FakeSource();
    source.latest = [rawPost('102'), rawPost('101')];
    const routed: string[] = [];
    const coordinator = new SourceCoordinator({
      database: testDatabase.database,
      source,
      cursors: new CursorRepository(testDatabase.database),
      posts: new PostRepository(testDatabase.database),
      router: {
        route: (post: StoredPost) => {
          routed.push(post.id);
          return { created: 0, existing: 0 };
        },
      },
      now: () => Date.parse('2026-08-01T12:01:00.000Z'),
    });

    try {
      await coordinator.initialize();
      expect(
        new CursorRepository(testDatabase.database).get('x:thsottiaux')?.latestPostId,
      ).toBe('102');
      expect(
        new PostRepository(testDatabase.database).listRecent({ limit: 10 }).items,
      ).toEqual([]);
      expect(routed).toEqual([]);
    } finally {
      testDatabase.cleanup();
    }
  });

  it('buffers live posts while catch-up runs, processes oldest first, and deduplicates', async () => {
    const testDatabase = createTestDatabase();
    const source = new FakeSource();
    source.catchup = [rawPost('101')];
    source.stream = [rawPost('102'), rawPost('101')];
    const cursors = new CursorRepository(testDatabase.database);
    cursors.advance('x:thsottiaux', '100', '2026-08-01T12:00:00.000Z');
    const routed: string[] = [];
    const coordinator = new SourceCoordinator({
      database: testDatabase.database,
      source,
      cursors,
      posts: new PostRepository(testDatabase.database),
      router: {
        route: (post: StoredPost) => {
          routed.push(post.id);
          return { created: 0, existing: 0 };
        },
      },
      now: () => Date.parse('2026-08-01T12:01:00.000Z'),
    });

    try {
      await coordinator.initialize();
      await coordinator.runConnection(new AbortController().signal);
      expect(routed).toEqual(['101', '102']);
      expect(cursors.get('x:thsottiaux')?.latestPostId).toBe('102');
      expect(
        new PostRepository(testDatabase.database).listRecent({ limit: 10 }).items,
      ).toHaveLength(2);
    } finally {
      testDatabase.cleanup();
    }
  });

  it('ignores wrong authors and reposts even if another app rule puts them on the stream', async () => {
    const testDatabase = createTestDatabase();
    const source = new FakeSource();
    source.stream = [
      rawPost('101', { author_id: '9999999999' }),
      rawPost('102', { referenced_tweets: [{ type: 'retweeted', id: '90' }] }),
    ];
    const cursors = new CursorRepository(testDatabase.database);
    cursors.advance('x:thsottiaux', '100', '2026-08-01T12:00:00.000Z');
    const coordinator = new SourceCoordinator({
      database: testDatabase.database,
      source,
      cursors,
      posts: new PostRepository(testDatabase.database),
      router: { route: () => ({ created: 0, existing: 0 }) },
    });

    try {
      await coordinator.initialize();
      await coordinator.runConnection(new AbortController().signal);
      expect(
        new PostRepository(testDatabase.database).listRecent({ limit: 10 }).items,
      ).toEqual([]);
      expect(cursors.get('x:thsottiaux')?.latestPostId).toBe('100');
    } finally {
      testDatabase.cleanup();
    }
  });

  it('reconnects with backoff after a failed stream cycle', async () => {
    const testDatabase = createTestDatabase();
    const source = new FakeSource();
    source.failFirstStream = true;
    const cursors = new CursorRepository(testDatabase.database);
    cursors.advance('x:thsottiaux', '100', '2026-08-01T12:00:00.000Z');
    const delays: number[] = [];
    const controller = new AbortController();
    const coordinator = new SourceCoordinator({
      database: testDatabase.database,
      source,
      cursors,
      posts: new PostRepository(testDatabase.database),
      router: { route: () => ({ created: 0, existing: 0 }) },
      sleep: async (delay) => {
        delays.push(delay);
      },
      onCycleComplete: () => {
        if (source.consumeCalls === 2) controller.abort();
      },
    });

    try {
      await coordinator.run(controller.signal);
      expect(source.consumeCalls).toBe(2);
      expect(delays).toEqual([1_000]);
    } finally {
      testDatabase.cleanup();
    }
  });
});
