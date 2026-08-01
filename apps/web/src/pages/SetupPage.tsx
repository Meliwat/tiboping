import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, RadioTower, RotateCcw } from 'lucide-react';

import {
  destinationApi,
  setupApi,
  type Destination,
  type DestinationDraft,
  type Routing,
  type SetupStatus,
} from '../api/client.js';
import { Button } from '../components/Button.js';
import { StatusPill } from '../components/StatusPill.js';
import { StepIndicator } from '../components/setup/StepIndicator.js';
import { XCredentialsStep } from '../components/setup/XCredentialsStep.js';
import { DestinationStep } from '../components/setup/DestinationStep.js';
import { TopicsStep } from '../components/setup/TopicsStep.js';
import { TestStep } from '../components/setup/TestStep.js';

const destinationsKey = ['destinations'] as const;

const startingStep = (setup: SetupStatus, destination?: Destination): number => {
  if (setup.source.mode === 'demo' && !destination) return 0;
  if (setup.source.mode === 'x' && !setup.source.profile) return 0;
  if (!destination) return 1;
  if (setup.destinations.testedCount === 0) return 2;
  return 4;
};

export const SetupPage = ({
  setup,
  onSetupChanged,
}: {
  setup: SetupStatus;
  onSetupChanged: (status: SetupStatus) => void;
}) => {
  const queryClient = useQueryClient();
  const destinations = useQuery({
    queryKey: destinationsKey,
    queryFn: destinationApi.list,
  });
  const destination = destinations.data?.items[0];
  const initialized = useRef(false);
  const [step, setStep] = useState(0);
  const [savedDraft, setSavedDraft] = useState<DestinationDraft>();
  const [signingSecret, setSigningSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (destinations.isSuccess && !initialized.current) {
      initialized.current = true;
      setStep(startingStep(setup, destination));
    }
  }, [destination, destinations.isSuccess, setup]);

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-setup-heading]')?.focus();
  }, [step]);

  const refreshSetup = async () => {
    const status = await setupApi.status();
    onSetupChanged(status);
    return status;
  };

  const createDestination = async (draft: DestinationDraft) => {
    setSavedDraft(draft);
    if (destination) {
      const updated = await destinationApi.updateConfiguration(destination.id, draft);
      queryClient.setQueryData(destinationsKey, { items: [updated.destination] });
    } else {
      const created = await destinationApi.create(draft);
      setSigningSecret(created.signingSecret ?? '');
      queryClient.setQueryData(destinationsKey, { items: [created.destination] });
    }
    setStep(2);
  };

  const saveTopics = async (routing: Routing) => {
    if (!destination) return;
    const updated = await destinationApi.updateRouting(destination.id, routing);
    queryClient.setQueryData(destinationsKey, { items: [updated.destination] });
    setStep(3);
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(signingSecret);
    setCopied(true);
  };

  const activate = async () => {
    setActivating(true);
    setActivationError('');
    try {
      onSetupChanged(await setupApi.activate());
    } catch (caught) {
      setActivationError(
        caught instanceof Error ? caught.message : 'Monitoring could not start',
      );
    } finally {
      setActivating(false);
    }
  };

  if (destinations.isPending) {
    return <div className="setup-loading">Loading setup state…</div>;
  }

  if (destinations.isError) {
    return (
      <div className="setup-loading setup-loading--error" role="alert">
        <p>The destination state could not be loaded.</p>
        <Button onClick={() => void destinations.refetch()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="setup-layout">
      <aside className="setup-sidebar">
        <div>
          <p className="eyebrow">First transmission</p>
          <h2>Five checks, then the desk is yours.</h2>
        </div>
        <StepIndicator current={step} />
        <div className="setup-sidebar__note">
          <RadioTower aria-hidden="true" />
          <p>All secrets are encrypted before storage and masked after creation.</p>
        </div>
      </aside>

      <div className="setup-canvas">
        {signingSecret ? (
          <aside className="secret-reveal" aria-label="One-time signing secret">
            <div>
              <StatusPill tone="warning">Copy once</StatusPill>
              <strong>Generic webhook signing secret</strong>
              <code>{signingSecret}</code>
              <p>This value will disappear when you continue or refresh.</p>
            </div>
            <Button variant="quiet" onClick={() => void copySecret()}>
              {copied ? (
                <Check size={17} aria-hidden="true" />
              ) : (
                <Copy size={17} aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy secret'}
            </Button>
          </aside>
        ) : null}

        {step === 0 ? (
          <XCredentialsStep
            source={setup.source}
            onVerify={async (token) => {
              await setupApi.verifyX(token);
              await refreshSetup();
            }}
            onContinue={() => setStep(destination ? 2 : 1)}
          />
        ) : null}
        {step === 1 ? (
          <DestinationStep
            onCreate={createDestination}
            {...(destination ? { destination } : {})}
            {...(savedDraft ? { draft: savedDraft } : {})}
          />
        ) : null}
        {step === 2 && destination ? (
          <TopicsStep
            destination={destination}
            onSave={saveTopics}
            onBack={() => setStep(1)}
          />
        ) : null}
        {step === 3 && destination ? (
          <TestStep
            destination={destination}
            onBack={() => setStep(2)}
            onTest={async () => {
              const { outcome } = await destinationApi.test(destination.id);
              if (outcome.kind === 'success') await refreshSetup();
              return outcome;
            }}
            onContinue={() => {
              setSigningSecret('');
              setStep(4);
            }}
          />
        ) : null}
        {step === 4 ? (
          <section className="setup-step setup-finale" aria-labelledby="setup-live-title">
            <div className="setup-step__icon" aria-hidden="true">
              <RadioTower />
            </div>
            <p className="eyebrow eyebrow--dark">Step 5 / Go live</p>
            <h1 id="setup-live-title" data-setup-heading tabIndex={-1}>
              Put the desk on air.
            </h1>
            <p className="setup-step__lede">
              Source verified. Destination tested. Topics tuned. Activation checkpoints
              the latest post without sending historical noise.
            </p>
            <div className="activation-board">
              {[
                [
                  'Source',
                  setup.source.mode === 'demo' ? 'Demo fixtures' : '@thsottiaux',
                ],
                ['Destination', destination?.name ?? 'Connected'],
                [
                  'Routing',
                  destination?.routing.mode === 'everything'
                    ? 'Everything'
                    : `${destination?.routing.categories.length ?? 0} topics`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <Check aria-hidden="true" />
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {activationError ? (
              <p className="form-error" role="alert">
                {activationError}
              </p>
            ) : null}
            <div className="setup-step__actions setup-step__actions--split">
              <Button variant="quiet" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button onClick={() => void activate()} loading={activating}>
                Activate monitoring
              </Button>
            </div>
            {!setup.readyToActivate ? (
              <button
                className="text-action"
                type="button"
                onClick={() => void refreshSetup()}
              >
                <RotateCcw size={14} aria-hidden="true" /> Refresh readiness
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
};
