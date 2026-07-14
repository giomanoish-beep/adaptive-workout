# Architecture

## Boundaries

- `apps/web`: React presentation, Supabase Auth client, and API orchestration.
- `packages/domain`: shared domain contracts and validated value types.
- `packages/workout-engine`: deterministic workout generation and substitutions.
- `packages/workout-decision-persistence`: server-only mapping and persistence of workout-engine audit evidence.
- `packages/progression-engine`: deterministic exercise progression recommendations.
- `packages/pain-safety`: deterministic discomfort classification and constraints.
- `packages/ai`: provider-neutral AI contracts, structured parsing, and grounded explanations.
- Supabase PostgreSQL: authoritative relational data and row-level security.
- Supabase Edge Functions: secret-bearing AI calls and trusted server-side workflows.

## Dependency direction

The web app and server functions may depend on packages. Engines may depend on `domain`, but never on React, Supabase clients, or AI providers. The AI package may describe domain-shaped extraction contracts but cannot invoke engines as an authority.

## Request flow

1. Web obtains authenticated data from Supabase.
2. Natural-language input is optionally parsed server-side through `AIProvider`.
3. Application code validates and passes structured inputs to a deterministic engine.
4. The engine returns an output plus decision evidence.
5. Trusted persistence writes the result and decision log transactionally.
6. AI may explain only the persisted decision data supplied to it.

## Data and security

- User-owned rows carry `user_id`; RLS restricts access to that owner.
- Shared catalog and program rows use explicit read policies and privileged write paths.
- Browser code receives only the Supabase URL and anonymous key.
- Service-role and AI keys exist only in Edge Function secrets or trusted deployment environments.
- Decision persistence receives an already configured trusted Supabase client; it never reads or exports service-role credentials.
- No fitness or workout data is stored in localStorage, sessionStorage, IndexedDB, or durable browser caches.

## Auditability

Engine outputs include rule-set version, normalized inputs, selected outcome, reason codes, and relevant scores or constraints. AI interactions record provider metadata and structured input/output references without treating generated text as authoritative state.
