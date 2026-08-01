import { z } from 'zod';

import { categoriesSchema } from './category.js';
import { postKindSchema } from './post.js';

export const genericWebhookEnvelopeSchema = z.object({
  schema_version: z.literal('1'),
  event_id: z.string().regex(/^x:\d+$/),
  event_type: z.literal('tibo.post'),
  post: z.object({
    id: z.string().regex(/^\d+$/),
    author_name: z.literal('Tibo'),
    author_username: z.literal('thsottiaux'),
    text: z.string().min(1),
    url: z.url(),
    created_at: z.iso.datetime(),
    kind: postKindSchema,
  }),
  categories: categoriesSchema,
  observed_at: z.iso.datetime(),
});

export type GenericWebhookEnvelope = z.infer<typeof genericWebhookEnvelopeSchema>;
