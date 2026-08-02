import type { FastifyPluginAsync } from 'fastify';

import type { TiboPingDatabase } from '../../db/client.js';

export const healthRoutes: FastifyPluginAsync<{ database: TiboPingDatabase }> = async (
  app,
  options,
) => {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    try {
      const migration = options.database
        .prepare('SELECT id FROM migrations ORDER BY id DESC LIMIT 1')
        .get() as { id: string } | undefined;
      if (!migration) throw new Error('Database migrations have not completed');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not-ready' });
    }
  });
};
