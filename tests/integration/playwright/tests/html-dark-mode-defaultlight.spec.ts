import { test, expect } from '@playwright/test';

async function check_blue_red(page) {
  const locatr = await page.locator('body').first();
  await expect(locatr).toHaveClass('fullcontent quarto-light');
  await expect(locatr).toHaveCSS('background-color', 'rgb(204, 221, 255)');
  await page.locator("a.quarto-color-scheme-toggle").click();
  const locatr2 = await page.locator('body').first();
  await expect(locatr2).toHaveCSS('background-color', 'rgb(66, 7, 11)');
}

test.use({
  colorScheme: 'light'
});

// brands used in these documents have background colors

test('Dark and light brand after user themes', async ({ page }) => {
  // brand overrides theme background color
  await page.goto('./html/dark-brand/brand-after-theme.html');
  await check_blue_red(page);
});

// project tests

test('Project specifies dark and light brands', async ({ page }) => {
  await page.goto('./html/dark-brand/project-light-dark/simple.html');
  await check_blue_red(page);
});
