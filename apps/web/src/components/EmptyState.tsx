import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export const EmptyState = ({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <div className="empty-state">
    <Inbox aria-hidden="true" />
    <h3>{title}</h3>
    <p>{children}</p>
    {action}
  </div>
);
