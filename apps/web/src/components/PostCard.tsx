import { ArrowUpRight, MessageSquareQuote, Reply } from 'lucide-react';

import type { Post } from '../api/client.js';
import { CategoryBadge } from './CategoryBadge.js';

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export const PostCard = ({
  post,
  compact = false,
}: {
  post: Post;
  compact?: boolean;
}) => (
  <article className={`post-card ${compact ? 'post-card--compact' : ''}`}>
    <div className="post-card__meta">
      <span>@thsottiaux</span>
      <time dateTime={post.createdAt}>{formatTimestamp(post.createdAt)}</time>
      {post.kind === 'reply' ? (
        <span>
          <Reply size={13} aria-hidden="true" /> Reply
        </span>
      ) : post.kind === 'quote' ? (
        <span>
          <MessageSquareQuote size={13} aria-hidden="true" /> Quote
        </span>
      ) : null}
    </div>
    <p>{post.text}</p>
    <div className="post-card__footer">
      <div className="post-card__categories">
        {post.categories.length > 0 ? (
          post.categories.map((category) => (
            <CategoryBadge category={category} key={category} />
          ))
        ) : (
          <span className="category-badge category-badge--unmatched">Unmatched</span>
        )}
      </div>
      <a href={post.url} target="_blank" rel="noreferrer">
        Open on X <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </div>
    {!compact && post.matchedRuleIds.length > 0 ? (
      <details className="post-card__rules">
        <summary>Why it matched</summary>
        <ul>
          {post.matchedRuleIds.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </details>
    ) : null}
  </article>
);
