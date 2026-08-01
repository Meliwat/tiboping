import { describe, expect, it } from 'vitest';

import { DestinationRepository } from '../../src/db/repositories/destinations.js';
import { deriveKeys } from '../../src/crypto/keys.js';
import { createTestDatabase } from '../helpers/database.js';

const encryptionKey = deriveKeys(Buffer.alloc(32, 4)).encryptionKey;

describe('destination repository', () => {
  it('encrypts configuration and exposes only safe metadata', () => {
    const testDatabase = createTestDatabase();
    const destinations = new DestinationRepository(testDatabase.database, encryptionKey, {
      now: () => '2026-08-01T12:00:00.000Z',
      createId: () => 'destination-1',
    });

    try {
      const created = destinations.create({
        type: 'slack',
        name: 'Codex alerts',
        config: { webhookUrl: 'https://hooks.slack.com/services/T/B/SECRET' },
        routing: { mode: 'categories', categories: ['codex', 'usage-limits'] },
      });
      const stored = testDatabase.database
        .prepare('SELECT encrypted_config FROM destinations WHERE id = ?')
        .get(created.id) as { encrypted_config: string };

      expect(stored.encrypted_config).not.toContain('hooks.slack.com');
      expect(created).toMatchObject({
        id: 'destination-1',
        type: 'slack',
        name: 'Codex alerts',
        state: 'active',
        routing: { mode: 'categories', categories: ['codex', 'usage-limits'] },
        hasConfiguration: true,
      });
      expect(destinations.getConfig(created.id)).toEqual({
        webhookUrl: 'https://hooks.slack.com/services/T/B/SECRET',
      });
    } finally {
      testDatabase.cleanup();
    }
  });

  it('validates category routing and supports pause, resume, and soft deletion', () => {
    const testDatabase = createTestDatabase();
    let now = '2026-08-01T12:00:00.000Z';
    const destinations = new DestinationRepository(testDatabase.database, encryptionKey, {
      now: () => now,
      createId: () => 'destination-1',
    });

    try {
      expect(() =>
        destinations.create({
          type: 'discord',
          name: '   ',
          config: { webhookUrl: 'secret' },
          routing: { mode: 'everything' },
        }),
      ).toThrow(/name/iu);
      expect(() =>
        destinations.create({
          type: 'discord',
          name: 'Broken',
          config: { webhookUrl: 'secret' },
          routing: { mode: 'categories', categories: [] },
        }),
      ).toThrow(/category/iu);

      destinations.create({
        type: 'discord',
        name: 'Everything',
        config: { webhookUrl: 'secret' },
        routing: { mode: 'everything' },
      });
      now = '2026-08-01T12:01:00.000Z';
      expect(destinations.pause('destination-1', 'invalid-credentials')?.state).toBe(
        'paused',
      );
      expect(destinations.listActive()).toEqual([]);
      expect(destinations.resume('destination-1')?.state).toBe('active');
      now = '2026-08-01T12:02:00.000Z';
      expect(destinations.softDelete('destination-1')).toBe(true);
      expect(destinations.get('destination-1')).toBeUndefined();

      const deleted = testDatabase.database
        .prepare('SELECT deleted_at FROM destinations WHERE id = ?')
        .get('destination-1') as { deleted_at: string };
      expect(deleted.deleted_at).toBe(now);
    } finally {
      testDatabase.cleanup();
    }
  });
});
