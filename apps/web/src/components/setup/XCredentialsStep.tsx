import { KeyRound, RadioTower } from 'lucide-react';
import { useState } from 'react';

import type { SourceStatus } from '../../api/client.js';
import { Button } from '../Button.js';
import { Field } from '../Field.js';
import { StatusPill } from '../StatusPill.js';

type XCredentialsStepProps = {
  source: SourceStatus;
  onVerify: (token?: string) => Promise<void>;
  onContinue: () => void;
};

export const XCredentialsStep = ({
  source,
  onVerify,
  onContinue,
}: XCredentialsStepProps) => {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verified = source.mode === 'demo' || Boolean(source.profile);

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      await onVerify(source.credentialSource === 'environment' ? undefined : token);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The source could not be verified',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="setup-step" aria-labelledby="setup-source-title">
      <div className="setup-step__icon" aria-hidden="true">
        {source.mode === 'demo' ? <RadioTower /> : <KeyRound />}
      </div>
      <p className="eyebrow eyebrow--dark">Step 1 / Source signal</p>
      <h1 id="setup-source-title" data-setup-heading tabIndex={-1}>
        {source.mode === 'demo'
          ? 'Your demo transmitter is ready.'
          : 'Connect the X signal.'}
      </h1>
      <p className="setup-step__lede">
        {source.mode === 'demo'
          ? 'Demo mode swaps paid X access for five deterministic Tibo fixtures. They still travel through the real classifier and delivery queue.'
          : 'TiboPing uses the official X API to watch @thsottiaux, catch up after restarts, and avoid historical broadcasts on first setup.'}
      </p>

      {source.mode === 'demo' ? (
        <div className="setup-callout setup-callout--signal">
          <StatusPill tone="live">Offline demo</StatusPill>
          <p>
            No X credential is needed. You can switch to production mode when deploying.
          </p>
        </div>
      ) : source.credentialSource === 'environment' ? (
        <div className="setup-callout">
          <StatusPill tone={verified ? 'live' : 'waiting'}>
            {verified ? 'Verified' : 'Environment owned'}
          </StatusPill>
          <p>
            X_BEARER_TOKEN is set in the environment. It can be verified here but never
            viewed or replaced from the dashboard.
          </p>
        </div>
      ) : (
        <Field
          label="X app bearer token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          hint="Stored encrypted in SQLite. The browser will not receive it again."
          {...(error ? { error } : {})}
        />
      )}

      {error && source.credentialSource === 'environment' ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="setup-step__actions">
        {!verified && source.mode === 'x' ? (
          <Button
            onClick={() => void verify()}
            loading={busy}
            disabled={!token && source.credentialEditable}
          >
            Verify required access
          </Button>
        ) : (
          <Button onClick={onContinue}>Continue to destination</Button>
        )}
      </div>
    </section>
  );
};
