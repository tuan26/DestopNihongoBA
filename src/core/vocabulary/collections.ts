import type { Database } from '../db/types';
import { nowIso } from '../db/types';

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  count: number;
}

export async function listCollections(db: Database): Promise<Collection[]> {
  const rows = await db.select<Collection>(
    `SELECT c.*, (SELECT COUNT(*) FROM collection_items i WHERE i.collection_id = c.id) AS count
     FROM collections c ORDER BY c.name`,
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

export async function createCollection(db: Database, name: string, description?: string): Promise<number> {
  const n = name.trim();
  if (!n) throw new Error('Tên collection không được để trống');
  const exists = await db.select('SELECT id FROM collections WHERE name = ?', [n]);
  if (exists.length) throw new Error('Collection đã tồn tại');
  const r = await db.execute('INSERT INTO collections (name, description, created_at) VALUES (?, ?, ?)', [
    n,
    description?.trim() || null,
    nowIso(),
  ]);
  return r.lastInsertId!;
}

export async function renameCollection(db: Database, id: number, name: string, description?: string | null) {
  await db.execute('UPDATE collections SET name = ?, description = ? WHERE id = ?', [name.trim(), description ?? null, id]);
}

export async function deleteCollection(db: Database, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM collection_items WHERE collection_id = ?', [id]);
    await tx.execute('DELETE FROM collections WHERE id = ?', [id]);
  });
}

export async function addToCollection(db: Database, collectionId: number, vocabularyId: number): Promise<void> {
  await db.execute('INSERT OR IGNORE INTO collection_items (collection_id, vocabulary_id, added_at) VALUES (?, ?, ?)', [
    collectionId,
    vocabularyId,
    nowIso(),
  ]);
}

export async function removeFromCollection(db: Database, collectionId: number, vocabularyId: number): Promise<void> {
  await db.execute('DELETE FROM collection_items WHERE collection_id = ? AND vocabulary_id = ?', [collectionId, vocabularyId]);
}

export async function collectionsOf(db: Database, vocabularyId: number): Promise<number[]> {
  const rows = await db.select<{ collection_id: number }>(
    'SELECT collection_id FROM collection_items WHERE vocabulary_id = ?',
    [vocabularyId],
  );
  return rows.map((r) => Number(r.collection_id));
}
