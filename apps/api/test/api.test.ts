import { describe, expect, it } from 'vitest';
import { T20 } from '@cricketpro/engine';
import { buildApp } from '../src/app';

const team = (p: string) => Array.from({ length: 11 }, (_, i) => `${p}${i + 1}`);
const match = () => ({
  id: 'm1', status: 'upcoming', rules: T20,
  xi: { A: team('a'), B: team('b') },
  innings: [{ battingTeamId: 'A', openers: ['a1', 'a2'], events: [], redo: [], audit: [] }],
});

describe('api (auth off)', () => {
  it('CRUD round trip', async () => {
    const app = buildApp({ auth: false });
    const created = await app.inject({ method: 'POST', url: '/api/players', payload: { name: 'Kohli' } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect((await app.inject({ url: `/api/players/${id}` })).json().name).toBe('Kohli');
    await app.inject({ method: 'PUT', url: `/api/players/${id}`, payload: { name: 'V Kohli' } });
    expect((await app.inject({ url: '/api/players' })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `/api/players/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ url: `/api/players/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/players/q', payload: [1] })).statusCode).toBe(400);
  });

  it('validates scoring events with the engine and is idempotent', async () => {
    const app = buildApp({ auth: false });
    await app.inject({ method: 'POST', url: '/api/matches', payload: match() });
    const url = '/api/matches/m1/innings/0/events';
    const ev = { id: 'e1', type: 'delivery', bowlerId: 'b1', batRuns: 4, boundary: 4 };
    expect((await app.inject({ method: 'POST', url, payload: ev })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url, payload: ev })).json().duplicate).toBe(true);
    const bad = await app.inject({ method: 'POST', url, payload: { id: 'e2', type: 'delivery', bowlerId: 'b1', batRuns: 3, wides: 1 } });
    expect(bad.statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: '/api/matches/m1/innings/9/events', payload: ev })).statusCode).toBe(404);
    const m = (await app.inject({ url: '/api/matches/m1' })).json();
    expect(m.innings[0].events).toHaveLength(1);
    expect(m.status).toBe('live');
  });

  it('snapshot restore rejects records without ids', async () => {
    const app = buildApp({ auth: false });
    const ok = await app.inject({ method: 'PUT', url: '/api/db', payload: { players: [{ id: 'p', name: 'X' }], teams: [], matches: [], tournaments: [] } });
    expect(ok.json().counts.players).toBe(1);
    const bad = await app.inject({ method: 'PUT', url: '/api/db', payload: { players: [{ name: 'no id' }], teams: [], matches: [], tournaments: [] } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ url: '/api/players' })).json()).toHaveLength(1);
  });
});

describe('api (auth on)', () => {
  const login = async (app: ReturnType<typeof buildApp>, username: string, password: string) =>
    app.inject({ method: 'POST', url: '/auth/login', payload: { username, password } });

  it('first-run setup, roles and last-admin protection', async () => {
    const app = buildApp();
    expect((await app.inject({ url: '/auth/status' })).json()).toEqual({ authRequired: true, needsSetup: true });
    expect((await app.inject({ url: '/api/players' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/setup', payload: { username: 'boss', password: 'short' } })).statusCode).toBe(400);
    const setup = await app.inject({ method: 'POST', url: '/auth/setup', payload: { username: 'Boss', name: 'The Boss', password: 'longenough1' } });
    expect(setup.statusCode).toBe(201);
    expect(setup.json().user.role).toBe('admin');
    expect((await app.inject({ method: 'POST', url: '/auth/setup', payload: { username: 'x2x', password: 'longenough1' } })).statusCode).toBe(409);
    const admin = { authorization: `Bearer ${setup.json().token}` };

    const mk = (username: string, role: string) => app.inject({ method: 'POST', url: '/api/users', headers: admin, payload: { username, password: 'password123', role } });
    const viewer = (await mk('vera', 'viewer')).json();
    expect((await mk('vera', 'scorer')).statusCode).toBe(409);
    await mk('sam', 'scorer');

    const v = { authorization: `Bearer ${(await login(app, 'vera', 'password123')).json().token}` };
    const s = { authorization: `Bearer ${(await login(app, 'SAM', 'password123')).json().token}` };
    expect((await app.inject({ url: '/api/players', headers: v })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/players', headers: v, payload: { name: 'n' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/players', headers: s, payload: { name: 'n' } })).statusCode).toBe(201);
    expect((await app.inject({ url: '/api/users', headers: s })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/db', headers: s, payload: {} })).statusCode).toBe(403);

    // role change applies to the existing token immediately
    await app.inject({ method: 'PUT', url: `/api/users/${viewer.id}`, headers: admin, payload: { role: 'scorer' } });
    expect((await app.inject({ method: 'POST', url: '/api/players', headers: v, payload: { name: 'm' } })).statusCode).toBe(201);

    const me = (await app.inject({ url: '/auth/me', headers: admin })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/users/${me.id}`, headers: admin })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: `/api/users/${me.id}`, headers: admin, payload: { role: 'viewer' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/users/${viewer.id}`, headers: admin })).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/players', headers: v })).statusCode).toBe(401); // deleted user's token is dead
  });

  it('rejects bad logins, forged tokens and throttles guessing', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/auth/setup', payload: { username: 'boss', password: 'longenough1' } });
    for (let i = 0; i < 8; i++) expect((await login(app, 'boss', 'nope')).statusCode).toBe(401);
    expect((await login(app, 'boss', 'longenough1')).statusCode).toBe(429);
    expect((await app.inject({ url: '/api/players', headers: { authorization: 'Bearer abc.def' } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/stream' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200);
  });
});
