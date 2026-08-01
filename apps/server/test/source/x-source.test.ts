import { describe, expect, it } from 'vitest';

import { XSource } from '../../src/source/x-source.js';
import type { XApi, XPost, XStreamRule, XUser } from '../../src/source/types.js';

const user: XUser = {
  id: '1888888888',
  name: 'Tibo',
  username: 'thsottiaux',
  protected: false,
};

class FakeXApi implements XApi {
  public rules: XStreamRule[] = [];
  public added: Array<{ value: string; tag: string }> = [];
  public deleted: string[][] = [];
  public pages = new Map<string, { posts: XPost[]; nextToken?: string }>();

  public async resolveUser(): Promise<XUser> {
    return user;
  }
  public async listStreamRules(): Promise<XStreamRule[]> {
    return this.rules;
  }
  public async addStreamRule(rule: { value: string; tag: string }): Promise<XStreamRule> {
    this.added.push(rule);
    return { id: 'new-rule', ...rule };
  }
  public async deleteStreamRules(ids: string[]): Promise<void> {
    this.deleted.push(ids);
  }
  public async fetchUserPosts(
    _userId: string,
    options: { paginationToken?: string },
  ): Promise<{ posts: XPost[]; nextToken?: string }> {
    return this.pages.get(options.paginationToken ?? 'first') ?? { posts: [] };
  }
  public async openFilteredStream(): Promise<ReadableStream<Uint8Array>> {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }
}

describe('XSource', () => {
  it('reuses its exact tagged rule and preserves unrelated app rules', async () => {
    const api = new FakeXApi();
    api.rules = [
      { id: 'unrelated', value: 'cats', tag: 'another-app' },
      { id: 'ours', value: 'from:thsottiaux -is:retweet', tag: 'tiboping:v1:thsottiaux' },
    ];
    const source = new XSource(api);

    await expect(source.prepare()).resolves.toEqual(user);
    expect(api.added).toEqual([]);
    expect(api.deleted).toEqual([]);
    expect(api.rules).toHaveLength(2);
  });

  it('replaces only a stale TiboPing-owned rule and never unrelated rules', async () => {
    const api = new FakeXApi();
    api.rules = [
      { id: 'unrelated', value: 'cats', tag: 'another-app' },
      { id: 'stale', value: 'from:somebodyelse', tag: 'tiboping:v1:thsottiaux' },
    ];
    const source = new XSource(api);

    await source.prepare();
    expect(api.deleted).toEqual([['stale']]);
    expect(api.added).toEqual([
      { value: 'from:thsottiaux -is:retweet', tag: 'tiboping:v1:thsottiaux' },
    ]);
  });

  it('paginates all catch-up posts while latest fetch reads one minimum-sized page', async () => {
    const api = new FakeXApi();
    api.pages.set('first', { posts: [{ id: '102' } as XPost], nextToken: 'page-2' });
    api.pages.set('page-2', { posts: [{ id: '101' } as XPost] });
    const source = new XSource(api);

    await expect(source.fetchLatest(user.id)).resolves.toHaveLength(1);
    await expect(source.fetchAfter(user.id, '100')).resolves.toMatchObject([
      { id: '102' },
      { id: '101' },
    ]);
  });
});
