import { randomBytes } from 'node:crypto';

import { notificationSchema, type DestinationType } from '@tiboping/core';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';

import type { RuntimeServices } from '../../services/runtime.js';
import {
  destinationCreateSchema,
  destinationResponseSchema,
  destinationUpdateSchema,
  idParamsSchema,
} from '../schemas.js';

const destinationNotFound = (reply: FastifyReply) =>
  reply.code(404).send({
    error: { code: 'destination-not-found', message: 'Destination not found' },
  });

const invalidConfiguration = (reply: FastifyReply) =>
  reply.code(422).send({
    error: {
      code: 'invalid-destination-configuration',
      message: 'The destination configuration could not be validated',
    },
  });

const testNotification = () =>
  notificationSchema.parse({
    eventId: 'x:1990999999999999999',
    post: {
      id: '1990999999999999999',
      authorName: 'Tibo',
      authorUsername: 'thsottiaux',
      text: 'TiboPing test: Codex notifications are connected.',
      url: 'https://x.com/thsottiaux/status/1990999999999999999',
      createdAt: new Date().toISOString(),
      kind: 'post',
    },
    categories: ['codex'],
    observedAt: new Date().toISOString(),
  });

const configForCreate = (
  body: ReturnType<typeof destinationCreateSchema.parse>,
): { config: unknown; signingSecret?: string } => {
  if (body.type === 'generic') {
    const signingSecret = randomBytes(32).toString('base64');
    return { config: { url: body.url, signingSecret }, signingSecret };
  }
  return { config: { webhookUrl: body.webhookUrl } };
};

const configForUpdate = (
  type: DestinationType,
  existing: unknown,
  body: ReturnType<typeof destinationUpdateSchema.parse>,
): unknown => {
  if (type === 'generic') {
    const config = existing as { url: string; signingSecret: string };
    if (body.webhookUrl) throw new Error('Generic destinations use url');
    return { ...config, ...(body.url ? { url: body.url } : {}) };
  }
  if (body.url) throw new Error('Provider destinations use webhookUrl');
  const config = existing as { webhookUrl: string };
  return { ...config, ...(body.webhookUrl ? { webhookUrl: body.webhookUrl } : {}) };
};

export const destinationRoutes: FastifyPluginAsync<{
  services: RuntimeServices;
}> = async (app, { services }) => {
  app.get('/api/destinations', async () => ({
    items: services.destinations
      .list()
      .map((item) => destinationResponseSchema.parse(item)),
  }));

  app.post('/api/destinations', async (request, reply) => {
    const body = destinationCreateSchema.parse(request.body);
    const { config, signingSecret } = configForCreate(body);
    try {
      await services.registry.get(body.type).validateConfig(config);
    } catch {
      return invalidConfiguration(reply);
    }
    const destination = services.destinations.create({
      type: body.type,
      name: body.name,
      routing: body.routing,
      config,
    });
    return reply.code(201).send({
      destination: destinationResponseSchema.parse(destination),
      ...(signingSecret ? { signingSecret } : {}),
    });
  });

  app.patch('/api/destinations/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = destinationUpdateSchema.parse(request.body);
    const existing = services.destinations.get(id);
    if (!existing) return destinationNotFound(reply);
    const existingConfig = services.destinations.getConfig(id);
    const configurationChanged = body.webhookUrl !== undefined || body.url !== undefined;
    let config = existingConfig;
    if (configurationChanged) {
      try {
        config = configForUpdate(existing.type, existingConfig, body);
        await services.registry.get(existing.type).validateConfig(config);
      } catch {
        return invalidConfiguration(reply);
      }
    }
    const updated = services.destinations.update(id, {
      ...(body.name ? { name: body.name } : {}),
      ...(body.routing ? { routing: body.routing } : {}),
      config,
    });
    if (configurationChanged) {
      services.settings.set(`destination.tested:${id}`, 'false');
    }
    return { destination: destinationResponseSchema.parse(updated) };
  });

  app.post('/api/destinations/:id/test', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const destination = services.destinations.get(id);
    if (!destination) return destinationNotFound(reply);
    const config = services.destinations.getConfig(id);
    const outcome = await services.deliveryService.testDestination(
      destination.type,
      config,
      testNotification(),
    );
    if (outcome.kind === 'success') {
      services.settings.set(`destination.tested:${id}`, 'true');
    }
    return { outcome };
  });

  app.post('/api/destinations/:id/pause', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const destination = services.destinations.pause(id, 'paused-by-operator');
    return destination
      ? { destination: destinationResponseSchema.parse(destination) }
      : destinationNotFound(reply);
  });

  app.post('/api/destinations/:id/resume', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const destination = services.destinations.resume(id);
    return destination
      ? { destination: destinationResponseSchema.parse(destination) }
      : destinationNotFound(reply);
  });

  app.post('/api/destinations/:id/rotate-secret', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const destination = services.destinations.get(id);
    if (!destination) return destinationNotFound(reply);
    if (destination.type !== 'generic') {
      return reply.code(409).send({
        error: {
          code: 'secret-rotation-unsupported',
          message: 'Only generic webhooks have a TiboPing signing secret',
        },
      });
    }
    const existing = services.destinations.getConfig(id) as { url: string };
    const signingSecret = randomBytes(32).toString('base64');
    const updated = services.destinations.update(id, {
      config: { ...existing, signingSecret },
    });
    services.settings.set(`destination.tested:${id}`, 'false');
    return {
      destination: destinationResponseSchema.parse(updated),
      signingSecret,
    };
  });

  app.delete('/api/destinations/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    return services.destinations.softDelete(id)
      ? reply.code(204).send()
      : destinationNotFound(reply);
  });
};
