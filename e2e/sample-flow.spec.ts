import { test, expect } from '@playwright/test';

test.describe('Sample gallery flow', () => {
    test('"try a sample" opens picker and loads a sample', async ({ page }) => {
        await page.goto('/');

        // The "try a sample" link should be visible in the empty upload state
        const sampleLink = page.getByRole('button', { name: /try a sample/i });
        await expect(sampleLink).toBeVisible();

        // Click to open the sample picker dialog
        await sampleLink.click();

        // The dialog heading should appear
        const heading = page.getByRole('heading', { name: /try a sample/i });
        await expect(heading).toBeVisible();

        // Click the first sample (Benchy – Cyclic)
        await page.getByText('Benchy – Cyclic').click();

        // Wait for the sample to load — file stats should appear
        await expect(page.getByText(/faces · click to replace/)).toBeVisible({ timeout: 15000 });

        // The 3D canvas should render
        await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });
    });

    test('sample picker can be closed via close button', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: /try a sample/i }).click();
        await expect(page.getByRole('heading', { name: /try a sample/i })).toBeVisible();

        // Close via the X button
        await page.getByRole('button', { name: /close/i }).click();

        // Dialog should disappear
        await expect(page.getByRole('heading', { name: /try a sample/i })).not.toBeVisible();
    });

    test('sample picker can be closed via Escape key', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: /try a sample/i }).click();
        await expect(page.getByRole('heading', { name: /try a sample/i })).toBeVisible();

        // Press Escape
        await page.keyboard.press('Escape');

        // Dialog should disappear
        await expect(page.getByRole('heading', { name: /try a sample/i })).not.toBeVisible();
    });
});
