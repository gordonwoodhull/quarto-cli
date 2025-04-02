import { test, expect } from '@playwright/test';

async function check_red_blue(page) {
  const locatr = await page.locator('body').first();
  await expect(locatr).toHaveClass('fullcontent quarto-dark');
  await expect(locatr).toHaveCSS('background-color', 'rgb(66, 7, 11)');
  await page.locator("a.quarto-color-scheme-toggle").click();
  const locatr2 = await page.locator('body').first();
  await expect(locatr2).toHaveCSS('background-color', 'rgb(204, 221, 255)');
}

test.use({
  colorScheme: 'dark'
});

// brands used in these documents have background colors

test('Dark and light brand after user themes', async ({ page }) => {
  // brand overrides theme background color
  await page.goto('./html/dark-brand/brand-after-theme.html');
  await check_red_blue(page);
});

// project tests

test('Project specifies dark and light brands', async ({ page }) => {
  await page.goto('./html/dark-brand/project-light-dark/simple.html');
  await check_red_blue(page);
});


test('Project specifies dark and light brands and respect-user-color-scheme', async ({ page }) => {
  await page.goto('./html/dark-brand/project-light-dark/simple-respect-color-scheme.html');
  await check_red_blue(page);
});
