import { describe, expect, it } from 'vitest';

import { migrateDatabase } from '../../src/db/migrate.js';
import { createTestDatabase } from '../helpers/database.js';

describe('database migrations', () => {
  it('creates every v0.1 table and records one forward migration', () => {
    const testDatabase = createTestDatabase();

    try {
      const tables = testDatabase.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      const migrations = testDatabase.database
        .prepare('SELECT id FROM migrations ORDER BY id')
        .all() as Array<{ id: string }>;

      expect(tables.map(({ name }) => name)).toEqual([
        'deliveries',
        'destinations',
        'migrations',
        'posts',
        'settings',
        'source_cursors',
      ]);
      expect(migrations).toEqual([{ id: '001_initial' }]);
    } finally {
      testDatabase.cleanup();
    }
  });

  it('is safe to run repeatedly and enables SQLite safety pragmas', () => {
    const testDatabase = createTestDatabase();

    try {
      migrateDatabase(testDatabase.database);
      const migrationCount = testDatabase.database
        .prepare('SELECT COUNT(*) AS count FROM migrations')
        .get() as { count: number };

      expect(migrationCount.count).toBe(1);
      expect(testDatabase.database.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(testDatabase.database.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(testDatabase.database.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      testDatabase.cleanup();
    }
  });

  it('enforces foreign keys', () => {
    const testDatabase = createTestDatabase();

    try {
      expect(() =>
        testDatabase.database
          .prepare(
            `INSERT INTO deliveries (
              id, post_id, destination_id, state, attempt_count,
              next_attempt_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
          )
          .run(
            'delivery-1',
            'missing-post',
            'missing-destination',
            ...Array(3).fill(new Date().toISOString()),
          ),
      ).toThrow(/FOREIGN KEY/iu);
    } finally {
      testDatabase.cleanup();
    }
  });

  it('rejects malformed snowflake identifiers at the database boundary', () => {
    const testDatabase = createTestDatabase();

    try {
      expect(() =>
        testDatabase.database
          .prepare(
            'INSERT INTO source_cursors (source, latest_post_id, updated_at) VALUES (?, ?, ?)',
          )
          .run('x:thsottiaux', '123-not-numeric', new Date().toISOString()),
      ).toThrow(/CHECK constraint/iu);
    } finally {
      testDatabase.cleanup();
    }
  });
});
