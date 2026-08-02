import type { ReactNode } from 'react';

type StatusPillProps = {
  children: ReactNode;
  tone?: 'live' | 'waiting' | 'warning' | 'neutral';
};

export const StatusPill = ({ children, tone = 'neutral' }: StatusPillProps) => (
  <span className={`status-pill status-pill--${tone}`}>
    <span className="status-pill__dot" aria-hidden="true" />
    {children}
  </span>
);
