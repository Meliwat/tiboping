import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { createTestConfig } from '../helpers/config.js';
import { createTestDatabase } from '../helpers/database.js';

const temporaryDirectories: string[] = [];

const createWebRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tiboping-spa-'));
  temporaryDirectories.push(root);
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><html><body><div id="root">TiboPing shell</div></body></html>',
  );
  writeFileSync(path.join(root, 'assets/index-CMw-rIlB.js'), 'window.TIBOPING=true;');
  return root;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('production SPA serving', () => {
  it('serves deep links without caching the HTML shell', async () => {
    const testDatabase = createTestDatabase();
    const app = await buildApp({
      config: createTestConfig(),
      database: testDatabase.database,
      webRoot: createWebRoot(),
    });

    for (const url of ['/', '/posts', '/deliveries']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.body).toContain('TiboPing shell');
    }

    await app.close();
    testDatabase.cleanup();
  });

  it('caches fingerprinted assets immutably and never converts missing files to HTML', async () => {
    const testDatabase = createTestDatabase();
    const app = await buildApp({
      config: createTestConfig(),
      database: testDatabase.database,
      webRoot: createWebRoot(),
    });

    const asset = await app.inject({
      method: 'GET',
      url: '/assets/index-CMw-rIlB.js',
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(asset.body).toBe('window.TIBOPING=true;');

    const missingAsset = await app.inject({ method: 'GET', url: '/assets/missing.js' });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.headers['content-type']).not.toContain('text/html');

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'a long admin password' },
    });
    const missingApi = await app.inject({
      method: 'GET',
      url: '/api/not-real',
      headers: { cookie: login.headers['set-cookie']?.split(';')[0] ?? '' },
    });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.json()).toEqual({
      error: { code: 'not-found', message: 'API route not found' },
    });

    await app.close();
    testDatabase.cleanup();
  });
});
