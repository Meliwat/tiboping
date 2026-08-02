import { classifyPost } from '@tiboping/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { RuntimeServices } from '../../services/runtime.js';
import { demoFixtureNames, getDemoFixture } from '../../source/demo-source.js';

const emitSchema = z.object({ fixture: z.enum(demoFixtureNames) });

export const demoRoutes: FastifyPluginAsync<{ services: RuntimeServices }> = async (
  app,
  { services },
) => {
  app.get('/api/demo/fixtures', async (_request, reply) => {
    if (!services.demoSource) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'API route not found' },
      });
    }
    return {
      items: demoFixtureNames.map((name) => {
        const post = getDemoFixture(name);
        return { name, text: post.text, categories: classifyPost(post.text).categories };
      }),
    };
  });

  app.post('/api/demo/emit', async (request, reply) => {
    if (!services.demoSource) {
      return reply.code(404).send({
        error: { code: 'not-found', message: 'API route not found' },
      });
    }
    const { fixture } = emitSchema.parse(request.body);
    const post = services.demoSource.emit(fixture);
    return reply.code(202).send({ accepted: true, postId: post.id });
  });
};
