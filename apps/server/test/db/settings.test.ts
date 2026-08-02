import { describe, expect, it } from 'vitest';

import { deriveKeys } from '../../src/crypto/keys.js';
import { SettingsRepository } from '../../src/db/repositories/settings.js';
import { createTestDatabase } from '../helpers/database.js';

describe('settings repository', () => {
  it('stores public values and encrypted secrets with stable upserts', () => {
    const testDatabase = createTestDatabase();
    const key = deriveKeys(Buffer.alloc(32, 6)).encryptionKey;
    const settings = new SettingsRepository(
      testDatabase.database,
      key,
      () => '2026-08-01T12:00:00.000Z',
    );

    try {
      settings.set('source_username', 'thsottiaux');
      settings.setSecret('x_bearer_token', 'extremely-secret-token');
      settings.set('source_username', 'tibo');

      expect(settings.get('source_username')).toBe('tibo');
      expect(settings.getSecret('x_bearer_token')).toBe('extremely-secret-token');
      const raw = testDatabase.database
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get('x_bearer_token') as { value: string };
      expect(raw.value).not.toContain('extremely-secret-token');
      expect(() => settings.get('x_bearer_token')).toThrow(/encrypted/iu);
    } finally {
      testDatabase.cleanup();
    }
  });
});
