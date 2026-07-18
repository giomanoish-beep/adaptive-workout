/**
 * Browser-safe workout generation gateway (SERVER-001).
 *
 * Calls the server-side generate-workout Edge Function using the existing
 * Supabase client and session. No engine imports, no AI imports, no
 * service-role key. Uses only the anonymous key and the user's auth token.
 *
 * The gateway is the only production path for workout generation.
 * The local review fixture remains only for test seams.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Request/Response shapes (mirrors server contracts)                 */
/* ------------------------------------------------------------------ */

export interface GatewayGenerateRequest {
  readonly targetMuscles: readonly string[];
  readonly excludedMuscles?: readonly string[];
  readonly durationMinutes: number;
  readonly equipmentContext: string;
  readonly emphasis?: string;
}

export interface GatewayReviewRepRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface GatewayReviewExercise {
  readonly position: number;
  readonly exerciseId: string;
  readonly exerciseVersion: number;
  readonly name: string;
  readonly sets: number;
  readonly reps: GatewayReviewRepRange;
  readonly rir: number;
  readonly restSeconds: number | null;
}

export interface GatewayReviewMuscleVolume {
  readonly muscle: string;
  readonly volume: number;
}

export interface GatewayReviewSuccess {
  readonly status: 'success';
  readonly generationId: string;
  readonly title: string;
  readonly estimatedDurationMinutes: number;
  readonly totalWorkingSets: number;
  readonly exercises: readonly GatewayReviewExercise[];
  readonly muscleVolume: readonly GatewayReviewMuscleVolume[];
  readonly appliedGoal: string;
  readonly engineVersion: string;
  readonly ruleSetVersion: string;
  readonly traceSummary: string | null;
}

export type GatewayErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_REQUEST'
  | 'PROFILE_MISSING'
  | 'PROFILE_INVALID'
  | 'DISCOMFORT_REVIEW_REQUIRED'
  | 'CATALOG_UNAVAILABLE'
  | 'NO_FEASIBLE_WORKOUT'
  | 'GENERATION_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'UNEXPECTED_ERROR';

export interface GatewayErrorResponse {
  readonly status: 'error';
  readonly generationId: string | null;
  readonly code: GatewayErrorCode;
  readonly message: string;
}

export type GatewayReviewResponse = GatewayReviewSuccess | GatewayErrorResponse;

/* ------------------------------------------------------------------ */
/*  Gateway error                                                      */
/* ------------------------------------------------------------------ */

export class WorkoutGenerationGatewayError extends Error {
  public readonly code: GatewayErrorCode;
  public readonly generationId: string | null;

  constructor(code: GatewayErrorCode, message: string, generationId: string | null = null) {
    super(message);
    this.name = 'WorkoutGenerationGatewayError';
    this.code = code;
    this.generationId = generationId;
  }
}

/* ------------------------------------------------------------------ */
/*  Gateway implementation                                             */
/* ------------------------------------------------------------------ */

/**
 * Calls the server-side generate-workout Edge Function.
 *
 * Uses the existing Supabase client to obtain the auth session token
 * and calls the Edge Function with structured request data.
 */
export async function generateWorkoutViaGateway(
  client: SupabaseClient,
  request: GatewayGenerateRequest,
): Promise<GatewayReviewResponse> {
  // 1. Validate request locally before sending
  if (!request.targetMuscles || request.targetMuscles.length === 0) {
    return {
      status: 'error',
      generationId: null,
      code: 'INVALID_REQUEST',
      message: 'Select at least one target muscle.',
    };
  }

  if (
    typeof request.durationMinutes !== 'number' ||
    request.durationMinutes < 15 ||
    request.durationMinutes > 240
  ) {
    return {
      status: 'error',
      generationId: null,
      code: 'INVALID_REQUEST',
      message: 'Duration must be between 15 and 240 minutes.',
    };
  }

  // 2. Get session token from the existing client
  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    return {
      status: 'error',
      generationId: null,
      code: 'UNAUTHENTICATED',
      message: 'Please sign in to generate a workout.',
    };
  }

  // 3. Determine the Edge Function URL
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    return {
      status: 'error',
      generationId: null,
      code: 'GENERATION_FAILED',
      message: 'Server configuration error.',
    };
  }

  const functionUrl = `${supabaseUrl}/functions/v1/generate-workout`;

  // 4. Call the Edge Function
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      // Try to parse error from response body
      try {
        const errorBody = (await response.json()) as GatewayErrorResponse;
        return {
          status: 'error',
          generationId: errorBody.generationId ?? null,
          code: errorBody.code ?? 'GENERATION_FAILED',
          message: errorBody.message ?? 'Workout generation failed.',
        };
      } catch {
        return {
          status: 'error',
          generationId: null,
          code: response.status === 401 ? 'UNAUTHENTICATED' : 'GENERATION_FAILED',
          message:
            response.status === 401
              ? 'Session expired. Please sign in again.'
              : `Server error (${response.status}).`,
        };
      }
    }

    const result = (await response.json()) as GatewayReviewResponse;
    return result;
  } catch {
    return {
      status: 'error',
      generationId: null,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server. Check your connection and try again.',
    };
  }
}

/**
 * Maps the gateway success response to the existing WorkoutReview shape
 * so the rest of the app (WorkoutReview, ActiveWorkout) works unchanged.
 */
export function mapGatewayToWorkoutReview(gateway: GatewayReviewSuccess) {
  return {
    title: gateway.title,
    estimatedDurationMinutes: gateway.estimatedDurationMinutes,
    totalWorkingSets: gateway.totalWorkingSets,
    exercises: gateway.exercises.map((ex) => ({
      position: ex.position,
      exerciseId: ex.exerciseId,
      exerciseVersion: ex.exerciseVersion,
      name: ex.name,
      sets: ex.sets,
      reps: { minimum: ex.reps.minimum, maximum: ex.reps.maximum },
      rir: ex.rir,
      restSeconds: ex.restSeconds,
    })),
    muscleVolume: gateway.muscleVolume.map((mv) => ({
      muscle: mv.muscle,
      volume: mv.volume,
    })),
  };
}

/**
 * Derives the Supabase project URL from the build-time environment variable.
 * This reads from the VITE_ prefix (browser-safe, injected at build time).
 */
function getSupabaseUrl(): string | null {
  // In the browser, import.meta.env.VITE_SUPABASE_URL is available
  if (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_SUPABASE_URL) {
    return String(import.meta.env.VITE_SUPABASE_URL);
  }
  return null;
}
