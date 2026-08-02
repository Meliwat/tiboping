import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const harnessUrl = 'http://127.0.0.1:3999';
export const webhookUrl = `${harnessUrl}/webhook`;

export const resetApplication = async (request: APIRequestContext, page?: Page) => {
  const response = await request.post(`${harnessUrl}/reset`);
  expect(response.ok(), await response.text()).toBeTruthy();
  if (page) {
    await page.context().clearCookies();
    await page.goto('/');
  }
};

export const login = async (page: Page) => {
  await page.goto('/');
  await page.getByLabel('Admin password').fill('tiboping-e2e-password');
  await page.getByRole('button', { name: 'Enter signal desk' }).click();
};

export const finishSetup = async (
  page: Page,
  routing: 'everything' | 'all-categories' = 'everything',
) => {
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Your demo transmitter is ready.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue to destination' }).click();
  await page.getByRole('radio', { name: /Generic/ }).check();
  await page.getByLabel('Display name').fill('Codex community');
  await page.getByLabel('Webhook endpoint').fill(webhookUrl);
  await page.getByRole('button', { name: 'Save destination' }).click();

  await expect(
    page.getByRole('heading', { name: 'What counts as signal?' }),
  ).toBeVisible();
  if (routing === 'all-categories') {
    await page.getByRole('checkbox', { name: /Codex \+ releases/ }).check();
    await page.getByRole('checkbox', { name: /^Outages/ }).check();
    await page.getByRole('checkbox', { name: /Usage limits \+ resets/ }).check();
  }
  await page.getByRole('button', { name: 'Save topics' }).click();
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByText('Destination acknowledged the ping.')).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'Activate monitoring' }).click();
  await expect(page.getByRole('heading', { name: 'Signal report.' })).toBeVisible();
};
