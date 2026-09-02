import { getTable, persist } from "./db";
import { emitChange } from "./realtime";

type Row = Record<string, unknown>;
type Result<T> = { data: T | null; error: { message: string } | null };

type Filter = { col: string; op: "eq" | "neq" | "ilike" | "in"; val: unknown };

function matchIlike(value: unknown, pattern: string): boolean {
  if (typeof value !== "string") return false;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * A minimal in-memory stand-in for postgrest-js's chainable query builder —
 * covers exactly the surface this app calls (.select/.insert/.update/.upsert/
 * .delete, .eq/.neq/.ilike/.in, .order/.limit, .single/.maybeSingle) against
 * the mock tables in ./db. Thenable, so `await supabase.from(x)...` works
 * exactly like the real client.
 */
export class MockQueryBuilder<T extends Row = Row> implements PromiseLike<Result<T | T[]>> {
  private filters: Filter[] = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload?: T | T[];
  private upsertConflict?: string[];
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(private table: string) {}

  select(_cols?: string) {
    void _cols;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ col, op: "neq", val });
    return this;
  }
  ilike(col: string, val: string) {
    this.filters.push({ col, op: "ilike", val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ col, op: "in", val: vals });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }
  insert(payload: T | T[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Partial<T>) {
    this.mode = "update";
    this.payload = payload as T;
    return this;
  }
  upsert(payload: T | T[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.upsertConflict = opts?.onConflict?.split(",").map((s) => s.trim());
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.col];
      switch (f.op) {
        case "eq":
          return v === f.val;
        case "neq":
          return v !== f.val;
        case "ilike":
          return matchIlike(v, f.val as string);
        case "in":
          return Array.isArray(f.val) && (f.val as unknown[]).includes(v);
        default:
          return true;
      }
    });
  }

  private sortAndLimit(rows: Row[]): Row[] {
    let out = rows;
    if (this.orderCol) {
      const col = this.orderCol;
      out = out.slice().sort((a, b) => {
        const av = a[col] as string | number | null;
        const bv = b[col] as string | number | null;
        if (av == null && bv == null) return 0;
        if (av == null) return this.orderAsc ? -1 : 1;
        if (bv == null) return this.orderAsc ? 1 : -1;
        if (av < bv) return this.orderAsc ? -1 : 1;
        if (av > bv) return this.orderAsc ? 1 : -1;
        return 0;
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  private execute(): Result<T | T[]> {
    try {
      const table = getTable(this.table);

      if (this.mode === "select") {
        // Copy each row on the way out. Reads used to hand back the live store
        // objects, so an update() that mutated a row in place also mutated the
        // copy React Query was already holding — the refetch then compared
        // deeply equal to itself, structural sharing kept the old reference,
        // and nothing re-rendered until a full reload. Accepting a referral
        // wrote through to the database and left the screen showing the old
        // state. Real PostgREST returns fresh JSON every time; so does this now.
        const rows = this.sortAndLimit(table.filter((r) => this.matches(r))).map((r) => ({ ...r }));
        if (this.wantSingle) {
          if (rows.length !== 1) return { data: null, error: { message: rows.length === 0 ? "Row not found" : "Multiple rows returned" } };
          return { data: rows[0] as T, error: null };
        }
        if (this.wantMaybeSingle) {
          if (rows.length > 1) return { data: null, error: { message: "Multiple rows returned" } };
          return { data: (rows[0] as T) ?? null, error: null };
        }
        return { data: rows as T[], error: null };
      }

      if (this.mode === "insert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as T[];
        const inserted = items.map((item) => {
          const row: Row = { id: newId(), created_at: new Date().toISOString(), ...item };
          table.push(row);
          emitChange(this.table, "INSERT", row);
          return row;
        });
        persist();
        if (this.wantSingle) return { data: (inserted[0] as T) ?? null, error: null };
        return { data: inserted as T[], error: null };
      }

      if (this.mode === "update") {
        const matched = table.filter((r) => this.matches(r));
        for (const row of matched) {
          Object.assign(row, this.payload);
          emitChange(this.table, "UPDATE", row);
        }
        persist();
        if (this.wantSingle) {
          if (matched.length !== 1) return { data: null, error: { message: "no/multiple rows matched" } };
          return { data: matched[0] as T, error: null };
        }
        if (this.wantMaybeSingle) return { data: (matched[0] as T) ?? null, error: null };
        return { data: matched as T[], error: null };
      }

      if (this.mode === "upsert") {
        const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const conflictCols = this.upsertConflict;
        const results = items.map((item) => {
          let existing: Row | undefined;
          if (item.id) existing = table.find((r) => r.id === item.id);
          else if (conflictCols?.length) existing = table.find((r) => conflictCols.every((c) => r[c] === item[c]));
          if (existing) {
            Object.assign(existing, item);
            return existing;
          }
          const row: Row = { id: newId(), created_at: new Date().toISOString(), ...item };
          table.push(row);
          return row;
        });
        persist();
        if (this.wantSingle) return { data: (results[0] as T) ?? null, error: null };
        return { data: results as T[], error: null };
      }

      if (this.mode === "delete") {
        const matched = table.filter((r) => this.matches(r));
        const ids = new Set(matched.map((r) => r.id));
        const remaining = table.filter((r) => !ids.has(r.id));
        table.length = 0;
        table.push(...remaining);
        persist();
        return { data: matched as T[], error: null };
      }

      return { data: null, error: { message: `Unsupported mode ${this.mode}` } };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }

  then<TResult1 = Result<T | T[]>, TResult2 = never>(
    onfulfilled?: ((value: Result<T | T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
