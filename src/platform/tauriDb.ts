import { invoke } from '@tauri-apps/api/core';
import { SerializedDatabase } from '../core/db/baseTx';
import type { ExecResult, SqlValue, Statement } from '../core/db/types';

/** Database bridge to the Rust (rusqlite) backend. */
export class TauriDatabase extends SerializedDatabase {
  protected rawExecute(sql: string, params: SqlValue[]): Promise<ExecResult> {
    return invoke<ExecResult>('db_execute', { sql, params });
  }
  protected rawSelect<T>(sql: string, params: SqlValue[]): Promise<T[]> {
    return invoke<T[]>('db_select', { sql, params });
  }
  override async batch(statements: Statement[]): Promise<void> {
    // One IPC round-trip, executed atomically by Rust. Chunk to keep payloads reasonable.
    const CHUNK = 2500;
    if (statements.length <= CHUNK) {
      await invoke('db_batch', { statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })) });
      return;
    }
    await this.transaction(async () => {
      for (let i = 0; i < statements.length; i += CHUNK) {
        await invoke('db_batch', {
          statements: statements.slice(i, i + CHUNK).map((s) => ({ sql: s.sql, params: s.params ?? [] })),
        });
      }
    });
  }
}
