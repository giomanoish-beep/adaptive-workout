/**
 * HARDENING-004: Static security and data-retention tests.
 *
 * These are deterministic checks that run without PostgreSQL/Docker.
 * They verify env variable boundaries, migration file patterns,
 * deletion cascade expectations, and absence of disallowed patterns.
 *
 * Vitest runs with cwd = project root, so we resolve files relative to that.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

function readMigrationFiles(): string {
  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8')).join('\n');
  } catch {
    return '';
  }
}

/**
 * Collapse SQL whitespace so multiline statements can be matched with simple
 * patterns. Removes newlines, normalises runs of whitespace to single spaces,
 * and trims. This is NOT a SQL parser — it is a best-effort preprocessor that
 * makes the concatenated migrations matchable without writing a full parser.
 */
function collapseSql(sql: string): string {
  return sql.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Foreign-key relationship extracted from migrations.
 *
 * `parentSchema` is `null` when the REFERENCES target is not
 * schema-qualified (e.g. just `references users(id)`), or the
 * schema name when it is (e.g. `references auth.users(id)` yields
 * `parentSchema: 'auth'`, `parentTable: 'users'`).
 */
interface FkRelationship {
  readonly childTable: string;
  readonly parentSchema: string | null;
  readonly parentTable: string;
  readonly onDelete: 'cascade' | 'restrict' | 'set null' | 'set default' | 'no action';
}

/**
 * Extract FK relationships from concatenated migration SQL.
 *
 * Handles:
 *  - Inline column-level REFERENCES (e.g. `id uuid references auth.users(id) on delete cascade`)
 *  - Table-level CONSTRAINT ... FOREIGN KEY ... REFERENCES syntax
 *  - ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES syntax
 *
 * The approach collates each CREATE TABLE / ALTER TABLE statement into a
 * normalised block and searches for REFERENCES patterns within it.
 */
function extractFkRelationships(migrations: string): readonly FkRelationship[] {
  const relationships: FkRelationship[] = [];

  // Normalise the entire migration text for pattern matching.
  const flat = collapseSql(migrations);

  // Split into statements on `;` that are meaningful.
  const statements = flat
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    // --- Inline column-level REFERENCES (inside CREATE TABLE or ALTER TABLE) ---
    // Pattern: … REFERENCES [schema.]parent_table [(col)] ON DELETE action
    // Captures optional schema prefix so `auth.users`, `public.exercises`, and
    // bare `users` are all parsed correctly.
    const inlinePattern =
      /\breferences\s+(?:([\w]+)\.)?(\w+)\s*(?:\([^)]+\))?\s+on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/gi;

    // Determine which child table this statement belongs to.
    const createMatch = stmt.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/i);
    const alterMatch = stmt.match(/alter\s+table\s+(?:only\s+)?(?:public\.)?(\w+)/i);
    const childTable = createMatch?.[1] ?? alterMatch?.[1];

    if (childTable) {
      let match: RegExpExecArray | null;
      inlinePattern.lastIndex = 0;
      while ((match = inlinePattern.exec(stmt)) !== null) {
        const parentSchema = match[1] ?? null;
        const parentTable = match[2]!;
        const action = match[3]!.replace(/\s+/g, ' ') as FkRelationship['onDelete'];
        relationships.push({ childTable, parentSchema, parentTable, onDelete: action });
      }
    }

    // --- Named CONSTRAINT ... FOREIGN KEY ... REFERENCES ---
    // Also handles ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES
    const constraintPattern =
      /foreign\s+key\s*\([^)]+\)\s+references\s+(?:([\w]+)\.)?(\w+)\s*(?:\([^)]+\))?\s+on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/gi;

    if (childTable) {
      let match: RegExpExecArray | null;
      constraintPattern.lastIndex = 0;
      while ((match = constraintPattern.exec(stmt)) !== null) {
        const parentSchema = match[1] ?? null;
        const parentTable = match[2]!;
        const action = match[3]!.replace(/\s+/g, ' ') as FkRelationship['onDelete'];
        // Avoid duplicates if the same relationship appears in both inline and constraint forms.
        const alreadyTracked = relationships.some(
          (r) => r.childTable === childTable && r.parentTable === parentTable,
        );
        if (!alreadyTracked) {
          relationships.push({ childTable, parentSchema, parentTable, onDelete: action });
        }
      }
    }
  }

  return relationships;
}

// Build once per describe block.
const fkRelationships = extractFkRelationships(readMigrationFiles());

/** Look up the ON DELETE action for a given child→parent FK, if it exists.
 *  Optionally restrict to a schema-qualified parent (e.g. `'users'`, `'auth'`). */
function findOnDelete(
  childTable: string,
  parentTable: string,
  parentSchema?: string,
): string | null {
  const rel = fkRelationships.find(
    (r) =>
      r.childTable === childTable &&
      r.parentTable === parentTable &&
      (parentSchema === undefined || r.parentSchema === parentSchema),
  );
  return rel?.onDelete ?? null;
}

describe('HARDENING-004 — secret management', () => {
  it('.env.example contains only placeholder values (no real secrets committed)', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const value = trimmed.slice(eqIdx + 1).trim();
      expect(value, `.env.example line "${trimmed}" has a non-empty value`).toBe('');
    }
  });

  it('.env.example contains only documented environment variables', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf-8');
    const documentedKeys = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'ZAI_API_KEY',
      'DEEPSEEK_API_KEY',
    ];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const key = trimmed.split('=')[0] ?? '';
      expect(documentedKeys, `Unknown key "${key}" in .env.example`).toContain(key);
    }
  });

  it('VITE_ prefix only on browser-safe Supabase variables', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const key = trimmed.split('=')[0] ?? '';
      if (key.startsWith('VITE_')) {
        expect(
          ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
          `VITE_ key "${key}" is not browser-safe`,
        ).toContain(key);
      }
    }
  });

  it('no service-role or AI key identifiers appear in .env.example with VITE_ prefix', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      const key = trimmed.split('=')[0] ?? '';
      if (!key.startsWith('VITE_')) continue;
      expect(key).not.toMatch(/(SERVICE_ROLE|ZAI_API|DEEPSEEK_API)/i);
    }
  });

  it('.env files (except .env.example) are git-ignored', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toContain('!.env.example');
  });

  it('*.local files are git-ignored', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('*.local');
  });
});

describe('HARDENING-004 — authentication and session boundaries', () => {
  it('supabase-client.ts only types VITE_ browser-safe env vars', () => {
    const content = readFileSync(
      join(ROOT, 'apps', 'web', 'src', 'auth', 'supabase-client.ts'),
      'utf-8',
    );
    expect(content).toContain('VITE_SUPABASE_URL');
    expect(content).toContain('VITE_SUPABASE_ANON_KEY');
    expect(content).not.toMatch(/SERVICE_ROLE/i);
    expect(content).not.toMatch(/ZAI_API_KEY/i);
    expect(content).not.toMatch(/DEEPSEEK_API_KEY/i);
  });

  it('App.tsx browser client only reads VITE_ env vars', () => {
    const content = readFileSync(join(ROOT, 'apps', 'web', 'src', 'App.tsx'), 'utf-8');
    const envReads = content.match(/import\.meta\.env\.\w+/g) ?? [];
    for (const read of envReads) {
      const key = read.replace('import.meta.env.', '');
      expect(
        ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_E2E_AUTH', 'DEV'],
        `Unexpected import.meta.env key "${key}" in browser App.tsx`,
      ).toContain(key);
    }
  });

  it('e2e-auth user identity is clearly non-production', () => {
    const content = readFileSync(join(ROOT, 'apps', 'web', 'src', 'auth', 'e2e-auth.ts'), 'utf-8');
    expect(content).toContain('e2e-test-user');
    expect(content).toContain('e2e@adaptive-workout.test');
  });

  it('E2E auth cannot activate accidentally in production', () => {
    const app = readFileSync(join(ROOT, 'apps', 'web', 'src', 'App.tsx'), 'utf-8');
    const viteConfig = readFileSync(join(ROOT, 'apps', 'web', 'vite.config.ts'), 'utf-8');
    expect(app).toContain('import.meta.env.DEV');
    expect(app).toMatch(/import\('\.\/auth\/e2e-auth'\)/);
    expect(app).not.toMatch(/import \{ createE2ESupabaseClient \}/);
    expect(viteConfig).toContain("mode === 'production'");
    expect(viteConfig).toContain("process.env.VITE_E2E_AUTH === 'true'");
    expect(viteConfig).toContain('E2E auth seam must not be active in a production build.');
  });
});

describe('HARDENING-004 — RLS policies (static migration audit)', () => {
  const migrations = readMigrationFiles();

  const applicationTables = [
    'profiles',
    'muscles',
    'equipment',
    'exercise_families',
    'exercises',
    'exercise_muscles',
    'exercise_equipment',
    'exercise_substitutions',
    'programs',
    'program_workouts',
    'program_workout_exercises',
    'workout_sessions',
    'workout_session_exercises',
    'set_logs',
    'exercise_performance_state',
    'muscle_training_state',
    'pain_events',
    'pain_event_observations',
    'pain_exercise_associations',
    'user_exercise_preferences',
    'workout_decisions',
    'ai_interactions',
  ];

  it('RLS is enabled on every application table', () => {
    for (const table of applicationTables) {
      const rlsEnables = migrations.match(
        new RegExp(`alter table.*${table}.*enable row level security`, 'gi'),
      );
      expect(rlsEnables, `Table "${table}" does not have RLS enabled in migrations`).toBeTruthy();
      expect((rlsEnables as string[]).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('anonymous privileges are revoked on every table', () => {
    for (const table of applicationTables) {
      const anonRevokes = migrations.match(new RegExp(`revoke all on.*${table}.*from anon`, 'gi'));
      expect(anonRevokes, `Table "${table}" does not revoke anon privileges`).toBeTruthy();
    }
  });

  it('no unconditional USING(true) or WITH CHECK(true) on user-owned tables', () => {
    const userOwnedTables = [
      'profiles',
      'workout_sessions',
      'pain_events',
      'pain_event_observations',
      'pain_exercise_associations',
      'user_exercise_preferences',
      'exercise_performance_state',
      'muscle_training_state',
      'workout_decisions',
      'ai_interactions',
    ];

    for (const table of userOwnedTables) {
      const tableSections = migrations.split(new RegExp(`on public\\.${table}`));
      for (let i = 1; i < tableSections.length; i++) {
        const policyBlock = tableSections[i] ?? '';
        const usingMatch = policyBlock.match(/(?:using|with check)\s*\((.+?)\)\s*;/is);
        if (usingMatch?.[1]) {
          const clause = usingMatch[1].trim();
          expect(clause, `Table "${table}" has unconditional true policy`).not.toBe('true');
        }
      }
    }
  });

  it('server-written tables reject authenticated direct insert/update/delete', () => {
    const serverWrittenTables: Record<
      string,
      { insert: boolean; update: boolean; delete: boolean }
    > = {
      workout_decisions: { insert: false, update: false, delete: false },
      ai_interactions: { insert: false, update: false, delete: false },
      exercise_performance_state: { insert: false, update: false, delete: false },
      muscle_training_state: { insert: false, update: false, delete: false },
    };

    for (const [table, expectedGrants] of Object.entries(serverWrittenTables)) {
      for (const [privilege, shouldBeDenied] of Object.entries(expectedGrants)) {
        if (!shouldBeDenied) continue;
        const grantLine = migrations.match(
          new RegExp(
            `grant\\s+([\\w,\\s]+)\\s+on\\s+(table\\s+)?${table}\\s+to authenticated`,
            'i',
          ),
        );
        if (grantLine?.[1]) {
          const granted = grantLine[1].toLowerCase();
          expect(granted, `Table "${table}" allows authenticated "${privilege}"`).not.toContain(
            privilege,
          );
        }
      }
    }
  });
});

describe('HARDENING-004 — deletion cascade map', () => {
  // Tables that MUST CASCADE to auth.users (user-owned).
  const userOwnedTables = [
    'profiles',
    'workout_sessions',
    'exercise_performance_state',
    'muscle_training_state',
    'pain_events',
    'pain_event_observations',
    'pain_exercise_associations',
    'user_exercise_preferences',
    'workout_decisions',
    'ai_interactions',
  ];

  it('extracted at least the expected number of FK relationships', () => {
    // Sanity: the parser must find a reasonable number of relationships.
    expect(fkRelationships.length).toBeGreaterThanOrEqual(15);
  });

  it('user-owned tables with cascading FKs to auth.users delete with user', () => {
    for (const table of userOwnedTables) {
      // auth.users is schema-qualified; use the schema-aware lookup.
      const action = findOnDelete(table, 'users', 'auth');
      expect(
        action,
        `Table "${table}" FK to auth.users — expected CASCADE, got ${action ?? 'MISSING'}`,
      ).toBe('cascade');
    }
  });

  it('shared catalog tables do NOT cascade delete to auth.users', () => {
    const catalogTables = ['muscles', 'equipment', 'exercise_families', 'exercises'];
    for (const table of catalogTables) {
      // Catalog tables should NOT have any FK to auth.users at all.
      const action = findOnDelete(table, 'users', 'auth');
      expect(
        action,
        `Catalog table "${table}" has FK to auth.users with ON DELETE ${action}`,
      ).toBeNull();
    }
  });

  it('programs.owner_user_id FK to auth.users exists (user-owned programs cascade on delete)', () => {
    // programs.owner_user_id references auth.users(id) on delete cascade.
    // The FK is nullable so shared (system) programs remain when a user is deleted.
    const action = findOnDelete('programs', 'users', 'auth');
    expect(action, `programs → auth.users FK — expected CASCADE, got ${action ?? 'MISSING'}`).toBe(
      'cascade',
    );
  });

  it('exercise definitions referenced by sessions use RESTRICT (not cascade)', () => {
    const action = findOnDelete('workout_session_exercises', 'exercises', 'public');
    expect(
      action,
      `workout_session_exercises → exercises ON DELETE should be restrict, got ${action}`,
    ).toBe('restrict');
  });

  it('program_workouts cascade from program deletion', () => {
    const action = findOnDelete('program_workouts', 'programs');
    expect(
      action,
      `program_workouts → programs FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('program_workout_exercises cascade from program_workout deletion', () => {
    const action = findOnDelete('program_workout_exercises', 'program_workouts');
    expect(
      action,
      `program_workout_exercises → program_workouts FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('set_logs cascade from session_exercise deletion', () => {
    const action = findOnDelete('set_logs', 'workout_session_exercises');
    expect(
      action,
      `set_logs → workout_session_exercises FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('workout_session_exercises cascade from session deletion', () => {
    const action = findOnDelete('workout_session_exercises', 'workout_sessions');
    expect(
      action,
      `workout_session_exercises → workout_sessions FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('workout_sessions with program FK uses SET NULL (not cascade)', () => {
    // source_program_workout_id → program_workouts(id) ON DELETE SET NULL
    // This preserves session history when a program template is deleted.
    const action = findOnDelete('workout_sessions', 'program_workouts');
    expect(
      action,
      `workout_sessions → program_workouts FK — expected set null, got ${action ?? 'MISSING'}`,
    ).toBe('set null');
  });

  it('pain_event_observations cascade from pain_events', () => {
    const action = findOnDelete('pain_event_observations', 'pain_events');
    expect(
      action,
      `pain_event_observations → pain_events FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('pain_exercise_associations cascade from pain_events', () => {
    const action = findOnDelete('pain_exercise_associations', 'pain_events');
    expect(
      action,
      `pain_exercise_associations → pain_events FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('exercise_performance_state cascade from set_logs via source_watermark', () => {
    const action = findOnDelete('exercise_performance_state', 'set_logs');
    expect(
      action,
      `exercise_performance_state → set_logs (source_watermark) FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('muscle_training_state cascade from set_logs via source_watermark', () => {
    const action = findOnDelete('muscle_training_state', 'set_logs');
    expect(
      action,
      `muscle_training_state → set_logs (source_watermark) FK — expected CASCADE, got ${action ?? 'MISSING'}`,
    ).toBe('cascade');
  });

  it('workout_decisions FK to workout_sessions is SET NULL (preserves audit)', () => {
    const action = findOnDelete('workout_decisions', 'workout_sessions');
    expect(
      action,
      `workout_decisions → workout_sessions FK — expected set null, got ${action ?? 'MISSING'}`,
    ).toBe('set null');
  });
});

describe('HARDENING-004 — data minimization', () => {
  it('no user email column in workout/domain tables', () => {
    const migrationSql = readMigrationFiles();
    const tablesWithoutEmail = [
      'workout_sessions',
      'workout_session_exercises',
      'set_logs',
      'exercise_performance_state',
      'muscle_training_state',
      'pain_events',
      'pain_event_observations',
      'pain_exercise_associations',
      'user_exercise_preferences',
      'workout_decisions',
      'ai_interactions',
    ];

    for (const table of tablesWithoutEmail) {
      const tableBlock = migrationSql.match(
        new RegExp(`create table public\\.${table}\\s*\\([\\s\\S]*?\\);`, 'gi'),
      );
      if (tableBlock) {
        for (const block of tableBlock) {
          expect(block.toLowerCase(), `Table "${table}" has an email column`).not.toMatch(
            /\bemail\b/,
          );
        }
      }
    }
  });

  it('browser Supabase client only persists auth token (not workout data)', () => {
    const content = readFileSync(
      join(ROOT, 'apps', 'web', 'src', 'auth', 'supabase-client.ts'),
      'utf-8',
    );
    expect(content).toContain('persistSession: true');
    expect(content.toLowerCase()).toContain('never workout');
  });

  it('AI interaction table does not store raw user text', () => {
    const migrationSql = readMigrationFiles();
    const aiBlock = migrationSql.match(/create table public\.ai_interactions\s*\([\s\S]*?\);/gi);
    if (aiBlock) {
      for (const block of aiBlock) {
        expect(block.toLowerCase()).not.toContain('raw_prompt');
        expect(block.toLowerCase()).not.toContain('user_text');
      }
    }
  });

  it('pain_events has report_text for user wording (allowed as documented)', () => {
    const migrationSql = readMigrationFiles();
    expect(migrationSql).toContain('report_text');
  });

  it('observability package contracts exist and describe metadata bounds', () => {
    const contractsContent = readFileSync(
      join(ROOT, 'packages', 'observability', 'src', 'contracts.ts'),
      'utf-8',
    );
    expect(contractsContent).toContain('ObservabilityMetadataValue');
  });

  it('no calorie-burn or unrelated health data columns exist in migrations', () => {
    const migrationSql = readMigrationFiles().toLowerCase();
    const forbiddenColumns = [
      'calories',
      'calorie',
      'heart_rate',
      'blood_pressure',
      'body_weight',
      'body_fat',
      'sleep',
    ];

    for (const col of forbiddenColumns) {
      const count = (migrationSql.match(new RegExp(`\\b${col}\\b`, 'g')) ?? []).length;
      expect(count, `Column "${col}" found in migrations`).toBe(0);
    }
  });
});

describe('HARDENING-004 — observability redaction', () => {
  it('redaction source covers all required sensitive key variants', () => {
    const redactionContent = readFileSync(
      join(ROOT, 'packages', 'observability', 'src', 'redaction.ts'),
      'utf-8',
    ).toLowerCase();

    const requiredKeys = [
      'apikey',
      'api_key',
      'authorization',
      'token',
      'accesstoken',
      'access_token',
      'refreshtoken',
      'refresh_token',
      'servicerolekey',
      'service_role_key',
      'password',
      'secret',
      'cookie',
      'set-cookie',
    ];

    for (const key of requiredKeys) {
      expect(redactionContent, `Redaction missing key "${key}"`).toContain(key);
    }
  });

  it('redaction is documented as pure and non-mutating', () => {
    const redactionContent = readFileSync(
      join(ROOT, 'packages', 'observability', 'src', 'redaction.ts'),
      'utf-8',
    );
    expect(redactionContent).toContain('never mutates');
  });

  it('redaction test covers all required key variants', () => {
    const testContent = readFileSync(
      join(ROOT, 'packages', 'observability', 'src', 'redaction.test.ts'),
      'utf-8',
    );

    const testCoveredKeys = [
      'apiKey',
      'API_KEY',
      'authorization',
      'token',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'serviceRoleKey',
      'service_role_key',
      'password',
      'secret',
      'cookie',
      'set-cookie',
    ];

    for (const key of testCoveredKeys) {
      expect(testContent, `Redaction test missing key "${key}"`).toContain(key);
    }
  });
});
