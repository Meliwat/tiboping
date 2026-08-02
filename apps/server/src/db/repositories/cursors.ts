import type { TiboPingDatabase } from '../client.js';

export type SourceCursor = {
  source: string;
  latestPostId: string;
  updatedAt: string;
};

type CursorRow = {
  source: string;
  latest_post_id: string;
  updated_at: string;
};

export class CursorRepository {
  public constructor(private readonly database: TiboPingDatabase) {}

  public get(source: string): SourceCursor | undefined {
    const row = this.database
      .prepare(
        'SELECT source, latest_post_id, updated_at FROM source_cursors WHERE source = ?',
      )
      .get(source) as CursorRow | undefined;

    return row
      ? {
          source: row.source,
          latestPostId: row.latest_post_id,
          updatedAt: row.updated_at,
        }
      : undefined;
  }

  public advance(source: string, postId: string, updatedAt: string): void {
    this.database
      .prepare(
        `INSERT INTO source_cursors (source, latest_post_id, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET
           latest_post_id = excluded.latest_post_id,
           updated_at = excluded.updated_at
         WHERE CAST(excluded.latest_post_id AS INTEGER) > CAST(source_cursors.latest_post_id AS INTEGER)`,
      )
      .run(source, postId, updatedAt);
  }
}
