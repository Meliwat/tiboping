import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { RuntimeServices } from '../../services/runtime.js';
import {
  deliveryResponseSchema,
  deliveryStateSchema,
  idParamsSchema,
  pageQuerySchema,
} from '../schemas.js';

const deliveryQuerySchema = pageQuerySchema.extend({
  destinationId: z.string().min(1).optional(),
  state: deliveryStateSchema.optional(),
});

export const deliveryRoutes: FastifyPluginAsync<{
  services: RuntimeServices;
}> = async (app, { services }) => {
  app.get('/api/deliveries', async (request) => {
    const query = deliveryQuerySchema.parse(request.query);
    const page = services.deliveries.listRecent({
      limit: query.limit,
      ...(query.before ? { beforeId: query.before } : {}),
      ...(query.destinationId ? { destinationId: query.destinationId } : {}),
      ...(query.state ? { state: query.state } : {}),
    });
    return {
      items: page.items.map((delivery) => deliveryResponseSchema.parse(delivery)),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  });

  app.post('/api/deliveries/:id/retry', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const existing = services.deliveries.get(id);
    if (!existing) {
      return reply.code(404).send({
        error: { code: 'delivery-not-found', message: 'Delivery not found' },
      });
    }
    if (existing.state !== 'failed') {
      return reply.code(409).send({
        error: {
          code: 'delivery-not-retryable',
          message: 'Only failed deliveries can be retried manually',
        },
      });
    }
    const retried = services.deliveryService.retryFailedDelivery(id);
    return { delivery: deliveryResponseSchema.parse(retried) };
  });
};
