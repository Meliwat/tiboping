import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

export type TiboPingDatabase = Database.Database;

export const openDatabase = (databasePath: string): TiboPingDatabase => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('journal_mode = WAL');

  return database;
};
