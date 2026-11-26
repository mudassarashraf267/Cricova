import { describe, expect, it } from 'vitest';
import { battingAverage, bowlingAverage, bowlingStrikeRate, computeResult, economy, strikeRate } from '../src';
import type { InningsSummary } from '../src';

const inn = (teamId: string, runs: number, wickets: number, status: InningsSummary['status'] = 'allOut'): InningsSummary =>
  ({ teamId, runs, wickets, status, wicketsToEnd: 10 });
const names = { A: 'Alpha', B: 'Bravo' };

describe('formulas', () => {
  it('strike rate, average, economy, bowling average and strike rate', () => {
    expect(strikeRate(75, 42)).toBe(178.57);
    expect(strikeRate(0, 0)).toBeNull();
    expect(battingAverage(300, 6)).toBe(50);
    expect(battingAverage(300, 0)).toBeNull(); // never dismissed: no average
    expect(economy(34, 21)).toBe(9.71); // 3.3 overs
    expect(bowlingAverage(34, 2)).toBe(17);
    expect(bowlingStrikeRate(21, 2)).toBe(10.5);
    expect(bowlingAverage(34, 0)).toBeNull();
  });
});

describe('match results', () => {
  it('win by runs (defending team)', () => {
    const r = computeResult({ teams: ['A', 'B'], inningsPerTeam: 1, names, innings: [inn('A', 180, 7, 'oversComplete'), inn('B', 170, 9, 'oversComplete')] });
    expect(r).toMatchObject({ kind: 'win', winner: 'A', by: 'runs', margin: 10 });
    expect(r.text).toBe('Alpha won by 10 runs');
  });
  it('win by wickets (chasing team) uses wickets remaining', () => {
    const r = computeResult({ teams: ['A', 'B'], inningsPerTeam: 1, names, innings: [inn('A', 150, 10), inn('B', 151, 4, 'targetReached')] });
    expect(r).toMatchObject({ winner: 'B', by: 'wickets', margin: 6 });
  });
  it('31. tied match', () => {
    const r = computeResult({ teams: ['A', 'B'], inningsPerTeam: 1, innings: [inn('A', 150, 8, 'oversComplete'), inn('B', 150, 9, 'oversComplete')] });
    expect(r.kind).toBe('tie');
  });
  it('does not invent a result while play is in progress', () => {
    const r = computeResult({ teams: ['A', 'B'], inningsPerTeam: 1, innings: [inn('A', 150, 8, 'oversComplete'), inn('B', 90, 3, 'inProgress')] });
    expect(r.kind).toBe('incomplete');
  });
  it('no result / abandoned / draw overrides', () => {
    for (const [o, k] of [['noResult', 'noResult'], ['abandoned', 'abandoned'], ['drawn', 'draw']] as const) {
      expect(computeResult({ teams: ['A', 'B'], inningsPerTeam: 1, innings: [], override: o }).kind).toBe(k);
    }
  });
  it('37. Test match: win by runs over four innings', () => {
    const r = computeResult({ teams: ['A', 'B'], inningsPerTeam: 2, names, innings: [inn('A', 300, 10), inn('B', 250, 10), inn('A', 200, 5, 'declared'), inn('B', 180, 10)] });
    expect(r).toMatchObject({ winner: 'A', by: 'runs', margin: 70 }); // 500 vs 430
  });
  it('Test match: win by wickets in the fourth innings', () => {
    const r = computeResult({ teams: ['A', 'B'], inningsPerTeam: 2, innings: [inn('A', 300, 10), inn('B', 250, 10), inn('A', 150, 10), inn('B', 201, 3, 'targetReached')] });
    expect(r).toMatchObject({ winner: 'B', by: 'wickets', margin: 7 });
  });
  it('Test match: innings victory after three innings', () => {
    const r = computeResult({ teams: ['A', 'B'], inningsPerTeam: 2, names, innings: [inn('A', 500, 6, 'declared'), inn('B', 200, 10), inn('B', 180, 10)] });
    expect(r.text).toBe('Alpha won by an innings and 120 runs');
  });
  it('Test match: unfinished fourth innings is not a result; draw is an explicit override', () => {
    const innings = [inn('A', 300, 10), inn('B', 250, 10), inn('A', 150, 10), inn('B', 100, 2, 'inProgress')];
    expect(computeResult({ teams: ['A', 'B'], inningsPerTeam: 2, innings }).kind).toBe('incomplete');
    expect(computeResult({ teams: ['A', 'B'], inningsPerTeam: 2, innings, override: 'drawn' }).kind).toBe('draw');
  });
});
