/**
 * V1-004: Browser-safe progression refresh gateway.
 *
 * Calls the refresh-progression Edge Function using the existing browser Supabase
 * client session. The caller must be authenticated; this module never accepts an
 * arbitrary user ID.
 *
 * - Does not import progression-engine
 * - Does not contain service-role key
 * - Does not calculate recommendations in the browser
 * - Uses the same Supabase client/session already owned by App.tsx
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mirrors ProgressionRefreshDto from the server-side orchestrator.
 * Never imported from the orchestrator package — defined inline to
 * avoid any workspace reference that could pull server code into the browser.
 */
export interface ProgressionRefreshDto {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentWeight: number | null;
  readonly weightUnit: string | null;
  readonly recentReps: number | null;
  readonly targetRir: number | null;
  readonly trend: 'improving' | 'stable' | 'declining' | 'mixed' | null;
  readonly recommendation:
    | 'increase_load'
    | 'maintain_load'
    | 'reduce_load'
    | 'review_deload'
    | 'change_rep_range'
    | 'consider_substitution'
    | 'insufficient_data';
  readonly suggestedNextWeight: number | null;
  readonly reasonCodes: readonly string[];
  readonly sourceExposureCount: number;
  readonly calculatedAt: string;
  readonly engineVersion: string;
  readonly ruleSetVersion: string;
  readonly insufficientData: boolean;
}

export class ProgressionRefreshError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProgressionRefreshError';
    this.code = code;
  }
}

export interface RefreshProgressionResult {
  readonly ok: true;
  readonly progressions: readonly ProgressionRefreshDto[];
}

export type RefreshProgressionGatewayResult =
  | RefreshProgressionResult
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Calls POST /functions/v1/refresh-progression with the user's bearer token.
 * Returns the controlled browser-safe DTO array.
 */
export async function refreshProgressionGateway(
  client: SupabaseClient,
): Promise<RefreshProgressionGatewayResult> {
  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session?.access_token) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'You must be signed in to refresh progression.',
    };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, '');
  const url = `${supabaseUrl}/functions/v1/refresh-progression`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Could not reach progression service. Check your connection.',
    };
  }

  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      // ignore parse errors
    }
    return {
      ok: false,
      code: (body['code'] as string) ?? 'REFRESH_FAILED',
      message: (body['message'] as string) ?? `Refresh failed with status ${response.status}.`,
    };
  }

  const data = (await response.json()) as {
    status: string;
    progressions: ProgressionRefreshDto[];
  };

  if (data.status === 'ok' && Array.isArray(data.progressions)) {
    return {
      ok: true,
      progressions: data.progressions,
    };
  }

  return {
    ok: false,
    code: 'MALFORMED_RESPONSE',
    message: 'Progression refresh returned an unexpected response.',
  };
}
