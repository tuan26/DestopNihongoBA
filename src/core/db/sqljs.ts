import type { Database as SqlJsDb, SqlJsStatic } from 'sql.js';
import { SerializedDatabase } from './baseTx';
import type { ExecResult, SqlValue } from './types';

const norm = (p: SqlValue[]) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));

/** sql.js (SQLite compiled to WASM) adapter — used by tests and the browser preview build. */
export class SqlJsDatabase extends SerializedDatabase {
  onWrite?: () => void;
  constructor(public readonly raw: SqlJsDb) {
    super();
    raw.run('PRAGMA foreign_keys = ON');
  }

  static async create(SQL: SqlJsStatic, data?: Uint8Array): Promise<SqlJsDatabase> {
    return new SqlJsDatabase(data ? new SQL.Database(data) : new SQL.Database());
  }

  protected async rawExecute(sql: string, params: SqlValue[]): Promise<ExecResult> {
    this.raw.run(sql, norm(params) as never);
    const rowsAffected = this.raw.getRowsModified();
    const r = this.raw.exec('SELECT last_insert_rowid() AS id');
    const lastInsertId = (r[0]?.values[0]?.[0] as number | undefined) ?? null;
    if (!/^\s*(BEGIN|SELECT)/i.test(sql)) this.onWrite?.();
    return { rowsAffected, lastInsertId };
  }

  protected async rawSelect<T>(sql: string, params: SqlValue[]): Promise<T[]> {
    const stmt = this.raw.prepare(sql);
    try {
      stmt.bind(norm(params) as never);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  export(): Uint8Array {
    return this.raw.export();
  }
}
