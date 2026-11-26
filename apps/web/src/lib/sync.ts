import { useSyncExternalStore } from 'react';
import { applyRemote, getDB, onCommit } from './store';
import { COLLECTIONS, allAsPending, diffDB, keyOf } from './syncLogic';
import type { Coll, Pending } from './syncLogic';
import { mergeServer } from './syncLogic';
import type { DB } from './domain';

/**
 * Optional server sync. The browser copy stays the working copy (works offline); changes are queued per
 * document and pushed when the server is reachable. Other devices are told through a Server-Sent Events stream.
 * Conflict rule: last write wins per document (a whole match is one document).
 */

export type Role = 'admin' | 'scorer' | 'viewer';
export interface SyncUser { id: string; username: string; name: string; role: Role }
interface Config { url: string; token: string; user: SyncUser; linked: boolean }
export type SyncState = 'off' | 'needs-link' | 'connecting' | 'online' | 'offline' | 'signed-out' | 'read-only';
export interface SyncInfo { state: SyncState; config: Config | null; pending: number; error: string }

const CFG = 'cricketpro.sync.v1';
const PEND = 'cricketpro.sync.pending.v1';
const CLIENT = 'cricketpro.sync.client.v1';

const read = <T,>(k: string, fb: T): T => { try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : fb; } catch { return fb; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

const clientId = (() => { let id = read<string>(CLIENT, ''); if (!id) { id = Math.random().toString(36).slice(2); write(CLIENT, id); } return id; })();

let config: Config | null = read<Config | null>(CFG, null);
let pending: Pending = read<Pending>(PEND, {});
let info: SyncInfo = { state: config ? (config.linked ? 'connecting' : 'needs-link') : 'off', config, pending: Object.keys(pending).length, error: '' };
const subs = new Set<() => void>();
let es: EventSource | null = null;
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function set(patch: Partial<SyncInfo>) {
  info = { ...info, config, pending: Object.keys(pending).length, ...patch };
  subs.forEach((f) => f());
}
export const getSync = () => info;
export function useSync(): SyncInfo { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => info); }
const savePending = () => write(PEND, pending);

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function api<T>(path: string, init: RequestInit = {}, cfg = config): Promise<T> {
  if (!cfg) throw new Error('Not connected');
  const headers: Record<string, string> = { 'x-client-id': clientId };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  if (init.body) headers['content-type'] = 'application/json';
  let res: Response;
  try { res = await fetch(cfg.url + path, { ...init, headers, signal: AbortSignal.timeout(15000) }); }
  catch { throw new HttpError(0, 'Cannot reach the server'); }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, (body as { error?: string }).error ?? `Server error ${res.status}`);
  return body as T;
}

const clean = (u: string) => u.trim().replace(/\/+$/, '');

// ----- sign in / out -----
export async function serverStatus(url: string): Promise<{ authRequired: boolean; needsSetup: boolean }> {
  return api('/auth/status', {}, { url: clean(url), token: '', user: null as never, linked: false });
}

async function startSession(url: string, path: '/auth/login' | '/auth/setup', payload: object) {
  const tmp = { url: clean(url), token: '', user: null as never, linked: false };
  const out = await api<{ token: string; user: SyncUser }>(path, { method: 'POST', body: JSON.stringify(payload) }, tmp);
  const sameServer = config?.url === tmp.url;
  config = { url: tmp.url, token: out.token, user: out.user, linked: sameServer && !!config?.linked };
  write(CFG, config);
  if (!sameServer) { pending = {}; savePending(); }
  set({ state: config.linked ? 'connecting' : 'needs-link', error: '' });
  if (config.linked) void connect();
}
export const signIn = (url: string, username: string, password: string) => startSession(url, '/auth/login', { username, password });
export const firstSetup = (url: string, username: string, name: string, password: string) => startSession(url, '/auth/setup', { username, name, password });

/** For servers started with AUTH=off: no login needed. */
export function openServer(url: string) {
  config = { url: clean(url), token: '', user: { id: 'anon', username: 'anonymous', name: 'Scorer', role: 'admin' }, linked: false };
  write(CFG, config); pending = {}; savePending();
  set({ state: 'needs-link', error: '' });
}

export function signOut() {
  es?.close(); es = null; clearTimeout(flushTimer); clearTimeout(retryTimer);
  config = null; pending = {};
  localStorage.removeItem(CFG); localStorage.removeItem(PEND);
  set({ state: 'off', error: '' });
}

// ----- first link: choose which side wins -----
export async function link(mode: 'upload' | 'download') {
  if (!config) return;
  set({ state: 'connecting', error: '' });
  try {
    if (mode === 'download') {
      const server = await api<Record<Coll, { id: string }[]>>('/api/db');
      applyRemote(mergeServer(getDB(), server, {}));
      pending = {};
    } else {
      pending = allAsPending(getDB());
    }
    savePending();
    config = { ...config, linked: true };
    write(CFG, config);
    await connect();
  } catch (e) { fail(e); }
}

// ----- pulling -----
async function pull() {
  const server = await api<Record<Coll, { id: string }[]>>('/api/db');
  const local = getDB();
  const merged = mergeServer(local, server, pending);
  if (COLLECTIONS.some((c) => JSON.stringify(merged[c]) !== JSON.stringify(local[c]))) applyRemote(merged);
}

async function pullOne(c: Coll, id: string, op: 'put' | 'delete') {
  const key = keyOf(c, id);
  if (pending[key]) return; // our own newer change wins until it is pushed
  const local = getDB();
  const list = local[c] as { id: string }[];
  if (op === 'delete') { if (list.some((d) => d.id === id)) applyRemote({ ...local, [c]: list.filter((d) => d.id !== id) } as DB); return; }
  const doc = await api<{ id: string }>(`/api/${c}/${encodeURIComponent(id)}`);
  const cur = list.find((d) => d.id === id);
  if (cur && JSON.stringify(cur) === JSON.stringify(doc)) return;
  applyRemote({ ...local, [c]: cur ? list.map((d) => (d.id === id ? doc : d)) : [...list, doc] } as DB);
}

function listen() {
  es?.close();
  if (!config) return;
  const url = `${config.url}/api/stream?token=${encodeURIComponent(config.token)}`;
  es = new EventSource(url);
  es.onopen = () => { if (info.state === 'offline') set({ state: 'online', error: '' }); void pull().catch(fail); }; // catch up on anything missed
  es.onerror = () => { if (info.state === 'online') set({ state: 'offline', error: 'Connection lost, retrying…' }); };
  es.onmessage = (m) => {
    try {
      const msg = JSON.parse(m.data) as { c?: Coll; id?: string; op: string; client?: string };
      if (msg.client === clientId) return; // our own change coming back
      if (msg.op === 'reset' || !msg.c || !msg.id) void pull().catch(fail);
      else void pullOne(msg.c, msg.id, msg.op === 'delete' ? 'delete' : 'put').catch(fail);
    } catch { /* ignore malformed */ }
  };
}

export async function connect() {
  if (!config?.linked) return;
  set({ state: 'connecting', error: '' });
  try {
    await pull();
    await flush();
    if (info.state === 'connecting') set({ state: 'online' });
    listen();
  } catch (e) { fail(e); }
}

function fail(e: unknown) {
  const err = e instanceof HttpError ? e : new HttpError(0, (e as Error).message);
  if (err.status === 401) { es?.close(); es = null; set({ state: 'signed-out', error: 'Session expired. Sign in again; your changes are kept.' }); return; }
  if (err.status === 403) { set({ state: 'read-only', error: 'This account is read-only, so your changes are not uploaded.' }); return; }
  set({ state: 'offline', error: err.message });
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void connect(), 10000);
}

// ----- pushing -----
export async function flush() {
  if (flushing || !config?.linked) return;
  flushing = true;
  try {
    for (;;) {
      const key = Object.keys(pending)[0];
      if (!key) break;
      const op = pending[key];
      const [c, ...rest] = key.split('/'); const id = rest.join('/');
      const path = `/api/${c}/${encodeURIComponent(id)}`;
      if (op === 'put') {
        const doc = (getDB()[c as Coll] as { id: string }[]).find((d) => d.id === id);
        if (doc) await api(path, { method: 'PUT', body: JSON.stringify(doc) });
      } else {
        try { await api(path, { method: 'DELETE' }); } catch (e) { if (!(e instanceof HttpError && e.status === 404)) throw e; }
      }
      // only clear if it was not changed again while we were sending
      if (pending[key] === op) { delete pending[key]; savePending(); set({}); }
    }
    if (info.state === 'offline' || info.state === 'connecting') set({ state: 'online', error: '' });
  } catch (e) { fail(e); }
  finally { flushing = false; }
}

/** Authenticated call for account management screens. */
export const serverApi = <T,>(path: string, init: RequestInit = {}) => api<T>(path, init);

export function syncNow() { void connect(); }

onCommit((prev, next) => {
  if (!config?.linked) return;
  Object.assign(pending, diffDB(prev, next));
  savePending(); set({});
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 400);
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void connect());
  if (config?.linked) void connect();
}
