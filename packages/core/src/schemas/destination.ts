import { z } from 'zod';

import { categoriesSchema } from './category.js';

export const destinationTypeSchema = z.enum(['slack', 'discord', 'generic']);

export const routingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('everything') }),
  z.object({
    mode: z.literal('categories'),
    categories: categoriesSchema.min(1, 'Choose at least one category'),
  }),
]);

export type DestinationType = z.infer<typeof destinationTypeSchema>;
export type Routing = z.infer<typeof routingSchema>;
