import { normalizedPostSchema, type NormalizedPost } from '@tiboping/core';

import type { XPost } from './types.js';

export const normalizeXPost = (
  post: XPost,
  options: { targetUserId: string; observedAt: string },
): NormalizedPost | undefined => {
  if (post.author_id !== options.targetUserId) return undefined;
  if (post.referenced_tweets?.some(({ type }) => type === 'retweeted')) return undefined;

  const quotedPostId = post.referenced_tweets?.find(({ type }) => type === 'quoted')?.id;
  const inReplyToPostId = post.referenced_tweets?.find(
    ({ type }) => type === 'replied_to',
  )?.id;
  const kind = quotedPostId ? 'quote' : inReplyToPostId ? 'reply' : 'post';

  return normalizedPostSchema.parse({
    id: post.id,
    authorId: post.author_id,
    authorName: 'Tibo',
    authorUsername: 'thsottiaux',
    text: post.note_tweet?.text ?? post.text,
    url: `https://x.com/thsottiaux/status/${post.id}`,
    createdAt: post.created_at,
    observedAt: options.observedAt,
    kind,
    ...(inReplyToPostId ? { inReplyToPostId } : {}),
    ...(quotedPostId ? { quotedPostId } : {}),
  });
};
