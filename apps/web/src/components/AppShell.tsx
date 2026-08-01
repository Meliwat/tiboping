import type { ReactNode } from 'react';
import { RadioTower } from 'lucide-react';

import { Button } from './Button.js';
import { StatusPill } from './StatusPill.js';

type AppShellProps = {
  children: ReactNode;
  onLogout: () => void;
  loggingOut?: boolean;
  pathname?: string;
  onNavigate?: (path: string) => void;
};

const navigation = [
  { path: '/', label: 'Dashboard' },
  { path: '/posts', label: 'Posts' },
  { path: '/deliveries', label: 'Deliveries' },
];

export const AppShell = ({
  children,
  onLogout,
  loggingOut = false,
  pathname = '/',
  onNavigate,
}: AppShellProps) => (
  <div className="app-shell">
    <header className="app-shell__masthead">
      <a
        className="wordmark"
        href="/"
        aria-label="TiboPing home"
        onClick={(event) => {
          if (!onNavigate) return;
          event.preventDefault();
          onNavigate('/');
        }}
      >
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
    {onNavigate ? (
      <nav className="app-navigation" aria-label="Primary navigation">
        {navigation.map((item) => (
          <a
            key={item.path}
            href={item.path}
            aria-current={pathname === item.path ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(item.path);
            }}
          >
            {item.label}
          </a>
        ))}
        <span>Codex · Outages · Usage limits</span>
      </nav>
    ) : (
      <div className="app-shell__ticker" aria-label="Active notification topics">
        <span>Codex + releases</span>
        <span>Outages</span>
        <span>Usage limits + resets</span>
      </div>
    )}
    <main className="app-shell__main">{children}</main>
  </div>
);
