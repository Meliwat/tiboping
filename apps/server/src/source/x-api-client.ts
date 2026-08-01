import { z } from 'zod';

import type { XApi, XPostPage, XStreamRule, XUser } from './types.js';

const userSchema = z.object({
  id: z.string().regex(/^\d+$/u),
  name: z.string().min(1),
  username: z.string().min(1),
  protected: z.boolean().optional().default(false),
});

const referencedPostSchema = z.object({
  type: z.enum(['replied_to', 'quoted', 'retweeted']),
  id: z.string().regex(/^\d+$/u),
});

export const xPostSchema = z.object({
  id: z.string().regex(/^\d+$/u),
  text: z.string(),
  author_id: z.string().regex(/^\d+$/u),
  created_at: z.iso.datetime(),
  referenced_tweets: z.array(referencedPostSchema).optional(),
  note_tweet: z.object({ text: z.string() }).optional(),
});

const ruleSchema = z.object({
  id: z.string().min(1),
  value: z.string().min(1),
  tag: z.string().optional(),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

export class XApiError extends Error {
  public readonly status: number;
  public readonly retryAt?: number;

  public constructor(status: number, retryAt?: number) {
    super(`X API request failed with HTTP ${status}`);
    this.name = 'XApiError';
    this.status = status;
    if (retryAt !== undefined) this.retryAt = retryAt;
  }
}

type FetchImplementation = typeof fetch;

export class XApiClient implements XApi {
  private readonly bearerToken: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly baseUrl: string;

  public constructor(options: {
    bearerToken: string;
    fetch?: FetchImplementation;
    baseUrl?: string;
  }) {
    this.bearerToken = options.bearerToken;
    this.fetchImplementation = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.x.com';
  }

  public async resolveUser(username: string): Promise<XUser> {
    const url = this.url(`/2/users/by/username/${encodeURIComponent(username)}`);
    url.searchParams.set('user.fields', 'name,username,protected');
    const body = await this.requestJson(url);
    return userSchema.parse(jsonObjectSchema.parse(body)['data']);
  }

  public async listStreamRules(): Promise<XStreamRule[]> {
    const body = await this.requestJson(this.url('/2/tweets/search/stream/rules'));
    const data = jsonObjectSchema.parse(body)['data'];
    return data === undefined ? [] : z.array(ruleSchema).parse(data);
  }

  public async addStreamRule(rule: { value: string; tag: string }): Promise<XStreamRule> {
    const body = await this.requestJson(this.url('/2/tweets/search/stream/rules'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ add: [rule] }),
    });
    const rules = z.array(ruleSchema).parse(jsonObjectSchema.parse(body)['data']);
    const created = rules[0];
    if (!created) throw new Error('X API did not return the created stream rule');
    return created;
  }

  public async deleteStreamRules(ids: string[]): Promise<void> {
    await this.requestJson(this.url('/2/tweets/search/stream/rules'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delete: { ids } }),
    });
  }

  public async fetchUserPosts(
    userId: string,
    options: { sinceId?: string; paginationToken?: string; maxResults: number },
  ): Promise<XPostPage> {
    const url = this.url(`/2/users/${encodeURIComponent(userId)}/tweets`);
    url.searchParams.set('max_results', String(options.maxResults));
    url.searchParams.set('exclude', 'retweets');
    url.searchParams.set(
      'tweet.fields',
      'author_id,created_at,referenced_tweets,note_tweet',
    );
    if (options.sinceId) url.searchParams.set('since_id', options.sinceId);
    if (options.paginationToken) {
      url.searchParams.set('pagination_token', options.paginationToken);
    }

    const body = jsonObjectSchema.parse(await this.requestJson(url));
    const data = body['data'];
    const meta = z
      .object({ next_token: z.string().optional() })
      .optional()
      .parse(body['meta']);
    return {
      posts: data === undefined ? [] : z.array(xPostSchema).parse(data),
      ...(meta?.next_token ? { nextToken: meta.next_token } : {}),
    };
  }

  public async openFilteredStream(
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const url = this.url('/2/tweets/search/stream');
    url.searchParams.set(
      'tweet.fields',
      'author_id,created_at,referenced_tweets,note_tweet',
    );
    const response = await this.fetchImplementation(url.toString(), {
      headers: this.authorizationHeaders(),
      redirect: 'manual',
      signal,
    });
    if (!response.ok) throw this.apiError(response);
    if (!response.body) throw new Error('X API opened a stream without a response body');
    return response.body;
  }

  private url(pathname: string): URL {
    return new URL(pathname, this.baseUrl);
  }

  private authorizationHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.bearerToken}` };
  }

  private async requestJson(url: URL, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchImplementation(url.toString(), {
      ...init,
      headers: { ...this.authorizationHeaders(), ...init.headers },
      redirect: 'manual',
    });
    if (!response.ok) throw this.apiError(response);
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : {};
  }

  private apiError(response: Response): XApiError {
    const resetSeconds = Number(response.headers.get('x-rate-limit-reset'));
    return new XApiError(
      response.status,
      Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds * 1000 : undefined,
    );
  }
}
