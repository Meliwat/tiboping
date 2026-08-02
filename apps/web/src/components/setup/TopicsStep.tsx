import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import type { Destination, Routing } from '../../api/client.js';
import { Button } from '../Button.js';
import { TopicSelector } from '../TopicSelector.js';

export const TopicsStep = ({
  destination,
  onSave,
  onBack,
}: {
  destination: Destination;
  onSave: (routing: Routing) => Promise<void>;
  onBack: () => void;
}) => {
  const [routing, setRouting] = useState<Routing>(destination.routing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave(routing);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Topics could not be saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="setup-step" aria-labelledby="setup-topics-title">
      <div className="setup-step__icon" aria-hidden="true">
        <SlidersHorizontal />
      </div>
      <p className="eyebrow eyebrow--dark">Step 3 / Tune the feed</p>
      <h1 id="setup-topics-title" data-setup-heading tabIndex={-1}>
        What counts as signal?
      </h1>
      <p className="setup-step__lede">
        Choose Everything or any combination of the three categories for{' '}
        <strong>{destination.name}</strong>.
      </p>
      <TopicSelector value={routing} onChange={setRouting} />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="setup-step__actions setup-step__actions--split">
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => void save()} loading={busy}>
          Save topics
        </Button>
      </div>
    </section>
  );
};
