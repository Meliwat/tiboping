import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openDatabase, type TiboPingDatabase } from '../../src/db/client.js';
import { migrateDatabase } from '../../src/db/migrate.js';

export type TestDatabase = {
  database: TiboPingDatabase;
  path: string;
  cleanup: () => void;
};

export const createTestDatabase = (): TestDatabase => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tiboping-db-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const database = openDatabase(databasePath);
  migrateDatabase(database);

  return {
    database,
    path: databasePath,
    cleanup: () => {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};
