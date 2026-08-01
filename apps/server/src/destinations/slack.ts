import { notificationSchema, type Notification } from '@tiboping/core';
import { z } from 'zod';

import { assertOutboundUrl } from './url-policy.js';
import {
  networkFailure,
  outcomeForResponse,
  type AdapterDependencies,
  type DestinationAdapter,
} from './types.js';

const slackConfigSchema = z.object({ webhookUrl: z.url() });
type SlackConfig = z.infer<typeof slackConfigSchema>;

const escapeSlack = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const truncate = (text: string, maximum: number): string =>
  text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;

const categoryLabel = (category: Notification['categories'][number]): string =>
  category === 'usage-limits' ? 'USAGE LIMITS' : category.toUpperCase();

const renderSlack = (notificationInput: Notification) => {
  const notification = notificationSchema.parse(notificationInput);
  const escapedText = truncate(escapeSlack(notification.post.text), 2800);
  const labels = notification.categories.map(categoryLabel).join('  •  ') || 'EVERYTHING';

  return {
    text: truncate(`Tibo posted: ${escapeSlack(notification.post.text)}`, 3000),
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Tibo posted*\n${escapedText}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `${labels}  •  ${notification.post.createdAt}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open on X' },
            url: notification.post.url,
          },
        ],
      },
    ],
  };
};

export const createSlackAdapter = (
  dependencies: AdapterDependencies,
): DestinationAdapter => {
  const validateConfig = async (input: unknown): Promise<SlackConfig> => {
    const config = slackConfigSchema.parse(input);
    await assertOutboundUrl(config.webhookUrl, {
      provider: 'slack',
      allowPrivate: false,
      ...(dependencies.resolveAddresses
        ? { resolveAddresses: dependencies.resolveAddresses }
        : {}),
    });
    return config;
  };

  return {
    type: 'slack',
    validateConfig,
    send: async (notification, input) => {
      let config: SlackConfig;
      try {
        config = await validateConfig(input);
      } catch {
        return {
          kind: 'permanent-failure',
          code: 'invalid-webhook',
          message: 'Slack webhook configuration is invalid',
        };
      }

      try {
        const response = await dependencies.transport.send({
          method: 'POST',
          url: config.webhookUrl,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(renderSlack(notification)),
          timeoutMs: 10_000,
          maxResponseBytes: 64 * 1024,
          redirect: 'manual',
        });
        return outcomeForResponse(
          'slack',
          response.status,
          response.headers,
          dependencies.now?.() ?? Date.now(),
        );
      } catch {
        return networkFailure();
      }
    },
  };
};
