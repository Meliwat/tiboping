import {
  categoriesSchema,
  destinationTypeSchema,
  normalizedPostSchema,
  routingSchema,
} from '@tiboping/core';
import { z } from 'zod';

export const idParamsSchema = z.object({ id: z.string().min(1) });

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  before: z.string().min(1).optional(),
});

export const destinationResponseSchema = z.object({
  id: z.string().min(1),
  type: destinationTypeSchema,
  name: z.string().min(1),
  routing: routingSchema,
  state: z.enum(['active', 'paused']),
  pauseReason: z.string().optional(),
  hasConfiguration: z.literal(true),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const destinationCreateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('slack'),
    name: z.string().trim().min(1).max(100),
    webhookUrl: z.url(),
    routing: routingSchema,
  }),
  z.object({
    type: z.literal('discord'),
    name: z.string().trim().min(1).max(100),
    webhookUrl: z.url(),
    routing: routingSchema,
  }),
  z.object({
    type: z.literal('generic'),
    name: z.string().trim().min(1).max(100),
    url: z.url(),
    routing: routingSchema,
  }),
]);

export const destinationUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    routing: routingSchema.optional(),
    webhookUrl: z.url().optional(),
    url: z.url().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one destination field is required',
  });

export const postResponseSchema = normalizedPostSchema.and(
  z.object({
    classifierVersion: z.number().int().positive(),
    categories: categoriesSchema,
    matchedRuleIds: z.array(z.string().min(1)),
    ingestedAt: z.iso.datetime(),
  }),
);

export const deliveryStateSchema = z.enum([
  'pending',
  'sending',
  'delivered',
  'failed',
  'cancelled',
]);

export const deliveryResponseSchema = z.object({
  id: z.string().min(1),
  postId: z.string().regex(/^\d+$/u),
  destinationId: z.string().min(1),
  state: deliveryStateSchema,
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: z.iso.datetime(),
  leaseOwner: z.string().optional(),
  leaseExpiresAt: z.iso.datetime().optional(),
  lastErrorCode: z.string().optional(),
  lastErrorMessage: z.string().optional(),
  deliveredAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const sourceStatusResponseSchema = z.object({
  mode: z.enum(['demo', 'x']),
  state: z.enum([
    'demo',
    'unconfigured',
    'verified',
    'inactive',
    'monitoring',
    'degraded',
  ]),
  configured: z.boolean(),
  active: z.boolean(),
  credentialSource: z.enum(['environment', 'database', 'none']),
  credentialEditable: z.boolean(),
  profile: z
    .object({
      id: z.string(),
      name: z.string(),
      username: z.string(),
      protected: z.boolean(),
    })
    .optional(),
  lastErrorCode: z.string().optional(),
});
