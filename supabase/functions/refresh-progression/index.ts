/**
 * refresh-progression Edge Function
 *
 * Server-side progression refresh endpoint. Requires an authenticated Supabase user.
 * Derives user identity from the verified auth context — never trusts a caller-supplied user ID.
 *
 * Responsibilities:
 * - Verify bearer token and reject unauthenticated requests
 * - Load the user's completed workout/set history
 * - Delegate to the deterministic progression orchestrator
 * - Persist rebuildable exercise_performance_state
 * - Return a controlled browser-safe progression DTO
 *
 * verify_jwt is disabled because the handler performs its own bearer-token
 * verification via authClient.auth.getUser(token) and returns controlled
 * UNAUTHENTICATED responses rather than the gateway's default rejection.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5';

// These imports are workspace-relative and will be resolved by the esbuild bundler.
import { refreshProgression } from '../../../packages/progression-orchestrator/src/orchestrator.js';
import type {
  ObservabilitySink,
  ObservabilityEvent,
  RefreshProgressionSuccessResponse,
  RefreshProgressionErrorResponse,
} from '../../../packages/progression-orchestrator/src/contracts.js';
import {
  engineName,
  engineVersion,
  ruleSetVersion,
} from '../../../packages/progression-orchestrator/src/contracts.js';

/* ------------------------------------------------------------------ */
/*  In-memory observability sink                                        */
/* ------------------------------------------------------------------ */

class ConsoleSink implements ObservabilitySink {
  emit(event: ObservabilityEvent): void {
    console.log(
      JSON.stringify({
        kind: event.kind,
        correlationId: event.correlationId,
        metadata: event.metadata,
        _package: '@adaptive-workout/progression-orchestrator',
      }),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Edge Function handler                                              */
/* ------------------------------------------------------------------ */

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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !anonKey) {
    return jsonResponse(500, {
      status: 'error',
      code: 'CONFIGURATION_ERROR',
      message: 'Server configuration error.',
    });
  }

  if (!serviceRoleKey) {
    return jsonResponse(500, {
      status: 'error',
      code: 'CONFIGURATION_ERROR',
      message: 'Service role key is required for server-side writes.',
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

  // Build dependencies
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Service-role client for writing derived state.
  // Trust boundary: service-role key is in Deno.env, never in browser code.
  // Every write is scoped to the verified userId.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const correlationId = crypto.randomUUID();
  const sink = new ConsoleSink();

  // Invoke the orchestrator
  const result = await refreshProgression({
    userId,
    anonClient: userClient,
    serviceClient: serviceClient as any,
    correlationId,
    sink,
  });

  if (result.status === 'error') {
    const statusCode =
      result.code === 'UNAUTHENTICATED'
        ? 401
        : result.code === 'REFRESH_FAILED'
          ? 500
          : 500;
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
