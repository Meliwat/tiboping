import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { verifyAdminPassword } from '../../auth/password.js';
import type { SessionManager } from '../../auth/session.js';
import { sessionCookieName } from '../plugins/auth.js';

const loginSchema = z.object({ password: z.string().min(1) });

const sessionBody = (session: { csrfToken: string; expiresAt: number }) => ({
  authenticated: true,
  csrfToken: session.csrfToken,
  expiresAt: new Date(session.expiresAt).toISOString(),
});

export const authRoutes: FastifyPluginAsync<{
  sessions: SessionManager;
  sessionKey: Uint8Array;
  adminPassword: string;
  secureCookie: boolean;
}> = async (app, options) => {
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      if (
        !verifyAdminPassword(body.password, options.adminPassword, options.sessionKey)
      ) {
        return reply.code(401).send({
          error: { code: 'invalid-credentials', message: 'The password is incorrect' },
        });
      }

      const { token, session } = options.sessions.create();
      reply.setCookie(sessionCookieName, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: options.secureCookie,
        expires: new Date(session.expiresAt),
      });
      return sessionBody(session);
    },
  );

  app.get('/api/auth/session', async (request) => sessionBody(request.adminSession!));

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(sessionCookieName, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: options.secureCookie,
    });
    return reply.code(204).send();
  });
};
