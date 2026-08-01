import { describe, expect, it } from 'vitest';

import { serviceName } from '../src/index.js';

describe('server workspace', () => {
  it('exports the service identity', () => {
    expect(serviceName).toBe('TiboPing');
  });
});
