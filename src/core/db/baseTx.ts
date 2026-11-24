import type { Database, ExecResult, SqlValue, Statement } from './types';

/**
 * Helper implementing transaction() on top of execute()/select() with a promise mutex,
 * so that concurrent callers in the same JS context never interleave inside a transaction.
 */
export abstract class SerializedDatabase implements Database {
  private queue: Promise<unknown> = Promise.resolve();
  private depth = 0;

  protected abstract rawExecute(sql: string, params: SqlValue[]): Promise<ExecResult>;
  protected abstract rawSelect<T>(sql: string, params: SqlValue[]): Promise<T[]>;

  private run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth > 0) return fn(); // inside a transaction: run directly
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  execute(sql: string, params: SqlValue[] = []): Promise<ExecResult> {
    return this.run(() => this.rawExecute(sql, params));
  }

  select<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.run(() => this.rawSelect<T>(sql, params));
  }

  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    if (this.depth > 0) return fn(this);
    return this.run(async () => {
      await this.rawExecute('BEGIN IMMEDIATE', []);
      this.depth++;
      try {
        const result = await fn(this);
        this.depth--;
        await this.rawExecute('COMMIT', []);
        return result;
      } catch (err) {
        this.depth--;
        try {
          await this.rawExecute('ROLLBACK', []);
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  }

  batch(statements: Statement[]): Promise<void> {
    return this.transaction(async (tx) => {
      for (const s of statements) await tx.execute(s.sql, s.params ?? []);
    });
  }
}
