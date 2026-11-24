export type SqlValue = string | number | null | boolean;

export interface ExecResult {
  rowsAffected: number;
  lastInsertId: number | null;
}

/** Abstract SQLite access. Implemented by the Tauri (rusqlite) bridge and by sql.js (tests / browser preview). */
export interface Database {
  execute(sql: string, params?: SqlValue[]): Promise<ExecResult>;
  select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run statements atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  /** Execute many write statements atomically in one round-trip (fast path for bulk import). */
  batch(statements: Statement[]): Promise<void>;
}

export interface Statement {
  sql: string;
  params?: SqlValue[];
}

export const nowIso = (d: Date = new Date()): string => d.toISOString();
