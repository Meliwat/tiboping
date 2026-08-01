import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = 'http://127.0.0.1:3100';
const harnessUrl = 'http://127.0.0.1:3999';
const videoDirectory = path.join(root, 'work/capture-video');
const rawVideo = path.join(root, 'work/tiboping-demo.webm');
const screenshot = path.join(root, 'docs/assets/tiboping-dashboard.png');

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const finishSetup = async (page) => {
  await page.goto(baseUrl);
  await page.getByLabel('Admin password').fill('tiboping-e2e-password');
  await page.getByRole('button', { name: 'Enter signal desk' }).click();
  await page.getByRole('heading', { name: 'Your demo transmitter is ready.' }).waitFor();
  await page.getByRole('button', { name: 'Continue to destination' }).click();
  await page.getByRole('radio', { name: /Generic/ }).check();
  await page.getByLabel('Display name').fill('Codex community');
  await page.getByLabel('Webhook endpoint').fill(`${harnessUrl}/webhook`);
  await page.getByRole('button', { name: 'Save destination' }).click();
  await page.getByRole('checkbox', { name: /Codex \+ releases/ }).check();
  await page.getByRole('checkbox', { name: /^Outages/ }).check();
  await page.getByRole('checkbox', { name: /Usage limits \+ resets/ }).check();
  await page.getByRole('button', { name: 'Save topics' }).click();
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await page.getByText('Destination acknowledged the ping.').waitFor();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'Activate monitoring' }).click();
  await page.getByRole('heading', { name: 'Signal report.' }).waitFor();
};

const main = async () => {
  await fetch(`${harnessUrl}/reset`, { method: 'POST' }).then((response) => {
    if (!response.ok) throw new Error(`Harness reset failed: ${response.status}`);
  });
  await rm(videoDirectory, { recursive: true, force: true });
  await mkdir(videoDirectory, { recursive: true });
  const browser = await chromium.launch();

  const setupContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const setupPage = await setupContext.newPage();
  await finishSetup(setupPage);
  const storageState = await setupContext.storageState();
  await setupContext.close();

  const recordingContext = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: videoDirectory, size: { width: 1440, height: 900 } },
  });
  const page = await recordingContext.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Signal report.' }).waitFor();
  await pause(900);
  await page.getByRole('button', { name: 'multi category' }).click();
  await page.getByText(/entered the delivery pipeline/).waitFor();
  await page.getByText(/Codex is degraded while we repair/).waitFor();
  await pause(1_300);

  const destination = page
    .locator('.destination-card')
    .filter({ hasText: 'Codex community' });
  await destination.scrollIntoViewIfNeeded();
  await pause(500);
  await destination.getByRole('button', { name: 'Test' }).click();
  await destination.getByText('Test acknowledged.').waitFor();
  await pause(900);
  await page.getByRole('heading', { name: 'Recent posts.' }).scrollIntoViewIfNeeded();
  await pause(900);
  await page.screenshot({ path: screenshot, fullPage: true });

  const video = page.video();
  await page.close();
  await video.saveAs(rawVideo);
  await recordingContext.close();
  await browser.close();
  process.stdout.write(`Captured ${screenshot} and ${rawVideo}\n`);
};

await main();
