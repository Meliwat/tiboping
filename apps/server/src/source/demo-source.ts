import type { TiboPostSource, XPost, XUser } from './types.js';

export const demoFixtureNames = [
  'codex',
  'outage',
  'usage-limit',
  'multi-category',
  'unmatched',
] as const;

export type DemoFixtureName = (typeof demoFixtureNames)[number];

const demoUser: XUser = {
  id: '127000000000000001',
  name: 'Tibo',
  username: 'thsottiaux',
  protected: false,
};

const fixture = (id: string, text: string, createdAt: string): XPost => ({
  id,
  text,
  author_id: demoUser.id,
  created_at: createdAt,
});

const demoFixtures: Record<DemoFixtureName, XPost> = {
  codex: fixture(
    '1990000000000000001',
    'Codex CLI v2 is rolling out today.',
    '2026-08-01T12:00:01.000Z',
  ),
  outage: fixture(
    '1990000000000000002',
    'We are investigating a service outage.',
    '2026-08-01T12:00:02.000Z',
  ),
  'usage-limit': fixture(
    '1990000000000000003',
    "I've reset everyone's usage limits.",
    '2026-08-01T12:00:03.000Z',
  ),
  'multi-category': fixture(
    '1990000000000000004',
    'Codex is degraded while we repair the usage limit service.',
    '2026-08-01T12:00:04.000Z',
  ),
  unmatched: fixture(
    '1990000000000000005',
    'Beautiful weather for a long walk.',
    '2026-08-01T12:00:05.000Z',
  ),
};

const clonePost = (post: XPost): XPost => structuredClone(post);

export const getDemoFixture = (name: DemoFixtureName): XPost =>
  clonePost(demoFixtures[name]);

export class DemoSource implements TiboPostSource {
  private readonly queue: XPost[] = [];
  private wakeConsumer: (() => void) | undefined;
  private consuming = false;

  public async prepare(): Promise<XUser> {
    return { ...demoUser };
  }

  public async fetchLatest(_userId: string): Promise<XPost[]> {
    return [];
  }

  public async fetchAfter(_userId: string, _sinceId: string): Promise<XPost[]> {
    return [];
  }

  public emit(name: DemoFixtureName): XPost {
    const post = getDemoFixture(name);
    this.queue.push(post);
    this.wakeConsumer?.();
    return clonePost(post);
  }

  public async consumeStream(
    signal: AbortSignal,
    onPost: (post: XPost) => Promise<void>,
  ): Promise<void> {
    if (this.consuming) throw new Error('The demo source already has a consumer');
    this.consuming = true;

    try {
      while (!signal.aborted) {
        const post = this.queue.shift();
        if (post) {
          await onPost(clonePost(post));
          continue;
        }
        await this.waitForEvent(signal);
      }
    } finally {
      this.consuming = false;
      this.wakeConsumer = undefined;
    }
  }

  private async waitForEvent(signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.queue.length > 0) return;

    await new Promise<void>((resolve) => {
      const wake = () => {
        signal.removeEventListener('abort', wake);
        if (this.wakeConsumer === wake) this.wakeConsumer = undefined;
        resolve();
      };
      this.wakeConsumer = wake;
      signal.addEventListener('abort', wake, { once: true });
    });
  }
}
