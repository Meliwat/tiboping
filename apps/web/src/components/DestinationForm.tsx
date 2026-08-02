import { useState, type FormEvent } from 'react';
import { Braces, Hash, MessageCircle } from 'lucide-react';

import type { DestinationDraft, DestinationType } from '../api/client.js';
import { Button } from './Button.js';
import { Field } from './Field.js';

const providerOptions: Array<{
  type: DestinationType;
  label: string;
  detail: string;
  icon: typeof Hash;
}> = [
  {
    type: 'slack',
    label: 'Slack',
    detail: 'Incoming webhook',
    icon: Hash,
  },
  {
    type: 'discord',
    label: 'Discord',
    detail: 'Incoming webhook',
    icon: MessageCircle,
  },
  {
    type: 'generic',
    label: 'Generic',
    detail: 'Signed JSON webhook',
    icon: Braces,
  },
];

export const DestinationForm = ({
  onSubmit,
  initialDraft,
  editing = false,
}: {
  onSubmit: (draft: DestinationDraft) => Promise<void>;
  initialDraft?: DestinationDraft;
  editing?: boolean;
}) => {
  const [type, setType] = useState<DestinationType>(initialDraft?.type ?? 'slack');
  const [name, setName] = useState(initialDraft?.name ?? '');
  const [endpoint, setEndpoint] = useState(initialDraft?.endpoint ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({ type, name, endpoint });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The destination could not be saved. Check the endpoint and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="destination-form" onSubmit={(event) => void submit(event)}>
      <fieldset className="provider-picker">
        <legend>Destination type</legend>
        <div className="provider-picker__grid">
          {providerOptions.map((provider) => {
            const Icon = provider.icon;
            return (
              <label key={provider.type}>
                <input
                  type="radio"
                  name="destination-type"
                  value={provider.type}
                  checked={type === provider.type}
                  disabled={editing}
                  onChange={() => {
                    setType(provider.type);
                    setEndpoint('');
                  }}
                />
                <span>
                  <Icon size={20} aria-hidden="true" />
                  <strong>{provider.label}</strong>
                  <small>{provider.detail}</small>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="destination-form__fields">
        <Field
          label="Display name"
          placeholder={type === 'slack' ? 'Codex community' : 'Main announcements'}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <Field
          label={
            type === 'generic'
              ? 'Webhook endpoint'
              : `${providerOptions.find((item) => item.type === type)?.label} webhook URL`
          }
          type="url"
          placeholder={
            type === 'slack'
              ? 'https://hooks.slack.com/services/…'
              : type === 'discord'
                ? 'https://discord.com/api/webhooks/…'
                : 'https://example.com/tiboping'
          }
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          hint="Encrypted before it is written to SQLite."
          required
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} disabled={!name || !endpoint}>
        {editing ? 'Update destination' : 'Save destination'}
      </Button>
    </form>
  );
};
