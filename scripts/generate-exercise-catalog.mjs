import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionExerciseCatalogSeedSql } from '../packages/domain/dist/index.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(
  repositoryRoot,
  'supabase/migrations/20260714121000_seed_initial_exercise_catalog.sql',
);
const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  const currentSql = await readFile(outputPath, 'utf8');

  if (currentSql !== productionExerciseCatalogSeedSql) {
    throw new Error('Generated exercise catalog migration is out of date.');
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, productionExerciseCatalogSeedSql, 'utf8');
}
