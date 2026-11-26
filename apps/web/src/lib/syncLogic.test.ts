import { describe, expect, it } from 'vitest';
import { allAsPending, diffDB, mergeServer } from './syncLogic';
import { makeSeed } from './seed';
import type { Player } from './domain';

const base = () => makeSeed();

describe('sync logic', () => {
  it('diffDB finds added, changed and removed documents only', () => {
    const a = base();
    const p0 = a.players[0];
    const added: Player = { ...p0, id: 'new' };
    const b = { ...a, players: [{ ...p0, name: 'Changed' }, ...a.players.slice(2), added], matches: a.matches.slice(1) };
    const d = diffDB(a, b);
    expect(d[`players/${p0.id}`]).toBe('put');
    expect(d['players/new']).toBe('put');
    expect(d[`players/${a.players[1].id}`]).toBe('del');
    expect(d[`matches/${a.matches[0].id}`]).toBe('del');
    expect(Object.keys(diffDB(a, a))).toHaveLength(0);
  });

  it('allAsPending covers every document', () => {
    const a = base();
    expect(Object.keys(allAsPending(a)).length).toBe(a.players.length + a.teams.length + a.tournaments.length + a.matches.length);
  });

  it('mergeServer: server wins, pending local changes survive', () => {
    const local = base();
    const [p1, p2] = local.players;
    const localEdited = { ...p1, name: 'Local edit' };
    const localNew: Player = { ...p1, id: 'offline-new', name: 'Made offline' };
    const state = { ...local, players: [localEdited, p2, localNew] };
    const server = {
      players: [{ ...p1, name: 'Server name' }, { ...p2, name: 'Server p2' }, { ...p1, id: 'from-other-device', name: 'Remote' }],
      teams: local.teams, tournaments: local.tournaments, matches: local.matches,
    };
    const merged = mergeServer(state, server, { [`players/${p1.id}`]: 'put', 'players/offline-new': 'put' });
    const byId = new Map(merged.players.map((p) => [p.id, p.name]));
    expect(byId.get(p1.id)).toBe('Local edit'); // pending put kept
    expect(byId.get(p2.id)).toBe('Server p2'); // server wins when nothing pending
    expect(byId.get('offline-new')).toBe('Made offline'); // not yet uploaded
    expect(byId.get('from-other-device')).toBe('Remote');
  });

  it('mergeServer: remote deletes apply, pending deletes stay deleted', () => {
    const local = base();
    const [p1, p2] = local.players;
    const server = { players: [p2], teams: local.teams, tournaments: local.tournaments, matches: local.matches };
    const merged = mergeServer(local, server, {});
    expect(merged.players.find((p) => p.id === p1.id)).toBeUndefined();
    const server2 = { ...server, players: [p1, p2] };
    const merged2 = mergeServer({ ...local, players: [p2] }, server2, { [`players/${p1.id}`]: 'del' });
    expect(merged2.players.find((p) => p.id === p1.id)).toBeUndefined();
  });
});
