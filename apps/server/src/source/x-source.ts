import { z } from 'zod';

import { parseXStream } from './x-stream-parser.js';
import { xPostSchema } from './x-api-client.js';
import type { TiboPostSource, XApi, XPost, XUser } from './types.js';

const targetUsername = 'thsottiaux';
const ruleValue = `from:${targetUsername} -is:retweet`;
const ruleTag = `tiboping:v1:${targetUsername}`;

const streamEnvelopeSchema = z.object({ data: xPostSchema });

export class XSource implements TiboPostSource {
  public constructor(private readonly api: XApi) {}

  public async prepare(): Promise<XUser> {
    const user = await this.api.resolveUser(targetUsername);
    if (user.username.toLowerCase() !== targetUsername || user.protected) {
      throw new Error(
        'The configured X account is not the expected public @thsottiaux account',
      );
    }

    const rules = await this.api.listStreamRules();
    const exactRule = rules.find(
      ({ value, tag }) => value === ruleValue && tag === ruleTag,
    );
    if (!exactRule) {
      const staleOwnedRules = rules
        .filter(({ tag }) => tag === ruleTag)
        .map(({ id }) => id);
      if (staleOwnedRules.length > 0) await this.api.deleteStreamRules(staleOwnedRules);
      await this.api.addStreamRule({ value: ruleValue, tag: ruleTag });
    }
    return user;
  }

  public async fetchLatest(userId: string): Promise<XPost[]> {
    return (await this.api.fetchUserPosts(userId, { maxResults: 5 })).posts;
  }

  public async fetchAfter(userId: string, sinceId: string): Promise<XPost[]> {
    const posts: XPost[] = [];
    let paginationToken: string | undefined;

    do {
      const page = await this.api.fetchUserPosts(userId, {
        sinceId,
        maxResults: 100,
        ...(paginationToken ? { paginationToken } : {}),
      });
      posts.push(...page.posts);
      paginationToken = page.nextToken;
    } while (paginationToken);

    return posts;
  }

  public async consumeStream(
    signal: AbortSignal,
    onPost: (post: XPost) => Promise<void>,
  ): Promise<void> {
    const stream = await this.api.openFilteredStream(signal);
    for await (const envelope of parseXStream(stream)) {
      await onPost(streamEnvelopeSchema.parse(envelope).data);
    }
  }
}
