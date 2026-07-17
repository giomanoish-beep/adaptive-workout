/**
 * PWA SMOKE CHECKS
 *
 * Validates basic PWA manifest and service worker registration.
 * Does not test full offline support — only verifies the manifest
 * is reachable, icons are declared, display is standalone, and
 * service worker registration does not crash.
 */

import { test, expect } from '@playwright/test';

test.describe('PWA — smoke checks', () => {
  test('manifest is reachable and contains required fields', async ({
    page,
  }) => {
    // Navigate to the app root to ensure the manifest link is in the DOM
    await page.goto('/');

    // Read the manifest from the link tag
    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');

    expect(manifestHref).toBeTruthy();

    // Fetch and validate the manifest
    const fullUrl = manifestHref!.startsWith('http')
      ? manifestHref! : `http://localhost:5173${manifestHref}`;

    const response = await page.request.get(fullUrl);
    expect(response.ok()).toBeTruthy();

    const manifest = await response.json();

    // Required PWA fields
    expect(manifest.name).toBe('Adaptive Workout');
    expect(manifest.short_name).toBe('Workout');
    expect(manifest.description).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.icons[0].src).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(
      manifest.background_color || manifest.theme_color,
    ).toBeTruthy();
    expect(manifest.theme_color).toBeTruthy();

    const expectedIcons = [
      ['/icons/icon-192.png', 192, 'any'],
      ['/icons/icon-512.png', 512, 'any'],
      ['/icons/icon-maskable-192.png', 192, 'maskable'],
      ['/icons/icon-maskable-512.png', 512, 'maskable'],
    ] as const;
    expect(manifest.icons).toHaveLength(expectedIcons.length);
    for (const [src, size, purpose] of expectedIcons) {
      expect(manifest.icons).toContainEqual({
        src,
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose,
      });
      const iconResponse = await page.request.get(`http://localhost:5173${src}`);
      expect(iconResponse.ok()).toBeTruthy();
      const icon = await iconResponse.body();
      expect([...icon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(icon.readUInt32BE(16)).toBe(size);
      expect(icon.readUInt32BE(20)).toBe(size);
    }
  });

  test('service worker registration does not crash the app', async ({
    page,
  }) => {
    // Navigate to the app and check for console errors during SW registration
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // No uncaught errors
    expect(errors.length).toBe(0);

    // If a service worker is registered, querying it must not throw. SW
    // registration itself is optional at this stage; the check is that the
    // SW API can be probed without crashing the page.
    const swProbeOk = await page.evaluate(async () => {
      try {
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.getRegistration();
        }
        return true;
      } catch {
        return false;
      }
    });
    expect(swProbeOk).toBe(true);
  });
});
