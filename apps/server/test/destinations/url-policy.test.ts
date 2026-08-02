import { describe, expect, it } from 'vitest';

import { assertOutboundUrl } from '../../src/destinations/url-policy.js';

describe('outbound URL policy', () => {
  it('accepts documented Slack and Discord webhook forms', async () => {
    await expect(
      assertOutboundUrl('https://hooks.slack.com/services/T/B/C', {
        provider: 'slack',
        allowPrivate: false,
        resolveAddresses: async () => ['18.205.93.1'],
      }),
    ).resolves.toBeInstanceOf(URL);
    await expect(
      assertOutboundUrl('https://discord.com/api/webhooks/123/token', {
        provider: 'discord',
        allowPrivate: false,
        resolveAddresses: async () => ['162.159.128.1'],
      }),
    ).resolves.toBeInstanceOf(URL);
  });

  it.each([
    ['http://hooks.slack.com/services/T/B/C', 'slack'],
    ['https://evil.example/services/T/B/C', 'slack'],
    ['https://discord.com/channels/123', 'discord'],
    ['https://user:pass@receiver.example/events', 'generic'],
  ] as const)('rejects invalid %s URLs', async (url, provider) => {
    await expect(
      assertOutboundUrl(url, {
        provider,
        allowPrivate: false,
        resolveAddresses: async () => ['93.184.216.34'],
      }),
    ).rejects.toThrow();
  });

  it.each(['127.0.0.1', '10.0.0.8', '169.254.169.254', '::1', 'fc00::1', '2001:db8::1'])(
    'rejects private or non-routable address %s',
    async (address) => {
      await expect(
        assertOutboundUrl('https://receiver.example/events', {
          provider: 'generic',
          allowPrivate: false,
          resolveAddresses: async () => [address],
        }),
      ).rejects.toThrow(/private|routable/iu);
    },
  );

  it('accepts a public generic URL and permits explicit private development endpoints', async () => {
    await expect(
      assertOutboundUrl('https://receiver.example/events', {
        provider: 'generic',
        allowPrivate: false,
        resolveAddresses: async () => ['93.184.216.34'],
      }),
    ).resolves.toBeInstanceOf(URL);
    await expect(
      assertOutboundUrl('http://127.0.0.1:4444/events', {
        provider: 'generic',
        allowPrivate: true,
        resolveAddresses: async () => ['127.0.0.1'],
      }),
    ).resolves.toBeInstanceOf(URL);
  });

  it('rejects when any resolved address is private to reduce DNS rebinding risk', async () => {
    await expect(
      assertOutboundUrl('https://receiver.example/events', {
        provider: 'generic',
        allowPrivate: false,
        resolveAddresses: async () => ['93.184.216.34', '127.0.0.1'],
      }),
    ).rejects.toThrow();
  });
});
