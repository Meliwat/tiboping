import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { postsApi, type Category } from '../api/client.js';
import { Button } from '../components/Button.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorNotice } from '../components/ErrorNotice.js';
import { PostCard } from '../components/PostCard.js';

const filters: Array<{ value: 'all' | 'unmatched' | Category; label: string }> = [
  { value: 'all', label: 'All posts' },
  { value: 'codex', label: 'Codex' },
  { value: 'outages', label: 'Outages' },
  { value: 'usage-limits', label: 'Usage limits' },
  { value: 'unmatched', label: 'Unmatched' },
];

export const PostsPage = () => {
  const [cursor, setCursor] = useState<string>();
  const [filter, setFilter] = useState<(typeof filters)[number]['value']>('all');
  const posts = useQuery({
    queryKey: ['posts', 'page', cursor ?? 'first'],
    queryFn: () => postsApi.list({ limit: 12, ...(cursor ? { before: cursor } : {}) }),
  });

  const visible =
    posts.data?.items.filter((post) =>
      filter === 'all'
        ? true
        : filter === 'unmatched'
          ? post.categories.length === 0
          : post.categories.includes(filter),
    ) ?? [];

  return (
    <div className="ledger-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow eyebrow--dark">Classifier ledger</p>
          <h1>Every observed post.</h1>
          <p>Stored with classifier version and the exact rules that matched.</p>
        </div>
      </header>
      <div className="filter-rail" aria-label="Filter posts">
        {filters.map((item) => (
          <button
            type="button"
            className={filter === item.value ? 'filter-rail__active' : ''}
            onClick={() => setFilter(item.value)}
            key={item.value}
          >
            {item.label}
          </button>
        ))}
      </div>
      {posts.isPending ? (
        <div className="dashboard-loading">Loading post ledger…</div>
      ) : null}
      {posts.isError ? (
        <ErrorNotice
          message="The post ledger could not be loaded."
          onRetry={() => void posts.refetch()}
        />
      ) : null}
      {posts.isSuccess && visible.length === 0 ? (
        <EmptyState title="No posts in this view">
          Try another category or wait for a new signal.
        </EmptyState>
      ) : null}
      {visible.length > 0 ? (
        <div className="post-ledger">
          {visible.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : null}
      {posts.data?.nextCursor ? (
        <div className="pagination-actions">
          <Button variant="quiet" onClick={() => setCursor(undefined)} disabled={!cursor}>
            Newest
          </Button>
          <Button onClick={() => setCursor(posts.data.nextCursor)}>Older posts</Button>
        </div>
      ) : cursor ? (
        <div className="pagination-actions">
          <Button variant="quiet" onClick={() => setCursor(undefined)}>
            Back to newest
          </Button>
        </div>
      ) : null}
    </div>
  );
};
