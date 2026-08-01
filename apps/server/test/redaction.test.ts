import { describe, expect, it } from 'vitest';

import { createRedactor } from '../src/logging/redaction.js';

describe('createRedactor', () => {
  const slackUrl = 'https://hooks.slack.com/services/T000/B000/SECRET';
  const bearer = 'bearer-super-secret';
  const redact = createRedactor([slackUrl, bearer]);

  it('redacts sensitive keys recursively without mutating the source', () => {
    const source = {
      authorization: `Bearer ${bearer}`,
      nested: {
        cookie: 'tp_session=signed-value',
        safe: 'healthy',
      },
    };

    expect(redact(source)).toEqual({
      authorization: '[REDACTED]',
      nested: { cookie: '[REDACTED]', safe: 'healthy' },
    });
    expect(source.nested.cookie).toBe('tp_session=signed-value');
  });

  it('removes registered secret values from strings and arrays', () => {
    expect(
      redact({
        message: `Provider rejected ${slackUrl}`,
        details: [`token=${bearer}`, 'safe'],
      }),
    ).toEqual({
      message: 'Provider rejected [REDACTED_WEBHOOK_URL]',
      details: ['token=[REDACTED]', 'safe'],
    });
  });

  it('recognizes webhook URLs even before they are registered', () => {
    expect(redact('POST https://discord.com/api/webhooks/123/private-token failed')).toBe(
      'POST [REDACTED_WEBHOOK_URL] failed',
    );
  });
});
