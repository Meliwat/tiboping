import { CircleAlert, RadioTower, Unplug } from 'lucide-react';

import type { SourceStatus } from '../api/client.js';
import { StatusPill } from './StatusPill.js';

const presentation = (source: SourceStatus) => {
  if (source.mode === 'demo') {
    return {
      tone: 'live' as const,
      label: 'Demo online',
      headline: 'Fixture transmitter standing by',
      detail: 'Offline events use the production classifier, queue, and adapters.',
      Icon: RadioTower,
    };
  }
  if (source.state === 'monitoring') {
    return {
      tone: 'live' as const,
      label: 'Monitoring',
      headline: 'Listening to @thsottiaux',
      detail: 'The filtered stream and durable catch-up cursor are active.',
      Icon: RadioTower,
    };
  }
  if (source.state === 'degraded') {
    return {
      tone: 'warning' as const,
      label: 'Degraded',
      headline: 'The X signal needs attention',
      detail: 'TiboPing will keep reconnecting and catch up from its durable cursor.',
      Icon: CircleAlert,
    };
  }
  return {
    tone: 'waiting' as const,
    label: source.state === 'unconfigured' ? 'Offline' : 'Connecting',
    headline:
      source.state === 'unconfigured' ? 'X is not configured' : 'Warming up the stream',
    detail:
      source.state === 'unconfigured'
        ? 'Verify an official X API bearer token to begin monitoring.'
        : 'TiboPing is preparing the stream and timeline checkpoint.',
    Icon: Unplug,
  };
};

export const SourceHealth = ({ source }: { source: SourceStatus }) => {
  const view = presentation(source);
  return (
    <section className={`source-health source-health--${view.tone}`}>
      <div className="source-health__icon" aria-hidden="true">
        <view.Icon />
      </div>
      <div>
        <StatusPill tone={view.tone}>{view.label}</StatusPill>
        <h2>{view.headline}</h2>
        <p>{view.detail}</p>
      </div>
      <dl>
        <div>
          <dt>Mode</dt>
          <dd>{source.mode === 'demo' ? 'Offline demo' : 'Official X API'}</dd>
        </div>
        <div>
          <dt>Credential</dt>
          <dd>
            {source.credentialSource === 'none'
              ? 'Not required'
              : source.credentialSource}
          </dd>
        </div>
      </dl>
    </section>
  );
};
