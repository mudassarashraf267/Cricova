import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Loaded via require: Vite/Vitest strip the `node:` prefix and fail to resolve the bare `sqlite` id.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export const COLLECTIONS = ['players', 'teams', 'tournaments', 'matches'] as const;
export type Collection = (typeof COLLECTIONS)[number];
export interface UserRow { id: string; username: string; name: string; role: 'admin' | 'scorer' | 'viewer'; hash: string; created_at: string }

/** Thin document store on SQLite: one table per collection, JSON in `data`. */
export class Store {
  private db: DatabaseSyncType;

  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    for (const c of COLLECTIONS) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    }
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL)');
  }

  // ----- users (not part of the shareable snapshot) -----
  listUsers(): UserRow[] { return this.db.prepare('SELECT * FROM users ORDER BY rowid').all() as unknown as UserRow[]; }
  userByName(username: string): UserRow | undefined { return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase()) as unknown as UserRow | undefined; }
  userById(id: string): UserRow | undefined { return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined; }
  putUser(u: UserRow) {
    this.db.prepare('INSERT INTO users (id, username, name, role, hash, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, name = excluded.name, role = excluded.role, hash = excluded.hash')
      .run(u.id, u.username.toLowerCase(), u.name, u.role, u.hash, u.created_at);
  }
  deleteUser(id: string) { this.db.prepare('DELETE FROM users WHERE id = ?').run(id); }

  list<T>(c: Collection): T[] {
    return this.db.prepare(`SELECT data FROM ${c} ORDER BY rowid`).all().map((r) => JSON.parse((r as { data: string }).data) as T);
  }
  get<T>(c: Collection, id: string): T | undefined {
    const r = this.db.prepare(`SELECT data FROM ${c} WHERE id = ?`).get(id) as { data: string } | undefined;
    return r ? (JSON.parse(r.data) as T) : undefined;
  }
  put(c: Collection, id: string, doc: unknown) {
    this.db.prepare(`INSERT INTO ${c} (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(id, JSON.stringify(doc), new Date().toISOString());
  }
  delete(c: Collection, id: string): boolean {
    return Number(this.db.prepare(`DELETE FROM ${c} WHERE id = ?`).run(id).changes) > 0;
  }
  getKV<T>(key: string, fallback: T): T {
    const r = this.db.prepare('SELECT data FROM kv WHERE key = ?').get(key) as { data: string } | undefined;
    return r ? (JSON.parse(r.data) as T) : fallback;
  }
  setKV(key: string, v: unknown) {
    this.db.prepare('INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run(key, JSON.stringify(v));
  }
  /** Run fn atomically. */
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try { const out = fn(); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  close() { this.db.close(); }
}
