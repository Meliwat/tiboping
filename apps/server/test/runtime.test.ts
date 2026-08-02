import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db/client.js';
import { migrateDatabase } from '../src/db/migrate.js';
import type { HttpRequest, HttpTransport } from '../src/destinations/http-client.js';
import {
  ApplicationRuntime,
  bootstrapRuntime,
  createRuntimeServices,
  type RuntimeUnit,
} from '../src/services/runtime.js';
import { createTestConfig } from './helpers/config.js';
import { createTestDatabase } from './helpers/database.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    rmSync(target, { recursive: true, force: true });
  }
});

describe('ApplicationRuntime', () => {
  it('starts HTTP, worker, and source in order and stops them in reverse', async () => {
    const events: string[] = [];
    const unit = (name: string): RuntimeUnit => ({
      start: async () => {
        events.push(`start:${name}`);
      },
      stop: async () => {
        events.push(`stop:${name}`);
      },
    });
    const runtime = new ApplicationRuntime({
      http: unit('http'),
      worker: unit('worker'),
      source: unit('source'),
      closeStorage: () => {
        events.push('stop:storage');
      },
    });

    await runtime.start();
    await runtime.stop();
    await runtime.stop();

    expect(events).toEqual([
      'start:http',
      'start:worker',
      'start:source',
      'stop:source',
      'stop:worker',
      'stop:http',
      'stop:storage',
    ]);
  });

  it('runs configuration, migrations, and app readiness before startup', async () => {
    const events: string[] = [];
    const directory = path.join(tmpdir(), `tiboping-runtime-${randomUUID()}`);
    cleanupPaths.push(directory);
    const config = createTestConfig({ databasePath: path.join(directory, 'db.sqlite') });
    const bundle = await bootstrapRuntime({
      loadConfiguration: () => {
        events.push('configuration');
        return config;
      },
      openStorage: (databasePath) => {
        events.push('storage');
        return openDatabase(databasePath);
      },
      migrateStorage: (database) => {
        events.push('migrations');
        migrateDatabase(database);
      },
      buildHttpApp: async () => {
        events.push('http-ready');
        return {
          listen: async () => {
            events.push('http-listen');
            return 'http://127.0.0.1:3000';
          },
          close: async () => undefined,
        };
      },
    });

    expect(events).toEqual(['configuration', 'storage', 'migrations', 'http-ready']);
    await bundle.runtime.start();
    expect(events).toContain('http-listen');
    await bundle.runtime.stop();
  });
});

describe('runtime services', () => {
  it('sends a demo fixture through classifier, storage, routing, worker, and adapter', async () => {
    const testDatabase = createTestDatabase();
    const requests: HttpRequest[] = [];
    const transport: HttpTransport = {
      send: async (request) => {
        requests.push(request);
        return { status: 204, headers: {}, body: '' };
      },
    };
    const services = createRuntimeServices({
      config: createTestConfig({ allowPrivateWebhooks: true }),
      database: testDatabase.database,
      transport,
    });

    try {
      expect(services.demoSource).toBeDefined();
      services.destinations.create({
        type: 'generic',
        name: 'Demo receiver',
        config: {
          url: 'http://127.0.0.1/demo-hook',
          signingSecret: Buffer.alloc(32, 7).toString('base64'),
        },
        routing: { mode: 'categories', categories: ['codex', 'outages'] },
      });

      const controller = new AbortController();
      const sourceRun = services.sourceCoordinator?.runConnection(controller.signal);
      services.demoSource?.emit('multi-category');

      await expect
        .poll(() => services.posts.get('1990000000000000004'))
        .toMatchObject({ categories: ['codex', 'outages', 'usage-limits'] });
      await expect(services.worker.runBatch(4)).resolves.toBe(1);

      const delivery = testDatabase.database
        .prepare('SELECT state FROM deliveries LIMIT 1')
        .get() as { state: string };
      expect(delivery.state).toBe('delivered');
      expect(requests).toHaveLength(1);
      expect(JSON.parse(requests[0]?.body ?? '{}')).toMatchObject({
        schema_version: '1',
        event_id: 'x:1990000000000000004',
        categories: ['codex', 'outages', 'usage-limits'],
      });

      controller.abort();
      await sourceRun;
    } finally {
      testDatabase.cleanup();
    }
  });
});
