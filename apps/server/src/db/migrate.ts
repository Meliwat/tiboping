import { readFileSync } from 'node:fs';

import type { TiboPingDatabase } from './client.js';

const migrations = [
  {
    id: '001_initial',
    url: new URL('./migrations/001_initial.sql', import.meta.url),
  },
] as const;

export const migrateDatabase = (database: TiboPingDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const hasMigration = database.prepare('SELECT 1 FROM migrations WHERE id = ?');
  const recordMigration = database.prepare(
    'INSERT INTO migrations (id, applied_at) VALUES (?, ?)',
  );

  const apply = database.transaction((id: string, sql: string) => {
    database.exec(sql);
    recordMigration.run(id, new Date().toISOString());
  });

  for (const migration of migrations) {
    if (!hasMigration.get(migration.id)) {
      apply(migration.id, readFileSync(migration.url, 'utf8'));
    }
  }
};
