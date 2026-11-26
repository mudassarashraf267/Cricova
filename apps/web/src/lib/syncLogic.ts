import type { DB } from './domain';

export const COLLECTIONS = ['players', 'teams', 'tournaments', 'matches'] as const;
export type Coll = (typeof COLLECTIONS)[number];
export type Op = 'put' | 'del';
/** Pending changes not yet confirmed by the server, keyed `collection/id`. */
export type Pending = Record<string, Op>;
type Doc = { id: string };

export const keyOf = (c: Coll, id: string) => `${c}/${id}`;

/** Which documents changed between two local states (compared by reference, as the store never mutates). */
export function diffDB(prev: DB, next: DB): Pending {
  const out: Pending = {};
  for (const c of COLLECTIONS) {
    const before = new Map((prev[c] as Doc[]).map((d) => [d.id, d]));
    const after = new Map((next[c] as Doc[]).map((d) => [d.id, d]));
    for (const [id, d] of after) if (before.get(id) !== d) out[keyOf(c, id)] = 'put';
    for (const id of before.keys()) if (!after.has(id)) out[keyOf(c, id)] = 'del';
  }
  return out;
}

/** Every document as a pending put (used when first uploading this device's data). */
export function allAsPending(db: DB): Pending {
  const out: Pending = {};
  for (const c of COLLECTIONS) for (const d of db[c] as Doc[]) out[keyOf(c, d.id)] = 'put';
  return out;
}

/**
 * Merge the server's documents into local data. Server wins, except for documents with a pending local change:
 * a pending put keeps the local copy, a pending delete stays deleted. Documents the server no longer has are dropped
 * unless they are pending local creations.
 */
export function mergeServer(local: DB, server: Record<Coll, Doc[]>, pending: Pending): DB {
  const next = { ...local } as DB;
  for (const c of COLLECTIONS) {
    const localDocs = new Map((local[c] as Doc[]).map((d) => [d.id, d]));
    const out: Doc[] = [];
    const seen = new Set<string>();
    for (const s of server[c]) {
      seen.add(s.id);
      const op = pending[keyOf(c, s.id)];
      if (op === 'del') continue;
      out.push(op === 'put' && localDocs.has(s.id) ? localDocs.get(s.id)! : s);
    }
    for (const [id, d] of localDocs) if (!seen.has(id) && pending[keyOf(c, id)] === 'put') out.push(d);
    (next as unknown as Record<string, Doc[]>)[c] = out;
  }
  return next;
}
