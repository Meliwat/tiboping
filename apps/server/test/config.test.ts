import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/load-config.js';

const appSecret = Buffer.alloc(32, 7).toString('base64');

describe('loadConfig', () => {
  it('loads a secure production configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      APP_SECRET: appSecret,
      ADMIN_PASSWORD: 'a long admin password',
      X_BEARER_TOKEN: 'x-token',
      PUBLIC_URL: 'https://tiboping.example',
      PORT: '4242',
      ALLOW_PRIVATE_WEBHOOKS: 'true',
    });

    expect(config).toMatchObject({
      nodeEnv: 'production',
      adminPassword: 'a long admin password',
      xBearerToken: 'x-token',
      publicUrl: 'https://tiboping.example',
      port: 4242,
      allowPrivateWebhooks: true,
      demoMode: false,
    });
    expect(config.appSecret).toEqual(Buffer.alloc(32, 7));
  });

  it('rejects missing production secrets', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/APP_SECRET/);
  });

  it('rejects a secret that does not decode to exactly 32 bytes', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        APP_SECRET: Buffer.alloc(31).toString('base64'),
        ADMIN_PASSWORD: 'a long admin password',
      }),
    ).toThrow(/32/);
  });

  it('uses safe local defaults and an injected ephemeral demo secret', () => {
    const config = loadConfig({ NODE_ENV: 'development', DEMO_MODE: 'true' }, () =>
      Buffer.alloc(32, 9),
    );

    expect(config).toMatchObject({
      demoMode: true,
      publicUrl: 'http://localhost:3000',
      port: 3000,
      databasePath: '/data/tiboping.sqlite',
      adminPassword: 'tiboping-demo',
      allowPrivateWebhooks: false,
    });
    expect(config.appSecret).toEqual(Buffer.alloc(32, 9));
  });

  it('rejects malformed boolean and URL values', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', DEMO_MODE: 'yes' })).toThrow(
      /DEMO_MODE/,
    );
    expect(() =>
      loadConfig({ NODE_ENV: 'development', DEMO_MODE: 'true', PUBLIC_URL: 'localhost' }),
    ).toThrow(/PUBLIC_URL/);
  });
});
