import type { FastifyPluginAsync } from 'fastify';

import type { RuntimeServices } from '../../services/runtime.js';
import { pageQuerySchema, postResponseSchema } from '../schemas.js';

export const postRoutes: FastifyPluginAsync<{ services: RuntimeServices }> = async (
  app,
  { services },
) => {
  app.get('/api/posts', async (request) => {
    const query = pageQuerySchema.parse(request.query);
    const page = services.posts.listRecent({
      limit: query.limit,
      ...(query.before ? { beforeId: query.before } : {}),
    });
    return {
      items: page.items.map((post) => postResponseSchema.parse(post)),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  });
};
