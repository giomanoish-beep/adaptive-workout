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
    'android:build',
    'android:test:device',
  ];

  for (const script of expectedScripts) {
    assert.equal(typeof pkg.scripts?.[script], 'string', `package.json must define ${script}.`);
  }
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

function assertDeepSeekProviderReadiness() {
  const contracts = readText('packages/ai-deepseek-provider/src/contracts.ts');
  assertIncludes(
    contracts,
    "deepseekDefaultModelId = 'deepseek-v4-flash'",
    'DeepSeek provider contracts',
  );
  assertIncludes(
    contracts,
    "deepseekDefaultBaseUrl = 'https://api.deepseek.com'",
    'DeepSeek provider contracts',
  );
  assertIncludes(contracts, "readonly thinking: { readonly type: 'disabled' }", 'DeepSeek payload');

  const environment = readText('packages/ai-deepseek-provider/src/environment.ts');
  assertIncludes(environment, 'DEEPSEEK_API_KEY', 'DeepSeek environment factory');
  assertIncludes(environment, 'DEEPSEEK_BASE_URL', 'DeepSeek environment factory');
  assertIncludes(environment, 'DEEPSEEK_MODEL', 'DeepSeek environment factory');
  assertIncludes(
    environment,
    'createDeepSeekProviderFromEnvironment',
    'DeepSeek environment factory',
  );

  const transport = readText('packages/ai-deepseek-provider/src/http-transport.ts');
  assertIncludes(transport, 'response_format: payload.responseFormat', 'DeepSeek HTTP transport');
  assertIncludes(transport, 'thinking: payload.thinking', 'DeepSeek HTTP transport');
  assertIncludes(transport, 'retryableStatusCodes = new Set([429, 500, 503])', 'DeepSeek retries');
  assertIncludes(transport, 'response.status === 402', 'DeepSeek HTTP status handling');
  assertIncludes(transport, "finishReason === 'length'", 'DeepSeek truncated-output handling');

  const handlers = [
    'packages/ai-workout-intent/src/deepseek-handler.ts',
    'packages/ai-discomfort-extraction/src/deepseek-handler.ts',
    'packages/ai-decision-explanation/src/deepseek-handler.ts',
  ];
  for (const handler of handlers) {
    const source = readText(handler);
    assertIncludes(source, 'deepseekDefaultModelId', handler);
    assertIncludes(source, "responseFormat: { type: 'json_object' }", handler);
    assertIncludes(source, "thinking: { type: 'disabled' }", handler);
  }
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

async function readDirectoryText(relativeDirectory) {
  const directory = resolve(root, relativeDirectory);
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const chunks = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = resolve(entry.parentPath, entry.name);
    if (!/\.(?:css|html|js|json|webmanifest)$/u.test(path)) continue;
    chunks.push(await readFile(path, 'utf8'));
  }
  return chunks.join('\n');
}

async function assertProductionAiFlowReadiness() {
  const index = readText('supabase/functions/generate-workout/index.ts');
  assertIncludes(index, 'createProductionDecisionExplainer', 'generate-workout Edge Function');
  assertIncludes(index, 'env: Deno.env', 'generate-workout Edge Function');
  assertIncludes(index, 'decisionExplainer', 'generate-workout Edge Function');

  const explainer = readText('supabase/functions/generate-workout/ai-explainer.ts');
  assertIncludes(
    explainer,
    'createDeepSeekProviderFromEnvironment',
    'generate-workout AI explainer',
  );
  assertIncludes(
    explainer,
    "registerDeepSeekTaskHandler('grounded_decision_explanation'",
    'generate-workout AI explainer',
  );
  assertIncludes(
    explainer,
    "registerGlmTaskHandler('grounded_decision_explanation'",
    'generate-workout AI explainer',
  );
  assertIncludes(explainer, 'defaultAiRoutingRuleSet', 'generate-workout AI explainer');
  assertIncludes(explainer, 'ZAI_API_KEY', 'generate-workout AI explainer');

  const bundle = readText('supabase/functions/generate-workout/index.bundle.ts');
  assertIncludes(bundle, 'createDeepSeekProviderFromEnvironment', 'generate-workout bundle');
  assertIncludes(bundle, 'grounded_decision_explanation', 'generate-workout bundle');
  assertIncludes(bundle, 'deepseek-v4-flash', 'generate-workout bundle');
  assertIncludes(bundle, 'DEEPSEEK_API_KEY', 'generate-workout bundle');
  assertIncludes(bundle, 'thinking:', 'generate-workout bundle');

  const browserSource = [
    readText('apps/web/src/workout/workout-review.ts'),
    readText('apps/web/src/workout/WorkoutReview.tsx'),
    readText('apps/web/src/workout/workout-generation-gateway.ts'),
  ].join('\n');
  for (const forbidden of [
    '@adaptive-workout/ai-deepseek-provider',
    '@adaptive-workout/ai-glm-provider',
    '@adaptive-workout/ai-router',
    '@adaptive-workout/ai-decision-explanation',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_MODEL',
  ]) {
    assertNotIncludes(browserSource, forbidden, 'browser workout AI boundary');
  }

  const browserBundle = await readDirectoryText('apps/web/dist');
  for (const forbidden of [
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_MODEL',
    '@adaptive-workout/ai-deepseek-provider',
    '@adaptive-workout/ai-glm-provider',
    '@adaptive-workout/ai-router',
    '@adaptive-workout/ai-decision-explanation',
    'createDeepSeekProviderFromEnvironment',
    'deepseek-v4-flash',
  ]) {
    assertNotIncludes(browserBundle, forbidden, 'browser production bundle');
  }
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

  assertIncludes(envExample, 'DEEPSEEK_API_KEY=', '.env.example');
  assertIncludes(envExample, 'DEEPSEEK_BASE_URL=', '.env.example');
  assertIncludes(envExample, 'DEEPSEEK_MODEL=', '.env.example');
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
  assertOtpReadiness();
  assertProductionGuardReadiness();
  assertDeepSeekProviderReadiness();
  await assertSupabasePrerequisites();
  await assertProductionAiFlowReadiness();
  assertSecretsAreNotTracked();
  assertReleaseDocsAndCi();

  console.log('release readiness static check passed');
}

await main();
