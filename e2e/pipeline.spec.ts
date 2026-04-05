import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'cube.3mf');
const PAINTED_FIXTURE = path.join(__dirname, 'fixtures', 'painted-cylinder.3mf');

test.describe('Pipeline integration', () => {
    test('upload triggers auto-processing and shows output stats', async ({
        page,
    }) => {
        await page.goto('/');
        const fileInput = page.locator('input[type="file"][accept=".3mf,.stl"]');
        await fileInput.setInputFiles(FIXTURE);

        // Wait for processing to complete — output stats section appears
        await expect(page.getByText('Output')).toBeVisible({ timeout: 30000 });
        await expect(page.getByText(/Faces/)).toBeVisible();
        await expect(page.getByText(/Layers/)).toBeVisible();
    });

    test('download button becomes enabled after processing', async ({
        page,
    }) => {
        await page.goto('/');
        const fileInput = page.locator('input[type="file"][accept=".3mf,.stl"]');
        await fileInput.setInputFiles(FIXTURE);

        const btn = page.getByRole('button', { name: /download/i });
        await expect(btn).toBeEnabled({ timeout: 30000 });
    });

    test('processing status shows Done after completion', async ({ page }) => {
        await page.goto('/');
        const fileInput = page.locator('input[type="file"][accept=".3mf,.stl"]');
        await fileInput.setInputFiles(FIXTURE);

        await expect(page.getByText('Done')).toBeVisible({ timeout: 30000 });
    });
});

test.describe('Pipeline — parallel worker path', () => {
    // painted-cylinder.3mf has 256 painted side faces spanning layers,
    // which exceeds the 100-boundary-face threshold for Web Worker parallelism.
    test('processes painted mesh with boundary splitting via workers', async ({
        page,
    }) => {
        await page.goto('/');
        const fileInput = page.locator('input[type="file"][accept=".3mf,.stl"]');
        await fileInput.setInputFiles(PAINTED_FIXTURE);

        // Wait for processing to complete
        await expect(page.getByText('Done')).toBeVisible({ timeout: 60000 });
        await expect(page.getByText('Output')).toBeVisible();
        await expect(page.getByRole('button', { name: /download/i })).toBeEnabled();
    });
});
