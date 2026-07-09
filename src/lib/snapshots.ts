import type { GeoEvent } from './providers/types';

/** Local-only snapshot baselines in IndexedDB (never sent anywhere).
 *  7-day retention: older snapshots are pruned on load. */

export interface Snapshot {
  id: string;
  name: string;
  at: number;
  events: GeoEvent[];
}

export interface SnapshotMeta {
  id: string;
  name: string;
  at: number;
  count: number;
}

const DB_NAME = 'terra-watch';
const STORE = 'snapshots';
const RETENTION_MS = 7 * 24 * 3600 * 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putSnapshot(s: Snapshot): Promise<void> {
  const db = await openDb();
  await tx(db, 'readwrite', (st) => st.put(s));
  db.close();
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  const db = await openDb();
  const s = await tx<Snapshot | undefined>(db, 'readonly', (st) => st.get(id) as IDBRequest<Snapshot | undefined>);
  db.close();
  return s;
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb();
  await tx(db, 'readwrite', (st) => st.delete(id));
  db.close();
}

/** List snapshot metadata (newest first), pruning anything past retention. */
export async function listSnapshots(now = Date.now()): Promise<SnapshotMeta[]> {
  const db = await openDb();
  const all = await tx<Snapshot[]>(db, 'readonly', (st) => st.getAll() as IDBRequest<Snapshot[]>);
  const stale = all.filter((s) => now - s.at > RETENTION_MS);
  for (const s of stale) await tx(db, 'readwrite', (st) => st.delete(s.id));
  db.close();
  return all
    .filter((s) => now - s.at <= RETENTION_MS)
    .sort((a, b) => b.at - a.at)
    .map((s) => ({ id: s.id, name: s.name, at: s.at, count: s.events.length }));
}

export interface SnapshotDelta {
  snapshotId: string;
  snapshotAt: number;
  added: number;
  removed: number;
}

/** Deviation vs a baseline: events that appeared / disappeared since the snapshot,
 *  by event id. A transparent count over public data — labeled delta, not prediction. */
export function diffSnapshot(snapshot: Snapshot, current: GeoEvent[]): SnapshotDelta {
  const snapIds = new Set(snapshot.events.map((e) => e.id));
  const curIds = new Set(current.map((e) => e.id));
  let added = 0;
  for (const id of curIds) if (!snapIds.has(id)) added++;
  let removed = 0;
  for (const id of snapIds) if (!curIds.has(id)) removed++;
  return { snapshotId: snapshot.id, snapshotAt: snapshot.at, added, removed };
}
