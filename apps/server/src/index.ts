import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrapRuntime, type ApplicationRuntime } from './services/runtime.js';

export const serviceName = 'TiboPing';

export const startServer = async (): Promise<ApplicationRuntime> => {
  const { runtime } = await bootstrapRuntime();
  await runtime.start();

  const close = async () => runtime.stop();
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
  return runtime;
};

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (executedPath === modulePath) {
  startServer().catch((error: unknown) => {
    process.stderr.write(`${serviceName} failed to start: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
