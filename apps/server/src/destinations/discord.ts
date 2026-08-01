import { notificationSchema, type Notification } from '@tiboping/core';
import { z } from 'zod';

import { assertOutboundUrl } from './url-policy.js';
import {
  networkFailure,
  outcomeForResponse,
  type AdapterDependencies,
  type DestinationAdapter,
} from './types.js';

const discordConfigSchema = z.object({ webhookUrl: z.url() });
type DiscordConfig = z.infer<typeof discordConfigSchema>;

const truncate = (text: string, maximum: number): string =>
  text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;

const renderDiscord = (notificationInput: Notification) => {
  const notification = notificationSchema.parse(notificationInput);
  const categories =
    notification.categories
      .map((category) =>
        category === 'usage-limits' ? 'USAGE LIMITS' : category.toUpperCase(),
      )
      .join(' • ') || 'EVERYTHING';

  return {
    username: 'TiboPing',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'Tibo posted',
        description: truncate(notification.post.text, 4096),
        url: notification.post.url,
        color: 0x35d07f,
        timestamp: notification.post.createdAt,
        footer: { text: categories },
      },
    ],
  };
};

export const createDiscordAdapter = (
  dependencies: AdapterDependencies,
): DestinationAdapter => {
  const validateConfig = async (input: unknown): Promise<DiscordConfig> => {
    const config = discordConfigSchema.parse(input);
    await assertOutboundUrl(config.webhookUrl, {
      provider: 'discord',
      allowPrivate: false,
      ...(dependencies.resolveAddresses
        ? { resolveAddresses: dependencies.resolveAddresses }
        : {}),
    });
    return config;
  };

  return {
    type: 'discord',
    validateConfig,
    send: async (notification, input) => {
      let config: DiscordConfig;
      try {
        config = await validateConfig(input);
      } catch {
        return {
          kind: 'permanent-failure',
          code: 'invalid-webhook',
          message: 'Discord webhook configuration is invalid',
        };
      }

      try {
        const response = await dependencies.transport.send({
          method: 'POST',
          url: config.webhookUrl,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(renderDiscord(notification)),
          timeoutMs: 10_000,
          maxResponseBytes: 64 * 1024,
          redirect: 'manual',
        });
        return outcomeForResponse(
          'discord',
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
