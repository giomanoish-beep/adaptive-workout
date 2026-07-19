import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeneratedProgramDto, ProgramSetupDraft } from './program-types';

export type ProgramGatewayResult =
  | { readonly status: 'success'; readonly program: GeneratedProgramDto }
  | { readonly status: 'error'; readonly message: string };

export async function generateProgramViaGateway(
  client: SupabaseClient,
  setup: ProgramSetupDraft,
): Promise<ProgramGatewayResult> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!token) return { status: 'error', message: 'Please sign in again.' };
  if (!base) return { status: 'error', message: 'Server configuration error.' };
  try {
    const response = await fetch(`${base}/functions/v1/generate-program`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(setup),
    });
    const result = (await response.json()) as ProgramGatewayResult;
    return response.ok
      ? result
      : {
          status: 'error',
          message: result.status === 'error' ? result.message : 'Program generation failed.',
        };
  } catch {
    return { status: 'error', message: 'Unable to reach the server. Try again.' };
  }
}
