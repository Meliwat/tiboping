import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const databaseDirectory = path.join(repositoryRoot, 'work/e2e');
const databasePath = path.join(databaseDirectory, 'tiboping.sqlite');
const appUrl = 'http://127.0.0.1:3100';
const appSecret = Buffer.alloc(32, 7).toString('base64');
const adminPassword = 'tiboping-e2e-password';
let backend;
let backendOutput = '';
let backendReady = false;
let failureStatus = 410;
let received = [];
let stopping = false;

mkdirSync(databaseDirectory, { recursive: true });

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const appendOutput = (chunk) => {
  backendOutput = `${backendOutput}${chunk.toString('utf8')}`.slice(-8_000);
};

const waitForReady = async () => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (backend?.exitCode !== null) {
      throw new Error(`E2E server exited before readiness:\n${backendOutput}`);
    }
    try {
      const response = await fetch(`${appUrl}/readyz`);
      if (response.ok) return;
    } catch {
      // The listener may not be bound yet.
    }
    await wait(100);
  }
  throw new Error(`E2E server did not become ready:\n${backendOutput}`);
};

const startBackend = async () => {
  backendReady = false;
  backendOutput = '';
  backend = spawn('node', ['apps/server/dist/index.js'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3100',
      PUBLIC_URL: appUrl,
      DATABASE_PATH: databasePath,
      APP_SECRET: appSecret,
      ADMIN_PASSWORD: adminPassword,
      DEMO_MODE: 'true',
      ALLOW_PRIVATE_WEBHOOKS: 'true',
      LOG_LEVEL: 'silent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', appendOutput);
  backend.stderr.on('data', appendOutput);
  await waitForReady();
  backendReady = true;
};

const stopBackend = async () => {
  backendReady = false;
  if (!backend || backend.exitCode !== null) return;
  const processToStop = backend;
  const exited = new Promise((resolve) => processToStop.once('exit', resolve));
  processToStop.kill('SIGTERM');
  const stoppedGracefully = await Promise.race([
    exited.then(() => true),
    wait(5_000).then(() => false),
  ]);
  if (!stoppedGracefully) {
    processToStop.kill('SIGKILL');
    await Promise.race([
      exited,
      wait(5_000).then(() => {
        throw new Error('E2E server did not stop after SIGKILL');
      }),
    ]);
  }
};

const resetDatabase = async () => {
  await stopBackend();
  for (const suffix of ['', '-shm', '-wal']) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
  received = [];
  failureStatus = 410;
  await startBackend();
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const sendJson = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const harness = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:3999');
    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, backendReady ? 200 : 503, { ready: backendReady });
    }
    if (request.method === 'POST' && url.pathname === '/reset') {
      await resetDatabase();
      return sendJson(response, 200, { reset: true });
    }
    if (request.method === 'POST' && url.pathname === '/restart') {
      await stopBackend();
      await startBackend();
      return sendJson(response, 200, { restarted: true });
    }
    if (request.method === 'POST' && url.pathname === '/recover') {
      failureStatus = 204;
      response.writeHead(204).end();
      return;
    }
    if (request.method === 'GET' && url.pathname === '/requests') {
      return sendJson(response, 200, { items: received });
    }
    if (request.method === 'POST' && ['/webhook', '/fail'].includes(url.pathname)) {
      received.push({
        path: url.pathname,
        headers: request.headers,
        body: await readBody(request),
      });
      response.writeHead(url.pathname === '/fail' ? failureStatus : 204).end();
      return;
    }
    sendJson(response, 404, { error: 'not-found' });
  } catch (error) {
    sendJson(response, 500, { error: String(error) });
  }
});

const shutdown = async (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  await stopBackend();
  await new Promise((resolve) => harness.close(resolve));
  process.exitCode = exitCode;
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

harness.listen(3999, '127.0.0.1', () => {
  startBackend().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    void shutdown(1);
  });
});
