import { z } from 'zod';

const booleanString = (name: string) =>
  z
    .enum(['true', 'false'], { error: `${name} must be "true" or "false"` })
    .transform((value) => value === 'true');

const optionalBooleanString = (name: string, fallback: boolean) =>
  booleanString(name).prefault(String(fallback) as 'true' | 'false');

const optionalPort = z.coerce.number().int().min(1).max(65_535).optional().default(3000);

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .optional()
      .default('development'),
    APP_SECRET: z.string().optional(),
    ADMIN_PASSWORD: z.string().min(12).optional(),
    X_BEARER_TOKEN: z.string().min(1).optional(),
    PUBLIC_URL: z.url().optional().default('http://localhost:3000'),
    PORT: optionalPort,
    DATABASE_PATH: z.string().min(1).optional().default('/data/tiboping.sqlite'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional()
      .default('info'),
    DEMO_MODE: optionalBooleanString('DEMO_MODE', false),
    ALLOW_PRIVATE_WEBHOOKS: optionalBooleanString('ALLOW_PRIVATE_WEBHOOKS', false),
  })
  .superRefine((environment, context) => {
    const requiresConfiguredSecrets =
      environment.NODE_ENV !== 'test' && !environment.DEMO_MODE;

    if (requiresConfiguredSecrets && !environment.APP_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['APP_SECRET'],
        message: 'APP_SECRET is required outside test and demo mode',
      });
    }

    if (requiresConfiguredSecrets && !environment.ADMIN_PASSWORD) {
      context.addIssue({
        code: 'custom',
        path: ['ADMIN_PASSWORD'],
        message: 'ADMIN_PASSWORD is required outside test and demo mode',
      });
    }
  });

export type ParsedEnvironment = z.infer<typeof environmentSchema>;
