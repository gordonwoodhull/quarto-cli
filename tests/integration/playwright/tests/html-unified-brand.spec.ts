import { test, expect } from '@playwright/test';

test('Light brand in file', async ({ page }) => {
  await page.goto('./html/unified-brand/light-brand-only-file.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(0);
});

test('Light brand inline', async ({ page }) => {
  await page.goto('./html/unified-brand/light-brand-only-inline.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(0);
});

test('Dark brand in file', async ({ page }) => {
  await page.goto('./html/unified-brand/dark-brand-only-file.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(1);
});

test('Dark brand inline', async ({ page }) => {
  await page.goto('./html/unified-brand/light-dark-brand.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(1);
});

test('Light and dark brand files', async ({ page }) => {
  await page.goto('./html/unified-brand/light-dark-brand-file.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(1);
});

test('Light and dark brands inline', async ({ page }) => {
  await page.goto('./html/unified-brand/light-dark-brand.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(1);
});

test('Unified light and dark brand file', async ({ page }) => {
  await page.goto('./html/unified-brand/unified-colors-file.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(1);
});

test('Unified light and dark brand inline', async ({ page }) => {
  await page.goto('./html/unified-brand/unified-colors.html');
  expect(await page.locator('a.quarto-color-scheme-toggle').count()).toEqual(1);
});
