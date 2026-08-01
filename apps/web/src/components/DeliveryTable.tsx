import { RotateCcw } from 'lucide-react';

import type { Delivery, Destination } from '../api/client.js';
import { Button } from './Button.js';
import { StatusPill } from './StatusPill.js';

const toneForState = (state: Delivery['state']) =>
  state === 'delivered'
    ? ('live' as const)
    : state === 'failed' || state === 'cancelled'
      ? ('warning' as const)
      : ('waiting' as const);

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export const DeliveryTable = ({
  deliveries,
  destinations,
  retryingId,
  onRetry,
}: {
  deliveries: Delivery[];
  destinations: Destination[];
  retryingId?: string;
  onRetry: (id: string) => void;
}) => {
  const names = new Map(destinations.map(({ id, name }) => [id, name]));
  return (
    <div className="delivery-table-wrap">
      <table className="delivery-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Destination</th>
            <th>Post</th>
            <th>Attempts</th>
            <th>Updated</th>
            <th>Recovery</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => (
            <tr key={delivery.id}>
              <td data-label="Status">
                <StatusPill tone={toneForState(delivery.state)}>
                  {delivery.state}
                </StatusPill>
              </td>
              <td data-label="Destination">
                {names.get(delivery.destinationId) ?? 'Removed destination'}
              </td>
              <td data-label="Post">
                <code>{delivery.postId}</code>
              </td>
              <td data-label="Attempts">{delivery.attemptCount}</td>
              <td data-label="Updated">{formatTimestamp(delivery.updatedAt)}</td>
              <td data-label="Recovery">
                {delivery.state === 'failed' ? (
                  <div className="delivery-table__recovery">
                    <span>{delivery.lastErrorCode ?? 'delivery-failed'}</span>
                    <Button
                      variant="quiet"
                      loading={retryingId === delivery.id}
                      onClick={() => onRetry(delivery.id)}
                    >
                      <RotateCcw size={14} aria-hidden="true" /> Retry
                    </Button>
                  </div>
                ) : (
                  <span>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
