import { classifyPost } from '@tiboping/core';
import { describe, expect, it } from 'vitest';

import {
  DemoSource,
  demoFixtureNames,
  getDemoFixture,
} from '../../src/source/demo-source.js';

describe('DemoSource', () => {
  it('provides stable fixtures for every demo scenario', () => {
    expect(demoFixtureNames).toEqual([
      'codex',
      'outage',
      'usage-limit',
      'multi-category',
      'unmatched',
    ]);

    expect(
      demoFixtureNames.map((name) => {
        const fixture = getDemoFixture(name);
        return {
          name,
          id: fixture.id,
          categories: classifyPost(fixture.text).categories,
        };
      }),
    ).toEqual([
      { name: 'codex', id: '1990000000000000001', categories: ['codex'] },
      { name: 'outage', id: '1990000000000000002', categories: ['outages'] },
      {
        name: 'usage-limit',
        id: '1990000000000000003',
        categories: ['usage-limits'],
      },
      {
        name: 'multi-category',
        id: '1990000000000000004',
        categories: ['codex', 'outages', 'usage-limits'],
      },
      { name: 'unmatched', id: '1990000000000000005', categories: [] },
    ]);
  });

  it('queues emitted fixtures until the stream consumer is ready', async () => {
    const source = new DemoSource();
    const controller = new AbortController();
    const received: string[] = [];

    source.emit('codex');
    const consuming = source.consumeStream(controller.signal, async (post) => {
      received.push(post.id);
      controller.abort();
    });

    await consuming;
    expect(received).toEqual(['1990000000000000001']);
  });

  it('behaves like an empty timeline around live demo events', async () => {
    const source = new DemoSource();

    await expect(source.prepare()).resolves.toMatchObject({
      username: 'thsottiaux',
      protected: false,
    });
    await expect(source.fetchLatest('demo-user')).resolves.toEqual([]);
    await expect(source.fetchAfter('demo-user', '1')).resolves.toEqual([]);
  });
});
