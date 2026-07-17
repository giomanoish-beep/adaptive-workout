import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const generateSource = readFileSync(
  join(root, 'supabase', 'functions', 'generate-workout', 'index.ts'),
  'utf8',
);
const refreshSource = readFileSync(
  join(root, 'supabase', 'functions', 'refresh-progression', 'index.ts'),
  'utf8',
);
const progressionSource = readFileSync(
  join(root, 'packages', 'progression-orchestrator', 'src', 'orchestrator.ts'),
  'utf8',
);

describe('production Edge Function RLS wiring', () => {
  it('forwards the verified bearer token to generate-workout database reads', () => {
    expect(generateSource).toContain('global: { headers: { Authorization: `Bearer ${accessToken}` } }');
    expect(generateSource).toContain('createSupabaseCatalogLoader(supabaseUrl, anonKey, token)');
    expect(generateSource).toContain('createSupabaseProfileLoader(supabaseUrl, anonKey, token)');
  });

  it('maps the deployed training profile column names', () => {
    expect(generateSource).toContain("row['training_frequency']");
    expect(generateSource).toContain("row['training_environment']");
    expect(generateSource).not.toContain("row['frequency']");
    expect(generateSource).not.toContain("row['environment']");
  });

  it('forwards the verified bearer token to progression history reads', () => {
    expect(refreshSource).toContain('global: { headers: { Authorization: `Bearer ${token}` } }');
    expect(refreshSource).toContain('anonClient: userClient');
  });

  it('does not log raw database error messages', () => {
    expect(progressionSource).not.toContain("console.error('Decision persistence failed:', error.message)");
    expect(progressionSource).not.toContain('metadata: { errorMessage: message }');
  });
});
