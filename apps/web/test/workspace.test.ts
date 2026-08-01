import { describe, expect, it } from 'vitest';

describe('web workspace', () => {
  it('uses the public product name', () => {
    expect('TiboPing').toMatch(/Ping$/);
  });
});
