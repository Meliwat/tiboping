import { expect, test } from '@playwright/test';

import { finishSetup, harnessUrl, resetApplication } from './helpers.js';

test('completes category setup, survives restart, and supports logout', async ({
  page,
  request,
}) => {
  await resetApplication(request, page);
  await finishSetup(page, 'all-categories');

  const destination = page.locator('.destination-card').filter({
    has: page.getByRole('heading', { name: 'Codex community' }),
  });
  await expect(destination.getByText('Codex · Outages · Usage limits')).toBeVisible();

  const deliveries = await request.get(`${harnessUrl}/requests`);
  expect((await deliveries.json()).items).toHaveLength(1);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('heading', { name: 'Open the listening room.' }),
  ).toBeVisible();
  await page.getByLabel('Admin password').fill('tiboping-e2e-password');
  await page.getByRole('button', { name: 'Enter signal desk' }).click();
  await expect(page.getByRole('heading', { name: 'Signal report.' })).toBeVisible();

  const restart = await request.post(`${harnessUrl}/restart`);
  expect(restart.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Signal report.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Codex community' })).toBeVisible();
});

test('can switch a destination between everything and each category', async ({
  page,
  request,
}) => {
  await resetApplication(request, page);
  await finishSetup(page);
  const destination = page
    .locator('.destination-card')
    .filter({ hasText: 'Codex community' });

  await destination.getByRole('button', { name: 'Topics' }).click();
  await destination.getByRole('checkbox', { name: /Codex \+ releases/ }).check();
  await destination.getByRole('checkbox', { name: /^Outages/ }).check();
  await destination.getByRole('checkbox', { name: /Usage limits \+ resets/ }).check();
  await destination.getByRole('button', { name: 'Save routing' }).click();
  await expect(destination.getByText('Codex · Outages · Usage limits')).toBeVisible();

  await destination.getByRole('button', { name: 'Topics' }).click();
  await destination.getByRole('radio', { name: /Everything Tibo posts/ }).check();
  await destination.getByRole('button', { name: 'Save routing' }).click();
  await expect(destination.getByText('Everything', { exact: true })).toBeVisible();
});
