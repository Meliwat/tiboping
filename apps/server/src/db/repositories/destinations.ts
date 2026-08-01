import { randomUUID } from 'node:crypto';

import {
  destinationTypeSchema,
  routingSchema,
  type DestinationType,
  type Routing,
} from '@tiboping/core';

import { decryptSecret, encryptSecret } from '../../crypto/envelope.js';
import type { TiboPingDatabase } from '../client.js';
import type { Destination, DestinationState } from '../schema.js';

type DestinationRow = {
  id: string;
  type: DestinationType;
  name: string;
  encrypted_config: string;
  routing_mode: 'everything' | 'categories';
  categories_json: string;
  state: DestinationState;
  pause_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type RepositoryOptions = {
  now?: () => string;
  createId?: () => string;
};

const mapDestination = (row: DestinationRow): Destination => {
  const routing = routingSchema.parse(
    row.routing_mode === 'everything'
      ? { mode: 'everything' }
      : { mode: 'categories', categories: JSON.parse(row.categories_json) as unknown },
  );

  return {
    id: row.id,
    type: destinationTypeSchema.parse(row.type),
    name: row.name,
    routing,
    state: row.state,
    ...(row.pause_reason ? { pauseReason: row.pause_reason } : {}),
    hasConfiguration: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export class DestinationRepository {
  private readonly now: () => string;
  private readonly createId: () => string;

  public constructor(
    private readonly database: TiboPingDatabase,
    private readonly encryptionKey: Uint8Array,
    options: RepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? randomUUID;
  }

  public create(input: {
    type: DestinationType;
    name: string;
    config: unknown;
    routing: Routing;
  }): Destination {
    const id = this.createId();
    const type = destinationTypeSchema.parse(input.type);
    const routing = routingSchema.parse(input.routing);
    const name = input.name.trim();
    if (!name) throw new Error('Destination name is required');
    const timestamp = this.now();
    const serializedConfig = JSON.stringify(input.config);
    if (serializedConfig === undefined)
      throw new Error('Destination configuration must be JSON');

    this.database
      .prepare(
        `INSERT INTO destinations (
          id, type, name, encrypted_config, routing_mode, categories_json,
          state, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        id,
        type,
        name,
        encryptSecret(serializedConfig, `destinations.config:${id}`, this.encryptionKey),
        routing.mode,
        JSON.stringify(routing.mode === 'categories' ? routing.categories : []),
        timestamp,
        timestamp,
      );

    const created = this.get(id);
    if (!created) throw new Error('Destination was not created');
    return created;
  }

  public get(id: string): Destination | undefined {
    const row = this.database
      .prepare('SELECT * FROM destinations WHERE id = ? AND deleted_at IS NULL')
      .get(id) as DestinationRow | undefined;
    return row ? mapDestination(row) : undefined;
  }

  public getConfig(id: string): unknown {
    const row = this.database
      .prepare(
        'SELECT encrypted_config FROM destinations WHERE id = ? AND deleted_at IS NULL',
      )
      .get(id) as { encrypted_config: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(
      decryptSecret(
        row.encrypted_config,
        `destinations.config:${id}`,
        this.encryptionKey,
      ),
    ) as unknown;
  }

  public listActive(): Destination[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM destinations WHERE state = 'active' AND deleted_at IS NULL ORDER BY created_at",
      )
      .all() as DestinationRow[];
    return rows.map(mapDestination);
  }

  public pause(id: string, reason: string): Destination | undefined {
    const timestamp = this.now();
    this.database
      .prepare(
        `UPDATE destinations SET state = 'paused', pause_reason = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(reason, timestamp, id);
    return this.get(id);
  }

  public resume(id: string): Destination | undefined {
    this.database
      .prepare(
        `UPDATE destinations SET state = 'active', pause_reason = NULL, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(this.now(), id);
    return this.get(id);
  }

  public softDelete(id: string): boolean {
    const timestamp = this.now();
    const remove = this.database.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE destinations SET
             state = 'paused', pause_reason = 'deleted', deleted_at = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(timestamp, timestamp, id);
      this.database
        .prepare(
          `UPDATE deliveries SET state = 'cancelled', updated_at = ?
           WHERE destination_id = ? AND state = 'pending'`,
        )
        .run(timestamp, id);
      return result.changes === 1;
    });
    return remove();
  }
}
