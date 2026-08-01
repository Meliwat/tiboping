import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from './app.js';
import { loadConfig } from './config/load-config.js';
import { openDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';

export const serviceName = 'TiboPing';

export const startServer = async (): Promise<void> => {
  const config = loadConfig();
  const database = openDatabase(config.databasePath);
  migrateDatabase(database);
  const app = await buildApp({ config, database });

  const close = async () => {
    await app.close();
    database.close();
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());

  await app.listen({ host: '0.0.0.0', port: config.port });
};

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (executedPath === modulePath) {
  startServer().catch((error: unknown) => {
    process.stderr.write(`${serviceName} failed to start: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
