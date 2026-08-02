import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowRight, Check, Copy, Plus, RadioTower, Send } from 'lucide-react';

import {
  demoApi,
  destinationApi,
  postsApi,
  statusApi,
  type DestinationDraft,
  type Routing,
} from '../api/client.js';
import { Button } from '../components/Button.js';
import { DestinationCard } from '../components/DestinationCard.js';
import { DestinationForm } from '../components/DestinationForm.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorNotice } from '../components/ErrorNotice.js';
import { PostCard } from '../components/PostCard.js';
import { SourceHealth } from '../components/SourceHealth.js';
import { StatusPill } from '../components/StatusPill.js';

const statusKey = ['status'] as const;
const destinationsKey = ['destinations'] as const;
const recentPostsKey = ['posts', 'recent'] as const;

export const DashboardPage = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: statusKey,
    queryFn: statusApi.get,
    refetchInterval: 2_000,
  });
  const destinations = useQuery({
    queryKey: destinationsKey,
    queryFn: destinationApi.list,
    refetchInterval: 2_000,
  });
  const recentPosts = useQuery({
    queryKey: recentPostsKey,
    queryFn: () => postsApi.list({ limit: 3 }),
  });
  const demoFixtures = useQuery({
    queryKey: ['demo', 'fixtures'],
    queryFn: demoApi.fixtures,
    enabled: status.data?.source.mode === 'demo',
  });
  const [adding, setAdding] = useState(false);
  const [signingSecret, setSigningSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const [demoMessage, setDemoMessage] = useState('');

  const refreshOperations = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: statusKey }),
      queryClient.invalidateQueries({ queryKey: destinationsKey }),
      queryClient.invalidateQueries({ queryKey: recentPostsKey }),
      queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
    ]);
  };

  const createDestination = async (draft: DestinationDraft) => {
    const created = await destinationApi.create(draft);
    if (created.signingSecret) setSigningSecret(created.signingSecret);
    setAdding(false);
    await refreshOperations();
  };

  const emitDemo = useMutation({
    mutationFn: demoApi.emit,
    onSuccess: async ({ postId }) => {
      setDemoMessage(`Fixture ${postId} entered the delivery pipeline.`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      await refreshOperations();
    },
  });

  if (status.isPending || destinations.isPending || recentPosts.isPending) {
    return <div className="dashboard-loading">Reading the signal desk…</div>;
  }

  if (status.isError || destinations.isError || recentPosts.isError) {
    return (
      <ErrorNotice
        message="The dashboard could not load its operational snapshot."
        onRetry={() => void refreshOperations()}
      />
    );
  }

  const statusData = status.data;
  const destinationItems = destinations.data.items;
  const postItems = recentPosts.data.items;
  const deliveryAttention = statusData.queue.failed + statusData.queue.pending;

  return (
    <div className="dashboard-page">
      <header className="page-heading page-heading--dashboard">
        <div>
          <p className="eyebrow eyebrow--dark">Operations / Now</p>
          <h1>Signal report.</h1>
        </div>
        <div className="page-heading__timestamp">
          <StatusPill tone={statusData.source.state === 'degraded' ? 'warning' : 'live'}>
            {statusData.source.state}
          </StatusPill>
          <span>
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date())}
          </span>
        </div>
      </header>

      {signingSecret ? (
        <aside className="dashboard-secret" aria-label="New signing secret">
          <div>
            <StatusPill tone="warning">Copy once</StatusPill>
            <strong>New generic signing secret</strong>
            <code>{signingSecret}</code>
          </div>
          <Button
            variant="quiet"
            onClick={() =>
              void navigator.clipboard
                .writeText(signingSecret)
                .then(() => setCopied(true))
            }
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </aside>
      ) : null}

      <div className="dashboard-grid">
        <SourceHealth source={statusData.source} />
        <section className="queue-board" aria-labelledby="queue-title">
          <div className="queue-board__heading">
            <div className="queue-board__icon" aria-hidden="true">
              <Activity />
            </div>
            <div>
              <p className="eyebrow eyebrow--dark">Delivery queue</p>
              <h2 id="queue-title">
                {deliveryAttention === 0
                  ? 'All clear.'
                  : `${deliveryAttention} need attention.`}
              </h2>
            </div>
          </div>
          <dl>
            {(['pending', 'sending', 'delivered', 'failed'] as const).map((state) => (
              <div key={state}>
                <dt>{state}</dt>
                <dd>{statusData.queue[state]}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={() => onNavigate('/deliveries')}>
            Open delivery log <ArrowRight size={15} aria-hidden="true" />
          </button>
        </section>
      </div>

      {statusData.source.mode === 'demo' ? (
        <section className="demo-console" aria-labelledby="demo-console-title">
          <div className="demo-console__intro">
            <RadioTower aria-hidden="true" />
            <div>
              <p className="eyebrow">Offline demo controls</p>
              <h2 id="demo-console-title">Transmit a synthetic Tibo post.</h2>
              <p>
                Every button enters the real classifier, database, queue, and adapter
                path.
              </p>
            </div>
          </div>
          <div className="demo-console__buttons">
            {demoFixtures.data?.items.map((fixture) => (
              <Button
                key={fixture.name}
                variant="quiet"
                loading={emitDemo.isPending && emitDemo.variables === fixture.name}
                onClick={() => emitDemo.mutate(fixture.name)}
              >
                <Send size={14} aria-hidden="true" />
                {fixture.name.replace('-', ' ')}
              </Button>
            ))}
          </div>
          {demoMessage ? (
            <p className="demo-console__message" role="status">
              {demoMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="dashboard-section" aria-labelledby="destinations-title">
        <div className="dashboard-section__heading">
          <div>
            <p className="eyebrow eyebrow--dark">
              Destinations / {destinationItems.length}
            </p>
            <h2 id="destinations-title">Where the signal lands.</h2>
          </div>
          <Button onClick={() => setAdding((value) => !value)}>
            <Plus size={17} aria-hidden="true" /> Add destination
          </Button>
        </div>

        {adding ? (
          <div className="dashboard-add-destination">
            <div>
              <p className="eyebrow eyebrow--dark">New receiver</p>
              <h3>Add another channel.</h3>
              <p>
                It starts on Everything. Tune its topic routing immediately after
                creation.
              </p>
            </div>
            <DestinationForm onSubmit={createDestination} />
          </div>
        ) : null}

        {destinationItems.length === 0 ? (
          <EmptyState title="No destinations connected">
            Add Slack, Discord, or a signed generic webhook to receive notifications.
          </EmptyState>
        ) : (
          <div className="destination-list">
            {destinationItems.map((destination) => {
              const updateDestination = async (operation: () => Promise<unknown>) => {
                await operation();
                await refreshOperations();
              };
              return (
                <DestinationCard
                  key={destination.id}
                  destination={destination}
                  onTest={async () => (await destinationApi.test(destination.id)).outcome}
                  onPause={async () =>
                    updateDestination(() => destinationApi.pause(destination.id))
                  }
                  onResume={async () =>
                    updateDestination(() => destinationApi.resume(destination.id))
                  }
                  onDelete={async () =>
                    updateDestination(() => destinationApi.remove(destination.id))
                  }
                  onRotate={async () => {
                    const rotated = await destinationApi.rotateSecret(destination.id);
                    setSigningSecret(rotated.signingSecret);
                    await refreshOperations();
                  }}
                  onUpdateRouting={async (routing: Routing) =>
                    updateDestination(() =>
                      destinationApi.updateRouting(destination.id, routing),
                    )
                  }
                  onUpdateConfiguration={async (draft) =>
                    updateDestination(() =>
                      destinationApi.updateConfiguration(destination.id, draft),
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section" aria-labelledby="recent-posts-title">
        <div className="dashboard-section__heading">
          <div>
            <p className="eyebrow eyebrow--dark">Classifier ledger</p>
            <h2 id="recent-posts-title">Recent posts.</h2>
          </div>
          <Button variant="quiet" onClick={() => onNavigate('/posts')}>
            View all <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </div>
        {postItems.length === 0 ? (
          <EmptyState title="No posts observed yet">
            {statusData.source.mode === 'demo'
              ? 'Use the demo transmitter above to put the classifier on the board.'
              : 'The first new authored post will appear here after monitoring begins.'}
          </EmptyState>
        ) : (
          <div className="recent-post-grid">
            {postItems.map((post) => (
              <PostCard key={post.id} post={post} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
