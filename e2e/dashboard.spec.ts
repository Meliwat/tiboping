import { expect, test } from '@playwright/test';

import { finishSetup, harnessUrl, resetApplication } from './helpers.js';

test('emits a real fixture and manages destination lifecycle', async ({
  page,
  request,
}) => {
  await resetApplication(request, page);
  await finishSetup(page);

  await page.getByRole('button', { name: 'multi category' }).click();
  await expect(page.getByText(/entered the delivery pipeline/)).toBeVisible();
  await expect(page.getByText(/Codex is degraded while we repair/)).toBeVisible();

  const destination = page
    .locator('.destination-card')
    .filter({ hasText: 'Codex community' });
  await destination.getByRole('button', { name: 'Test' }).click();
  await expect(destination.getByText('Test acknowledged.')).toBeVisible();
  await destination.getByRole('button', { name: 'Pause' }).click();
  await expect(destination.getByText('paused', { exact: true })).toBeVisible();
  await destination.getByRole('button', { name: 'Resume' }).click();
  await expect(destination.getByText('active', { exact: true })).toBeVisible();
  await destination.getByRole('button', { name: 'Secret' }).click();
  await expect(page.getByLabel('New signing secret')).toBeVisible();

  await destination.getByRole('button', { name: 'Delete' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Delete Codex community?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete destination' }).click();
  await expect(page.getByText('No destinations connected')).toBeVisible();
});

test('recovers a permanently failed delivery after endpoint repair', async ({
  page,
  request,
}) => {
  await resetApplication(request, page);
  await finishSetup(page);

  await page.getByRole('button', { name: 'Add destination' }).click();
  const form = page.locator('.dashboard-add-destination');
  await form.getByRole('radio', { name: /Generic/ }).check();
  await form.getByLabel('Display name').fill('Failing receiver');
  await form.getByLabel('Webhook endpoint').fill(`${harnessUrl}/fail`);
  await form.getByRole('button', { name: 'Save destination' }).click();

  await page.getByRole('button', { name: 'outage' }).click();
  const failedDestination = page
    .locator('.destination-card')
    .filter({ hasText: 'Failing receiver' });
  await expect(failedDestination.getByText(/Paused: endpoint-rejected/)).toBeVisible();

  expect((await request.post(`${harnessUrl}/recover`)).ok()).toBeTruthy();
  await failedDestination.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('link', { name: 'Deliveries' }).click();
  const failedRow = page.locator('tr').filter({ hasText: 'Failing receiver' });
  await expect(failedRow.getByText('failed', { exact: true })).toBeVisible();
  await failedRow.getByRole('button', { name: 'Retry' }).click();
  await expect(failedRow.getByText('pending', { exact: true })).toBeVisible();
  await page.waitForTimeout(1_200);
  await page.reload();
  await expect(
    page.locator('tr').filter({ hasText: 'Failing receiver' }).getByText('delivered', {
      exact: true,
    }),
  ).toBeVisible();
});
