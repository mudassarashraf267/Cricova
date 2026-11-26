import { allOvers, ballsFromOvers, battingAverage, bowlingAverage, bowlingStrikeRate, computeResult, economy, formatOvers, strikeRate } from '@cricketpro/engine';
import type { InningsState, InningsSummary, MatchResult } from '@cricketpro/engine';
import { inningsState } from './domain';
import type { DB, Match, Player } from './domain';

export interface InnView {
  index: number; battingTeamId: string; bowlingTeamId: string;
  runs: number; wickets: number; overs: string; legalBalls: number; status: InningsState['status'] | 'manual';
  state?: InningsState; manual: boolean; ballsForRate: number; wicketsToEnd: number;
}

export function inningsViews(m: Match): InnView[] {
  return m.innings.map((inn, i) => {
    if (inn.manual) {
      const lb = (() => { try { return ballsFromOvers(inn.manual.overs); } catch { return 0; } })();
      const out = inn.manual.wickets >= m.rules.playersPerSide - 1;
      return { index: i, battingTeamId: inn.battingTeamId, bowlingTeamId: inn.bowlingTeamId, runs: inn.manual.runs, wickets: inn.manual.wickets, overs: inn.manual.overs, legalBalls: lb, status: 'manual' as const, manual: true, wicketsToEnd: m.rules.playersPerSide - 1, ballsForRate: out && m.rules.oversPerInnings ? m.rules.oversPerInnings * 6 : lb };
    }
    const s = inningsState(m, i);
    const full = s.status === 'allOut' && s.oversLimit !== null ? s.oversLimit * 6 : s.legalBalls;
    return { index: i, battingTeamId: inn.battingTeamId, bowlingTeamId: inn.bowlingTeamId, runs: s.runs, wickets: s.wickets, overs: formatOvers(s.legalBalls), legalBalls: s.legalBalls, status: s.status, state: s, manual: false, ballsForRate: full, wicketsToEnd: s.wicketsToEnd };
  });
}

export function summaries(m: Match): InningsSummary[] {
  return inningsViews(m).map((v) => ({
    teamId: v.battingTeamId, runs: v.runs, wickets: v.wickets, wicketsToEnd: v.wicketsToEnd,
    status: v.status === 'manual' ? (v.wickets >= m.rules.playersPerSide - 1 ? 'allOut' : 'oversComplete') : v.status,
  }));
}

export function resultOf(m: Match, names: Record<string, string>): MatchResult {
  if (m.status === 'upcoming' && !m.override) return { kind: 'incomplete', text: 'Not started' };
  return computeResult({ teams: [m.teamAId, m.teamBId], innings: summaries(m), inningsPerTeam: m.rules.inningsPerTeam, override: m.override, names });
}

export const teamName = (db: DB, id: string) => db.teams.find((t) => t.id === id)?.name ?? db.archived?.[id] ?? 'Former team';
export const playerName = (db: DB, id?: string) => (id ? db.players.find((p) => p.id === id)?.name ?? db.archived?.[id] ?? 'Former player' : '');
export const nameMap = (db: DB) => Object.fromEntries(db.teams.map((t) => [t.id, t.name]));

// ---------- career statistics (completed ball-by-ball matches only: no double counting) ----------
export interface Career {
  player: Player;
  matches: number;
  bat: { inns: number; notOuts: number; dismissals: number; runs: number; balls: number; fours: number; sixes: number; hs: number; hsNotOut: boolean; fifties: number; hundreds: number; ducks: number; sr: number | null; avg: number | null };
  bowl: { inns: number; legalBalls: number; maidens: number; runs: number; wickets: number; bestW: number; bestR: number; fiveW: number; tenW: number; dots: number; avg: number | null; eco: number | null; sr: number | null };
  field: { catches: number; stumpings: number; runOuts: number };
}

export interface StatFilter { format?: string; from?: string; to?: string; tournamentId?: string; teamId?: string }

export function passes(m: Match, f: StatFilter) {
  if (m.status !== 'completed' || m.mode !== 'detailed') return false;
  if (f.format && m.format !== f.format) return false;
  if (f.from && m.date < f.from) return false;
  if (f.to && m.date > f.to) return false;
  if (f.tournamentId && m.tournamentId !== f.tournamentId) return false;
  return true;
}

export function careerStats(db: DB, f: StatFilter = {}): Map<string, Career> {
  const out = new Map<string, Career>();
  const get = (id: string): Career | undefined => {
    const p = db.players.find((x) => x.id === id);
    if (!p) return undefined;
    let c = out.get(id);
    if (!c) {
      c = { player: p, matches: 0, bat: { inns: 0, notOuts: 0, dismissals: 0, runs: 0, balls: 0, fours: 0, sixes: 0, hs: 0, hsNotOut: false, fifties: 0, hundreds: 0, ducks: 0, sr: null, avg: null }, bowl: { inns: 0, legalBalls: 0, maidens: 0, runs: 0, wickets: 0, bestW: 0, bestR: 0, fiveW: 0, tenW: 0, dots: 0, avg: null, eco: null, sr: null }, field: { catches: 0, stumpings: 0, runOuts: 0 } };
      out.set(id, c);
    }
    return c;
  };
  for (const m of db.matches) {
    if (!passes(m, f)) continue;
    const played = new Set<string>(); const matchWk = new Map<string, number>();
    for (const v of inningsViews(m)) {
      const s = v.state; if (!s) continue;
      if (f.teamId && v.battingTeamId !== f.teamId && v.bowlingTeamId !== f.teamId) { /* still counted for players of that team below */ }
      for (const b of Object.values(s.batters)) {
        if (b.status === 'yetToBat') continue;
        const c = get(b.id); if (!c) continue;
        played.add(b.id);
        c.bat.inns++; c.bat.runs += b.runs; c.bat.balls += b.balls; c.bat.fours += b.fours; c.bat.sixes += b.sixes;
        const out_ = b.status === 'out';
        if (out_) c.bat.dismissals++; else c.bat.notOuts++;
        if (b.runs > c.bat.hs || (b.runs === c.bat.hs && !out_)) { c.bat.hs = b.runs; c.bat.hsNotOut = !out_; }
        if (b.runs >= 100) c.bat.hundreds++; else if (b.runs >= 50) c.bat.fifties++;
        if (out_ && b.runs === 0) c.bat.ducks++;
      }
      for (const bw of Object.values(s.bowlers)) {
        const c = get(bw.id); if (!c) continue;
        played.add(bw.id);
        c.bowl.inns++; c.bowl.legalBalls += bw.legalBalls; c.bowl.maidens += bw.maidens; c.bowl.runs += bw.runs; c.bowl.wickets += bw.wickets; c.bowl.dots += bw.dots;
        if (bw.wickets > c.bowl.bestW || (bw.wickets === c.bowl.bestW && bw.wickets > 0 && bw.runs < c.bowl.bestR)) { c.bowl.bestW = bw.wickets; c.bowl.bestR = bw.runs; }
        if (bw.wickets >= 5) c.bowl.fiveW++;
        matchWk.set(bw.id, (matchWk.get(bw.id) ?? 0) + bw.wickets);
      }
      for (const ball of s.balls) {
        const w = ball.wicket; if (!w) continue;
        if (w.kind === 'caught' || w.kind === 'caughtAndBowled') { const c = w.fielderId && get(w.fielderId); if (c) { c.field.catches++; played.add(w.fielderId!); } }
        else if (w.kind === 'stumped') { const c = w.fielderId && get(w.fielderId); if (c) c.field.stumpings++; }
        else if (w.kind === 'runOut') { const c = w.fielderId && get(w.fielderId); if (c) c.field.runOuts++; }
      }
    }
    for (const id of played) { const c = get(id); if (c) c.matches++; }
    for (const [id, w] of matchWk) if (w >= 10) get(id)!.bowl.tenW++;
  }
  for (const c of out.values()) {
    c.bat.sr = strikeRate(c.bat.runs, c.bat.balls); c.bat.avg = battingAverage(c.bat.runs, c.bat.dismissals);
    c.bowl.avg = bowlingAverage(c.bowl.runs, c.bowl.wickets); c.bowl.eco = economy(c.bowl.runs, c.bowl.legalBalls); c.bowl.sr = bowlingStrikeRate(c.bowl.legalBalls, c.bowl.wickets);
  }
  if (f.teamId) {
    const ids = new Set(db.teams.find((t) => t.id === f.teamId)?.playerIds ?? []);
    for (const k of [...out.keys()]) if (!ids.has(k)) out.delete(k);
  }
  return out;
}

// ---------- team records / points table ----------
export interface TeamRecord { teamId: string; played: number; won: number; lost: number; tied: number; noResult: number; points: number; runsFor: number; ballsFor: number; runsAgainst: number; ballsAgainst: number; nrr: number }

export function teamRecords(db: DB, matches: Match[], teamIds: string[]): TeamRecord[] {
  const rec = new Map<string, TeamRecord>(teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0 }]));
  const names = nameMap(db);
  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const A = rec.get(m.teamAId), B = rec.get(m.teamBId);
    const res = resultOf(m, names);
    for (const r of [A, B]) if (r) r.played++;
    if (res.kind === 'win') {
      const w = rec.get(res.winner!), l = rec.get(res.winner === m.teamAId ? m.teamBId : m.teamAId);
      if (w) { w.won++; w.points += 2; } if (l) l.lost++;
    } else if (res.kind === 'tie') { for (const r of [A, B]) if (r) { r.tied++; r.points += 1; } }
    else { for (const r of [A, B]) if (r) { r.noResult++; r.points += 1; } }
    if (res.kind === 'win' || res.kind === 'tie') {
      for (const v of inningsViews(m)) {
        const bat = rec.get(v.battingTeamId), bowl = rec.get(v.bowlingTeamId);
        if (bat) { bat.runsFor += v.runs; bat.ballsFor += v.ballsForRate; }
        if (bowl) { bowl.runsAgainst += v.runs; bowl.ballsAgainst += v.ballsForRate; }
      }
    }
  }
  for (const r of rec.values()) {
    const f = r.ballsFor ? (r.runsFor * 6) / r.ballsFor : 0, a = r.ballsAgainst ? (r.runsAgainst * 6) / r.ballsAgainst : 0;
    r.nrr = Math.round((f - a) * 1000) / 1000;
  }
  return [...rec.values()].sort((x, y) => y.points - x.points || y.nrr - x.nrr);
}

// ---------- phases ----------
export function phaseSummary(s: InningsState) {
  const overs = allOvers(s);
  const pp = s.config.rules.powerplays[0];
  const limit = s.oversLimit ?? overs.length;
  const ppEnd = pp ? pp.toOver : Math.ceil(limit * 0.3);
  const deathStart = Math.max(ppEnd + 1, limit - Math.ceil(limit * 0.2) + 1);
  const sum = (a: number, b: number) => overs.filter((o) => o.over >= a && o.over <= b).reduce((t, o) => ({ runs: t.runs + o.runs, wickets: t.wickets + o.wickets, balls: t.balls + o.legalBalls }), { runs: 0, wickets: 0, balls: 0 });
  return [
    { phase: `Powerplay (1-${ppEnd})`, ...sum(1, ppEnd) },
    { phase: `Middle (${ppEnd + 1}-${deathStart - 1})`, ...sum(ppEnd + 1, deathStart - 1) },
    { phase: `Death (${deathStart}-${limit})`, ...sum(deathStart, limit) },
  ];
}
