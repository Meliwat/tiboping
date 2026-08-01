import { decryptSecret, encryptSecret } from '../../crypto/envelope.js';
import type { TiboPingDatabase } from '../client.js';

type SettingRow = {
  value: string;
  encrypted: number;
};

export class SettingsRepository {
  public constructor(
    private readonly database: TiboPingDatabase,
    private readonly encryptionKey: Uint8Array,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public set(key: string, value: string): void {
    this.upsert(key, value, false);
  }

  public get(key: string): string | undefined {
    const row = this.read(key);
    if (!row) return undefined;
    if (row.encrypted === 1) {
      throw new Error(`Setting ${key} is encrypted and must be read with getSecret`);
    }
    return row.value;
  }

  public setSecret(key: string, value: string): void {
    this.upsert(key, encryptSecret(value, `settings:${key}`, this.encryptionKey), true);
  }

  public getSecret(key: string): string | undefined {
    const row = this.read(key);
    if (!row) return undefined;
    if (row.encrypted !== 1) {
      throw new Error(`Setting ${key} is not encrypted`);
    }
    return decryptSecret(row.value, `settings:${key}`, this.encryptionKey);
  }

  private read(key: string): SettingRow | undefined {
    return this.database
      .prepare('SELECT value, encrypted FROM settings WHERE key = ?')
      .get(key) as SettingRow | undefined;
  }

  private upsert(key: string, value: string, encrypted: boolean): void {
    this.database
      .prepare(
        `INSERT INTO settings (key, value, encrypted, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           encrypted = excluded.encrypted,
           updated_at = excluded.updated_at`,
      )
      .run(key, value, encrypted ? 1 : 0, this.now());
  }
}
