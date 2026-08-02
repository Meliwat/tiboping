import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deliveriesApi, destinationApi, type DeliveryState } from '../api/client.js';
import { Button } from '../components/Button.js';
import { DeliveryTable } from '../components/DeliveryTable.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorNotice } from '../components/ErrorNotice.js';

export const DeliveriesPage = () => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<DeliveryState | 'all'>('all');
  const [destinationId, setDestinationId] = useState('all');
  const [cursor, setCursor] = useState<string>();
  const destinations = useQuery({
    queryKey: ['destinations'],
    queryFn: destinationApi.list,
  });
  const deliveries = useQuery({
    queryKey: ['deliveries', state, destinationId, cursor ?? 'first'],
    queryFn: () =>
      deliveriesApi.list({
        limit: 25,
        ...(state === 'all' ? {} : { state }),
        ...(destinationId === 'all' ? {} : { destinationId }),
        ...(cursor ? { before: cursor } : {}),
      }),
  });
  const retry = useMutation({
    mutationFn: deliveriesApi.retry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      await queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  return (
    <div className="ledger-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow eyebrow--dark">Delivery operations</p>
          <h1>Every attempt, accounted for.</h1>
          <p>
            Inspect provider outcomes, isolate failures, and retry after correcting a
            destination.
          </p>
        </div>
      </header>
      <div className="delivery-filters">
        <label>
          <span>State</span>
          <select
            value={state}
            onChange={(event) => setState(event.target.value as DeliveryState | 'all')}
          >
            <option value="all">All states</option>
            <option value="pending">Pending</option>
            <option value="sending">Sending</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          <span>Destination</span>
          <select
            value={destinationId}
            onChange={(event) => setDestinationId(event.target.value)}
          >
            <option value="all">All destinations</option>
            {destinations.data?.items.map((destination) => (
              <option value={destination.id} key={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {deliveries.isPending || destinations.isPending ? (
        <div className="dashboard-loading">Loading delivery log…</div>
      ) : null}
      {deliveries.isError || destinations.isError ? (
        <ErrorNotice
          message="The delivery log could not be loaded."
          onRetry={() => void deliveries.refetch()}
        />
      ) : null}
      {deliveries.data?.items.length === 0 ? (
        <EmptyState title="No deliveries in this view">
          Delivery attempts appear here after a post routes to a destination.
        </EmptyState>
      ) : null}
      {deliveries.data && destinations.data && deliveries.data.items.length > 0 ? (
        <DeliveryTable
          deliveries={deliveries.data.items}
          destinations={destinations.data.items}
          {...(retry.isPending ? { retryingId: retry.variables } : {})}
          onRetry={(id) => retry.mutate(id)}
        />
      ) : null}
      {deliveries.data?.nextCursor ? (
        <div className="pagination-actions">
          <Button variant="quiet" onClick={() => setCursor(undefined)} disabled={!cursor}>
            Newest
          </Button>
          <Button onClick={() => setCursor(deliveries.data.nextCursor)}>
            Older attempts
          </Button>
        </div>
      ) : cursor ? (
        <div className="pagination-actions">
          <Button variant="quiet" onClick={() => setCursor(undefined)}>
            Back to newest
          </Button>
        </div>
      ) : null}
    </div>
  );
};
