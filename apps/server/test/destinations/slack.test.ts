import { describe, expect, it } from 'vitest';

import { createSlackAdapter } from '../../src/destinations/slack.js';
import { notificationFixture } from '../fixtures/notification.js';
import { FakeHttpTransport, resolvePublicAddress, response } from '../helpers/http.js';

const config = { webhookUrl: 'https://hooks.slack.com/services/T000/B000/SECRET' };

describe('Slack destination adapter', () => {
  it('renders escaped Block Kit content and preserves the canonical link', async () => {
    const transport = new FakeHttpTransport(response(200, {}, 'ok'));
    const adapter = createSlackAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });

    await expect(adapter.validateConfig(config)).resolves.toEqual(config);
    await expect(adapter.send(notificationFixture, config)).resolves.toEqual({
      kind: 'success',
    });

    const request = transport.requests[0];
    const payload = JSON.parse(request?.body ?? '') as {
      text: string;
      blocks: Array<Record<string, unknown>>;
    };
    expect(request).toMatchObject({
      method: 'POST',
      url: config.webhookUrl,
      headers: { 'content-type': 'application/json' },
      redirect: 'manual',
    });
    expect(payload.text).toContain('Tibo posted');
    expect(payload.text).toContain('Codex &lt;limits&gt; &amp;');
    expect(JSON.stringify(payload.blocks)).toContain('Codex &lt;limits&gt; &amp;');
    expect(JSON.stringify(payload.blocks)).toContain(notificationFixture.post.url);
    expect(JSON.stringify(payload.blocks)).toContain('CODEX');
    expect(JSON.stringify(payload.blocks)).toContain('USAGE LIMITS');
  });

  it('truncates oversized post text without losing the link', async () => {
    const transport = new FakeHttpTransport(response(200));
    const adapter = createSlackAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });

    await adapter.send(
      {
        ...notificationFixture,
        post: { ...notificationFixture.post, text: 'x'.repeat(10_000) },
      },
      config,
    );
    const payload = JSON.parse(transport.requests[0]?.body ?? '') as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const section = payload.blocks.find(({ type }) => type === 'section');
    expect(section?.text?.text.length).toBeLessThanOrEqual(3000);
    expect(JSON.stringify(payload)).toContain(notificationFixture.post.url);
  });

  it.each([
    [
      429,
      { 'retry-after': '12' },
      { kind: 'retry', code: 'provider-rate-limit', retryAfterMs: 12_000 },
    ],
    [503, {}, { kind: 'retry', code: 'provider-unavailable' }],
    [404, {}, { kind: 'permanent-failure', code: 'invalid-webhook' }],
    [
      302,
      { location: 'https://evil.example' },
      { kind: 'permanent-failure', code: 'redirect-rejected' },
    ],
  ] as const)('classifies HTTP %s', async (status, headers, expected) => {
    const transport = new FakeHttpTransport(response(status, headers));
    const adapter = createSlackAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });

    await expect(adapter.send(notificationFixture, config)).resolves.toMatchObject(
      expected,
    );
  });

  it('classifies network errors without exposing the webhook URL', async () => {
    const transport = new FakeHttpTransport(
      new Error(`connect failed: ${config.webhookUrl}`),
    );
    const adapter = createSlackAdapter({
      transport,
      resolveAddresses: resolvePublicAddress,
    });

    const result = await adapter.send(notificationFixture, config);
    expect(result).toMatchObject({ kind: 'retry', code: 'network-error' });
    expect(JSON.stringify(result)).not.toContain(config.webhookUrl);
  });
});
