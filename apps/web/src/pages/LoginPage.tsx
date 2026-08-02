import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, RadioTower } from 'lucide-react';

import { ApiError, authApi, type Session } from '../api/client.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { StatusPill } from '../components/StatusPill.js';

type LoginPageProps = {
  onAuthenticated: (session: Session) => void;
  connectionError?: boolean;
};

const messageForError = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many attempts. Let the signal cool down for a minute, then try again.';
  }
  if (error instanceof ApiError && error.status === 401) {
    return 'That password did not unlock the desk.';
  }
  return 'The desk could not reach TiboPing. Check the server and try again.';
};

export const LoginPage = ({
  onAuthenticated,
  connectionError = false,
}: LoginPageProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    connectionError
      ? 'The desk could not reach TiboPing. Check the server and try again.'
      : '',
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      onAuthenticated(await authApi.login(password));
    } catch (caught) {
      setError(messageForError(caught));
      inputRef.current?.focus();
      inputRef.current?.select();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-story-title">
        <div className="login-story__topline">
          <a className="wordmark wordmark--inverse" href="/" aria-label="TiboPing home">
            <span className="wordmark__mark" aria-hidden="true">
              <RadioTower size={19} strokeWidth={2.4} />
            </span>
            <span>TiboPing</span>
          </a>
          <StatusPill tone="waiting">Private desk</StatusPill>
        </div>

        <div className="signal-orbit" aria-hidden="true">
          <span className="signal-orbit__ring signal-orbit__ring--one" />
          <span className="signal-orbit__ring signal-orbit__ring--two" />
          <span className="signal-orbit__core" />
        </div>

        <div className="login-story__copy">
          <p className="eyebrow">Community signal desk / 001</p>
          <h1 id="login-story-title">
            When Tibo posts,
            <em> your people know.</em>
          </h1>
          <p className="login-story__lede">
            One tiny open-source relay for Codex releases, outages, usage-limit resets—and
            every glorious big-button moment.
          </p>
        </div>

        <div className="topic-rail" aria-label="Notification categories">
          <span>01 / Codex</span>
          <span>02 / Outages</span>
          <span>03 / Usage limits</span>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel__stamp" aria-hidden="true">
          SELF
          <br />
          HOSTED
        </div>
        <div className="login-panel__content">
          <p className="eyebrow eyebrow--dark">Operator access</p>
          <h2 id="login-title">Open the listening room.</h2>
          <p className="login-panel__intro">
            Use the admin password from your TiboPing environment. Nothing is stored in
            this browser.
          </p>

          <form className="login-form" onSubmit={(event) => void submit(event)}>
            <label className="sr-only" htmlFor="operator-username">
              Username
            </label>
            <input
              className="sr-only"
              id="operator-username"
              name="username"
              type="text"
              autoComplete="username"
              value="admin"
              readOnly
              tabIndex={-1}
            />
            <Field
              ref={inputRef}
              label="Admin password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              {...(error ? { error } : {})}
              required
            />
            <Button className="login-form__submit" type="submit" loading={submitting}>
              Enter signal desk
              <ArrowUpRight size={18} aria-hidden="true" />
            </Button>
          </form>

          <p className="login-panel__footnote">
            No accounts. No telemetry. One operator, one SQLite file, your channels.
          </p>
        </div>
      </section>
    </main>
  );
};
