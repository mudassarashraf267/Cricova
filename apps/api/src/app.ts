import { randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { applyEvent, replay, ScoringError } from '@cricketpro/engine';
import type { InningsConfig, InningsEvent, RuleProfile } from '@cricketpro/engine';
import { COLLECTIONS, Store } from './db';
import type { Collection, UserRow } from './db';
import { LoginLimiter, ROLES, hashPassword, signToken, verifyPassword, verifyToken } from './auth';
import type { Role, TokenUser } from './auth';

/** Shapes mirror apps/web/src/lib/domain.ts (kept loose: the engine is the real validator). */
interface MatchInnings {
  battingTeamId: string; openers: [string, string];
  events: InningsEvent[]; redo: InningsEvent[]; audit: unknown[];
  oversLimit?: number | null; target?: number;
}
interface Match { id: string; rules: RuleProfile; xi: Record<string, string[]>; innings: MatchInnings[]; status: string }

declare module 'fastify' { interface FastifyRequest { user?: TokenUser } }

const uid = () => `x_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
const ANON: TokenUser = { id: 'anon', username: 'anonymous', name: 'Scorer', role: 'admin' };

export function inningsConfig(m: Match, i: number): InningsConfig {
  const inn = m.innings[i];
  const xi = m.xi[inn.battingTeamId] ?? [];
  const order = [...inn.openers, ...xi.filter((p) => !inn.openers.includes(p))];
  return { rules: m.rules, battingOrder: order, openers: inn.openers, target: inn.target, oversLimit: inn.oversLimit };
}

export interface AppOptions {
  store?: Store;
  /** Require login (default true). When false every caller is an anonymous admin; use only on a trusted LAN or in tests. */
  auth?: boolean;
  /** Folder with the built web app (apps/web/dist) to serve at /. Skipped if missing. */
  webDir?: string;
  /** Token signing secret. Defaults to one generated once and kept in the database. */
  secret?: string;
  logger?: boolean;
}

const publicUser = (u: UserRow) => ({ id: u.id, username: u.username, name: u.name, role: u.role, created_at: u.created_at });
const validUsername = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9._-]{3,32}$/.test(s);
const validPassword = (s: unknown): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 200;

export function buildApp(opts: AppOptions = {}) {
  const store = opts.store ?? new Store();
  const authOn = opts.auth ?? true;
  let secret = opts.secret ?? store.getKV<string | null>('secret', null);
  if (!secret) { secret = randomBytes(32).toString('hex'); store.setKV('secret', secret); }
  const limiter = new LoginLimiter();
  const app = Fastify({
    // the event stream carries the token in its query string: never write queries to the logs
    logger: opts.logger ? { serializers: { req: (r) => ({ method: r.method, url: r.url?.split('?')[0], remoteAddress: r.ip }) } } : false, bodyLimit: 25 * 1024 * 1024 });
  app.register(cors, { origin: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['content-type', 'authorization', 'x-client-id'] });

  if (opts.webDir && existsSync(opts.webDir)) app.register(fastifyStatic, { root: opts.webDir });

  // ----- live change stream (Server-Sent Events) -----
  const clients = new Set<import('node:http').ServerResponse>();
  const broadcast = (msg: object) => { const line = `data: ${JSON.stringify(msg)}\n\n`; for (const c of clients) c.write(line); };

  // ----- auth gate -----
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (req.method === 'OPTIONS' || path === '/health' || !(path.startsWith('/api/') || path.startsWith('/auth/')) || path === '/auth/status' || path === '/auth/setup' || path === '/auth/login') return;
    if (!authOn) { req.user = ANON; return; }
    const header = req.headers.authorization;
    // EventSource cannot set headers, so the stream (and only the stream) also accepts ?token=
    const token = header?.startsWith('Bearer ') ? header.slice(7) : path === '/api/stream' ? (req.query as { token?: string }).token : undefined;
    const user = token ? verifyToken(token, secret!) : null;
    if (!user || !store.userById(user.id)) return reply.code(401).send({ error: 'Sign in required' });
    const live = store.userById(user.id)!; // role changes take effect immediately
    req.user = { id: live.id, username: live.username, name: live.name, role: live.role };
    const adminOnly = path.startsWith('/api/users') || (path === '/api/db' && req.method !== 'GET');
    if (adminOnly && req.user.role !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    if (req.method !== 'GET' && req.user.role === 'viewer') return reply.code(403).send({ error: 'Your account is read-only' });
  });

  app.get('/health', async () => ({ ok: true, service: 'cricketpro-api' }));

  // ----- accounts -----
  const session = (u: UserRow) => ({ token: signToken({ id: u.id, username: u.username, name: u.name, role: u.role }, secret!), user: publicUser(u) });
  app.get('/auth/status', async () => ({ authRequired: authOn, needsSetup: authOn && store.listUsers().length === 0 }));
  app.post<{ Body: { username?: string; name?: string; password?: string } }>('/auth/setup', async (req, reply) => {
    if (!authOn || store.listUsers().length > 0) return reply.code(409).send({ error: 'Already set up' });
    const { username, name, password } = req.body ?? {};
    if (!validUsername(username)) return reply.code(400).send({ error: 'Username: 3-32 letters, digits, . _ -' });
    if (!validPassword(password)) return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    const u: UserRow = { id: randomUUID(), username: username.toLowerCase(), name: name?.trim() || username, role: 'admin', hash: await hashPassword(password), created_at: new Date().toISOString() };
    store.putUser(u);
    return reply.code(201).send(session(u));
  });
  app.post<{ Body: { username?: string; password?: string } }>('/auth/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') return reply.code(400).send({ error: 'Username and password required' });
    const key = username.toLowerCase();
    if (limiter.blocked(key)) return reply.code(429).send({ error: 'Too many failed attempts. Try again later.' });
    const u = store.userByName(key);
    if (!u || !(await verifyPassword(password, u.hash))) { limiter.fail(key); return reply.code(401).send({ error: 'Wrong username or password' }); }
    limiter.clear(key);
    return session(u);
  });
  app.get('/auth/me', async (req) => req.user);

  app.get('/api/users', async () => store.listUsers().map(publicUser));
  app.post<{ Body: { username?: string; name?: string; password?: string; role?: Role } }>('/api/users', async (req, reply) => {
    const { username, name, password, role } = req.body ?? {};
    if (!validUsername(username)) return reply.code(400).send({ error: 'Username: 3-32 letters, digits, . _ -' });
    if (!validPassword(password)) return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    if (!role || !ROLES.includes(role)) return reply.code(400).send({ error: 'Role must be admin, scorer or viewer' });
    if (store.userByName(username)) return reply.code(409).send({ error: 'Username taken' });
    const u: UserRow = { id: randomUUID(), username: username.toLowerCase(), name: name?.trim() || username, role, hash: await hashPassword(password), created_at: new Date().toISOString() };
    store.putUser(u);
    return reply.code(201).send(publicUser(u));
  });
  app.put<{ Params: { id: string }; Body: { name?: string; password?: string; role?: Role } }>('/api/users/:id', async (req, reply) => {
    const u = store.userById(req.params.id);
    if (!u) return reply.code(404).send({ error: 'Not found' });
    const { name, password, role } = req.body ?? {};
    if (role !== undefined && !ROLES.includes(role)) return reply.code(400).send({ error: 'Bad role' });
    if (password !== undefined && !validPassword(password)) return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    const next = { ...u, name: name?.trim() || u.name, role: role ?? u.role, hash: password ? await hashPassword(password) : u.hash };
    if (u.role === 'admin' && next.role !== 'admin' && store.listUsers().filter((x) => x.role === 'admin').length < 2) return reply.code(409).send({ error: 'Cannot demote the last admin' });
    store.putUser(next);
    return publicUser(next);
  });
  app.delete<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    const u = store.userById(req.params.id);
    if (!u) return reply.code(404).send({ error: 'Not found' });
    if (u.role === 'admin' && store.listUsers().filter((x) => x.role === 'admin').length < 2) return reply.code(409).send({ error: 'Cannot delete the last admin' });
    store.deleteUser(u.id);
    return reply.code(204).send();
  });

  // ----- generic collections -----
  for (const c of COLLECTIONS) {
    app.get(`/api/${c}`, async () => store.list(c));
    app.get<{ Params: { id: string } }>(`/api/${c}/:id`, async (req, reply) => store.get(c, req.params.id) ?? reply.code(404).send({ error: 'Not found' }));
    app.post(`/api/${c}`, async (req, reply) => {
      const doc = req.body as { id?: string } | null;
      if (!doc || typeof doc !== 'object') return reply.code(400).send({ error: 'Body must be a JSON object' });
      const id = doc.id ?? uid();
      if (store.get(c, id)) return reply.code(409).send({ error: 'Already exists; use PUT' });
      store.put(c, id, { ...doc, id });
      broadcast({ c, id, op: 'put', by: req.user!.id, client: req.headers["x-client-id"] });
      return reply.code(201).send({ ...doc, id });
    });
    app.put<{ Params: { id: string } }>(`/api/${c}/:id`, async (req, reply) => {
      const doc = req.body as object | null;
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return reply.code(400).send({ error: 'Body must be a JSON object' });
      const next = { ...doc, id: req.params.id };
      store.put(c, req.params.id, next);
      broadcast({ c, id: req.params.id, op: 'put', by: req.user!.id, client: req.headers["x-client-id"] });
      return next;
    });
    app.delete<{ Params: { id: string } }>(`/api/${c}/:id`, async (req, reply) => {
      if (!store.delete(c, req.params.id)) return reply.code(404).send({ error: 'Not found' });
      broadcast({ c, id: req.params.id, op: 'delete', by: req.user!.id, client: req.headers["x-client-id"] });
      return reply.code(204).send();
    });
  }

  // ----- scoring: server re-validates every event with the shared engine -----
  app.post<{ Params: { id: string; i: string }; Body: InningsEvent }>('/api/matches/:id/innings/:i/events', async (req, reply) => {
    const i = Number(req.params.i);
    const ev = req.body;
    if (!ev || typeof ev !== 'object' || typeof ev.id !== 'string' || typeof ev.type !== 'string') return reply.code(400).send({ error: 'Event needs id and type' });
    const out = store.tx(() => {
      const m = store.get<Match>('matches', req.params.id);
      if (!m) return { code: 404, body: { error: 'Match not found' } };
      const inn = m.innings?.[i];
      if (!Number.isInteger(i) || !inn) return { code: 404, body: { error: 'Innings not found' } };
      if (inn.events.some((e) => e.id === ev.id)) return { code: 200, body: { duplicate: true, events: inn.events.length } }; // idempotent (offline sync)
      try {
        applyEvent(replay(inningsConfig(m, i), inn.events), ev);
      } catch (e) {
        if (e instanceof ScoringError) return { code: 422, body: { error: e.message } };
        throw e;
      }
      inn.events.push(ev);
      inn.redo = [];
      inn.audit.push({ at: new Date().toISOString(), action: 'add', detail: ev.type, user: req.user!.name });
      m.status = 'live';
      store.put('matches', m.id, m);
      return { code: 201, body: { duplicate: false, events: inn.events.length }, changed: m.id };
    });
    if ('changed' in out) broadcast({ c: 'matches', id: out.changed, op: 'put', by: req.user!.id, client: req.headers["x-client-id"] });
    return reply.code(out.code).send(out.body);
  });

  // ----- snapshot: backup / restore / first sync from a browser -----
  app.get('/api/db', async () => Object.fromEntries(COLLECTIONS.map((c) => [c, store.list(c)])));
  app.put('/api/db', async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || !COLLECTIONS.every((c) => Array.isArray(body[c]) && (body[c] as { id?: unknown }[]).every((d) => d && typeof d.id === 'string'))) {
      return reply.code(400).send({ error: 'Not a CricketPro backup (every record needs an id)' });
    }
    store.tx(() => {
      for (const c of COLLECTIONS as readonly Collection[]) {
        for (const old of store.list<{ id: string }>(c)) store.delete(c, old.id);
        for (const doc of body[c] as { id: string }[]) store.put(c, doc.id, doc);
      }
    });
    broadcast({ op: 'reset', by: req.user!.id, client: req.headers["x-client-id"] });
    return { ok: true, counts: Object.fromEntries(COLLECTIONS.map((c) => [c, (body[c] as unknown[]).length])) };
  });

  app.get('/api/stream', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive',
      'access-control-allow-origin': req.headers.origin ?? '*', vary: 'Origin',
    });
    res.write(': connected\n\n');
    clients.add(res);
    const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => { clearInterval(beat); clients.delete(res); });
  });

  app.addHook('onClose', async () => { for (const c of clients) c.end(); clients.clear(); store.close(); });
  return app;
}
