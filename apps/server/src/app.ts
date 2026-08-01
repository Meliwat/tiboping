import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { createSessionManager } from './auth/session.js';
import type { AppConfig } from './config/load-config.js';
import { deriveKeys } from './crypto/keys.js';
import type { TiboPingDatabase } from './db/client.js';
import { createRedactor } from './logging/redaction.js';
import { authPlugin } from './api/plugins/auth.js';
import { authRoutes } from './api/routes/auth.js';
import { healthRoutes } from './api/routes/health.js';
import { setupRoutes } from './api/routes/setup.js';
import { statusRoutes } from './api/routes/status.js';
import { destinationRoutes } from './api/routes/destinations.js';
import { postRoutes } from './api/routes/posts.js';
import { deliveryRoutes } from './api/routes/deliveries.js';
import { demoRoutes } from './api/routes/demo.js';
import type { RuntimeServices } from './services/runtime.js';

export type AppDependencies = {
  config: AppConfig;
  database: TiboPingDatabase;
  services?: RuntimeServices;
  now?: () => number;
};

export const buildApp = async (
  dependencies: AppDependencies,
): Promise<FastifyInstance> => {
  const { config, database } = dependencies;
  const redact = createRedactor(
    [config.adminPassword, config.xBearerToken].filter(
      (value): value is string => typeof value === 'string',
    ),
  );
  const { sessionKey } = deriveKeys(config.appSecret);
  const sessions = createSessionManager({
    key: sessionKey,
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  const app = Fastify({
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers.set-cookie',
              ],
              censor: '[REDACTED]',
            },
          },
  });

  app.setErrorHandler(async (error, _request, reply) => {
    if (
      error instanceof ZodError ||
      (error instanceof Error && error.name === 'ZodError')
    ) {
      return reply.code(400).send({
        error: {
          code: 'invalid-request',
          message: 'The request body is invalid',
        },
      });
    }

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;

    if (statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: 'rate-limit-exceeded',
          message: 'Too many login attempts; try again later',
        },
      });
    }

    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: { code: 'invalid-request', message: 'The request could not be accepted' },
      });
    }

    const safeError =
      error instanceof Error
        ? redact({ name: error.name, message: error.message, stack: error.stack })
        : redact(error);
    app.log.error({ err: safeError }, 'Unhandled request error');
    return reply.code(500).send({
      error: { code: 'internal-error', message: 'An unexpected error occurred' },
    });
  });

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: {
        code: 'rate-limit-exceeded',
        message: 'Too many login attempts; try again later',
      },
    }),
  });
  await app.register(authPlugin, { sessions, publicUrl: config.publicUrl });
  await app.register(healthRoutes, { database });
  await app.register(authRoutes, {
    sessions,
    sessionKey,
    adminPassword: config.adminPassword,
    secureCookie: new URL(config.publicUrl).protocol === 'https:',
  });
  if (dependencies.services) {
    const routeOptions = { services: dependencies.services };
    await app.register(setupRoutes, routeOptions);
    await app.register(statusRoutes, routeOptions);
    await app.register(destinationRoutes, routeOptions);
    await app.register(postRoutes, routeOptions);
    await app.register(deliveryRoutes, routeOptions);
    await app.register(demoRoutes, routeOptions);
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'API route not found' },
      });
    }
    return reply.code(404).type('text/plain').send('Not found');
  });

  await app.ready();
  return app;
};
