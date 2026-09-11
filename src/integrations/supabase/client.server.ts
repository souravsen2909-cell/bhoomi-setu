// Server-side Supabase client with service role key.
// When live credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are configured,
// it connects to real Supabase. Otherwise, it provides an in-memory mock database
// for preview and development.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { normalizeSupabaseUrl } from "./url";
import {
  MOCK_AFFECTED_FAMILIES,
  MOCK_AWARDS,
  MOCK_COMPENSATION,
  MOCK_JURISDICTIONS,
  MOCK_PARCELS,
  MOCK_PROJECTS,
  MOCK_ROLES,
  MOCK_USERS,
} from "./mock-data";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

// In-memory mock database store for preview mode
const mockStore: Record<string, any[]> = {
  jurisdictions: [...MOCK_JURISDICTIONS],
  projects: [...MOCK_PROJECTS],
  parcels: [...MOCK_PARCELS],
  public_parcels: [...MOCK_PARCELS],
  awards: [...MOCK_AWARDS],
  compensation: [...MOCK_COMPENSATION],
  affected_families: [...MOCK_AFFECTED_FAMILIES],
  users: [...MOCK_USERS],
  roles: [...MOCK_ROLES],
  proposals: [],
  alerts: [],
  disputes: [],
  documents: [],
  possession_records: [],
  parcel_ownership: [],
};

class MockQueryBuilder<T = any> {
  private rows: any[];
  private tableName: string;
  private isSingle = false;
  private isMaybeSingle = false;

  constructor(tableName: string, initialRows: any[]) {
    this.tableName = tableName;
    this.rows = [...initialRows];
  }

  select(_cols = "*") {
    return this;
  }

  eq(col: string, val: any) {
    this.rows = this.rows.filter((r) => r && r[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this.rows = this.rows.filter((r) => r && r[col] !== val);
    return this;
  }

  in(col: string, vals: any[]) {
    this.rows = this.rows.filter((r) => r && vals.includes(r[col]));
    return this;
  }

  or(clause: string) {
    const parts = clause
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    this.rows = this.rows.filter((r) => {
      if (!r) return false;
      return parts.some((part) => {
        const match = part.match(/^([^.]+)\.([^.]+)\.(.+)$/);
        if (!match) return false;
        const [, col, op, val] = match;
        if (op === "eq") return String(r[col]) === String(val);
        if (op === "neq") return String(r[col]) !== String(val);
        return false;
      });
    });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    const asc = opts?.ascending ?? true;
    this.rows.sort((a, b) => {
      const va = a?.[col];
      const vb = b?.[col];
      if (va == null) return 1;
      if (vb == null) return -1;
      return asc ? (va > vb ? 1 : va < vb ? -1 : 0) : va < vb ? 1 : va > vb ? -1 : 0;
    });
    return this;
  }

  limit(n: number) {
    this.rows = this.rows.slice(0, n);
    return this;
  }

  range(from: number, to: number) {
    this.rows = this.rows.slice(from, to + 1);
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data: any) {
    const items = Array.isArray(data) ? data : [data];
    const inserted = items.map((item) => ({
      id: item.id || `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      created_at: item.created_at || new Date().toISOString(),
      ...item,
    }));
    const storeArr = mockStore[this.tableName];
    if (storeArr) {
      storeArr.push(...inserted);
    }
    this.rows = inserted;
    return this;
  }

  update(data: any) {
    this.rows = this.rows.map((r) => ({ ...r, ...data }));
    return this;
  }

  delete() {
    this.rows = [];
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: any; error: null; count: number }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    let resultData: any;
    if (this.isSingle || this.isMaybeSingle) {
      resultData = this.rows.length > 0 ? this.rows[0] : null;
    } else {
      resultData = [...this.rows];
    }
    const result = { data: resultData, error: null, count: this.rows.length };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function createMockSupabaseAdmin() {
  console.warn(
    "[Supabase Admin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Operating with in-memory database mock.",
  );
  return {
    from(table: string) {
      const items = mockStore[table] ?? [];
      return new MockQueryBuilder(table, items);
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          return { data: { user: { id } }, error: null };
        },
      },
    },
  };
}

function createSupabaseAdminClient() {
  const rawUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const SUPABASE_URL = normalizeSupabaseUrl(rawUrl);
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  const isLive =
    Boolean(SUPABASE_URL) &&
    Boolean(SUPABASE_SERVICE_ROLE_KEY) &&
    SUPABASE_SERVICE_ROLE_KEY !== "sb_secret_dummy_key_for_preview_mode" &&
    SUPABASE_SERVICE_ROLE_KEY !== "sb_publishable_dummy_key_for_preview_mode";

  if (!isLive) {
    return createMockSupabaseAdmin() as any;
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_SERVICE_ROLE_KEY!),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: any | undefined;

export const supabaseAdmin = new Proxy({} as any, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
