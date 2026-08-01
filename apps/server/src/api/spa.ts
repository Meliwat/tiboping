import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const immutableAssetPattern = /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/u;

export const defaultWebRoot = fileURLToPath(
  new URL('../../../web/dist/', import.meta.url),
);

const pathnameFor = (request: FastifyRequest): string => request.url.split('?')[0] ?? '/';

const isFileRequest = (pathname: string): boolean =>
  pathname.startsWith('/assets/') || path.posix.basename(pathname).includes('.');

export const registerSpaAssets = async (
  app: FastifyInstance,
  root: string,
): Promise<void> => {
  await app.register(fastifyStatic, {
    root,
    wildcard: true,
    cacheControl: false,
    setHeaders: (reply, servedPath) => {
      if (immutableAssetPattern.test(path.basename(servedPath))) {
        reply.header('cache-control', 'public, max-age=31536000, immutable');
        return;
      }
      reply.header('cache-control', 'no-cache');
    },
  });
};

export const sendSpaNotFound = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> => {
  const pathname = pathnameFor(request);
  if (pathname.startsWith('/api/')) {
    return reply.code(404).send({
      error: { code: 'not-found', message: 'API route not found' },
    });
  }
  if (isFileRequest(pathname)) {
    return reply.code(404).type('text/plain').send('Not found');
  }
  return reply.header('cache-control', 'no-cache').sendFile('index.html');
};
