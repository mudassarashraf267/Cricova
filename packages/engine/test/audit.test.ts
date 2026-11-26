import { describe, expect, it } from 'vitest';
import { allOvers, allPartnerships, applyEvent, checkInvariants, createInnings, customRules, economy, formatOvers, replay, T10, T20, TAPE_BALL } from '../src';
import type { DeliveryEvent, InningsEvent, InningsState, RuleProfile } from '../src';

/** Independent, deliberately simple model that recomputes every scorecard number from the raw events. */
function reference(rules: RuleProfile, order: string[], events: InningsEvent[]) {
  const bat: Record<string, { runs: number; balls: number; fours: number; sixes: number; out: boolean }> = {};
  const bowl: Record<string, { legal: number; runs: number; wkts: number; wides: number; nb: number; dots: number; maidens: number }> = {};
  const get = <T,>(m: Record<string, T>, k: string, mk: () => T) => (m[k] ??= mk());
  let striker = order[0], non = order[1]; let nextIdx = 2;
  let team = 0, wickets = 0, legal = 0; const ex = { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 };
  const fowScores: number[] = []; let overBowlers: string[] = []; let overCharged: Record<string, number> = {}; let overLegal = 0; let lastWasFreeHitSource = false; void lastWasFreeHitSource;
  for (const e of events) {
    if (e.type === 'penalty') { team += e.runs; ex.pen += e.runs; continue; }
    if (e.type === 'declare') continue;
    if (e.type === 'swapStrike') { [striker, non] = [non, striker]; continue; }
    if (e.type === 'batterOut') {
      const isW = e.kind === 'timedOut' || e.kind === 'retiredOut';
      if (isW) { wickets++; fowScores.push(team); get(bat, e.playerId, () => ({ runs: 0, balls: 0, fours: 0, sixes: 0, out: false })).out = true; }
      const repl = e.nextBatterId; if (repl) { if (striker === e.playerId) striker = repl; else non = repl; }
      continue;
    }
    const wd = e.wides ?? 0, byes = e.byes ?? 0, lb = e.legByes ?? 0, nb = !!e.noBall, br = e.batRuns;
    const isLegal = !wd && !nb;
    const b = get(bat, striker, () => ({ runs: 0, balls: 0, fours: 0, sixes: 0, out: false }));
    const bw = get(bowl, e.bowlerId, () => ({ legal: 0, runs: 0, wkts: 0, wides: 0, nb: 0, dots: 0, maidens: 0 }));
    if (!wd) b.balls++;
    b.runs += br;
    if (e.boundary && br > 0) { if (e.boundary === 4) b.fours++; else b.sixes++; }
    const nbPen = nb ? rules.noBallRuns : 0;
    const total = br + wd + nbPen + byes + lb;
    team += total; ex.wd += wd; ex.nb += nbPen; ex.b += byes; ex.lb += lb;
    const charged = br + wd + nbPen;
    bw.runs += charged; bw.wides += wd; if (nb) bw.nb++;
    if (isLegal) { bw.legal++; legal++; if (br === 0) bw.dots++; overLegal++; }
    if (!overBowlers.includes(e.bowlerId)) overBowlers.push(e.bowlerId);
    overCharged[e.bowlerId] = (overCharged[e.bowlerId] ?? 0) + charged;
    const completed = e.completedRuns ?? (e.boundary ? 0 : wd ? wd - rules.wideRuns : br + byes + lb);
    if (completed % 2 === 1) [striker, non] = [non, striker];
    if (e.wicket) {
      const out = e.wicket.playerOutId ?? striker;
      get(bat, out, () => ({ runs: 0, balls: 0, fours: 0, sixes: 0, out: false })).out = true;
      wickets++; fowScores.push(team);
      if (['bowled', 'caught', 'caughtAndBowled', 'lbw', 'stumped', 'hitWicket'].includes(e.wicket.kind)) bw.wkts++;
      const repl = e.wicket.nextBatterId;
      if (repl) { if (striker === out) striker = repl; else non = repl; nextIdx++; }
    }
    if (isLegal && overLegal === rules.ballsPerOver) {
      if (overBowlers.length === 1 && overCharged[overBowlers[0]] === 0) bowl[overBowlers[0]].maidens++;
      [striker, non] = [non, striker]; overBowlers = []; overCharged = {}; overLegal = 0;
    }
  }
  return { bat, bowl, team, wickets, legal, ex, fowScores };
}

function prng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function randomInnings(rules: RuleProfile, teamSize: number, rnd: () => number, target?: number) {
  const order = Array.from({ length: teamSize }, (_, i) => `A${i + 1}`);
  const bowlers = Array.from({ length: 7 }, (_, i) => `B${i + 1}`);
  let s: InningsState = createInnings({ rules, battingOrder: order, target });
  const events: InningsEvent[] = []; let id = 0;
  while (s.status === 'inProgress' && events.length < 800) {
    const cur = s.currentOver?.bowlerId;
    const max = rules.maxOversPerBowler;
    const ok = bowlers.filter((b) => b !== s.lastOverBowlerId && (max === null || (s.bowlers[b]?.legalBalls ?? 0) < max * 6));
    const bowlerId = cur ?? ok[Math.floor(rnd() * ok.length)]; if (!bowlerId) break;
    const e: DeliveryEvent = { type: 'delivery', id: `r${++id}`, bowlerId, batRuns: 0 };
    const r = rnd();
    if (r < 0.25) { /* dot */ }
    else if (r < 0.45) e.batRuns = 1;
    else if (r < 0.53) e.batRuns = 2;
    else if (r < 0.55) e.batRuns = 3;
    else if (r < 0.63) { e.batRuns = 4; e.boundary = 4; }
    else if (r < 0.67) { e.batRuns = 6; e.boundary = 6; }
    else if (r < 0.68) { e.batRuns = 5; e.completedRuns = 1; }                 // overthrows
    else if (r < 0.73) e.wides = 1 + Math.floor(rnd() * 3);
    else if (r < 0.75) { e.wides = 5; e.boundary = 4; }
    else if (r < 0.78) { e.noBall = true; e.batRuns = Math.floor(rnd() * 3); }
    else if (r < 0.80) { e.noBall = true; e.batRuns = 4; e.boundary = 4; }
    else if (r < 0.83) e.byes = 1 + Math.floor(rnd() * 3);
    else if (r < 0.85) e.legByes = 1 + Math.floor(rnd() * 2);
    else if (r < 0.86) { e.noBall = true; e.byes = 2; }
    else if (r < 0.865) { s = applyEvent(s, { type: 'penalty', id: `p${++id}`, runs: 5 }); events.push({ type: 'penalty', id: `p${id}`, runs: 5 }); continue; }
    else {
      const avail = Object.values(s.batters).find((b) => b.status === 'yetToBat')?.id;
      const last = s.wickets + 1 >= s.wicketsToEnd;
      const nextBatterId = last ? undefined : avail;
      const k = rnd();
      if (s.freeHit || e.noBall) { e.wicket = { kind: 'runOut', nextBatterId }; }
      else if (k < 0.3) e.wicket = { kind: 'bowled', nextBatterId };
      else if (k < 0.55) e.wicket = { kind: 'caught', fielderId: 'F1', nextBatterId };
      else if (k < 0.65) e.wicket = { kind: 'lbw', nextBatterId };
      else if (k < 0.72) e.wicket = { kind: 'stumped', fielderId: 'K', nextBatterId };
      else if (k < 0.8) { e.wicket = { kind: 'runOut', playerOutId: s.nonStrikerId ?? undefined, nextBatterId }; }
      else if (k < 0.9) { e.batRuns = 1; e.wicket = { kind: 'runOut', playerOutId: s.strikerId ?? undefined, nextBatterId }; }
      else { e.byes = 1; e.wicket = { kind: 'runOut', playerOutId: s.nonStrikerId ?? undefined, nextBatterId }; }
    }
    try { s = applyEvent(s, e); events.push(e); } catch { /* invalid random draw: skip */ }
  }
  return { s, events, order };
}

const configs: [string, RuleProfile, number][] = [
  ['T20, 11 players', T20, 11], ['T10, 11 players', T10, 11], ['tape-ball, 6 players', customRules({ oversPerInnings: 6, maxOversPerBowler: 2, playersPerSide: 11 }, TAPE_BALL), 6],
  ['custom 12 overs, 5 players', customRules({ oversPerInnings: 12, maxOversPerBowler: 3, playersPerSide: 11 }), 5],
];

describe('independent audit of every scorecard number', () => {
  for (const [name, rules, size] of configs) {
    for (const seed of [3, 11, 29, 57, 101, 777]) {
      it(`${name}, seed ${seed}`, () => {
        const { s, events, order } = randomInnings(rules, size, prng(seed));
        const ref = reference(rules, order, events);

        // team level
        expect(s.runs, 'team runs').toBe(ref.team);
        expect(s.wickets, 'wickets').toBe(ref.wickets);
        expect(s.legalBalls, 'legal balls').toBe(ref.legal);
        expect(s.extras).toEqual({ wides: ref.ex.wd, noBalls: ref.ex.nb, byes: ref.ex.b, legByes: ref.ex.lb, penalty: ref.ex.pen });
        expect(s.fow.map((f) => f.score), 'FOW scores').toEqual(ref.fowScores);
        expect(checkInvariants(s)).toEqual([]);

        // every batter
        for (const [id, r] of Object.entries(ref.bat)) {
          expect(s.batters[id], `batter ${id}`).toMatchObject({ runs: r.runs, balls: r.balls, fours: r.fours, sixes: r.sixes });
          expect(s.batters[id].status === 'out', `out ${id}`).toBe(r.out);
        }
        // every bowler
        for (const [id, r] of Object.entries(ref.bowl)) {
          expect(s.bowlers[id], `bowler ${id}`).toMatchObject({ legalBalls: r.legal, runs: r.runs, wickets: r.wkts, wides: r.wides, noBalls: r.nb, dots: r.dots, maidens: r.maidens });
          expect(economy(s.bowlers[id].runs, s.bowlers[id].legalBalls)).toBe(r.legal ? Math.round((r.runs * 6 / r.legal) * 100) / 100 : null);
        }

        // partnerships add up to the team score and legal balls; overs add up too
        const ps = allPartnerships(s);
        expect(ps.reduce((a, p) => a + p.runs, 0), 'partnership runs').toBe(s.runs);
        expect(ps.reduce((a, p) => a + p.balls, 0), 'partnership balls').toBe(s.legalBalls);
        const ov = allOvers(s);
        expect(ov.reduce((a, o) => a + o.runs, 0), 'over runs').toBe(s.runs - s.extras.penalty);
        expect(ov.reduce((a, o) => a + o.legalBalls, 0)).toBe(s.legalBalls);
        for (const o of ov.slice(0, -1)) expect(o.legalBalls).toBe(6);
        // each partnership: batter contributions + extras = runs
        for (const p of ps) expect(Object.values(p.contributions).reduce((a, c) => a + c.runs, 0) + p.extras, 'partnership split').toBe(p.runs);

        // overs text is derived from integer balls
        expect(formatOvers(s.legalBalls)).toBe(`${Math.floor(ref.legal / 6)}.${ref.legal % 6}`);
        // the two batters at the crease are distinct and not out
        if (s.status === 'inProgress') {
          expect(s.strikerId).not.toBe(s.nonStrikerId);
          expect(s.batters[s.strikerId!].status).toBe('notOut');
          expect(s.batters[s.nonStrikerId!].status).toBe('notOut');
        }
        // wickets credited to bowlers never exceed team wickets
        expect(Object.values(s.bowlers).reduce((a, b) => a + b.wickets, 0)).toBeLessThanOrEqual(s.wickets);
        // pure replay gives the identical state
        expect(JSON.stringify(replay(s.config, events))).toBe(JSON.stringify(s));
      });
    }
  }
});

describe('audit data is rich enough', () => {
  it('covers extras, many wicket kinds, overthrows, penalties and several overs', () => {
    const kinds = new Set<string>(); let balls = 0, wides = 0, nbs = 0, byes = 0, lbs = 0, pen = 0, runouts = 0, overs = 0, wkts = 0;
    for (const [, rules, size] of configs) for (const seed of [3, 11, 29, 57, 101, 777]) {
      const { s, events } = randomInnings(rules, size, prng(seed));
      balls += s.balls.length; overs += allOvers(s).length; wkts += s.wickets;
      for (const e of events) { if (e.type === 'penalty') pen++; if (e.type === 'delivery') { if (e.wides) wides++; if (e.noBall) nbs++; if (e.byes) byes++; if (e.legByes) lbs++; if (e.wicket) { kinds.add(e.wicket.kind); if (e.wicket.kind === 'runOut') runouts++; } } }
    }
    console.log({ balls, overs, wkts, wides, nbs, byes, lbs, pen, runouts, kinds: [...kinds] });
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    expect(balls).toBeGreaterThan(1000); expect(wides).toBeGreaterThan(50); expect(nbs).toBeGreaterThan(30); expect(pen).toBeGreaterThan(3); expect(runouts).toBeGreaterThan(20);
  });
});

describe('limits are enforced during a whole random innings', () => {
  it('no bowler exceeds max overs, nobody bowls consecutive overs, all-out has size-1 wickets', () => {
    for (const [, rules, size] of configs) {
      const { s } = randomInnings(rules, size, prng(5));
      for (const b of Object.values(s.bowlers)) if (rules.maxOversPerBowler) expect(b.legalBalls).toBeLessThanOrEqual(rules.maxOversPerBowler * 6);
      const ov = allOvers(s);
      for (let i = 1; i < ov.length; i++) expect(ov[i].bowlerIds[0]).not.toBe(ov[i - 1].bowlerIds.at(-1));
      if (s.status === 'allOut') expect(s.wickets).toBe(Math.min(rules.playersPerSide, size) - 1);
      if (s.status === 'oversComplete') expect(s.legalBalls).toBe((rules.oversPerInnings ?? 0) * 6);
    }
  });
});
