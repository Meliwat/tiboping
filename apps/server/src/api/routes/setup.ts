import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { RuntimeServices } from '../../services/runtime.js';
import { SourceSetupError } from '../../services/source-service.js';
import { sourceStatusResponseSchema } from '../schemas.js';

const verifyBodySchema = z.object({ token: z.string().min(1).optional() });

const sourceError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof SourceSetupError) {
    return reply.code(409).send({
      error: { code: error.code, message: error.message },
    });
  }
  return reply.code(422).send({
    error: {
      code: 'x-verification-failed',
      message: 'The X credential could not be verified for all required capabilities',
    },
  });
};

const setupBody = (services: RuntimeServices) => {
  const destinations = services.destinations.list();
  const testedDestinationIds = destinations
    .filter(
      (destination) =>
        services.settings.get(`destination.tested:${destination.id}`) === 'true',
    )
    .map(({ id }) => id);
  const source = sourceStatusResponseSchema.parse(services.source.status());
  return {
    complete: services.settings.get('setup.complete') === 'true',
    source,
    destinations: {
      count: destinations.length,
      testedCount: testedDestinationIds.length,
    },
    readyToActivate:
      source.configured && destinations.length > 0 && testedDestinationIds.length > 0,
  };
};

export const setupRoutes: FastifyPluginAsync<{ services: RuntimeServices }> = async (
  app,
  { services },
) => {
  app.get('/api/setup', async () => setupBody(services));

  app.post('/api/setup/x/verify', async (request, reply) => {
    const body = verifyBodySchema.parse(request.body ?? {});
    try {
      const profile = await services.source.verify(body.token);
      services.settings.set('setup.complete', 'false');
      return {
        profile,
        source: sourceStatusResponseSchema.parse(services.source.status()),
      };
    } catch (error) {
      return sourceError(reply, error);
    }
  });

  app.post('/api/setup/activate', async (_request, reply) => {
    const status = setupBody(services);
    if (!status.readyToActivate) {
      return reply.code(409).send({
        error: {
          code: 'setup-incomplete',
          message: 'Verify the source and successfully test a destination first',
        },
      });
    }
    try {
      await services.source.activate();
      services.settings.set('setup.complete', 'true');
      return setupBody(services);
    } catch (error) {
      return sourceError(reply, error);
    }
  });
};
