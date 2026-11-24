import { describe, expect, it, vi } from 'vitest';
import { memoryDb } from '../helpers/db';
import { MIGRATIONS, runMigrations, getAppliedVersions } from '../../src/core/db/migrations';

describe('migrations', () => {
  it('applies all migrations on fresh DB and is idempotent', async () => {
    const db = await memoryDb(false);
    const backup = vi.fn(async () => {});
    expect(await runMigrations(db, { beforeMigrate: backup })).toEqual(MIGRATIONS.map((m) => m.version));
    expect(backup).not.toHaveBeenCalled(); // fresh install: nothing to back up
    expect(await runMigrations(db, { beforeMigrate: backup })).toEqual([]);
    expect(await getAppliedVersions(db)).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it('backs up before upgrading and rolls back a failing migration', async () => {
    const db = await memoryDb(true);
    const backup = vi.fn(async () => {});
    const bad = [...MIGRATIONS, { version: 99, name: 'broken', sql: 'CREATE TABLE ok_table (id INTEGER);\nTHIS IS NOT SQL;' }];
    await expect(runMigrations(db, { migrations: bad, beforeMigrate: backup })).rejects.toThrow();
    expect(backup).toHaveBeenCalledTimes(1);
    const t = await db.select("SELECT name FROM sqlite_master WHERE name = 'ok_table'");
    expect(t).toHaveLength(0);
    expect(await getAppliedVersions(db)).not.toContain(99);
  });
});
