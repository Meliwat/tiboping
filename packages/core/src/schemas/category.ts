import { z } from 'zod';

export const categoryValues = ['codex', 'outages', 'usage-limits'] as const;

export const categorySchema = z.enum(categoryValues);

export const categoriesSchema = z
  .array(categorySchema)
  .superRefine((categories, context) => {
    if (new Set(categories).size !== categories.length) {
      context.addIssue({
        code: 'custom',
        message: 'Categories must not contain duplicates',
      });
    }
  });

export type Category = z.infer<typeof categorySchema>;
