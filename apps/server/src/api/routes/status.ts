import type { FastifyPluginAsync } from 'fastify';

import type { RuntimeServices } from '../../services/runtime.js';
import { postResponseSchema, sourceStatusResponseSchema } from '../schemas.js';

export const statusRoutes: FastifyPluginAsync<{ services: RuntimeServices }> = async (
  app,
  { services },
) => {
  app.get('/api/status', async () => {
    const destinations = services.destinations.list();
    const lastPost = services.posts.listRecent({ limit: 1 }).items[0];
    return {
      source: sourceStatusResponseSchema.parse(services.source.status()),
      database: { status: 'ready' },
      queue: services.deliveries.countByState(),
      destinations: {
        active: destinations.filter(({ state }) => state === 'active').length,
        paused: destinations.filter(({ state }) => state === 'paused').length,
      },
      ...(lastPost ? { lastPost: postResponseSchema.parse(lastPost) } : {}),
    };
  });
};
