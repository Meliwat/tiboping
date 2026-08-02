import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { defaultWebRoot } from '../api/spa.js';
import { buildApp, type AppDependencies } from '../app.js';
import { loadConfig, type AppConfig } from '../config/load-config.js';
import { deriveKeys } from '../crypto/keys.js';
import { openDatabase, type TiboPingDatabase } from '../db/client.js';
import { migrateDatabase } from '../db/migrate.js';
import { CursorRepository } from '../db/repositories/cursors.js';
import { DeliveryRepository } from '../db/repositories/deliveries.js';
import { DestinationRepository } from '../db/repositories/destinations.js';
import { PostRepository } from '../db/repositories/posts.js';
import { SettingsRepository } from '../db/repositories/settings.js';
import { DeliveryService } from '../delivery/service.js';
import { NotificationRouter } from '../delivery/router.js';
import { DeliveryWorker } from '../delivery/worker.js';
import { createDiscordAdapter } from '../destinations/discord.js';
import { createGenericWebhookAdapter } from '../destinations/generic.js';
import { FetchHttpTransport, type HttpTransport } from '../destinations/http-client.js';
import { DestinationAdapterRegistry } from '../destinations/registry.js';
import { createSlackAdapter } from '../destinations/slack.js';
import { DemoSource } from '../source/demo-source.js';
import { SourceCoordinator } from '../source/source-coordinator.js';
import type { XApi } from '../source/types.js';
import { XApiClient } from '../source/x-api-client.js';
import { XSource } from '../source/x-source.js';
import { SourceService } from './source-service.js';

export type RuntimeUnit = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type RuntimeParts = {
  http: RuntimeUnit;
  worker: RuntimeUnit;
  source: RuntimeUnit;
  closeStorage: () => void;
};

export class ApplicationRuntime {
  private readonly startedUnits: RuntimeUnit[] = [];
  private storageClosed = false;
  private stopped = false;

  public constructor(private readonly parts: RuntimeParts) {}

  public async start(): Promise<void> {
    if (this.stopped) throw new Error('The application runtime has already stopped');
    if (this.startedUnits.length > 0) return;

    try {
      for (const unit of [this.parts.http, this.parts.worker, this.parts.source]) {
        await unit.start();
        this.startedUnits.push(unit);
      }
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const errors: unknown[] = [];

    for (const unit of this.startedUnits.reverse()) {
      try {
        await unit.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    this.startedUnits.length = 0;

    if (!this.storageClosed) {
      this.storageClosed = true;
      try {
        this.parts.closeStorage();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'TiboPing could not shut down cleanly');
    }
  }
}

const waitForAbort = async (delayMs: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
};

class BackgroundUnit implements RuntimeUnit {
  private controller: AbortController | undefined;
  private completion: Promise<void> | undefined;

  public constructor(private readonly run: (signal: AbortSignal) => Promise<void>) {}

  public async start(): Promise<void> {
    if (this.controller) return;
    this.controller = new AbortController();
    this.completion = this.run(this.controller.signal).catch(() => undefined);
  }

  public async stop(): Promise<void> {
    this.controller?.abort();
    await this.completion;
    this.controller = undefined;
    this.completion = undefined;
  }
}

const runDeliveryLoop = async (
  worker: DeliveryWorker,
  signal: AbortSignal,
): Promise<void> => {
  while (!signal.aborted) {
    let processed: number;
    try {
      processed = await worker.runBatch(4);
    } catch {
      processed = 0;
    }
    if (!signal.aborted) await waitForAbort(processed > 0 ? 25 : 1000, signal);
  }
};

export type RuntimeServices = {
  settings: SettingsRepository;
  cursors: CursorRepository;
  posts: PostRepository;
  destinations: DestinationRepository;
  deliveries: DeliveryRepository;
  registry: DestinationAdapterRegistry;
  router: NotificationRouter;
  worker: DeliveryWorker;
  deliveryService: DeliveryService;
  source: SourceService;
  sourceCoordinator?: SourceCoordinator;
  demoSource?: DemoSource;
};

export const createRuntimeServices = (options: {
  config: AppConfig;
  database: TiboPingDatabase;
  transport?: HttpTransport;
  xApi?: XApi;
  now?: () => number;
}): RuntimeServices => {
  const now = options.now ?? Date.now;
  const nowIso = () => new Date(now()).toISOString();
  const { encryptionKey } = deriveKeys(options.config.appSecret);
  const transport = options.transport ?? new FetchHttpTransport();
  const adapterDependencies = {
    transport,
    allowPrivate: options.config.allowPrivateWebhooks,
    now,
  };
  const settings = new SettingsRepository(options.database, encryptionKey, nowIso);
  const cursors = new CursorRepository(options.database);
  const posts = new PostRepository(options.database, nowIso);
  const destinations = new DestinationRepository(options.database, encryptionKey, {
    now: nowIso,
  });
  const deliveries = new DeliveryRepository(options.database);
  const registry = new DestinationAdapterRegistry([
    createSlackAdapter(adapterDependencies),
    createDiscordAdapter(adapterDependencies),
    createGenericWebhookAdapter(adapterDependencies),
  ]);
  const router = new NotificationRouter(options.database, destinations, deliveries, {
    now: nowIso,
  });
  const worker = new DeliveryWorker({
    deliveries,
    destinations,
    posts,
    registry,
    workerId: `worker:${process.pid}:${randomUUID()}`,
    now,
  });
  const deliveryService = new DeliveryService(deliveries, registry, nowIso);

  const createCoordinator = (xApi: XApi) =>
    new SourceCoordinator({
      database: options.database,
      source: new XSource(xApi),
      cursors,
      posts,
      router,
      now,
    });
  const createApi = (token: string) =>
    options.xApi ?? new XApiClient({ bearerToken: token });
  let demoSource: DemoSource | undefined;
  let demoCoordinator: SourceCoordinator | undefined;
  if (options.config.demoMode) {
    demoSource = new DemoSource();
    demoCoordinator = new SourceCoordinator({
      database: options.database,
      source: demoSource,
      cursors,
      posts,
      router,
      now,
    });
  }
  const source = new SourceService({
    config: options.config,
    settings,
    createApi,
    createCoordinator,
    ...(demoCoordinator ? { demoCoordinator } : {}),
  });

  return {
    settings,
    cursors,
    posts,
    destinations,
    deliveries,
    registry,
    router,
    worker,
    deliveryService,
    source,
    ...(demoCoordinator ? { sourceCoordinator: demoCoordinator } : {}),
    ...(demoSource ? { demoSource } : {}),
  };
};

type HttpApplication = Pick<FastifyInstance, 'listen' | 'close'>;

type BootstrapOptions = {
  loadConfiguration?: () => AppConfig;
  openStorage?: (databasePath: string) => TiboPingDatabase;
  migrateStorage?: (database: TiboPingDatabase) => void;
  buildHttpApp?: (dependencies: AppDependencies) => Promise<HttpApplication>;
  transport?: HttpTransport;
  xApi?: XApi;
};

export type RuntimeBundle = {
  config: AppConfig;
  database: TiboPingDatabase;
  app: HttpApplication;
  services: RuntimeServices;
  runtime: ApplicationRuntime;
};

export const bootstrapRuntime = async (
  options: BootstrapOptions = {},
): Promise<RuntimeBundle> => {
  const config = (options.loadConfiguration ?? loadConfig)();
  const database = (options.openStorage ?? openDatabase)(config.databasePath);

  try {
    (options.migrateStorage ?? migrateDatabase)(database);
    const services = createRuntimeServices({
      config,
      database,
      ...(options.transport ? { transport: options.transport } : {}),
      ...(options.xApi ? { xApi: options.xApi } : {}),
    });
    const app = await (options.buildHttpApp ?? buildApp)({
      config,
      database,
      services,
      ...(config.nodeEnv === 'production' ? { webRoot: defaultWebRoot } : {}),
    });
    const http: RuntimeUnit = {
      start: async () => {
        await app.listen({ host: '0.0.0.0', port: config.port });
      },
      stop: async () => app.close(),
    };
    const worker = new BackgroundUnit(async (signal) =>
      runDeliveryLoop(services.worker, signal),
    );
    const runtime = new ApplicationRuntime({
      http,
      worker,
      source: services.source,
      closeStorage: () => database.close(),
    });
    return { config, database, app, services, runtime };
  } catch (error) {
    database.close();
    throw error;
  }
};
