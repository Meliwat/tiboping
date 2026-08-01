import { randomUUID } from 'node:crypto';

import type { TiboPingDatabase } from '../client.js';
import type { Delivery, DeliveryState } from '../schema.js';

type DeliveryRow = {
  id: string;
  post_id: string;
  destination_id: string;
  state: DeliveryState;
  attempt_count: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

const mapDelivery = (row: DeliveryRow): Delivery => ({
  id: row.id,
  postId: row.post_id,
  destinationId: row.destination_id,
  state: row.state,
  attemptCount: row.attempt_count,
  nextAttemptAt: row.next_attempt_at,
  ...(row.lease_owner ? { leaseOwner: row.lease_owner } : {}),
  ...(row.lease_expires_at ? { leaseExpiresAt: row.lease_expires_at } : {}),
  ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
  ...(row.last_error_message ? { lastErrorMessage: row.last_error_message } : {}),
  ...(row.delivered_at ? { deliveredAt: row.delivered_at } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class DeliveryRepository {
  private readonly createId: () => string;

  public constructor(
    private readonly database: TiboPingDatabase,
    options: { createId?: () => string } = {},
  ) {
    this.createId = options.createId ?? randomUUID;
  }

  public create(
    postId: string,
    destinationId: string,
    timestamp: string,
  ): { created: boolean; id: string } {
    const candidateId = this.createId();
    const result = this.database
      .prepare(
        `INSERT INTO deliveries (
           id, post_id, destination_id, state, attempt_count,
           next_attempt_at, created_at, updated_at
         ) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)
         ON CONFLICT(post_id, destination_id) DO NOTHING`,
      )
      .run(candidateId, postId, destinationId, timestamp, timestamp, timestamp);
    const row = this.database
      .prepare('SELECT id FROM deliveries WHERE post_id = ? AND destination_id = ?')
      .get(postId, destinationId) as { id: string };
    return { created: result.changes === 1, id: row.id };
  }

  public get(id: string): Delivery | undefined {
    const row = this.database.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) as
      DeliveryRow | undefined;
    return row ? mapDelivery(row) : undefined;
  }

  public claimDue(input: {
    workerId: string;
    now: string;
    leaseUntil: string;
  }): Delivery | undefined {
    const claim = this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE deliveries SET
             state = 'pending', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
           WHERE state = 'sending' AND lease_expires_at <= ?`,
        )
        .run(input.now, input.now);

      const candidate = this.database
        .prepare(
          `SELECT deliveries.id
           FROM deliveries
           JOIN destinations ON destinations.id = deliveries.destination_id
           WHERE deliveries.state = 'pending'
             AND deliveries.next_attempt_at <= ?
             AND destinations.state = 'active'
             AND destinations.deleted_at IS NULL
           ORDER BY deliveries.next_attempt_at, deliveries.created_at
           LIMIT 1`,
        )
        .get(input.now) as { id: string } | undefined;
      if (!candidate) return undefined;

      this.database
        .prepare(
          `UPDATE deliveries SET
             state = 'sending', attempt_count = attempt_count + 1,
             lease_owner = ?, lease_expires_at = ?, updated_at = ?
           WHERE id = ? AND state = 'pending'`,
        )
        .run(input.workerId, input.leaseUntil, input.now, candidate.id);
      return this.get(candidate.id);
    });

    return claim();
  }

  public scheduleRetry(
    id: string,
    input: {
      nextAttemptAt: string;
      errorCode: string;
      errorMessage: string;
      now: string;
    },
  ): Delivery | undefined {
    this.database
      .prepare(
        `UPDATE deliveries SET
           state = 'pending', next_attempt_at = ?, lease_owner = NULL, lease_expires_at = NULL,
           last_error_code = ?, last_error_message = ?, updated_at = ?
         WHERE id = ? AND state = 'sending'`,
      )
      .run(input.nextAttemptAt, input.errorCode, input.errorMessage, input.now, id);
    return this.get(id);
  }

  public markDelivered(id: string, now: string): Delivery | undefined {
    this.database
      .prepare(
        `UPDATE deliveries SET
           state = 'delivered', delivered_at = ?, lease_owner = NULL, lease_expires_at = NULL,
           last_error_code = NULL, last_error_message = NULL, updated_at = ?
         WHERE id = ? AND state = 'sending'`,
      )
      .run(now, now, id);
    return this.get(id);
  }

  public markPermanentFailure(
    id: string,
    input: { errorCode: string; errorMessage: string; now: string },
  ): Delivery | undefined {
    const fail = this.database.transaction(() => {
      const delivery = this.get(id);
      if (!delivery || delivery.state !== 'sending') return delivery;
      this.database
        .prepare(
          `UPDATE deliveries SET
             state = 'failed', lease_owner = NULL, lease_expires_at = NULL,
             last_error_code = ?, last_error_message = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(input.errorCode, input.errorMessage, input.now, id);
      this.database
        .prepare(
          `UPDATE destinations SET
             state = 'paused', pause_reason = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(input.errorCode, input.now, delivery.destinationId);
      return this.get(id);
    });
    return fail();
  }

  public manualRetry(id: string, now: string): Delivery | undefined {
    this.database
      .prepare(
        `UPDATE deliveries SET
           state = 'pending', attempt_count = 0, next_attempt_at = ?,
           lease_owner = NULL, lease_expires_at = NULL,
           last_error_code = NULL, last_error_message = NULL, updated_at = ?
         WHERE id = ? AND state = 'failed'`,
      )
      .run(now, now, id);
    return this.get(id);
  }
}
