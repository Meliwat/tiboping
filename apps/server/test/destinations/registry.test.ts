import { describe, expect, it } from 'vitest';

import { DestinationAdapterRegistry } from '../../src/destinations/registry.js';
import type { DestinationAdapter } from '../../src/destinations/types.js';

const adapter = (type: DestinationAdapter['type']): DestinationAdapter => ({
  type,
  validateConfig: async (config) => config,
  send: async () => ({ kind: 'success' }),
});

describe('DestinationAdapterRegistry', () => {
  it('returns registered adapters and rejects missing or duplicate types', () => {
    const registry = new DestinationAdapterRegistry([
      adapter('slack'),
      adapter('discord'),
    ]);

    expect(registry.get('slack').type).toBe('slack');
    expect(registry.list().map(({ type }) => type)).toEqual(['slack', 'discord']);
    expect(() => registry.get('generic')).toThrow(/not registered/iu);
    expect(
      () => new DestinationAdapterRegistry([adapter('slack'), adapter('slack')]),
    ).toThrow(/duplicate/iu);
  });
});
