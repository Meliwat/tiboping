import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { finishSetup, login, resetApplication } from './helpers.js';

const expectNoSeriousViolations = async (page: Page) => {
  const loginPanel = page.locator('.login-panel__content');
  if ((await loginPanel.count()) > 0) {
    await expect(loginPanel).toHaveCSS('opacity', '1');
  }
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);
};

test('login, setup, and dashboard have no serious automated violations', async ({
  page,
  request,
}) => {
  await resetApplication(request, page);
  await page.goto('/');
  await expectNoSeriousViolations(page);

  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Your demo transmitter is ready.' }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Continue to destination' }).click();
  await page.getByRole('radio', { name: /Generic/ }).check();
  await page.getByLabel('Display name').fill('Codex community');
  await page.getByLabel('Webhook endpoint').fill('http://127.0.0.1:3999/webhook');
  await page.getByRole('button', { name: 'Save destination' }).click();
  await page.getByRole('button', { name: 'Save topics' }).click();
  await page.getByRole('button', { name: 'Send test notification' }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'Activate monitoring' }).click();
  await expect(page.getByRole('heading', { name: 'Signal report.' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('core login and navigation work from the keyboard', async ({ page, request }) => {
  await resetApplication(request, page);
  await page.goto('/');
  await expect(page.getByLabel('Admin password')).toBeFocused();
  await page.keyboard.type('tiboping-e2e-password');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enter signal desk' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Your demo transmitter is ready.' }),
  ).toBeVisible();

  await resetApplication(request, page);
  await finishSetup(page);
  await page.getByRole('link', { name: 'Posts' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Every observed post.' })).toBeVisible();
});
