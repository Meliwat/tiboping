import { classifyPost } from '@tiboping/core';

import type { TiboPingDatabase } from '../db/client.js';
import type { CursorRepository } from '../db/repositories/cursors.js';
import type { PostRepository, StoredPost } from '../db/repositories/posts.js';
import { normalizeXPost } from './normalize-post.js';
import type { TiboPostSource, XPost, XUser } from './types.js';

type Router = {
  route: (post: StoredPost) => { created: number; existing: number };
};

type CoordinatorDependencies = {
  database: TiboPingDatabase;
  source: TiboPostSource;
  cursors: CursorRepository;
  posts: PostRepository;
  router: Router;
  now?: () => number;
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  onCycleComplete?: () => void;
};

const sourceKey = 'x:thsottiaux';

const defaultSleep = async (delayMs: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
};

const comparePostIds = (left: XPost, right: XPost): number =>
  BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0;

export class SourceCoordinator {
  private readonly now: () => number;
  private readonly sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
  private target?: XUser;

  public constructor(private readonly dependencies: CoordinatorDependencies) {
    this.now = dependencies.now ?? Date.now;
    this.sleep = dependencies.sleep ?? defaultSleep;
  }

  public async initialize(): Promise<XUser> {
    if (this.target) return this.target;
    this.target = await this.dependencies.source.prepare();

    if (!this.dependencies.cursors.get(sourceKey)) {
      const latest = await this.dependencies.source.fetchLatest(this.target.id);
      const validPosts = latest
        .map((post) => this.normalize(post))
        .filter((post): post is NonNullable<typeof post> => post !== undefined);
      const newest = validPosts.sort((left, right) =>
        BigInt(left.id) > BigInt(right.id)
          ? -1
          : BigInt(left.id) < BigInt(right.id)
            ? 1
            : 0,
      )[0];
      if (newest) {
        this.dependencies.cursors.advance(sourceKey, newest.id, newest.observedAt);
      }
    }

    return this.target;
  }

  public async runConnection(signal: AbortSignal): Promise<void> {
    const target = await this.initialize();
    const buffer: XPost[] = [];
    let live = false;
    let streamError: unknown;

    const streamDone = this.dependencies.source
      .consumeStream(signal, async (post) => {
        if (live) await this.process(post);
        else buffer.push(post);
      })
      .catch((error: unknown) => {
        streamError = error;
      });

    const cursor = this.dependencies.cursors.get(sourceKey);
    if (cursor) {
      const catchup = await this.dependencies.source.fetchAfter(
        target.id,
        cursor.latestPostId,
      );
      for (const post of catchup.sort(comparePostIds)) await this.process(post);
    }

    while (buffer.length > 0) {
      const post = buffer.shift();
      if (post) await this.process(post);
    }
    live = true;
    await streamDone;
    if (streamError !== undefined) throw streamError;
  }

  public async run(signal: AbortSignal): Promise<void> {
    await this.initialize();
    let failures = 0;

    while (!signal.aborted) {
      let failed = false;
      try {
        await this.runConnection(signal);
        failures = 0;
      } catch {
        failed = true;
        failures += 1;
      } finally {
        this.dependencies.onCycleComplete?.();
      }

      if (signal.aborted) break;
      const delay = failed ? Math.min(60_000, 1000 * 2 ** (failures - 1)) : 1000;
      await this.sleep(delay, signal);
    }
  }

  private normalize(post: XPost) {
    if (!this.target) throw new Error('Source coordinator is not initialized');
    return normalizeXPost(post, {
      targetUserId: this.target.id,
      observedAt: new Date(this.now()).toISOString(),
    });
  }

  private async process(rawPost: XPost): Promise<void> {
    const post = this.normalize(rawPost);
    if (!post) return;
    const classification = classifyPost(post.text);

    const ingest = this.dependencies.database.transaction(() => {
      const inserted = this.dependencies.posts.insert(post, classification);
      this.dependencies.cursors.advance(sourceKey, post.id, post.observedAt);
      if (inserted) {
        const stored = this.dependencies.posts.get(post.id);
        if (!stored) throw new Error('Stored X post could not be reloaded');
        this.dependencies.router.route(stored);
      }
    });
    ingest();
  }
}
