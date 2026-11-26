import { applyEvent, createInnings, T10 } from '@cricketpro/engine';
import type { InningsEvent, InningsState } from '@cricketpro/engine';
import { uid } from './domain';
import type { DB, Match, MatchInnings, Player, Team, Tournament } from './domain';

function prng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Plays out a random but rule-valid innings through the real engine. Used for sample data and demos. */
export function simulateInnings(cfg: Parameters<typeof createInnings>[0], bowlerPool: string[], fielders: string[], rnd: () => number, strength = 1): InningsEvent[] {
  let s: InningsState = createInnings(cfg);
  const events: InningsEvent[] = [];
  const maxBalls = 700;
  while (s.status === 'inProgress' && events.length < maxBalls) {
    const cur = s.currentOver?.bowlerId;
    const max = s.config.rules.maxOversPerBowler;
    const ok = bowlerPool.filter((b) => b !== s.lastOverBowlerId && (max === null || (s.bowlers[b]?.legalBalls ?? 0) < max * 6));
    const bowlerId = cur ?? ok[Math.floor(rnd() * ok.length)];
    if (!bowlerId) break;
    const r = rnd();
    const e: any = { type: 'delivery', id: uid('e'), bowlerId, batRuns: 0 };
    const wkP = 0.045 / strength;
    if (r < 0.26) e.batRuns = 0;
    else if (r < 0.5) e.batRuns = 1;
    else if (r < 0.6) e.batRuns = 2;
    else if (r < 0.62) e.batRuns = 3;
    else if (r < 0.72 * 1) { e.batRuns = 4; e.boundary = 4; }
    else if (r < 0.78 + (strength - 1) * 0.02) { e.batRuns = 6; e.boundary = 6; }
    else if (r < 0.82) e.wides = 1;
    else if (r < 0.835) { e.noBall = true; e.batRuns = rnd() < 0.5 ? 1 : 0; }
    else if (r < 0.86) e.byes = 1;
    else if (r < 0.88) e.legByes = 1;
    else if (r < 0.88 + wkP * 2.2) {
      const nextBatterId = Object.values(s.batters).find((b) => b.status === 'yetToBat')?.id;
      const lastWicket = s.wickets + 1 >= s.wicketsToEnd;
      const k = rnd();
      const kind = s.freeHit ? 'runOut' : k < 0.35 ? 'bowled' : k < 0.7 ? 'caught' : k < 0.82 ? 'lbw' : k < 0.92 ? 'runOut' : 'stumped';
      const fielderId = kind === 'caught' || kind === 'runOut' || kind === 'stumped' ? fielders[Math.floor(rnd() * fielders.length)] : undefined;
      e.wicket = { kind, fielderId, nextBatterId: lastWicket ? undefined : nextBatterId };
    }
    if (e.noBall && e.wicket) delete e.wicket;
    try { s = applyEvent(s, e); events.push(e); } catch { /* skip invalid draw */ }
  }
  return events;
}

const FIRST = ['Arjun', 'Bilal', 'Callum', 'Danish', 'Ethan', 'Farhan', 'Gavin', 'Hamza', 'Imran', 'Jasper', 'Kabir', 'Liam', 'Mohit', 'Nadeem', 'Owen', 'Pranav', 'Qasim', 'Rohan', 'Sameer', 'Tariq', 'Umar', 'Vikram', 'Wasim', 'Xavier', 'Yusuf', 'Zane', 'Adil', 'Brandon', 'Chetan', 'Dev', 'Eshan', 'Faisal', 'Gurpreet', 'Hassan', 'Ishaan', 'Jamal', 'Karan', 'Lucas', 'Mateo', 'Noah', 'Omar', 'Peter', 'Rizwan', 'Sajid', 'Tom', 'Usman'];
const LAST = ['Khan', 'Sharma', 'Brooks', 'Malik', 'Carter', 'Rao', 'Patel', 'Ahmed', 'Hughes', 'Singh', 'Ali', 'Fisher', 'Iqbal', 'Reed', 'Nair', 'Shah', 'Cole', 'Verma', 'Butt', 'Moore'];
const ROLES = ['Batter', 'Batter', 'Batter', 'Wicketkeeper', 'All-rounder', 'All-rounder', 'All-rounder', 'Bowler', 'Bowler', 'Bowler', 'Bowler'] as const;
const BOWL = ['Right-arm fast', 'Left-arm fast', 'Right-arm medium', 'Right-arm off-spin', 'Left-arm orthodox', 'Right-arm leg-spin'];
const TEAMS: [string, string, string, string][] = [
  ['Riverside Rangers', '#10b981', 'Riverside Oval', 'North'],
  ['Harbor Hawks', '#3b82f6', 'Harbor Ground', 'Coastal'],
  ['Summit Strikers', '#f59e0b', 'Summit Park', 'Highland'],
  ['Delta Dragons', '#ef4444', 'Delta Field', 'South'],
];

export function makeSeed(): DB {
  const rnd = prng(2024);
  const players: Player[] = [];
  const teams: Team[] = TEAMS.map(([name, color, ground, region], ti) => {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const n = ti * 12 + i;
      const role = i === 11 ? 'Batter' : ROLES[i];
      const p: Player = {
        id: `p_${n + 1}`, name: `${FIRST[n % FIRST.length]} ${LAST[(n * 7 + ti) % LAST.length]}`,
        batStyle: rnd() < 0.25 ? 'Left-handed' : 'Right-handed',
        bowlStyle: role === 'Batter' || role === 'Wicketkeeper' ? 'None' : BOWL[Math.floor(rnd() * BOWL.length)],
        role: role as Player['role'], jersey: i + 1, teamId: `t_${ti + 1}`,
      };
      players.push(p); ids.push(p.id);
    }
    return { id: `t_${ti + 1}`, name, color, ground, region, playerIds: ids, captainId: ids[0], viceId: ids[1], keeperId: ids[3] };
  });

  const tour: Tournament = { id: 'tn_1', name: 'City T10 Cup', teamIds: teams.map((t) => t.id), fixtures: [], createdAt: '2026-10-01' };
  const pairs: [number, number][] = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  const matches: Match[] = [];
  pairs.forEach(([a, b], k) => {
    const A = teams[a], B = teams[b];
    const date = `2026-11-${String(5 + k * 3).padStart(2, '0')}`;
    const m: Match = {
      id: `m_${k + 1}`, title: `${A.name} vs ${B.name}`, teamAId: A.id, teamBId: B.id, tournamentId: tour.id,
      date, time: '14:00', venue: A.ground ?? '', pitch: 'Turf', umpires: 'Sample Umpire 1, Sample Umpire 2', scorer: 'Sample Scorer',
      format: 'T10', rules: T10, xi: { [A.id]: A.playerIds.slice(0, 11), [B.id]: B.playerIds.slice(0, 11) },
      innings: [], status: 'upcoming', mode: 'detailed', stage: 'League',
    };
    tour.fixtures.push({ id: `f_${k + 1}`, teamAId: A.id, teamBId: B.id, date, stage: 'league', matchId: m.id });
    if (k < 4) {
      const tossWin = rnd() < 0.5 ? A : B;
      const decision = rnd() < 0.5 ? 'bat' : 'bowl';
      m.toss = { winnerId: tossWin.id, decision };
      const first = decision === 'bat' ? tossWin : tossWin === A ? B : A;
      const second = first === A ? B : A;
      const mkInn = (bat: Team, bowl: Team, target?: number): MatchInnings => {
        const xiBat = m.xi[bat.id], xiBowl = m.xi[bowl.id];
        const openers: [string, string] = [xiBat[0], xiBat[1]];
        const order = [...openers, ...xiBat.filter((x) => !openers.includes(x))];
        const bowlers = xiBowl.filter((x) => x !== bowl.keeperId);
        const events = simulateInnings({ rules: T10, battingOrder: order, openers, target }, bowlers, xiBowl, rnd, 1 + rnd() * 0.5);
        return { battingTeamId: bat.id, bowlingTeamId: bowl.id, openers, events, redo: [], audit: [], target };
      };
      const i1 = mkInn(first, second);
      const s1 = replaySafe(m, i1);
      const i2 = mkInn(second, first, s1 + 1);
      m.innings = [i1, i2];
      m.status = 'completed';
    }
    matches.push(m);
  });
  // Player of the match: best performer in each completed match
  return { players, teams, matches, tournaments: [tour], settings: { dark: true, sound: false, vibrate: false, scorer: 'Scorer' } };
}

function replaySafe(m: Match, inn: MatchInnings): number {
  const order = [...inn.openers, ...m.xi[inn.battingTeamId].filter((x) => !inn.openers.includes(x))];
  let s = createInnings({ rules: m.rules, battingOrder: order, openers: inn.openers });
  for (const e of inn.events) s = applyEvent(s, e);
  return s.runs;
}
