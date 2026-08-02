import {
  categoriesSchema,
  normalizedPostSchema,
  type ClassificationResult,
  type NormalizedPost,
} from '@tiboping/core';
import { z } from 'zod';

import type { TiboPingDatabase } from '../client.js';

type PostRow = {
  id: string;
  author_id: string;
  author_name: string;
  author_username: 'thsottiaux';
  text: string;
  url: string;
  created_at: string;
  observed_at: string;
  kind: 'post' | 'reply' | 'quote';
  in_reply_to_post_id: string | null;
  quoted_post_id: string | null;
  classifier_version: number;
  categories_json: string;
  matched_rule_ids_json: string;
  ingested_at: string;
};

export type StoredPost = NormalizedPost & {
  classifierVersion: number;
  categories: ClassificationResult['categories'];
  matchedRuleIds: string[];
  ingestedAt: string;
};

const matchedRuleIdsSchema = z.array(z.string().min(1));

const mapPost = (row: PostRow): StoredPost => {
  const post = normalizedPostSchema.parse({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    authorUsername: row.author_username,
    text: row.text,
    url: row.url,
    createdAt: row.created_at,
    observedAt: row.observed_at,
    kind: row.kind,
    ...(row.in_reply_to_post_id ? { inReplyToPostId: row.in_reply_to_post_id } : {}),
    ...(row.quoted_post_id ? { quotedPostId: row.quoted_post_id } : {}),
  });

  return {
    ...post,
    classifierVersion: row.classifier_version,
    categories: categoriesSchema.parse(JSON.parse(row.categories_json) as unknown),
    matchedRuleIds: matchedRuleIdsSchema.parse(
      JSON.parse(row.matched_rule_ids_json) as unknown,
    ),
    ingestedAt: row.ingested_at,
  };
};

export class PostRepository {
  public constructor(
    private readonly database: TiboPingDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public insert(
    postInput: NormalizedPost,
    classification: ClassificationResult,
  ): boolean {
    const post = normalizedPostSchema.parse(postInput);
    const result = this.database
      .prepare(
        `INSERT INTO posts (
          id, author_id, author_name, author_username, text, url,
          created_at, observed_at, kind, in_reply_to_post_id, quoted_post_id,
          classifier_version, categories_json, matched_rule_ids_json, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
      )
      .run(
        post.id,
        post.authorId,
        post.authorName,
        post.authorUsername,
        post.text,
        post.url,
        post.createdAt,
        post.observedAt,
        post.kind,
        post.inReplyToPostId ?? null,
        post.quotedPostId ?? null,
        classification.version,
        JSON.stringify(classification.categories),
        JSON.stringify(classification.matchedRuleIds),
        this.now(),
      );

    return result.changes === 1;
  }

  public get(id: string): StoredPost | undefined {
    const row = this.database.prepare('SELECT * FROM posts WHERE id = ?').get(id) as
      PostRow | undefined;
    return row ? mapPost(row) : undefined;
  }

  public listRecent(options: { limit: number; beforeId?: string }): {
    items: StoredPost[];
    nextCursor?: string;
  } {
    const rows = (
      options.beforeId
        ? this.database
            .prepare(
              `SELECT * FROM posts
             WHERE CAST(id AS INTEGER) < CAST(? AS INTEGER)
             ORDER BY CAST(id AS INTEGER) DESC LIMIT ?`,
            )
            .all(options.beforeId, options.limit)
        : this.database
            .prepare('SELECT * FROM posts ORDER BY CAST(id AS INTEGER) DESC LIMIT ?')
            .all(options.limit)
    ) as PostRow[];
    const items = rows.map(mapPost);
    const lastItem = items.at(-1);

    return {
      items,
      ...(items.length === options.limit && lastItem ? { nextCursor: lastItem.id } : {}),
    };
  }
}
