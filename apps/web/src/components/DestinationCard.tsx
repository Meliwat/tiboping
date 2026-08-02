import {
  Braces,
  Hash,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import type {
  DeliveryOutcome,
  Destination,
  DestinationDraft,
  Routing,
} from '../api/client.js';
import { Button } from './Button.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { DestinationForm } from './DestinationForm.js';
import { StatusPill } from './StatusPill.js';
import { TopicSelector } from './TopicSelector.js';

const iconForType = {
  slack: Hash,
  discord: MessageCircle,
  generic: Braces,
};

const routingLabel = (routing: Routing): string =>
  routing.mode === 'everything'
    ? 'Everything'
    : routing.categories
        .map((category) =>
          category === 'usage-limits'
            ? 'Usage limits'
            : category[0]?.toUpperCase() + category.slice(1),
        )
        .join(' · ');

export const DestinationCard = ({
  destination,
  onTest,
  onPause,
  onResume,
  onDelete,
  onRotate,
  onUpdateRouting,
  onUpdateConfiguration,
}: {
  destination: Destination;
  onTest: () => Promise<DeliveryOutcome>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRotate: () => Promise<void>;
  onUpdateRouting: (routing: Routing) => Promise<void>;
  onUpdateConfiguration: (draft: DestinationDraft) => Promise<void>;
}) => {
  const Icon = iconForType[destination.type];
  const [panel, setPanel] = useState<'topics' | 'endpoint'>();
  const [routing, setRouting] = useState<Routing>(destination.routing);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const action = async (name: string, operation: () => Promise<void>) => {
    setBusy(name);
    setMessage('');
    try {
      await operation();
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : 'The operation could not be completed',
      );
    } finally {
      setBusy('');
    }
  };

  return (
    <article className={`destination-card destination-card--${destination.state}`}>
      <header>
        <div className="destination-card__icon" aria-hidden="true">
          <Icon />
        </div>
        <div>
          <p className="eyebrow eyebrow--dark">{destination.type} destination</p>
          <h3>{destination.name}</h3>
        </div>
        <StatusPill tone={destination.state === 'active' ? 'live' : 'warning'}>
          {destination.state}
        </StatusPill>
      </header>
      <div className="destination-card__route">
        <span>Routing</span>
        <strong>{routingLabel(destination.routing)}</strong>
      </div>
      {destination.pauseReason ? (
        <p className="destination-card__pause">Paused: {destination.pauseReason}</p>
      ) : null}
      {message ? (
        <p className="destination-card__message" role="status">
          {message}
        </p>
      ) : null}
      <div className="destination-card__actions">
        <Button
          variant="quiet"
          loading={busy === 'test'}
          onClick={() =>
            void action('test', async () => {
              const outcome = await onTest();
              setMessage(
                outcome.kind === 'success' ? 'Test acknowledged.' : outcome.message,
              );
            })
          }
        >
          <Send size={14} aria-hidden="true" /> Test
        </Button>
        <Button
          variant="quiet"
          onClick={() => setPanel(panel === 'topics' ? undefined : 'topics')}
        >
          <Settings2 size={14} aria-hidden="true" /> Topics
        </Button>
        <Button
          variant="quiet"
          onClick={() => setPanel(panel === 'endpoint' ? undefined : 'endpoint')}
        >
          <RotateCcw size={14} aria-hidden="true" /> Endpoint
        </Button>
        <Button
          variant="quiet"
          loading={busy === 'state'}
          onClick={() =>
            void action('state', destination.state === 'active' ? onPause : onResume)
          }
        >
          {destination.state === 'active' ? (
            <Pause size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          {destination.state === 'active' ? 'Pause' : 'Resume'}
        </Button>
        {destination.type === 'generic' ? (
          <Button
            variant="quiet"
            loading={busy === 'rotate'}
            onClick={() => void action('rotate', onRotate)}
          >
            <RotateCcw size={14} aria-hidden="true" /> Secret
          </Button>
        ) : null}
        <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} aria-hidden="true" /> Delete
        </Button>
      </div>

      {panel === 'topics' ? (
        <section
          className="destination-card__editor"
          aria-label="Edit destination topics"
        >
          <TopicSelector value={routing} onChange={setRouting} />
          <div>
            <Button variant="quiet" onClick={() => setPanel(undefined)}>
              Cancel
            </Button>
            <Button
              loading={busy === 'topics'}
              onClick={() =>
                void action('topics', async () => {
                  await onUpdateRouting(routing);
                  setPanel(undefined);
                })
              }
            >
              Save routing
            </Button>
          </div>
        </section>
      ) : null}

      {panel === 'endpoint' ? (
        <section
          className="destination-card__editor"
          aria-label="Replace destination endpoint"
        >
          <DestinationForm
            editing
            initialDraft={{
              type: destination.type,
              name: destination.name,
              endpoint: '',
            }}
            onSubmit={async (draft) => {
              await action('endpoint', async () => {
                await onUpdateConfiguration(draft);
                setPanel(undefined);
              });
            }}
          />
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${destination.name}?`}
        message="Pending deliveries will be cancelled. Historical delivery records remain available."
        confirmLabel="Delete destination"
        busy={busy === 'delete'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          void action('delete', async () => {
            await onDelete();
            setConfirmDelete(false);
          })
        }
      />
    </article>
  );
};
