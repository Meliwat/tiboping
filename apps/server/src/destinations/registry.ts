import type { DestinationType } from '@tiboping/core';

import type { DestinationAdapter } from './types.js';

export class DestinationAdapterRegistry {
  private readonly adapters = new Map<DestinationType, DestinationAdapter>();

  public constructor(adapters: readonly DestinationAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.type)) {
        throw new Error(`Duplicate destination adapter: ${adapter.type}`);
      }
      this.adapters.set(adapter.type, adapter);
    }
  }

  public get(type: DestinationType): DestinationAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) throw new Error(`Destination adapter is not registered: ${type}`);
    return adapter;
  }

  public list(): DestinationAdapter[] {
    return [...this.adapters.values()];
  }
}
