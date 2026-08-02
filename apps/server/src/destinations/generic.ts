import { genericWebhookEnvelopeSchema, notificationSchema } from '@tiboping/core';
import { z } from 'zod';

import { signWebhook } from '../crypto/signature.js';
import { assertOutboundUrl } from './url-policy.js';
import {
  networkFailure,
  outcomeForResponse,
  type AdapterDependencies,
  type DestinationAdapter,
} from './types.js';

const base64Secret = z.string().superRefine((value, context) => {
  const decoded = Buffer.from(value, 'base64');
  const canonical = decoded.toString('base64').replace(/=+$/u, '');
  if (decoded.byteLength !== 32 || canonical !== value.replace(/=+$/u, '')) {
    context.addIssue({
      code: 'custom',
      message: 'Signing secret must decode to exactly 32 bytes',
    });
  }
});

const genericConfigSchema = z.object({
  url: z.url(),
  signingSecret: base64Secret,
});
type GenericConfig = z.infer<typeof genericConfigSchema>;

const renderEnvelope = (notificationInput: Parameters<DestinationAdapter['send']>[0]) => {
  const notification = notificationSchema.parse(notificationInput);
  return genericWebhookEnvelopeSchema.parse({
    schema_version: '1',
    event_id: notification.eventId,
    event_type: 'tibo.post',
    post: {
      id: notification.post.id,
      author_name: notification.post.authorName,
      author_username: notification.post.authorUsername,
      text: notification.post.text,
      url: notification.post.url,
      created_at: notification.post.createdAt,
      kind: notification.post.kind,
    },
    categories: notification.categories,
    observed_at: notification.observedAt,
  });
};

export const createGenericWebhookAdapter = (
  dependencies: AdapterDependencies,
): DestinationAdapter => {
  const validateConfig = async (input: unknown): Promise<GenericConfig> => {
    const config = genericConfigSchema.parse(input);
    await assertOutboundUrl(config.url, {
      provider: 'generic',
      allowPrivate: dependencies.allowPrivate ?? false,
      ...(dependencies.resolveAddresses
        ? { resolveAddresses: dependencies.resolveAddresses }
        : {}),
    });
    return config;
  };

  return {
    type: 'generic',
    validateConfig,
    send: async (notification, input) => {
      let config: GenericConfig;
      try {
        config = await validateConfig(input);
      } catch {
        return {
          kind: 'permanent-failure',
          code: 'invalid-webhook',
          message: 'Generic webhook configuration is invalid',
        };
      }

      const body = JSON.stringify(renderEnvelope(notification));
      const timestamp = String(Math.floor((dependencies.now?.() ?? Date.now()) / 1000));
      const secret = Buffer.from(config.signingSecret, 'base64');

      try {
        const response = await dependencies.transport.send({
          method: 'POST',
          url: config.url,
          headers: {
            'content-type': 'application/json',
            'x-tiboping-event': notification.eventId,
            'x-tiboping-timestamp': timestamp,
            'x-tiboping-signature': signWebhook(secret, timestamp, Buffer.from(body)),
          },
          body,
          timeoutMs: 10_000,
          maxResponseBytes: 64 * 1024,
          redirect: 'manual',
        });
        return outcomeForResponse(
          'generic',
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
