import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
    test('app loads with title and heading', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Full Spectrum/);
        await expect(page.locator('h1')).toHaveText('Full Spectrum');
    });

    test('upload drop zone is visible', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Drop a .3mf file here')).toBeVisible();
    });

    test('download button is initially disabled', async ({ page }) => {
        await page.goto('/');
        const btn = page.getByRole('button', { name: /download/i });
        await expect(btn).toBeDisabled();
    });

    test('settings section renders', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Settings')).toBeVisible();
        await expect(page.getByText('Layer height')).toBeVisible();
    });

    test('config section renders with export/import', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Import' })).toBeVisible();
    });

    test('processing status shows Ready', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('Ready')).toBeVisible();
    });
});
