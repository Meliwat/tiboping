import type { FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import { isExpectedOrigin, isValidCsrfToken } from '../../auth/csrf.js';
import type { AdminSession, SessionManager } from '../../auth/session.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminSession?: AdminSession;
  }
}

export const sessionCookieName = 'tp_session';

const publicApiPaths = new Set(['/api/auth/login']);
const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const protectedRoutes: FastifyPluginAsync<{
  sessions: SessionManager;
  publicUrl: string;
}> = async (app, options) => {
  app.addHook('preHandler', async (request, reply) => {
    const pathname = new URL(request.url, options.publicUrl).pathname;
    if (!pathname.startsWith('/api/') || publicApiPaths.has(pathname)) return;

    const token = request.cookies[sessionCookieName];
    const session = token ? options.sessions.verify(token) : undefined;
    if (!session) {
      await reply.code(401).send({
        error: {
          code: 'authentication-required',
          message: 'Sign in to continue',
        },
      });
      return reply;
    }

    request.adminSession = session;

    if (stateChangingMethods.has(request.method)) {
      const origin = request.headers.origin;
      const csrfToken = request.headers['x-csrf-token'];
      if (
        !isExpectedOrigin(origin, options.publicUrl) ||
        !isValidCsrfToken(csrfToken, session.csrfToken)
      ) {
        await reply.code(403).send({
          error: {
            code: 'csrf-rejected',
            message: 'The request origin or CSRF token is invalid',
          },
        });
        return reply;
      }
    }
  });
};

export const authPlugin = fastifyPlugin(protectedRoutes, {
  name: 'tiboping-authentication',
  dependencies: ['@fastify/cookie'],
});
