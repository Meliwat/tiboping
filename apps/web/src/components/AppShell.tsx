import type { ReactNode } from 'react';
import { RadioTower } from 'lucide-react';

import { Button } from './Button.js';
import { StatusPill } from './StatusPill.js';

type AppShellProps = {
  children: ReactNode;
  onLogout: () => void;
  loggingOut?: boolean;
};

export const AppShell = ({ children, onLogout, loggingOut = false }: AppShellProps) => (
  <div className="app-shell">
    <header className="app-shell__masthead">
      <a className="wordmark" href="/" aria-label="TiboPing home">
        <span className="wordmark__mark" aria-hidden="true">
          <RadioTower size={19} strokeWidth={2.4} />
        </span>
        <span>TiboPing</span>
      </a>
      <div className="app-shell__masthead-actions">
        <StatusPill tone="live">Desk online</StatusPill>
        <Button variant="quiet" onClick={onLogout} loading={loggingOut}>
          Sign out
        </Button>
      </div>
    </header>
    <div className="app-shell__ticker" aria-label="Active notification topics">
      <span>Codex + releases</span>
      <span>Outages</span>
      <span>Usage limits + resets</span>
    </div>
    <main className="app-shell__main">{children}</main>
  </div>
);
