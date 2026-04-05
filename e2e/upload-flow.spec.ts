import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'cube.3mf');

test.describe('Upload flow', () => {
    test('upload valid 3MF shows file name and stats', async ({ page }) => {
        await page.goto('/');

        // Upload via the hidden file input
        const fileInput = page.locator('input[type="file"][accept=".3mf,.stl"]');
        await fileInput.setInputFiles(FIXTURE);

        // File name should appear
        await expect(page.getByText('cube.3mf')).toBeVisible({
            timeout: 10000,
        });

        // Face stats should appear in the upload area
        await expect(page.getByText(/\d+ faces · click to replace/)).toBeVisible();
    });

    test('upload valid 3MF shows 3D canvas', async ({ page }) => {
        await page.goto('/');
        const fileInput = page.locator('input[type="file"][accept=".3mf,.stl"]');
        await fileInput.setInputFiles(FIXTURE);

        // Wait for canvas to appear (Three.js renders into <canvas>)
        await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });
    });

    test('upload valid 3MF shows filament list', async ({ page }) => {
        await page.goto('/');
        const fileInput = page.locator('input[type="file"][accept=".3mf,.stl"]');
        await fileInput.setInputFiles(FIXTURE);

        await expect(page.getByText('Filaments')).toBeVisible({ timeout: 10000 });
    });
});
