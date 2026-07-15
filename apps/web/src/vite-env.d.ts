/// <reference types="vite/client" />

/**
 * Browser-safe environment variables (docs/ARCHITECTURE.md). Only these two
 * VITE_-prefixed vars are exposed to the browser. Service-role and AI keys are
 * never declared here and never reach browser code.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
