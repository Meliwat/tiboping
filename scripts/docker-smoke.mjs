import { randomBytes } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const image = process.env.TIBOPING_IMAGE ?? 'tiboping:smoke';
const suffix = `${process.pid}-${Date.now()}`;
const containerName = `tiboping-smoke-${suffix}`;
const volumeName = `tiboping-smoke-data-${suffix}`;
const password = `tiboping-smoke-${randomBytes(12).toString('hex')}`;
const appSecret = randomBytes(32).toString('base64');
const received = [];

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

const docker = (...arguments_) => {
  const result = spawnSync('docker', arguments_, {
    cwd: path.resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `docker ${arguments_.join(' ')} failed\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
};

const availablePort = async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  invariant(address && typeof address === 'object', 'Could not allocate a local port');
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
};

const receiver = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    received.push({
      headers: request.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    });
    response.writeHead(204).end();
  });
});

const listenForWebhooks = async () => {
  await new Promise((resolve, reject) => {
    receiver.once('error', reject);
    receiver.listen(0, '0.0.0.0', resolve);
  });
  const address = receiver.address();
  invariant(
    address && typeof address === 'object',
    'Could not start the webhook receiver',
  );
  return address.port;
};

const stopReceiver = async () =>
  new Promise((resolve) => receiver.close(() => resolve()));

const waitFor = async (description, operation, timeoutMilliseconds = 30_000) => {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${String(lastError)}` : ''}`,
  );
};

const startContainer = ({ appPort }) => {
  docker(
    'run',
    '--detach',
    '--name',
    containerName,
    '--init',
    '--read-only',
    '--security-opt',
    'no-new-privileges',
    '--add-host',
    'host.docker.internal:host-gateway',
    '--publish',
    `127.0.0.1:${appPort}:3000`,
    '--volume',
    `${volumeName}:/data`,
    '--env',
    'NODE_ENV=production',
    '--env',
    'DEMO_MODE=true',
    '--env',
    'ALLOW_PRIVATE_WEBHOOKS=true',
    '--env',
    'LOG_LEVEL=silent',
    '--env',
    `APP_SECRET=${appSecret}`,
    '--env',
    `ADMIN_PASSWORD=${password}`,
    '--env',
    `PUBLIC_URL=http://127.0.0.1:${appPort}`,
    image,
  );
  return `http://127.0.0.1:${appPort}`;
};

const waitForReady = async (baseUrl) =>
  waitFor('container readiness', async () => {
    const response = await fetch(`${baseUrl}/readyz`);
    return response.ok;
  });

const login = async (baseUrl) => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ password }),
  });
  invariant(response.ok, `Login failed with ${response.status}`);
  const body = await response.json();
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  invariant(cookie, 'Login did not return a session cookie');
  return { cookie, csrfToken: body.csrfToken };
};

const request = async (baseUrl, session, pathname, options = {}) => {
  const headers = new Headers(options.headers);
  headers.set('cookie', session.cookie);
  headers.set('origin', baseUrl);
  if (options.body) headers.set('content-type', 'application/json');
  if (options.method && options.method !== 'GET') {
    headers.set('x-csrf-token', session.csrfToken);
  }
  const response = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const body = response.status === 204 ? undefined : await response.json();
  invariant(
    response.ok,
    `${options.method ?? 'GET'} ${pathname} failed with ${response.status}: ${JSON.stringify(body)}`,
  );
  return body;
};

try {
  if (process.env.TIBOPING_SKIP_BUILD !== 'true') {
    process.stdout.write(`Building ${image}…\n`);
    docker('build', '--tag', image, '.');
  }

  const [appPort, receiverPort] = await Promise.all([
    availablePort(),
    listenForWebhooks(),
  ]);
  let baseUrl = startContainer({ appPort });
  await waitForReady(baseUrl);
  invariant(
    docker('exec', containerName, 'id', '-u') !== '0',
    'Container is running as root',
  );
  const deepLink = await fetch(`${baseUrl}/deliveries`);
  invariant(deepLink.ok, 'The production SPA deep link did not load');
  invariant(
    deepLink.headers.get('cache-control') === 'no-cache',
    'The production SPA shell was cacheable',
  );
  let session = await login(baseUrl);

  const created = await request(baseUrl, session, '/api/destinations', {
    method: 'POST',
    body: JSON.stringify({
      type: 'generic',
      name: 'Docker smoke receiver',
      url: `http://host.docker.internal:${receiverPort}/tiboping`,
      routing: { mode: 'everything' },
    }),
  });
  const destinationId = created.destination.id;
  await request(baseUrl, session, `/api/destinations/${destinationId}/test`, {
    method: 'POST',
  });
  await request(baseUrl, session, '/api/setup/activate', { method: 'POST' });
  const emitted = await request(baseUrl, session, '/api/demo/emit', {
    method: 'POST',
    body: JSON.stringify({ fixture: 'codex' }),
  });

  await waitFor('completed generic delivery', async () => {
    const deliveries = await request(
      baseUrl,
      session,
      `/api/deliveries?destinationId=${destinationId}&limit=10`,
    );
    return deliveries.items.some(
      (delivery) => delivery.postId === emitted.postId && delivery.state === 'delivered',
    );
  });
  await waitFor('webhook receipt', async () => received.length >= 2);
  const notification = received.find(({ body }) => body.includes(emitted.postId));
  invariant(notification, 'The emitted notification never reached the generic receiver');
  invariant(
    notification.headers['x-tiboping-signature'],
    'Webhook signature header is missing',
  );

  docker('stop', '--time', '15', containerName);
  docker('rm', containerName);
  baseUrl = startContainer({ appPort });
  await waitForReady(baseUrl);
  session = await login(baseUrl);
  const persistedPosts = await request(baseUrl, session, '/api/posts?limit=10');
  const persistedDeliveries = await request(baseUrl, session, '/api/deliveries?limit=10');
  invariant(
    persistedPosts.items.some((post) => post.id === emitted.postId),
    'The demo post did not survive a fresh container',
  );
  invariant(
    persistedDeliveries.items.some(
      (delivery) => delivery.postId === emitted.postId && delivery.state === 'delivered',
    ),
    'The completed delivery did not survive a fresh container',
  );

  process.stdout.write(
    `Docker smoke passed: login, signed generic delivery, and persisted restart (${emitted.postId}).\n`,
  );
} catch (error) {
  const logs = spawnSync('docker', ['logs', containerName], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (error instanceof Error && (logs.stdout || logs.stderr)) {
    error.message += `\nContainer logs:\n${logs.stdout}${logs.stderr}`;
  }
  throw error;
} finally {
  spawnSync('docker', ['rm', '--force', containerName], { stdio: 'ignore' });
  spawnSync('docker', ['volume', 'rm', '--force', volumeName], { stdio: 'ignore' });
  await stopReceiver();
}
