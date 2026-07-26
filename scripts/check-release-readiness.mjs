#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function assertIncludes(haystack, needle, context) {
  assert(
    haystack.includes(needle),
    `${context} must contain ${JSON.stringify(needle)} for release readiness.`,
  );
}

function assertNotIncludes(haystack, needle, context) {
  assert(
    !haystack.includes(needle),
    `${context} must not contain ${JSON.stringify(needle)} for release readiness.`,
  );
}

async function assertPngDimensions(relativePath, expectedWidth, expectedHeight) {
  const buffer = await readFile(resolve(root, relativePath));
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${relativePath} must be a PNG file.`,
  );
  assert.equal(buffer.readUInt32BE(16), expectedWidth, `${relativePath} width mismatch.`);
  assert.equal(buffer.readUInt32BE(20), expectedHeight, `${relativePath} height mismatch.`);
}

function assertPackageScripts() {
  const pkg = readJson('package.json');
  const expectedScripts = [
    'typecheck',
    'lint',
    'format:check',
    'test',
    'build',
    'catalog:check',
    'edge-fn:build:all',
    'test:e2e-production-guard',
    'release:check',
    'db:reset',
    'db:lint',
  ];

  for (const script of expectedScripts) {
    assert.equal(typeof pkg.scripts?.[script], 'string', `package.json must define ${script}.`);
  }
}

async function assertPwaInstallability() {
  const manifest = readJson('apps/web/public/manifest.webmanifest');
  assert.equal(manifest.name, 'Adaptive Workout');
  assert.equal(manifest.short_name, 'Workout');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#0b1120');
  assert.equal(manifest.theme_color, '#0b1120');

  const expectedIcons = [
    ['/icons/icon-192.png', '192x192', 'any', 192],
    ['/icons/icon-512.png', '512x512', 'any', 512],
    ['/icons/icon-maskable-192.png', '192x192', 'maskable', 192],
    ['/icons/icon-maskable-512.png', '512x512', 'maskable', 512],
  ];
  assert.equal(manifest.icons.length, expectedIcons.length);
  for (const [src, sizes, purpose, pixelSize] of expectedIcons) {
    assert(
      manifest.icons.some(
        (icon) =>
          icon.src === src &&
          icon.sizes === sizes &&
          icon.type === 'image/png' &&
          icon.purpose === purpose,
      ),
      `manifest must declare ${src} as ${sizes} ${purpose}.`,
    );
    await assertPngDimensions(`apps/web/public${src}`, pixelSize, pixelSize);
  }

  const indexHtml = readText('apps/web/index.html');
  assertIncludes(indexHtml, 'viewport-fit=cover', 'apps/web/index.html');
  assertIncludes(indexHtml, '<meta name="theme-color" content="#0b1120" />', 'apps/web/index.html');
  assertIncludes(
    indexHtml,
    '<meta name="mobile-web-app-capable" content="yes" />',
    'apps/web/index.html',
  );
  assertIncludes(
    indexHtml,
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    'apps/web/index.html',
  );
  assertIncludes(
    indexHtml,
    '<link rel="manifest" href="/manifest.webmanifest" />',
    'apps/web/index.html',
  );
  assertIncludes(
    indexHtml,
    '<link rel="apple-touch-icon" href="/icons/icon-192.png" />',
    'apps/web/index.html',
  );
}

function assertVercelPrerequisites() {
  const vercel = readJson('vercel.json');
  assert.equal(vercel.installCommand, 'npm ci');
  assert.equal(vercel.buildCommand, 'npm run build --workspace @adaptive-workout/web');
  assert.equal(vercel.outputDirectory, 'apps/web/dist');
  assert.equal(vercel.framework, null);

  const allHeaders = vercel.headers.flatMap((entry) => entry.headers);
  const header = (name) => allHeaders.find((item) => item.key === name)?.value;
  assert.equal(header('X-Content-Type-Options'), 'nosniff');
  assert.equal(header('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(header('X-Frame-Options'), 'DENY');
  assert.equal(header('Strict-Transport-Security'), 'max-age=63072000; includeSubDomains; preload');
  assertIncludes(header('Permissions-Policy') ?? '', 'camera=()', 'vercel.json Permissions-Policy');

  assert(
    vercel.redirects.some(
      (redirect) => redirect.destination === '/index.html' && redirect.statusCode === 200,
    ),
    'vercel.json must preserve SPA fallback to /index.html.',
  );
}

function assertOtpReadiness() {
  const signIn = readText('apps/web/src/auth/use-email-sign-in.ts');
  assertIncludes(signIn, 'signInWithOtp({', 'use-email-sign-in.ts');
  assertIncludes(signIn, 'shouldCreateUser: true', 'use-email-sign-in.ts');
  assertNotIncludes(signIn, 'emailRedirectTo', 'use-email-sign-in.ts');

  const verify = readText('apps/web/src/auth/verify-otp-utils.ts');
  assertIncludes(verify, "type: 'email'", 'verify-otp-utils.ts');
  assertIncludes(verify, 'token,', 'verify-otp-utils.ts');

  const client = readText('apps/web/src/auth/supabase-client.ts');
  assertIncludes(client, 'persistSession: true', 'supabase-client.ts');
  assertIncludes(client, 'autoRefreshToken: true', 'supabase-client.ts');
  assertIncludes(client, 'detectSessionInUrl: true', 'supabase-client.ts');
  assertNotIncludes(client, 'SUPABASE_SERVICE_ROLE_KEY', 'supabase-client.ts runtime code');
}

function assertProductionGuardReadiness() {
  const vite = readText('apps/web/vite.config.ts');
  assertIncludes(vite, "mode === 'production'", 'vite.config.ts');
  assertIncludes(vite, "process.env.VITE_E2E_AUTH === 'true'", 'vite.config.ts');

  const guard = readText('scripts/test-e2e-production-guard.mjs');
  assertIncludes(
    guard,
    'E2E auth seam must not be active in a production build.',
    'production guard',
  );
  assertIncludes(guard, 'createE2ESupabaseClient', 'production guard forbidden markers');
  assertIncludes(guard, 'e2e@adaptive-workout.test', 'production guard forbidden markers');
}

async function assertSupabasePrerequisites() {
  const config = readText('supabase/config.toml');
  assertIncludes(config, '[functions.generate-workout]', 'supabase/config.toml');
  assertIncludes(
    config,
    'entrypoint = "functions/generate-workout/index.bundle.ts"',
    'supabase/config.toml',
  );
  assertIncludes(config, '[functions.refresh-progression]', 'supabase/config.toml');
  assertIncludes(
    config,
    'entrypoint = "functions/refresh-progression/index.bundle.ts"',
    'supabase/config.toml',
  );
  assertIncludes(config, '[functions.generate-program]', 'supabase/config.toml');
  assertIncludes(
    config,
    'entrypoint = "functions/generate-program/index.bundle.ts"',
    'supabase/config.toml',
  );
  assert.equal((config.match(/verify_jwt = false/g) ?? []).length, 3);

  const functionNames = ['generate-workout', 'refresh-progression', 'generate-program'];
  for (const functionName of functionNames) {
    const bundle = readText(`supabase/functions/${functionName}/index.bundle.ts`);
    assertIncludes(
      bundle,
      'Generated by scripts/build-edge-function.mjs',
      `${functionName} bundle`,
    );
  }

  const migrations = (await readdir(resolve(root, 'supabase/migrations'))).filter((file) =>
    file.endsWith('.sql'),
  );
  assert.equal(migrations.length, 14, 'local migration count must match CI expectation.');

  const workflow = readText('.github/workflows/ci.yml');
  assertIncludes(workflow, 'npx supabase db reset --local', 'CI database job');
  assertIncludes(
    workflow,
    'npx supabase db lint --local --level warning --fail-on warning',
    'CI database job',
  );
  assertIncludes(workflow, 'npx supabase test db', 'CI database job');
}

function assertSecretsAreNotTracked() {
  const envExample = readText('.env.example');
  for (const line of envExample.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [key, value = ''] = line.split('=');
    assert(key, '.env.example entries must have keys.');
    assert.equal(value, '', `.env.example ${key} must remain an empty placeholder.`);
  }

  const gitignore = readText('.gitignore');
  assertIncludes(gitignore, '.env', '.gitignore');
  assertIncludes(gitignore, '.env.*', '.gitignore');
  assertIncludes(gitignore, '!.env.example', '.gitignore');
}

function assertReleaseDocsAndCi() {
  const checklist = readText('docs/RELEASE_CHECKLIST.md');
  assertIncludes(checklist, '## Automated release-readiness checks', 'release checklist');
  assertIncludes(checklist, '## Manual human gates', 'release checklist');
  assertIncludes(checklist, 'Do not deploy from STAB-005.', 'release checklist');

  const plan = readText('docs/IMPLEMENTATION_PLAN.md');
  assertIncludes(plan, '| STAB-005', 'implementation plan');

  const workflow = readText('.github/workflows/ci.yml');
  assertIncludes(workflow, 'npm run release:check', 'CI quality job');
}

async function main() {
  assertPackageScripts();
  await assertPwaInstallability();
  assertVercelPrerequisites();
  assertOtpReadiness();
  assertProductionGuardReadiness();
  await assertSupabasePrerequisites();
  assertSecretsAreNotTracked();
  assertReleaseDocsAndCi();

  console.log('release readiness static check passed');
}

await main();
