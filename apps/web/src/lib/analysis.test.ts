import { describe, expect, it } from 'vitest';
import { battingAverage, economy, strikeRate } from '@cricketpro/engine';
import { careerStats, inningsViews, nameMap, resultOf, teamRecords } from './analysis';
import { makeSeed } from './seed';
import { matchCSV } from './text';

const db = makeSeed();
const done = db.matches.filter((m) => m.status === 'completed');

describe('seeded data is internally consistent', () => {
  it('has completed matches with full innings', () => {
    expect(done.length).toBe(4);
    for (const m of done) expect(inningsViews(m).length).toBe(2);
  });
});

describe('career statistics equal an independent sum over scorecards', () => {
  const stats = careerStats(db);
  it('batting totals, innings, not-outs, highest score, 50s, ducks, balls, boundaries', () => {
    const ref = new Map<string, { runs: number; inns: number; no: number; hs: number; balls: number; fours: number; sixes: number; ducks: number; fifties: number }>();
    for (const m of done) for (const v of inningsViews(m)) for (const b of Object.values(v.state!.batters)) {
      if (b.status === 'yetToBat') continue;
      const r = ref.get(b.id) ?? { runs: 0, inns: 0, no: 0, hs: 0, balls: 0, fours: 0, sixes: 0, ducks: 0, fifties: 0 };
      r.runs += b.runs; r.inns++; if (b.status !== 'out') r.no++; r.hs = Math.max(r.hs, b.runs); r.balls += b.balls; r.fours += b.fours; r.sixes += b.sixes;
      if (b.status === 'out' && b.runs === 0) r.ducks++; if (b.runs >= 50 && b.runs < 100) r.fifties++;
      ref.set(b.id, r);
    }
    expect(ref.size).toBeGreaterThan(10);
    for (const [id, r] of ref) {
      const c = stats.get(id)!;
      expect(c.bat, id).toMatchObject({ runs: r.runs, inns: r.inns, notOuts: r.no, hs: r.hs, balls: r.balls, fours: r.fours, sixes: r.sixes, ducks: r.ducks, fifties: r.fifties });
      expect(c.bat.sr).toBe(strikeRate(r.runs, r.balls));
      expect(c.bat.avg).toBe(battingAverage(r.runs, r.inns - r.no));
    }
  });
  it('bowling totals, wickets, maidens, best figures, economy', () => {
    const ref = new Map<string, { balls: number; runs: number; w: number; m: number; bestW: number; bestR: number }>();
    for (const m of done) for (const v of inningsViews(m)) for (const b of Object.values(v.state!.bowlers)) {
      const r = ref.get(b.id) ?? { balls: 0, runs: 0, w: 0, m: 0, bestW: 0, bestR: 0 };
      r.balls += b.legalBalls; r.runs += b.runs; r.w += b.wickets; r.m += b.maidens;
      if (b.wickets > r.bestW || (b.wickets === r.bestW && b.wickets > 0 && b.runs < r.bestR)) { r.bestW = b.wickets; r.bestR = b.runs; }
      ref.set(b.id, r);
    }
    for (const [id, r] of ref) {
      const c = stats.get(id)!;
      expect(c.bowl, id).toMatchObject({ legalBalls: r.balls, runs: r.runs, wickets: r.w, maidens: r.m, bestW: r.bestW, bestR: r.bestR });
      expect(c.bowl.eco).toBe(economy(r.runs, r.balls));
    }
  });
  it('team wickets equal bowler-credited wickets + run-outs (no wicket is lost or counted twice)', () => {
    for (const m of done) for (const v of inningsViews(m)) {
      const s = v.state!;
      const credited = Object.values(s.bowlers).reduce((a, b) => a + b.wickets, 0);
      const other = s.balls.filter((b) => b.wicket && !b.wicket.bowlerCredited).length;
      expect(credited + other).toBe(s.wickets);
    }
  });
  it('fielding: catches and stumpings match dismissals', () => {
    let catches = 0, stumpings = 0, runOuts = 0, c2 = 0, s2 = 0, r2 = 0;
    for (const c of stats.values()) { catches += c.field.catches; stumpings += c.field.stumpings; runOuts += c.field.runOuts; }
    for (const m of done) for (const v of inningsViews(m)) for (const b of v.state!.balls) {
      const w = b.wicket; if (!w) continue;
      if ((w.kind === 'caught' || w.kind === 'caughtAndBowled') && w.fielderId) c2++;
      if (w.kind === 'stumped' && w.fielderId) s2++;
      if (w.kind === 'runOut' && w.fielderId) r2++;
    }
    expect([catches, stumpings, runOuts]).toEqual([c2, s2, r2]);
  });
  it('a player is never counted twice for one match', () => {
    for (const c of stats.values()) expect(c.matches).toBeLessThanOrEqual(done.length);
  });
});

describe('results and points table', () => {
  const names = nameMap(db);
  it('winner and margin agree with the scores', () => {
    for (const m of done) {
      const [i1, i2] = inningsViews(m); const r = resultOf(m, names);
      if (i2.runs > i1.runs) { expect(r.winner).toBe(i2.battingTeamId); expect(r.by).toBe('wickets'); expect(r.margin).toBe(i2.wicketsToEnd - i2.wickets); }
      else if (i1.runs > i2.runs) { expect(r.winner).toBe(i1.battingTeamId); expect(r.by).toBe('runs'); expect(r.margin).toBe(i1.runs - i2.runs); }
      else expect(r.kind).toBe('tie');
    }
  });
  it('points = 2 per win, played = won + lost + tied + no result, NRR from first principles', () => {
    const table = teamRecords(db, db.matches, db.teams.map((t) => t.id));
    for (const r of table) {
      expect(r.played).toBe(r.won + r.lost + r.tied + r.noResult);
      expect(r.points).toBe(r.won * 2 + r.tied + r.noResult);
      let rf = 0, bf = 0, ra = 0, ba = 0;
      for (const m of done) for (const v of inningsViews(m)) {
        const balls = v.state!.status === 'allOut' ? 60 : v.legalBalls; // T10 quota
        if (v.battingTeamId === r.teamId) { rf += v.runs; bf += balls; }
        if (v.bowlingTeamId === r.teamId) { ra += v.runs; ba += balls; }
      }
      const nrr = (bf ? (rf * 6) / bf : 0) - (ba ? (ra * 6) / ba : 0);
      expect(r.nrr).toBeCloseTo(nrr, 2);
    }
    expect(table.reduce((a, r) => a + r.won, 0)).toBe(table.reduce((a, r) => a + r.lost, 0));
  });
});

describe('CSV export', () => {
  it('contains the totals of every innings', () => {
    const m = done[0]; const csv = matchCSV(m, db);
    for (const v of inningsViews(m)) expect(csv).toContain(`${v.runs}/${v.wickets}`);
    expect(csv).toContain('Fall of wickets');
  });
});
