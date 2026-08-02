import { z } from 'zod';

import { categoriesSchema } from './schemas/category.js';
import { postKindSchema } from './schemas/post.js';

export const notificationSchema = z.object({
  eventId: z.string().regex(/^x:\d+$/),
  post: z.object({
    id: z.string().regex(/^\d+$/),
    authorName: z.literal('Tibo'),
    authorUsername: z.literal('thsottiaux'),
    text: z.string().min(1),
    url: z.url(),
    createdAt: z.iso.datetime(),
    kind: postKindSchema,
  }),
  categories: categoriesSchema,
  observedAt: z.iso.datetime(),
});

export type Notification = z.infer<typeof notificationSchema>;
