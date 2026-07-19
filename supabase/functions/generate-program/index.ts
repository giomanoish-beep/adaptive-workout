/** V1.2 authoritative deterministic program generation. */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import {
  generateProgram,
  type ProgramExerciseCandidate,
  type ProgramSetup,
} from '../../../packages/program-engine/src/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST')
    return json(
      { status: 'error', code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' },
      405,
    );
  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token)
      return json({ status: 'error', code: 'UNAUTHENTICATED', message: 'Please sign in.' }, 401);
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey)
      return json(
        { status: 'error', code: 'SERVER_CONFIGURATION', message: 'Server configuration error.' },
        500,
      );
    const client = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData.user)
      return json({ status: 'error', code: 'UNAUTHENTICATED', message: 'Session expired.' }, 401);
    const setup = (await request.json()) as ProgramSetup;
    const validation = validateSetup(setup);
    if (validation)
      return json({ status: 'error', code: 'INVALID_REQUEST', message: validation }, 400);

    const [exercises, families, muscles, joins, equipment, equipmentJoins] = await Promise.all([
      client
        .from('exercises')
        .select('id,name,exercise_family_id')
        .eq('is_active', true)
        .order('id'),
      client.from('exercise_families').select('id,slug'),
      client.from('muscles').select('id,slug'),
      client.from('exercise_muscles').select('exercise_id,muscle_id,role'),
      client.from('equipment').select('id,slug'),
      client.from('exercise_equipment').select('exercise_id,equipment_id,requirement'),
    ]);
    const failed = [exercises, families, muscles, joins, equipment, equipmentJoins].find(
      (result) => result.error,
    );
    if (failed?.error) throw new Error(failed.error.message);
    const familyMap = new Map(
      (families.data ?? []).map((row) => [String(row.id), String(row.slug)]),
    );
    const muscleMap = new Map(
      (muscles.data ?? []).map((row) => [String(row.id), String(row.slug)]),
    );
    const equipmentMap = new Map(
      (equipment.data ?? []).map((row) => [String(row.id), String(row.slug)]),
    );
    const catalog: ProgramExerciseCandidate[] = (exercises.data ?? []).map((row) => {
      const primary = (joins.data ?? []).find(
        (join) => join.exercise_id === row.id && join.role === 'primary',
      );
      const required = (equipmentJoins.data ?? []).filter(
        (join) => join.exercise_id === row.id && join.requirement === 'required',
      );
      return {
        id: String(row.id),
        name: String(row.name),
        movementPattern: familyMap.get(String(row.exercise_family_id)) ?? 'other',
        primaryMuscle: muscleMap.get(String(primary?.muscle_id)) ?? 'general',
        equipment: required
          .map((join) => equipmentMap.get(String(join.equipment_id)) ?? '')
          .filter(Boolean),
      };
    });
    return json({ status: 'success', program: generateProgram(setup, catalog) }, 200);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'program_generation_failed',
        message: error instanceof Error ? error.message : 'unknown',
      }),
    );
    return json(
      {
        status: 'error',
        code: 'GENERATION_FAILED',
        message: 'We could not create your program. Please review your choices and try again.',
      },
      500,
    );
  }
});

function validateSetup(value: ProgramSetup): string | null {
  if (
    !value ||
    !['build_muscle', 'gain_strength', 'recomposition', 'fat_loss_support'].includes(value.goal)
  )
    return 'Choose a supported training goal.';
  if (![8, 12, 16].includes(value.durationWeeks)) return 'Choose an 8, 12, or 16 week program.';
  if (!Number.isInteger(value.daysPerWeek) || value.daysPerWeek < 2 || value.daysPerWeek > 6)
    return 'Choose between 2 and 6 training days.';
  return null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
