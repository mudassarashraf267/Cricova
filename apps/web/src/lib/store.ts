import { useSyncExternalStore } from 'react';
import { applyEvent, replay } from '@cricketpro/engine';
import type { InningsEvent } from '@cricketpro/engine';
import { customRules, T20 } from '@cricketpro/engine';
import { inningsConfig, inningsState, uid } from './domain';
import type { AuditRow, DB, Match, MatchInnings, Player, Team, Tournament } from './domain';
import { makeSeed } from './seed';

const KEY = 'cricketpro.db.v1';
let db: DB = load();
const subs = new Set<() => void>();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch { /* fall through to seed */ }
  const seed = makeSeed();
  try { localStorage.setItem(KEY, JSON.stringify(seed)); } catch { /* storage unavailable */ }
  return seed;
}

type CommitListener = (prev: DB, next: DB) => void;
const commitListeners = new Set<CommitListener>();
/** Called after every local change (not for changes received from the server). */
export function onCommit(f: CommitListener) { commitListeners.add(f); return () => { commitListeners.delete(f); }; }

/** Replace the data with what the server sent. Persisted and rendered, but not pushed back. */
export function applyRemote(next: DB) {
  db = next;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota: keep in memory */ }
  subs.forEach((f) => f());
}

function commit(next: DB) {
  const prev = db;
  db = next;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota: keep in memory */ }
  subs.forEach((f) => f());
  commitListeners.forEach((f) => f(prev, next));
}

export const getDB = () => db;
export function useDB(): DB {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => db);
}

export const resetToSample = () => commit(makeSeed());
export const wipeAll = () => commit({ ...makeSeed(), players: [], teams: [], matches: [], tournaments: [] });
export const exportJSON = () => JSON.stringify(db, null, 2);
export function importJSON(text: string) {
  let parsed: Partial<DB>;
  try { parsed = JSON.parse(text) as Partial<DB>; } catch { throw new Error('That file is not valid JSON'); }
  if (!parsed || !Array.isArray(parsed.players) || !Array.isArray(parsed.teams) || !Array.isArray(parsed.matches)) throw new Error('Not a Cricova backup');
  // older or hand-edited backups may lack some parts: fill them so no page crashes
  commit({ ...parsed, players: parsed.players, teams: parsed.teams, matches: parsed.matches, tournaments: Array.isArray(parsed.tournaments) ? parsed.tournaments : [], settings: { ...db.settings, ...parsed.settings } });
}

// ----- players / teams / tournaments -----
export const savePlayer = (p: Player) => commit({ ...db, players: db.players.some((x) => x.id === p.id) ? db.players.map((x) => (x.id === p.id ? p : x)) : [...db.players, p] });
export function deletePlayer(id: string) {
  const gone = db.players.find((p) => p.id === id);
  commit({ ...db, archived: { ...db.archived, ...(gone ? { [id]: gone.name } : {}) }, players: db.players.filter((p) => p.id !== id), teams: db.teams.map((t) => ({ ...t, playerIds: t.playerIds.filter((x) => x !== id), captainId: t.captainId === id ? undefined : t.captainId, viceId: t.viceId === id ? undefined : t.viceId, keeperId: t.keeperId === id ? undefined : t.keeperId })) });
}
export const saveTeam = (t: Team) => commit({ ...db, teams: db.teams.some((x) => x.id === t.id) ? db.teams.map((x) => (x.id === t.id ? t : x)) : [...db.teams, t] });
export function deleteTeam(id: string) {
  const gone = db.teams.find((t) => t.id === id);
  commit({ ...db, archived: { ...db.archived, ...(gone ? { [id]: gone.name } : {}) }, teams: db.teams.filter((t) => t.id !== id), players: db.players.map((p) => (p.teamId === id ? { ...p, teamId: undefined } : p)) });
}

/** Remove every player in one step. Names are kept for old scorecards; matches and teams are not deleted. */
export function deleteAllPlayers(): number {
  const n = db.players.length;
  commit({
    ...db,
    archived: { ...db.archived, ...Object.fromEntries(db.players.map((p) => [p.id, p.name])) },
    players: [],
    teams: db.teams.map((t) => ({ ...t, playerIds: [], captainId: undefined, viceId: undefined, keeperId: undefined })),
  });
  return n;
}

/** Remove every team in one step. Players stay (without a team); old matches keep the team names. */
export function deleteAllTeams(): number {
  const n = db.teams.length;
  commit({
    ...db,
    archived: { ...db.archived, ...Object.fromEntries(db.teams.map((t) => [t.id, t.name])) },
    teams: [],
    players: db.players.map((p) => ({ ...p, teamId: undefined })),
    tournaments: db.tournaments.map((t) => ({ ...t, teamIds: [] })),
  });
  return n;
}
/** Delete every match (and so every statistic). Players, teams and tournaments stay; fixtures become unplayed. Returns matches removed. */
export function deleteAllStats(): number {
  const n = db.matches.length;
  commit({ ...db, matches: [], tournaments: db.tournaments.map((t) => ({ ...t, fixtures: t.fixtures.map((f) => ({ ...f, matchId: undefined })) })) });
  return n;
}
export const saveTournament = (t: Tournament) => commit({ ...db, tournaments: db.tournaments.some((x) => x.id === t.id) ? db.tournaments.map((x) => (x.id === t.id ? t : x)) : [...db.tournaments, t] });
export const deleteTournament = (id: string) => commit({ ...db, tournaments: db.tournaments.filter((t) => t.id !== id) });
export const saveSettings = (s: Partial<DB['settings']>) => commit({ ...db, settings: { ...db.settings, ...s } });

// ----- matches -----
export const saveMatch = (m: Match) => commit({ ...db, matches: db.matches.some((x) => x.id === m.id) ? db.matches.map((x) => (x.id === m.id ? m : x)) : [...db.matches, m] });
export const deleteMatch = (id: string) => commit({
  ...db, matches: db.matches.filter((m) => m.id !== id),
  tournaments: db.tournaments.map((t) => ({ ...t, fixtures: t.fixtures.map((f) => (f.matchId === id ? { ...f, matchId: undefined } : f)) })),
});

const row = (action: string, detail: string, reason?: string): AuditRow => ({ at: new Date().toISOString(), action, detail, reason, user: db.settings.scorer || 'Scorer' });

function patchInnings(m: Match, i: number, patch: Partial<MatchInnings>, status?: Match['status']) {
  const innings = m.innings.map((x, k) => (k === i ? { ...x, ...patch } : x));
  saveMatch({ ...m, innings, status: status ?? m.status });
}

/** Add one event. Returns an error message (state untouched) or null. */
export function addEvent(matchId: string, i: number, ev: InningsEvent): string | null {
  const m = db.matches.find((x) => x.id === matchId)!;
  const inn = m.innings[i];
  try { applyEvent(inningsState(m, i), ev); } catch (e) { return (e as Error).message; }
  patchInnings(m, i, { events: [...inn.events, ev], redo: [], audit: [...inn.audit, row('add', ev.type === 'delivery' ? 'delivery' : ev.type)] }, 'live');
  return null;
}

export function undoEvent(matchId: string, i: number, reason = 'Undo last delivery'): string | null {
  const m = db.matches.find((x) => x.id === matchId)!;
  const inn = m.innings[i];
  const last = inn.events[inn.events.length - 1];
  if (!last) return 'Nothing to undo';
  patchInnings(m, i, { events: inn.events.slice(0, -1), redo: [...inn.redo, last], audit: [...inn.audit, row('undo', JSON.stringify(last), reason)] });
  return null;
}

export function redoEvent(matchId: string, i: number): string | null {
  const m = db.matches.find((x) => x.id === matchId)!;
  const inn = m.innings[i];
  const ev = inn.redo[inn.redo.length - 1];
  if (!ev) return 'Nothing to redo';
  try { applyEvent(inningsState(m, i), ev); } catch (e) { return (e as Error).message; }
  patchInnings(m, i, { events: [...inn.events, ev], redo: inn.redo.slice(0, -1), audit: [...inn.audit, row('redo', ev.type)] });
  return null;
}

/** Correct or delete an earlier event; the whole innings is replayed and rejected if anything later becomes illegal. */
export function correctEvent(matchId: string, i: number, eventId: string, replacement: InningsEvent | null, reason: string): string | null {
  if (!reason.trim()) return 'A reason is required';
  const m = db.matches.find((x) => x.id === matchId)!;
  const inn = m.innings[i];
  const idx = inn.events.findIndex((e) => e.id === eventId);
  if (idx < 0) return 'Event not found';
  const next = replacement ? inn.events.map((e, k) => (k === idx ? replacement : e)) : inn.events.filter((_, k) => k !== idx);
  try { replay(inningsConfig(m, i), next); } catch (e) { return `Correction rejected: ${(e as Error).message}`; }
  const detail = JSON.stringify({ original: inn.events[idx], corrected: replacement });
  patchInnings(m, i, { events: next, redo: [], audit: [...inn.audit, row(replacement ? 'edit' : 'delete', detail, reason)] });
  return null;
}

/** Immediately change the ball just entered (e.g. add runs to a wide). Validated by replaying the innings. */
export function amendLast(matchId: string, i: number, ev: InningsEvent): string | null {
  const m = db.matches.find((x) => x.id === matchId)!;
  const inn = m.innings[i];
  const last = inn.events[inn.events.length - 1];
  if (!last || last.id !== ev.id) return 'That ball is no longer the latest';
  const next = [...inn.events.slice(0, -1), ev];
  try { replay(inningsConfig(m, i), next); } catch (e) { return (e as Error).message; }
  patchInnings(m, i, { events: next, redo: [], audit: [...inn.audit, row('amend', JSON.stringify({ original: last, corrected: ev }), 'Added to the ball just entered')] });
  return null;
}

export function startInnings(matchId: string, battingTeamId: string, openers: [string, string], oversLimit?: number | null): void {
  const m = db.matches.find((x) => x.id === matchId)!;
  const bowlingTeamId = battingTeamId === m.teamAId ? m.teamBId : m.teamAId;
  const idx = m.innings.length;
  let target: number | undefined;
  const last = idx === m.rules.inningsPerTeam * 2 - 1;
  if (last) {
    const tot = (team: string) => m.innings.reduce((a, x, k) => (x.battingTeamId === team ? a + inningsState(m, k).runs : a), 0);
    target = tot(bowlingTeamId) - tot(battingTeamId) + 1;
  }
  const inn: MatchInnings = { battingTeamId, bowlingTeamId, openers, events: [], redo: [], audit: [], oversLimit, target };
  saveMatch({ ...m, innings: [...m.innings, inn], status: 'live' });
}

export const newId = uid;

// ----- quick helpers: type names, everything else is created for you -----
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
export interface QuickMatchInput {
  teams: [{ name: string; players: string[] }, { name: string; players: string[] }];
  overs: number | null; testStyle: boolean; venue: string; date: string; tournamentId?: string;
  toss: { winner: 0 | 1; decision: 'bat' | 'bowl' }; maxOversPerBowler?: number | null; freeHit: boolean; mode?: 'detailed' | 'quick';
  /** A scheduled (calendar-only) match this one replaces. */
  fromId?: string;
}

/** Creates (or reuses by name) the teams and players, then the match, in one save. Returns the match id. */
export function createQuickMatch(inp: QuickMatchInput): string {
  const players = [...db.players]; const teams = [...db.teams];
  const ids: string[] = []; const xi: Record<string, string[]> = {};
  inp.teams.forEach((t, k) => {
    const name = t.name.trim();
    let team = teams.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!team) { team = { id: uid('t'), name, color: COLORS[(teams.length + k) % COLORS.length], playerIds: [] }; teams.push(team); }
    else teams[teams.indexOf(team)] = team = { ...team, playerIds: [...team.playerIds] };
    for (const raw of t.players) {
      const pn = raw.trim(); if (!pn) continue;
      let p = players.find((x) => x.name.toLowerCase() === pn.toLowerCase() && team!.playerIds.includes(x.id));
      if (!p) { p = { id: uid('p'), name: pn, batStyle: 'Right-handed', bowlStyle: 'None', role: 'All-rounder', teamId: team.id }; players.push(p); team.playerIds.push(p.id); }
      (xi[team.id] ??= []).includes(p.id) || xi[team.id].push(p.id);
    }
    ids.push(team.id);
  });
  const size = Math.max(11, ...Object.values(xi).map((x) => x.length));
  const rules = customRules({
    oversPerInnings: inp.testStyle ? null : inp.overs, inningsPerTeam: inp.testStyle ? 2 : 1, playersPerSide: size,
    maxOversPerBowler: inp.testStyle || !inp.overs ? null : inp.maxOversPerBowler === undefined ? Math.max(1, Math.ceil(inp.overs / 5)) : inp.maxOversPerBowler,
    freeHit: inp.testStyle ? false : inp.freeHit,
  }, T20);
  const [a, b] = ids; const A = teams.find((t) => t.id === a)!, B = teams.find((t) => t.id === b)!;
  const m: Match = {
    id: uid('m'), title: `${A.name} vs ${B.name}`, teamAId: a, teamBId: b, tournamentId: inp.tournamentId,
    date: inp.date, venue: inp.venue, pitch: 'Turf', umpires: '', scorer: db.settings.scorer, time: '',
    format: inp.testStyle ? 'Multi-day' : `${inp.overs} overs`, rules, xi,
    toss: { winnerId: ids[inp.toss.winner], decision: inp.toss.decision }, innings: [], status: 'upcoming', mode: inp.mode ?? 'detailed',
  };
  let tournaments = db.tournaments;
  const tn = tournaments.find((x) => x.id === inp.tournamentId);
  if (tn) {
    const f = tn.fixtures.find((x) => !x.matchId && ((x.teamAId === a && x.teamBId === b) || (x.teamAId === b && x.teamBId === a)));
    tournaments = tournaments.map((x) => x !== tn ? x : { ...tn, fixtures: f ? tn.fixtures.map((y) => (y === f ? { ...y, matchId: m.id } : y)) : [...tn.fixtures, { id: uid('f'), teamAId: a, teamBId: b, date: inp.date, stage: 'league', matchId: m.id }] });
  }
  const old = inp.fromId ? db.matches.find((x) => x.id === inp.fromId) : undefined;
  const replaced = old && isScheduled(old) ? old : undefined;
  if (replaced) { m.time = replaced.time ?? ''; tournaments = tournaments.map((t) => ({ ...t, fixtures: t.fixtures.map((f) => (f.matchId === replaced.id ? { ...f, matchId: m.id } : f)) })); }
  commit({ ...db, players, teams, tournaments, matches: [...db.matches.filter((x) => x !== replaced), m] });
  return m.id;
}

/** A fixture that has only been put in the calendar: no toss, no squads yet. Starting it opens the new-match wizard. */
export const isScheduled = (m: Match) => m.status === 'upcoming' && !m.toss && m.innings.length === 0 && Object.values(m.xi).every((x) => x.length === 0);

export interface ScheduleInput { teamA: string; teamB: string; date: string; time: string; venue: string; overs: number | null }

/** Add an upcoming match to the calendar (teams are created by name if they do not exist). Returns the match id. */
export function scheduleMatch(inp: ScheduleInput): string {
  const teams = [...db.teams]; const ids: string[] = [];
  for (const raw of [inp.teamA, inp.teamB]) {
    const name = raw.trim();
    let t = teams.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!t) { t = { id: uid('t'), name, color: COLORS[teams.length % COLORS.length], playerIds: [] }; teams.push(t); }
    ids.push(t.id);
  }
  const [a, b] = ids; const A = teams.find((t) => t.id === a)!, B = teams.find((t) => t.id === b)!;
  const rules = customRules({ oversPerInnings: inp.overs, maxOversPerBowler: inp.overs ? Math.max(1, Math.ceil(inp.overs / 5)) : null }, T20);
  const m: Match = {
    id: uid('m'), title: `${A.name} vs ${B.name}`, teamAId: a, teamBId: b, date: inp.date, time: inp.time, venue: inp.venue.trim(), pitch: 'Turf', umpires: '', scorer: db.settings.scorer,
    format: inp.overs ? `${inp.overs} overs` : 'Multi-day', rules, xi: { [a]: [], [b]: [] }, innings: [], status: 'upcoming', mode: 'detailed',
  };
  commit({ ...db, teams, matches: [...db.matches, m] });
  return m.id;
}

/** Change the date, time or ground of a match that has not started. */
export function rescheduleMatch(id: string, p: { date: string; time: string; venue: string }) {
  const m = db.matches.find((x) => x.id === id); if (!m || m.status !== 'upcoming') return;
  saveMatch({ ...m, date: p.date, time: p.time, venue: p.venue.trim() });
}

/** Add a new player (by typed name) to a team and to the match's XI. Returns the new player id. */
export function addPlayerToMatch(matchId: string, teamId: string, name: string): string | null {
  const nm = name.trim(); if (!nm) return null;
  const m = db.matches.find((x) => x.id === matchId); if (!m) return null;
  const existing = db.players.find((p) => p.name.toLowerCase() === nm.toLowerCase() && m.xi[teamId]?.includes(p.id));
  if (existing) return existing.id;
  const p: Player = { id: uid('p'), name: nm, batStyle: 'Right-handed', bowlStyle: 'None', role: 'All-rounder', teamId };
  const xi = { ...m.xi, [teamId]: [...(m.xi[teamId] ?? []), p.id] };
  const rules = { ...m.rules, playersPerSide: Math.max(m.rules.playersPerSide, xi[teamId].length) };
  commit({
    ...db, players: [...db.players, p],
    teams: db.teams.map((t) => (t.id === teamId && !t.playerIds.includes(p.id) ? { ...t, playerIds: [...t.playerIds, p.id] } : t)),
    matches: db.matches.map((x) => (x.id === matchId ? { ...m, xi, rules } : x)),
  });
  return p.id;
}
