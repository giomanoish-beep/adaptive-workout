import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = resolve(root, 'apps/web');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const output = await mkdtemp(join(tmpdir(), 'adaptive-workout-production-guard-'));
const forbidden = [
  '__E2E_STORE__',
  '__E2E_SEED__',
  'createE2ESupabaseClient',
  'e2e-mock-token',
  'e2e@adaptive-workout.test',
];

function build(env) {
  return spawnSync(
    process.execPath,
    [vite, 'build', '--mode', 'production', '--outDir', output, '--emptyOutDir'],
    { cwd: webRoot, env, encoding: 'utf8' },
  );
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else files.push(path);
  }
  return files;
}

try {
  const productionEnv = { ...process.env };
  delete productionEnv.VITE_E2E_AUTH;
  const normalBuild = build(productionEnv);
  assert.equal(
    normalBuild.status,
    0,
    `normal production build failed:\n${normalBuild.stdout}\n${normalBuild.stderr}`,
  );

  const emittedFiles = await filesBelow(output);
  for (const path of emittedFiles.filter((file) => /\.(?:html|js|css)$/.test(file))) {
    const content = await readFile(path, 'utf8');
    for (const marker of forbidden) {
      assert(!content.includes(marker), `${marker} leaked into ${path}`);
    }
  }

  const guardedBuild = build({ ...process.env, VITE_E2E_AUTH: 'true' });
  assert.notEqual(
    guardedBuild.status,
    0,
    'production build unexpectedly accepted VITE_E2E_AUTH=true',
  );
  assert(
    `${guardedBuild.stdout}\n${guardedBuild.stderr}`.includes(
      'E2E auth seam must not be active in a production build.',
    ),
    'production build failed for an unexpected reason',
  );

  console.log('production E2E seam guard passed: adapter absent and flagged builds rejected');
} finally {
  await rm(output, { recursive: true, force: true });
}
