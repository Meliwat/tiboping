import { Check, Send, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import type { DeliveryOutcome, Destination } from '../../api/client.js';
import { Button } from '../Button.js';
import { StatusPill } from '../StatusPill.js';

export const TestStep = ({
  destination,
  onTest,
  onContinue,
  onBack,
}: {
  destination: Destination;
  onTest: () => Promise<DeliveryOutcome>;
  onContinue: () => void;
  onBack: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DeliveryOutcome>();
  const [error, setError] = useState('');

  const test = async () => {
    setBusy(true);
    setError('');
    try {
      setOutcome(await onTest());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The test could not be sent');
    } finally {
      setBusy(false);
    }
  };

  const succeeded = outcome?.kind === 'success';
  return (
    <section className="setup-step" aria-labelledby="setup-test-title">
      <div className="setup-step__icon" aria-hidden="true">
        <Send />
      </div>
      <p className="eyebrow eyebrow--dark">Step 4 / Test transmission</p>
      <h1 id="setup-test-title" data-setup-heading tabIndex={-1}>
        Send one unmistakable ping.
      </h1>
      <p className="setup-step__lede">
        TiboPing will send a clearly labeled test to <strong>{destination.name}</strong>{' '}
        using the same adapter as real notifications.
      </p>

      <div className="test-card">
        <div className="test-card__preview">
          <span className="test-card__avatar">TP</span>
          <div>
            <strong>TiboPing test</strong>
            <p>Codex notifications are connected.</p>
            <small>CODEX · TEST TRANSMISSION</small>
          </div>
        </div>
        {succeeded ? (
          <div className="test-card__result test-card__result--success" role="status">
            <Check aria-hidden="true" />
            Destination acknowledged the ping.
          </div>
        ) : outcome ? (
          <div className="test-card__result test-card__result--error" role="alert">
            <TriangleAlert aria-hidden="true" />
            <span>{outcome.message}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="setup-step__actions setup-step__actions--split">
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        {succeeded ? (
          <Button onClick={onContinue}>
            Continue
            <StatusPill tone="live">Passed</StatusPill>
          </Button>
        ) : (
          <Button onClick={() => void test()} loading={busy}>
            Send test notification
          </Button>
        )}
      </div>
    </section>
  );
};
