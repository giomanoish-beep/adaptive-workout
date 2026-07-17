/**
 * generate-workout Edge Function
 *
 * Server-side workout generation endpoint. Requires an authenticated Supabase user.
 * Derives user identity from the verified auth context — never trusts a caller-supplied user ID.
 *
 * Responsibilities:
 * - Verify bearer token and reject unauthenticated requests
 * - Load the user's training profile from the database
 * - Load the exercise catalog from the database
 * - Delegate to the deterministic workout-gen-orchestrator
 * - Return a controlled browser-safe review DTO
 * - Emit structured observability events
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';

// These would be resolved via a bundler in production. For local development,
// the orchestrator is imported from the workspace monorepo.
// In the deployed Edge Function, use import maps or bundlers.
import { generateWorkout } from '../../../packages/workout-gen-orchestrator/src/orchestrator.ts';
import { ConsoleSink } from '../../../packages/observability/src/sinks.ts';
import type {
  GenerateWorkoutRequest,
  CatalogLoader,
  ProfileLoader,
  ServerTrainingProfile,
  CatalogExerciseRow,
  CatalogMuscleRow,
  CatalogExerciseMuscleRow,
  CatalogExerciseEquipmentRow,
  CatalogEquipmentRow,
  EquipmentContextMap,
  MuscleIdMap,
} from '../../../packages/workout-gen-orchestrator/src/contracts.ts';

/* ------------------------------------------------------------------ */
/*  Equipment context mapping                                          */
/* ------------------------------------------------------------------ */

const equipmentContextMap: EquipmentContextMap = {
  'full-gym': [
    'barbell',
    'dumbbell',
    'cable',
    'bench',
    'smith-machine',
    'leg-press',
    'hack-squat',
    'plate-loaded-machine',
    'selectorized-machine',
    'bodyweight',
    'pull-up-station',
    'dip-station',
  ],
  'dumbbells-only': ['dumbbell', 'bench', 'bodyweight'],
  'cables-only': ['cable', 'bodyweight'],
};

/* ------------------------------------------------------------------ */
/*  Muscle ID mapping (UI option ID → canonical DB slug)              */
/* ------------------------------------------------------------------ */

const muscleIdMap: MuscleIdMap = {
  chest: 'chest',
  back: 'lats',
  shoulders: 'front-delts', // compound shoulder press targets front-delts
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quadriceps',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  core: 'abs',
};

/* ------------------------------------------------------------------ */
/*  Supabase catalog loader                                            */
/* ------------------------------------------------------------------ */

function createSupabaseCatalogLoader(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
): CatalogLoader {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  return {
    async loadActiveCatalog() {
      const [
        exercisesResult,
        musclesResult,
        exerciseMusclesResult,
        exerciseEquipmentResult,
        equipmentResult,
      ] = await Promise.all([
        client
          .from('exercises')
          .select('id, slug, name, exercise_family_id, is_active, version')
          .eq('is_active', true)
          .order('id'),
        client
          .from('muscles')
          .select('id, slug, name, is_active')
          .eq('is_active', true)
          .order('id'),
        client.from('exercise_muscles').select('exercise_id, muscle_id, role, contribution'),
        client.from('exercise_equipment').select('exercise_id, equipment_id, requirement'),
        client
          .from('equipment')
          .select('id, slug, name, is_active')
          .eq('is_active', true)
          .order('id'),
      ]);

      if (exercisesResult.error) throw new Error(`exercises: ${exercisesResult.error.message}`);
      if (musclesResult.error) throw new Error(`muscles: ${musclesResult.error.message}`);
      if (exerciseMusclesResult.error)
        throw new Error(`exercise_muscles: ${exerciseMusclesResult.error.message}`);
      if (exerciseEquipmentResult.error)
        throw new Error(`exercise_equipment: ${exerciseEquipmentResult.error.message}`);
      if (equipmentResult.error) throw new Error(`equipment: ${equipmentResult.error.message}`);

      // We need exercise family slugs — join from the exercises query
      const { data: families, error: familiesError } = await client
        .from('exercise_families')
        .select('id, slug');

      if (familiesError) throw new Error(`exercise_families: ${familiesError.message}`);

      const familySlugMap = new Map<string, string>();
      for (const f of families ?? []) {
        familySlugMap.set(f.id as string, f.slug as string);
      }

      const exercises: CatalogExerciseRow[] = (exercisesResult.data ?? []).map(
        (row: Record<string, unknown>) => ({
          id: row['id'] as string,
          slug: row['slug'] as string,
          name: row['name'] as string,
          exerciseFamilyId: row['exercise_family_id'] as string,
          exerciseFamilySlug: familySlugMap.get(row['exercise_family_id'] as string) ?? 'unknown',
          isActive: row['is_active'] as boolean,
          version: row['version'] as number,
        }),
      );

      const muscles: CatalogMuscleRow[] = (musclesResult.data ?? []).map(
        (row: Record<string, unknown>) => ({
          id: row['id'] as string,
          slug: row['slug'] as string,
          name: row['name'] as string,
          isActive: row['is_active'] as boolean,
        }),
      );

      const exerciseMuscles: CatalogExerciseMuscleRow[] = (exerciseMusclesResult.data ?? []).map(
        (row: Record<string, unknown>) => ({
          exerciseId: row['exercise_id'] as string,
          muscleId: row['muscle_id'] as string,
          role: row['role'] as 'primary' | 'secondary' | 'stabilizer',
          contribution: row['contribution'] as number,
        }),
      );

      const exerciseEquipment: CatalogExerciseEquipmentRow[] = (
        exerciseEquipmentResult.data ?? []
      ).map((row: Record<string, unknown>) => ({
        exerciseId: row['exercise_id'] as string,
        equipmentId: row['equipment_id'] as string,
        equipmentSlug: '', // Not needed for candidate mapping
        requirement: row['requirement'] as 'required' | 'optional',
      }));

      const equipment: CatalogEquipmentRow[] = (equipmentResult.data ?? []).map(
        (row: Record<string, unknown>) => ({
          id: row['id'] as string,
          slug: row['slug'] as string,
          name: row['name'] as string,
          isActive: row['is_active'] as boolean,
        }),
      );

      return { exercises, muscles, exerciseMuscles, exerciseEquipment, equipment };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Supabase profile loader                                            */
/* ------------------------------------------------------------------ */

function createSupabaseProfileLoader(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
): ProfileLoader {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  return {
    async loadProfile(userId: string): Promise<ServerTrainingProfile | null> {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw new Error(`Profile load failed: ${error.message}`);
      }

      if (!data) return null;

      const row = data as Record<string, unknown>;
      return {
        goal: (row['goal'] as string) ?? '',
        experience: (row['experience'] as string) ?? '',
        frequency: (row['training_frequency'] as string) ?? '',
        typicalDurationMinutes: (row['typical_duration_minutes'] as number) ?? 45,
        environment: (row['training_environment'] as string) ?? '',
        programPreference: (row['program_preference'] as string) ?? '',
        hasCurrentDiscomfort: (row['has_current_discomfort'] as boolean) ?? false,
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Edge Function handler                                              */
/* ------------------------------------------------------------------ */

interface EdgeFunctionContext {
  req: Request;
  supabaseUrl: string;
  anonKey: string;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, {
      status: 'error',
      code: 'INVALID_REQUEST',
      message: 'Only POST requests are accepted.',
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !anonKey) {
    return jsonResponse(500, {
      status: 'error',
      code: 'GENERATION_FAILED',
      message: 'Server configuration error.',
    });
  }

  // Verify authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(401, {
      status: 'error',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
    });
  }

  const token = authHeader.slice(7);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(token);

  if (userError || !userData.user) {
    return jsonResponse(401, {
      status: 'error',
      code: 'UNAUTHENTICATED',
      message: 'Invalid or expired session.',
    });
  }

  const userId = userData.user.id;

  // Parse request body
  let body: GenerateWorkoutRequest;
  try {
    body = (await req.json()) as GenerateWorkoutRequest;
  } catch {
    return jsonResponse(400, {
      status: 'error',
      code: 'INVALID_REQUEST',
      message: 'Invalid JSON body.',
    });
  }

  // Build dependencies
  const catalogLoader = createSupabaseCatalogLoader(supabaseUrl, anonKey, token);
  const profileLoader = createSupabaseProfileLoader(supabaseUrl, anonKey, token);

  const sink = new ConsoleSink();

  // Generate
  const result = await generateWorkout(
    body,
    userId,
    {
      profileLoader,
      catalogLoader,
      equipmentContextMap,
      muscleIdMap,
    },
    sink,
  );

  if (result.status === 'error') {
    const statusCode =
      result.code === 'UNAUTHENTICATED' ? 401 : result.code === 'INVALID_REQUEST' ? 400 : 500;
    return jsonResponse(statusCode, result);
  }

  return jsonResponse(200, result);
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
