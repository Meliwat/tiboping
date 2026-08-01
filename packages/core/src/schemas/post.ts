import { z } from 'zod';

const xPostIdSchema = z.string().regex(/^\d+$/, 'Expected a numeric X post ID');

export const postKindSchema = z.enum(['post', 'reply', 'quote']);

export const normalizedPostSchema = z
  .object({
    id: xPostIdSchema,
    authorId: z.string().regex(/^\d+$/, 'Expected a numeric X user ID'),
    authorName: z.string().min(1),
    authorUsername: z.literal('thsottiaux'),
    text: z.string().min(1),
    url: z.url(),
    createdAt: z.iso.datetime(),
    observedAt: z.iso.datetime(),
    kind: postKindSchema,
    inReplyToPostId: xPostIdSchema.optional(),
    quotedPostId: xPostIdSchema.optional(),
  })
  .superRefine((post, context) => {
    const canonicalUrl = new URL(post.url);
    const validHost =
      canonicalUrl.hostname === 'x.com' || canonicalUrl.hostname === 'www.x.com';
    const expectedPath = `/thsottiaux/status/${post.id}`;

    if (!validHost || canonicalUrl.pathname !== expectedPath) {
      context.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'URL must be the canonical @thsottiaux X post URL',
      });
    }
  });

export type NormalizedPost = z.infer<typeof normalizedPostSchema>;
export type PostKind = z.infer<typeof postKindSchema>;
