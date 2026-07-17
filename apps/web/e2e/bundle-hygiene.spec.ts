/**
 * HARDENING-003: Deterministic bundle hygiene checks.
 *
 * Inspects the production build output:
 *  - No server-only AI provider package identifiers in browser bundle
 *  - No service-role or API provider secret identifiers
 *  - JS and CSS assets respect provisional size thresholds
 */

import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST_ASSETS = join(import.meta.dirname, '..', 'dist', 'assets');

function getAssetFiles(): string[] {
  try {
    return readdirSync(DIST_ASSETS).filter(
      (f) => f.endsWith('.js') || f.endsWith('.js.map'),
    );
  } catch {
    return [];
  }
}

function readAllJsContent(): string {
  return getAssetFiles()
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      try {
        return readFileSync(join(DIST_ASSETS, f), 'utf-8');
      } catch {
        return '';
      }
    })
    .join('\n');
}


test.describe('HARDENING-003 — bundle hygiene', () => {
  test('production browser assets contain no service-role or API provider secret identifiers', () => {
    const content = readAllJsContent();
    if (!content) {
      // Build may not exist; skip assertion with a descriptive message
      test.skip(
        !content,
        'No production build found — run `npm run build --workspace @adaptive-workout/web` first',
      );
      return;
    }

    const forbidden = [
      'service_role',
      'service-role',
      'ZAI_API_KEY',
      'DEEPSEEK_API_KEY',
      'supabase_service_role',
    ];

    for (const secret of forbidden) {
      expect(content).not.toContain(secret);
    }
  });

  test('browser bundle does not contain server-only AI provider package identifiers', () => {
    const content = readAllJsContent();
    if (!content) {
      test.skip(!content, 'No production build found');
      return;
    }

    // These package identifiers should not appear in browser bundle
    const serverOnlyPackages = [
      '@adaptive-workout/ai-deepseek-provider',
      '@adaptive-workout/ai-glm-provider',
      '@adaptive-workout/ai-router',
      'ai-deepseek-provider',
      'ai-glm-provider',
      'ai-router',
    ];

    for (const pkg of serverOnlyPackages) {
      expect(content).not.toContain(pkg);
    }
  });

  test('emitted JS assets respect provisional size threshold (500 KiB uncompressed)', () => {
    const files = getAssetFiles().filter((f) => f.endsWith('.js'));
    if (files.length === 0) {
      test.skip(true, 'No production build found');
      return;
    }

    for (const file of files) {
      const stat = statSync(join(DIST_ASSETS, file));
      const sizeKib = stat.size / 1024;
      expect(sizeKib).toBeLessThanOrEqual(500);
    }
  });

  test('emitted CSS assets respect provisional size threshold (150 KiB uncompressed)', () => {
    const cssFiles = readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.css'));
    if (cssFiles.length === 0) {
      test.skip(true, 'No production build found');
      return;
    }

    for (const file of cssFiles) {
      const stat = statSync(join(DIST_ASSETS, file));
      const sizeKib = stat.size / 1024;
      expect(sizeKib).toBeLessThanOrEqual(150);
    }
  });

  test('no hardcoded API key value appears in bundle', () => {
    const content = readAllJsContent();
    if (!content) {
      test.skip(!content, 'No production build found');
      return;
    }

    // Check for common key patterns (the presence of actual values, not env var names)
    const keyPatterns = [
      /sk-[A-Za-z0-9]{20,}/, // OpenAI-style keys
      /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, // JWT tokens
      /sbp_[A-Za-z0-9]{20,}/, // Supabase service role keys
    ];

    for (const pattern of keyPatterns) {
      expect(content).not.toMatch(pattern);
    }
  });

  test('no observability server integrations pull AI/server packages into web', () => {
    const content = readAllJsContent();
    if (!content) {
      test.skip(!content, 'No production build found');
      return;
    }

    // Observability package should not import AI packages
    const observabilityServerImports = [
      '@adaptive-workout/ai',
      '@adaptive-workout/ai-deepseek-provider',
      '@adaptive-workout/ai-glm-provider',
    ];

    for (const pkg of observabilityServerImports) {
      expect(content).not.toContain(pkg);
    }
  });
});