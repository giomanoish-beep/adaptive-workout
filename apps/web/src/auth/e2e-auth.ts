/**
 * E2E AUTHENTICATION SEAM — TEST-ONLY
 *
 * Activated ONLY when `import.meta.env.VITE_E2E_AUTH === 'true'`.
 * Provides a deterministic mock SupabaseClient.
 *
 * Production builds leave VITE_E2E_AUTH unset/undefined.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const E2E_USER = {
  id: 'e2e-test-user-00000000-0000-0000-0000-000000000000',
  email: 'e2e@adaptive-workout.test',
} as const;

type AuthListener = (event: string, session: Session | null) => void;

interface Session {
  user: { id: string; email: string };
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

type Row = Record<string, unknown>;
const store = new Map<string, Row[]>();

function getTable(n: string): Row[] {
  let r = store.get(n);
  if (!r) { r = []; store.set(n, r); }
  return r;
}
function genId() { return `e2e-${crypto.randomUUID()}`; }
function nowISO() { return new Date().toISOString(); }
function eqF(rows: Row[], c: string, v: unknown): Row[] { return rows.filter((r) => r[c] === v); }
function inF(rows: Row[], c: string, vs: unknown[]): Row[] { return rows.filter((r) => vs.includes(r[c])); }
function likeF(rows: Row[], c: string, p: string): Row[] {
  const prefix = p.replace(/%$/, '');
  return rows.filter((r) => { const v = r[c]; return typeof v === 'string' && v.startsWith(prefix); });
}
function selCols(row: Row, cols: string | null): Row {
  if (!cols || cols === '*') return { ...row };
  const out: Row = {};
  for (const c of cols.split(',').map((s) => s.trim())) { if (c in row) out[c] = row[c]; }
  return out;
}

export function createE2ESupabaseClient(): SupabaseClient {
  let authenticated = true;
  const listeners = new Set<AuthListener>();
  const session: Session = {
    user: { id: E2E_USER.id, email: E2E_USER.email },
    access_token: 'e2e-mock-token',
    refresh_token: 'e2e-mock-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  function notify(event: string) {
    const s = authenticated ? session : null;
    for (const cb of listeners) cb(event, s);
  }

  const auth = {
    getSession() { return Promise.resolve({ data: { session: authenticated ? session : null }, error: null }); },
    onAuthStateChange(cb: AuthListener) {
      listeners.add(cb);
      setTimeout(() => cb('INITIAL_SESSION', authenticated ? session : null), 0);
      return { data: { subscription: { unsubscribe() { listeners.delete(cb); } } } };
    },
    signOut() { authenticated = false; notify('SIGNED_OUT'); return Promise.resolve({ error: null }); },
  };

  function createQB(tableName: string) {
    const rows = getTable(tableName);
    let filteredRows: Row[] = rows;
    let limitCount: number | null = null;
    let orderColumn: string | null = null;
    let orderAscending = true;
    let selectColumns: string | null = null;

    function reset() { filteredRows = rows; limitCount = null; orderColumn = null; orderAscending = true; selectColumns = null; }
    function apply() {
      let r = [...filteredRows];
      if (orderColumn) {
        r.sort((a, b) => {
          const va = a[orderColumn!], vb = b[orderColumn!];
          if (va == null && vb == null) return 0;
          if (va == null) return orderAscending ? 1 : -1;
          if (vb == null) return orderAscending ? -1 : 1;
          return va < vb ? (orderAscending ? -1 : 1) : va > vb ? (orderAscending ? 1 : -1) : 0;
        });
      }
      if (limitCount) r = r.slice(0, limitCount);
      return { result: r, filters: filteredRows };
    }
    function map(r: Row) { return selCols(r, selectColumns); }

    const b = {
      select(cols?: string) {
        reset();
        selectColumns = cols ?? '*';
        const that = {
          eq(c: string, v: unknown) { filteredRows = eqF(rows, c, v); return that; },
          in(c: string, vs: unknown[]) { filteredRows = inF(rows, c, vs); return that; },
          like(c: string, p: string) { filteredRows = likeF(rows, c, p); return that; },
          order(c: string, o?: { ascending?: boolean }) { orderColumn = c; orderAscending = o?.ascending ?? true; return that; },
          limit(n: number) { limitCount = n; return that; },
          single() { const { result: r } = apply(); return Promise.resolve(r.length === 0 ? { data: null, error: null } : { data: map(r[0]!), error: null }); },
          then(resolve?: (v: { data: Row[] | null; error: null }) => void) {
            const { result: r } = apply();
            const v = { data: r.map(map), error: null };
            if (resolve) { resolve(v); return undefined!; }
            return Promise.resolve(v);
          },
        };
        return that;
      },
      insert(row: Row | Row[]) {
        const entries = Array.isArray(row) ? row : [row];
        const now = nowISO();
        for (const entry of entries) {
          const full: Row = { ...entry, id: genId(), user_id: E2E_USER.id, created_at: now, updated_at: now };
          rows.push(full);
        }
        const that: Record<string, unknown> = {
          select(cols?: string) {
            if (cols) selectColumns = cols;
            return that;
          },
          single() {
            const last = rows[rows.length - 1] ?? null;
            return Promise.resolve({ data: last ? selCols(last, selectColumns) : null, error: null });
          },
        };
        return that;
      },
      upsert(row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        const conflictCols = (opts?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const now = nowISO();
        let idx = -1;
        for (let i = 0; i < rows.length; i++) {
          if (conflictCols.every((col) => String(rows[i]![col]) === String(row[col]))) { idx = i; break; }
        }
        if (idx >= 0 && !opts?.ignoreDuplicates) {
          rows[idx] = { ...rows[idx], ...row, updated_at: now };
        } else if (idx < 0) {
          rows.push({ ...row, id: genId(), user_id: E2E_USER.id, created_at: now, updated_at: now });
        }
        const that: Record<string, unknown> = {
          select(cols?: string) { if (cols) selectColumns = cols; return that; },
          single() {
            const last = rows[rows.length - 1] ?? null;
            return Promise.resolve({ data: last ? selCols(last, selectColumns) : null, error: null });
          },
        };
        return that;
      },
      update(row: Row) {
        const now = nowISO();
        for (const target of [...filteredRows]) {
          const idx = rows.indexOf(target);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...row, updated_at: now };
        }
        const that: Record<string, unknown> = {
          eq(c: string, v: unknown) { filteredRows = eqF(rows, c, v); return that; },
          select(cols?: string) { if (cols) selectColumns = cols; return that; },
          single() {
            const t = [...filteredRows];
            return Promise.resolve({ data: t.length > 0 ? selCols(t[0]!, selectColumns) : null, error: null });
          },
        };
        return that;
      },
      delete() {
        const that = {
          eq(c: string, v: unknown) {
            for (const t of eqF(rows, c, v)) { const i = rows.indexOf(t); if (i >= 0) rows.splice(i, 1); }
            return { then: (resolve?: (v: unknown) => void) => { const val = { data: null, error: null }; if (resolve) resolve(val); return val; } };
          },
        };
        return that;
      },
      eq(c: string, v: unknown) { filteredRows = eqF(rows, c, v); return b; },
      in(c: string, vs: unknown[]) { filteredRows = inF(rows, c, vs); return b; },
      like(c: string, p: string) { filteredRows = likeF(rows, c, p); return b; },
      order(c: string, o?: { ascending?: boolean }) { orderColumn = c; orderAscending = o?.ascending ?? true; return b; },
      limit(n: number) { limitCount = n; return b; },
    };
    return b;
  }

  return { auth, from: (t: string) => createQB(t) } as unknown as SupabaseClient;
}

export function clearE2EStore(): void { store.clear(); }
export function seedE2EStore(seeds: Record<string, Row[]>): void {
  for (const [tableName, rows] of Object.entries(seeds)) store.set(tableName, [...rows]);
}
export function dumpE2EStore(): Record<string, Row[]> {
  const result: Record<string, Row[]> = {};
  for (const [k, v] of store.entries()) result[k] = [...v];
  return result;
}
if (typeof window !== 'undefined') {
  const pendingSeed = (window as unknown as Record<string, unknown>).__E2E_SEED__ as
    | Record<string, Row[]>
    | undefined;
  if (pendingSeed) {
    seedE2EStore(pendingSeed);
    delete (window as unknown as Record<string, unknown>).__E2E_SEED__;
  }
  (window as unknown as Record<string, unknown>).__E2E_STORE__ = { clear: clearE2EStore, seed: seedE2EStore, dump: dumpE2EStore };
}
