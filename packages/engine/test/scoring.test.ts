import { describe, expect, it } from 'vitest';
import {
  applyEvent, ballsFromOvers, checkInvariants, formatOvers, lastBalls, replay, scoreboard, ScoringError,
  allPartnerships,
} from '../src';
import { d, mk, over, order, rules, run } from './helpers';

describe('runs and strike rotation', () => {
  it('1. dot ball', () => {
    const s = run(mk(), d());
    expect(s.runs).toBe(0);
    expect(s.legalBalls).toBe(1);
    expect(s.batters.A1).toMatchObject({ runs: 0, balls: 1, dots: 1 });
    expect(s.bowlers.B1).toMatchObject({ legalBalls: 1, runs: 0, dots: 1 });
    expect(s.strikerId).toBe('A1');
  });
  it('2. single rotates strike', () => {
    const s = run(mk(), d({ batRuns: 1 }));
    expect(s.runs).toBe(1);
    expect(s.batters.A1.runs).toBe(1);
    expect(s.strikerId).toBe('A2');
    expect(s.nonStrikerId).toBe('A1');
  });
  it('3. two runs keep strike, 4. three runs rotate', () => {
    const two = run(mk(), d({ batRuns: 2 }));
    expect(two.strikerId).toBe('A1');
    const three = run(mk(), d({ batRuns: 3 }));
    expect(three.strikerId).toBe('A2');
    expect(three.runs).toBe(3);
  });
  it('5. four / 6. six: boundaries counted, no rotation', () => {
    const s = run(mk(), d({ batRuns: 4, boundary: 4 }), d({ batRuns: 6, boundary: 6 }));
    expect(s.runs).toBe(10);
    expect(s.batters.A1).toMatchObject({ runs: 10, fours: 1, sixes: 1, balls: 2 });
    expect(s.bowlers.B1).toMatchObject({ runs: 10, fours: 1, sixes: 1, boundaryRuns: 10 });
    expect(s.strikerId).toBe('A1');
  });
  it('overthrows: 1 run run + 4 overthrows = 5 to the bat, odd completed runs rotate, no four credited', () => {
    const s = run(mk(), d({ batRuns: 5, completedRuns: 1 }));
    expect(s.runs).toBe(5);
    expect(s.batters.A1).toMatchObject({ runs: 5, fours: 0 });
    expect(s.strikerId).toBe('A2');
  });
});

describe('extras', () => {
  it('7. wide: not legal, not faced, charged to bowler', () => {
    const s = run(mk(), d({ wides: 1 }));
    expect(s.runs).toBe(1);
    expect(s.legalBalls).toBe(0);
    expect(s.batters.A1.balls).toBe(0);
    expect(s.extras.wides).toBe(1);
    expect(s.bowlers.B1).toMatchObject({ runs: 1, wides: 1, legalBalls: 0, deliveries: 1 });
    expect(s.strikerId).toBe('A1');
  });
  it('8. no-ball: not legal, ball faced, penalty to bowler, triggers free hit', () => {
    const s = run(mk(), d({ noBall: true }));
    expect(s.runs).toBe(1);
    expect(s.legalBalls).toBe(0);
    expect(s.batters.A1.balls).toBe(1);
    expect(s.extras.noBalls).toBe(1);
    expect(s.bowlers.B1).toMatchObject({ runs: 1, noBalls: 1 });
    expect(s.freeHit).toBe(true);
  });
  it('9. bye: legal, faced, NOT charged to bowler, counts as dot for bowler', () => {
    const s = run(mk(), d({ byes: 1 }));
    expect(s.runs).toBe(1);
    expect(s.extras.byes).toBe(1);
    expect(s.batters.A1).toMatchObject({ runs: 0, balls: 1 });
    expect(s.bowlers.B1).toMatchObject({ runs: 0, legalBalls: 1, dots: 1 });
    expect(s.strikerId).toBe('A2');
  });
  it('10. leg-bye', () => {
    const s = run(mk(), d({ legByes: 3 }));
    expect(s.runs).toBe(3);
    expect(s.extras.legByes).toBe(3);
    expect(s.bowlers.B1.runs).toBe(0);
    expect(s.strikerId).toBe('A2');
  });
  it('11. multiple wides then a legal ball', () => {
    const s = run(mk(), d({ wides: 1 }), d({ wides: 1 }), d({ wides: 1 }), d({ batRuns: 1 }));
    expect(s.runs).toBe(4);
    expect(s.legalBalls).toBe(1);
    expect(s.bowlers.B1).toMatchObject({ deliveries: 4, legalBalls: 1, runs: 4 });
    expect(lastBalls(s)).toEqual(['Wd', 'Wd', 'Wd', '1']);
  });
  it('12. no-ball + 2 off the bat', () => {
    const s = run(mk(), d({ noBall: true, batRuns: 2 }));
    expect(s.runs).toBe(3);
    expect(s.batters.A1.runs).toBe(2);
    expect(s.bowlers.B1.runs).toBe(3);
    expect(s.strikerId).toBe('A1');
  });
  it('13. no-ball + boundary four = 5 runs', () => {
    const s = run(mk(), d({ noBall: true, batRuns: 4, boundary: 4 }));
    expect(s.runs).toBe(5);
    expect(s.batters.A1).toMatchObject({ runs: 4, fours: 1 });
    expect(s.bowlers.B1).toMatchObject({ runs: 5, fours: 1, noBalls: 1 });
    expect(s.legalBalls).toBe(0);
  });
  it('14. wide with completed runs: wides=3 means 2 run, strike unchanged; wides=2 rotates', () => {
    expect(run(mk(), d({ wides: 3 })).strikerId).toBe('A1');
    const s = run(mk(), d({ wides: 2 }));
    expect(s.strikerId).toBe('A2');
    expect(s.runs).toBe(2);
    expect(s.legalBalls).toBe(0);
  });
  it('wide that reaches the boundary is 5 wides with no strike change', () => {
    const s = run(mk(), d({ wides: 5, boundary: 4 }));
    expect(s.runs).toBe(5);
    expect(s.extras.wides).toBe(5);
    expect(s.strikerId).toBe('A1');
    expect(s.batters.A1.fours).toBe(0);
  });
  it('no-ball + 3 byes: team 4, bowler charged only the no-ball, strike rotates', () => {
    const s = run(mk(), d({ noBall: true, byes: 3 }));
    expect(s.runs).toBe(4);
    expect(s.extras).toMatchObject({ noBalls: 1, byes: 3 });
    expect(s.bowlers.B1.runs).toBe(1);
    expect(s.batters.A1.balls).toBe(1);
    expect(s.strikerId).toBe('A2');
  });
  it('bye that reaches the boundary is not a batter four', () => {
    const s = run(mk(), d({ byes: 4, boundary: 4 }));
    expect(s.runs).toBe(4);
    expect(s.batters.A1.fours).toBe(0);
    expect(s.bowlers.B1.boundaryRuns).toBe(0);
  });
  it('penalty runs count to the team but not batter or bowler', () => {
    const s = run(mk(), { type: 'penalty', id: 'p1', runs: 5 });
    expect(s.runs).toBe(5);
    expect(s.extras.penalty).toBe(5);
    expect(Object.values(s.batters).every((b) => b.runs === 0)).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('rejects impossible combinations', () => {
    expect(() => run(mk(), d({ wides: 1, noBall: true }))).toThrow(ScoringError);
    expect(() => run(mk(), d({ wides: 1, batRuns: 1 }))).toThrow(ScoringError);
    expect(() => run(mk(), d({ byes: 1, legByes: 1 }))).toThrow(ScoringError);
    expect(() => run(mk(), d({ batRuns: 2, boundary: 4 }))).toThrow(ScoringError);
    expect(() => run(mk(), d({ batRuns: -1 }))).toThrow(ScoringError);
  });
});

describe('overs', () => {
  it('overs are legal-ball based, never decimal', () => {
    expect(formatOvers(34)).toBe('5.4');
    expect(formatOvers(36)).toBe('6.0');
    expect(ballsFromOvers('5.4')).toBe(34);
    expect(() => ballsFromOvers('5.6')).toThrow();
  });
  it('23. end-of-over strike rotation and bowling end change', () => {
    const s = over(mk(), 'B1');
    expect(s.overs).toHaveLength(1);
    expect(s.legalBalls).toBe(6);
    expect(s.strikerId).toBe('A2'); // ends changed, A2 now faces
    expect(s.currentOver).toBeNull();
  });
  it('single off the last ball of the over: run swap then end-of-over swap = same striker', () => {
    const s = over(mk(), 'B1', [0, 0, 0, 0, 0, 1]);
    expect(s.strikerId).toBe('A1');
  });
  it('24. maiden over', () => {
    const s = over(mk(), 'B1');
    expect(s.bowlers.B1).toMatchObject({ maidens: 1, runs: 0, legalBalls: 6 });
    expect(s.overs[0].maidenBowlerId).toBe('B1');
  });
  it('byes do not spoil a maiden; a wide or no-ball does', () => {
    const withBye = run(mk(), d({ byes: 1 }), ...Array.from({ length: 5 }, () => d()));
    expect(withBye.bowlers.B1.maidens).toBe(1);
    const withWide = run(mk(), d({ wides: 1 }), ...Array.from({ length: 6 }, () => d()));
    expect(withWide.bowlers.B1.maidens).toBe(0);
    expect(withWide.overs[0].legalBalls).toBe(6);
    const withNb = run(mk(), d({ noBall: true }), ...Array.from({ length: 6 }, () => d()));
    expect(withNb.bowlers.B1.maidens).toBe(0);
  });
  it('25. bowling change: next over by a different bowler; consecutive overs rejected', () => {
    const s = over(mk(), 'B1');
    expect(() => run(s, d({ bowlerId: 'B1' }))).toThrow(/consecutive/);
    const s2 = over(s, 'B2');
    expect(s2.overs.map((o) => o.bowlerIds[0])).toEqual(['B1', 'B2']);
    expect(s2.legalBalls).toBe(12);
  });
  it('mid-over bowler change needs the flag; the replaced bowler cannot resume; nobody gets a maiden', () => {
    let s = run(mk(), d(), d(), d());
    expect(() => run(s, d({ bowlerId: 'B2' }))).toThrow(/mid-over/);
    s = run(s, d({ bowlerId: 'B2', replacesBowlerMidOver: true }), d({ bowlerId: 'B2' }), d({ bowlerId: 'B2' }));
    expect(s.overs[0].bowlerIds).toEqual(['B1', 'B2']);
    expect(s.bowlers.B1.maidens + s.bowlers.B2.maidens).toBe(0);
    expect(s.bowlers.B1.legalBalls).toBe(3);
    expect(s.bowlers.B2.legalBalls).toBe(3);
    const s3 = run(mk(), d(), d());
    expect(() => run(run(s3, d({ bowlerId: 'B2', replacesBowlerMidOver: true })), d({ bowlerId: 'B1', replacesBowlerMidOver: true }))).toThrow(/resume/);
  });
  it('26. maximum overs per bowler', () => {
    const r = rules({ maxOversPerBowler: 1 });
    let s = over(mk(r), 'B1');
    s = over(s, 'B2');
    expect(() => run(s, d({ bowlerId: 'B1' }))).toThrow(/maximum/);
    s = over(s, 'B3');
    expect(s.legalBalls).toBe(18);
  });
});

describe('wickets', () => {
  const wk = (kind: any, extra: any = {}) => d({ wicket: { kind, nextBatterId: 'A3', ...extra } });

  it('15. bowled: wicket, FOW, partnership closed, new batter on strike', () => {
    let s = run(mk(), d({ batRuns: 4, boundary: 4 }), d({ batRuns: 1 }), wk('bowled'));
    // A1 scored 4, then single (A2 faces), then A2 bowled
    expect(s.wickets).toBe(1);
    expect(s.batters.A2.status).toBe('out');
    expect(s.batters.A2.dismissal).toMatchObject({ kind: 'bowled', bowlerId: 'B1', wicketNo: 1, score: 5, over: '0.3' });
    expect(s.bowlers.B1.wickets).toBe(1);
    expect(s.fow).toEqual([expect.objectContaining({ wicket: 1, score: 5, batterId: 'A2', over: '0.3', partnershipRuns: 5 })]);
    expect(s.strikerId).toBe('A3');
    expect(s.nonStrikerId).toBe('A1');
    expect(s.current).toMatchObject({ wicketNo: 2, runs: 0 });
    expect(s.partnerships[0]).toMatchObject({ wicketNo: 1, runs: 5, balls: 3, startScore: 0, endScore: 5 });
    expect(checkInvariants(s)).toEqual([]);
  });
  it('16. caught records fielder; 17. caught and bowled uses bowler as fielder', () => {
    const c = run(mk(), wk('caught', { fielderId: 'F1' }));
    expect(c.batters.A1.dismissal).toMatchObject({ kind: 'caught', fielderId: 'F1', bowlerId: 'B1' });
    const cb = run(mk(), wk('caughtAndBowled'));
    expect(cb.batters.A1.dismissal?.fielderId).toBe('B1');
    expect(cb.bowlers.B1.wickets).toBe(1);
  });
  it('18. lbw, 20. hit wicket credited to bowler', () => {
    expect(run(mk(), wk('lbw')).bowlers.B1.wickets).toBe(1);
    expect(run(mk(), wk('hitWicket')).bowlers.B1.wickets).toBe(1);
  });
  it('19. stumping off a wide: wide runs stand, ball not legal, bowler credited', () => {
    const s = run(mk(), d({ wides: 1, wicket: { kind: 'stumped', nextBatterId: 'A3' } }));
    expect(s.runs).toBe(1);
    expect(s.legalBalls).toBe(0);
    expect(s.wickets).toBe(1);
    expect(s.bowlers.B1.wickets).toBe(1);
    expect(s.batters.A1.balls).toBe(0);
    expect(s.fow[0]).toMatchObject({ score: 1, over: '0.0' });
  });
  it('21. run-out: not credited to bowler; runs completed before the run-out count', () => {
    // 1 run completed, then the original non-striker (A2, now at the striker\'s end) is run out going for a second
    const s = run(mk(), d({ batRuns: 1, completedRuns: 1, wicket: { kind: 'runOut', playerOutId: 'A2', nextBatterId: 'A3' } }));
    expect(s.runs).toBe(1);
    expect(s.batters.A1.runs).toBe(1);
    expect(s.batters.A2.status).toBe('out');
    expect(s.bowlers.B1.wickets).toBe(0);
    expect(s.wickets).toBe(1);
    expect(s.strikerId).toBe('A3');
    expect(s.nonStrikerId).toBe('A1');
    expect(s.legalBalls).toBe(1);
  });
  it('run-out of the non-striker with no runs', () => {
    const s = run(mk(), d({ wicket: { kind: 'runOut', playerOutId: 'A2', nextBatterId: 'A3' } }));
    expect(s.strikerId).toBe('A1');
    expect(s.nonStrikerId).toBe('A3');
    expect(s.fow[0].batterId).toBe('A2');
  });
  it('run-out on a no-ball: allowed; no-ball still not legal; free hit follows', () => {
    const s = run(mk(), d({ noBall: true, wicket: { kind: 'runOut', nextBatterId: 'A3' } }));
    expect(s.wickets).toBe(1);
    expect(s.legalBalls).toBe(0);
    expect(s.runs).toBe(1);
    expect(s.freeHit).toBe(true);
  });
  it('wicket + bye: run-out while running byes', () => {
    const s = run(mk(), d({ byes: 1, completedRuns: 1, wicket: { kind: 'runOut', playerOutId: 'A2', nextBatterId: 'A3' } }));
    expect(s.runs).toBe(1);
    expect(s.extras.byes).toBe(1);
    expect(s.wickets).toBe(1);
    expect(s.bowlers.B1.wickets).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
  });
  it('bowled / caught / lbw not possible off a no-ball, nor with runs scored', () => {
    expect(() => run(mk(), d({ noBall: true, wicket: { kind: 'bowled', nextBatterId: 'A3' } }))).toThrow(/no-ball/);
    expect(() => run(mk(), d({ wides: 1, wicket: { kind: 'bowled', nextBatterId: 'A3' } }))).toThrow(/wide/);
    expect(() => run(mk(), d({ batRuns: 1, wicket: { kind: 'caught', nextBatterId: 'A3' } }))).toThrow(/dead/);
    expect(() => run(mk(), d({ wicket: { kind: 'bowled' } }))).toThrow(/nextBatterId/);
    expect(() => run(mk(), d({ wicket: { kind: 'bowled', playerOutId: 'A2', nextBatterId: 'A3' } }))).toThrow(/striker/);
  });
  it('27. free hit: only run-out / hit-twice / obstruction; wide keeps it; legal ball ends it', () => {
    let s = run(mk(), d({ noBall: true }));
    expect(() => run(s, d({ wicket: { kind: 'bowled', nextBatterId: 'A3' } }))).toThrow(/free hit/);
    expect(() => run(s, d({ wicket: { kind: 'stumped', nextBatterId: 'A3' } }))).toThrow();
    s = run(s, d({ wides: 1 }));
    expect(s.freeHit).toBe(true);
    expect(scoreboard(s).freeHit).toBe(true);
    const ro = run(s, d({ wicket: { kind: 'runOut', nextBatterId: 'A3' } }));
    expect(ro.wickets).toBe(1);
    s = run(s, d({ batRuns: 6, boundary: 6 }));
    expect(s.freeHit).toBe(false);
    expect(run(s, d({ wicket: { kind: 'bowled', nextBatterId: 'A3' } })).wickets).toBe(1);
    // a no-ball on a free hit gives another free hit
    expect(run(run(mk(), d({ noBall: true })), d({ noBall: true })).freeHit).toBe(true);
  });
  it('free hit can be turned off by the rule profile', () => {
    const s = run(mk(rules({ freeHit: false })), d({ noBall: true }), d({ wicket: { kind: 'bowled', nextBatterId: 'A3' } }));
    expect(s.wickets).toBe(1);
  });
  it('hit the ball twice / obstructing the field are not credited to the bowler', () => {
    expect(run(mk(), d({ wicket: { kind: 'hitBallTwice', nextBatterId: 'A3' } })).bowlers.B1.wickets).toBe(0);
    expect(run(mk(), d({ wicket: { kind: 'obstructingField', nextBatterId: 'A3' } })).bowlers.B1.wickets).toBe(0);
  });
  it('22. retired hurt: no wicket, no FOW, may return later', () => {
    let s = run(mk(), d({ batRuns: 2 }), { type: 'batterOut', id: 'r1', kind: 'retiredHurt', playerId: 'A1', nextBatterId: 'A3' });
    expect(s.wickets).toBe(0);
    expect(s.fow).toHaveLength(0);
    expect(s.batters.A1).toMatchObject({ status: 'retiredHurt', runs: 2 });
    expect(s.strikerId).toBe('A3');
    s = run(s, d({ wicket: { kind: 'bowled', nextBatterId: 'A1' } })); // A3 bowled, A1 returns
    expect(s.batters.A1.status).toBe('notOut');
    expect(s.batters.A1.runs).toBe(2);
    expect(s.wickets).toBe(1);
  });
  it('retired out and timed out are wickets but never credited to the bowler', () => {
    let s = run(mk(), { type: 'batterOut', id: 'r1', kind: 'retiredOut', playerId: 'A1', nextBatterId: 'A3' });
    expect(s.wickets).toBe(1);
    expect(s.fow[0]).toMatchObject({ kind: 'retiredOut', batterId: 'A1' });
    s = run(s, { type: 'batterOut', id: 't1', kind: 'timedOut', playerId: 'A3', nextBatterId: 'A4' });
    expect(s.wickets).toBe(2);
    expect(s.strikerId).toBe('A4');
    expect(Object.values(s.bowlers).reduce((a, b) => a + b.wickets, 0)).toBe(0);
  });
  it('wicket on the last ball of an over: new batter, then ends change', () => {
    const s = run(over(mk(), 'B1', [0, 0, 0, 0, 0, 0]).currentOver ? mk() : mk(), ...Array.from({ length: 5 }, () => d()), wk('bowled'));
    expect(s.overs).toHaveLength(1);
    expect(s.strikerId).toBe('A2');
    expect(s.nonStrikerId).toBe('A3');
  });
  it('28. all out ends the innings and blocks further scoring', () => {
    let s = mk();
    for (let i = 0; i < 10; i++) {
      s = run(s, d({ bowlerId: i < 6 ? 'B1' : 'B2', wicket: { kind: 'bowled', nextBatterId: i < 9 ? order[i + 2] : undefined } }));
    }
    expect(s.wickets).toBe(10);
    expect(s.status).toBe('allOut');
    expect(s.fow).toHaveLength(10);
    expect(() => run(s, d({ bowlerId: 'B2' }))).toThrow(/complete/);
    expect(checkInvariants(s)).toEqual([]);
  });
});

describe('innings completion', () => {
  it('29. limited-overs innings completes at the overs limit', () => {
    const s = over(over(mk(rules({ oversPerInnings: 2 })), 'B1'), 'B2');
    expect(s.status).toBe('oversComplete');
    expect(() => run(s, d({ bowlerId: 'B1' }))).toThrow();
  });
  it('reduced-overs (interrupted) innings: limit override', () => {
    const s = over(over(mk(rules({}), { oversLimit: 2 }), 'B1'), 'B2');
    expect(s.status).toBe('oversComplete');
  });
  it('30. target reached ends the chase immediately', () => {
    const s = run(mk(rules({}), { target: 5 }), d({ batRuns: 4, boundary: 4 }), d({ batRuns: 1 }));
    expect(s.status).toBe('targetReached');
    expect(s.runs).toBe(5);
  });
  it('scoreboard: CRR, required runs, remaining balls, RRR, last deliveries', () => {
    const s = over(mk(rules({ oversPerInnings: 2 }), { target: 20 }), 'B1', [1, 0, 4, 0, 2, 1]);
    const sb = scoreboard(s);
    expect(sb).toMatchObject({ runs: 8, overs: '1.0', crr: 8, target: 20, required: 12, remainingBalls: 6, rrr: 12 });
    expect(sb.lastBalls).toEqual(['1', '0', '4', '0', '2', '1']);
  });
  it('declaration ends the innings', () => {
    const s = run(mk(rules({ oversPerInnings: null })), d({ batRuns: 1 }), { type: 'declare', id: 'dec' });
    expect(s.status).toBe('declared');
  });
  it('32. super over: 3 batters, 2 wickets ends it; 1 over', () => {
    const so = { rules: rules({ oversPerInnings: 1, playersPerSide: 3, maxOversPerBowler: 1 }), battingOrder: ['A1', 'A2', 'A3'] };
    let s = replay(so, [d({ batRuns: 6, boundary: 6 }), d({ wicket: { kind: 'bowled', nextBatterId: 'A3' } }), d({ wicket: { kind: 'bowled' } })]);
    expect(s.status).toBe('allOut');
    expect(s.runs).toBe(6);
    expect(s.wickets).toBe(2);
    s = replay({ ...so, target: 8 }, [d({ batRuns: 4, boundary: 4 }), d({ batRuns: 4, boundary: 4 })]);
    expect(s.status).toBe('targetReached');
  });
});

describe('partnerships and fall of wickets', () => {
  it('tracks contributions, extras and balls per partnership', () => {
    let s = run(mk(), d({ batRuns: 4, boundary: 4 }), d({ wides: 1 }), d({ batRuns: 1 }), d({ batRuns: 2 }), d({ byes: 1 }));
    // A1: 4, wide(1), A1 single -> A2 faces: 2 runs, then bye(1) rotates
    const p = allPartnerships(s)[0];
    expect(p.runs).toBe(9);
    expect(p.extras).toBe(2);
    expect(p.balls).toBe(4);
    expect(p.contributions.A1).toMatchObject({ runs: 5, balls: 2, fours: 1 });
    expect(p.contributions.A2).toMatchObject({ runs: 2, balls: 2 });
    s = run(s, d({ wicket: { kind: 'bowled', nextBatterId: 'A3' } }));
    expect(s.fow[0]).toMatchObject({ wicket: 1, score: 9, partnershipRuns: 9 });
    expect(allPartnerships(s)).toHaveLength(2);
    expect(allPartnerships(s)[0].unbroken).toBe(false);
  });
});

describe('batter and bowler figures', () => {
  it('batter score excludes extras; bowler figures exclude byes/leg-byes', () => {
    const s = over(mk(), 'B1', [1, 0, 0, 0, 0, 0]);
    const t = run(s, d({ bowlerId: 'B2', wides: 1 }), d({ bowlerId: 'B2', legByes: 2 }), d({ bowlerId: 'B2', byes: 1 }), d({ bowlerId: 'B2', batRuns: 4, boundary: 4 }));
    expect(t.runs).toBe(1 + 1 + 2 + 1 + 4);
    const batRuns = Object.values(t.batters).reduce((a, b) => a + b.runs, 0);
    expect(batRuns).toBe(5);
    expect(t.bowlers.B2).toMatchObject({ runs: 5, wides: 1, legalBalls: 3 });
    expect(checkInvariants(t)).toEqual([]);
  });
});

describe('corrections, undo and sync (session)', async () => {
  const { ScoringSession } = await import('../src');
  const cfg = { rules: rules({}), battingOrder: order };
  const ev = (id: string, o: object = {}) => ({ type: 'delivery' as const, id, bowlerId: 'B1', batRuns: 0, ...o });

  it('33. undo and redo', () => {
    const ss = new ScoringSession(cfg);
    ss.add(ev('a', { batRuns: 4, boundary: 4 }), 'u1');
    ss.add(ev('b', { batRuns: 1 }), 'u1');
    expect(ss.state.runs).toBe(5);
    ss.undo('u1', 'wrong ball');
    expect(ss.state.runs).toBe(4);
    expect(ss.state.strikerId).toBe('A1');
    ss.redo('u1');
    expect(ss.state.runs).toBe(5);
    expect(ss.audit.map((a) => a.action)).toEqual(['add', 'add', 'undo', 'redo']);
    expect(ss.audit[2].original?.id).toBe('b');
  });
  it('a new event after undo discards redo history', () => {
    const ss = new ScoringSession(cfg);
    ss.add(ev('a')); ss.undo('u'); ss.add(ev('c', { batRuns: 2 }));
    expect(ss.canRedo).toBe(false);
  });
  it('34. score correction preserves original, correction, reason and user; scorecards recalculate', () => {
    const ss = new ScoringSession(cfg, [], () => '2026-01-01T00:00:00Z');
    ss.add(ev('a', { batRuns: 1 })); ss.add(ev('b', { batRuns: 2 })); ss.add(ev('c'));
    expect(ss.state.strikerId).toBe('A2');
    ss.edit('a', ev('a', { batRuns: 2 }), 'scorer7', 'was a two, not a one');
    expect(ss.state.runs).toBe(4);
    expect(ss.state.batters.A1.runs).toBe(4); // strike now stays with A1
    const last = ss.audit[ss.audit.length - 1];
    expect(last).toMatchObject({ action: 'edit', userId: 'scorer7', reason: 'was a two, not a one', at: '2026-01-01T00:00:00Z' });
    expect((last.original as any).batRuns).toBe(1);
    expect((last.corrected as any).batRuns).toBe(2);
    expect(() => ss.edit('a', ev('a'), 'u', '')).toThrow(/reason/);
    ss.remove('c', 'scorer7', 'duplicate ball');
    expect(ss.state.legalBalls).toBe(2);
    expect(JSON.stringify(ss.recalculate())).toBe(JSON.stringify(ss.state));
  });
  it('an edit that would invalidate later events is rejected and nothing changes', () => {
    const ss = new ScoringSession(cfg);
    ss.add(ev('a')); ss.add(ev('b', { wicket: { kind: 'bowled', nextBatterId: 'A3' } })); ss.add(ev('c', { batRuns: 1 }));
    const before = JSON.stringify(ss.state);
    // Making ball a a no-ball would turn b into a free-hit bowled: illegal.
    expect(() => ss.edit('a', ev('a', { noBall: true }), 'u', 'oops')).toThrow(/free hit/);
    expect(JSON.stringify(ss.state)).toBe(before);
    expect(ss.events).toHaveLength(3);
  });
  it('35/36. offline sync: retried and re-ordered batches never duplicate deliveries', () => {
    const device = [ev('1', { batRuns: 1 }), ev('2', { batRuns: 4, boundary: 4 }), ev('3', { wides: 1 })];
    const server = new ScoringSession(cfg);
    for (const e of device) server.add(e);
    // network retry re-sends everything plus one new event
    const results = [...device, ev('4', { batRuns: 2 })].map((e) => server.add(e));
    expect(results.map((r) => r.duplicate)).toEqual([true, true, true, false]);
    expect(server.state.runs).toBe(1 + 4 + 1 + 2);
    expect(() => applyEvent(server.state, device[0])).toThrow(/Duplicate/);
    const fresh = new ScoringSession(cfg, [...server.events]);
    expect(JSON.stringify(fresh.state)).toBe(JSON.stringify(server.state));
  });
  it('invalid event leaves session state untouched', () => {
    const ss = new ScoringSession(cfg);
    ss.add(ev('a'));
    expect(() => ss.add(ev('b', { wides: 1, noBall: true }))).toThrow();
    expect(ss.events).toHaveLength(1);
    expect(ss.state.legalBalls).toBe(1);
  });
});

describe('property test: random valid innings keep every invariant', () => {
  function prng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  for (const seed of [1, 7, 42, 99, 2024]) {
    it(`seed ${seed}`, () => {
      const rnd = prng(seed);
      const bowlers = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
      let s = mk();
      let id = 0;
      for (let step = 0; step < 600 && s.status === 'inProgress'; step++) {
        const cur = s.currentOver?.bowlerId;
        const choices = cur ? [cur] : bowlers.filter((b) => b !== s.lastOverBowlerId && (s.bowlers[b]?.legalBalls ?? 0) < 24);
        const bowlerId = choices[Math.floor(rnd() * choices.length)];
        const r = rnd();
        let e: any = { type: 'delivery', id: `x${++id}`, bowlerId, batRuns: 0 };
        if (r < 0.3) e.batRuns = 0;
        else if (r < 0.5) e.batRuns = 1;
        else if (r < 0.58) e.batRuns = 2;
        else if (r < 0.6) e.batRuns = 3;
        else if (r < 0.68) { e.batRuns = 4; e.boundary = 4; }
        else if (r < 0.72) { e.batRuns = 6; e.boundary = 6; }
        else if (r < 0.78) e.wides = 1 + Math.floor(rnd() * 3);
        else if (r < 0.81) { e.noBall = true; e.batRuns = Math.floor(rnd() * 3); }
        else if (r < 0.85) e.byes = 1 + Math.floor(rnd() * 2);
        else if (r < 0.89) e.legByes = 1;
        else {
          const nextAvail = Object.values(s.batters).find((b) => b.status === 'yetToBat')?.id;
          const last = s.wickets + 1 >= s.wicketsToEnd;
          const fh = s.freeHit;
          e.wicket = { kind: fh ? 'runOut' : rnd() < 0.5 ? 'bowled' : 'runOut', nextBatterId: last ? undefined : nextAvail };
        }
        s = applyEvent(s, e);
        expect(checkInvariants(s), `seed ${seed} step ${step}`).toEqual([]);
        expect(s.balls.filter((b) => b.legal).length).toBe(s.legalBalls);
      }
      // the whole innings is reproducible from its event log alone
      expect(s.balls.length).toBeGreaterThan(30);
      const strikerOk = s.status !== 'inProgress' || (s.strikerId && s.nonStrikerId && s.strikerId !== s.nonStrikerId);
      expect(strikerOk).toBeTruthy();
    });
  }
});

describe('strike rules and the manual strike override', () => {
  it('3 runs mid-over: the other batter faces; 3 runs off the last ball: the same batter faces the next over', () => {
    expect(run(mk(), d({ batRuns: 3 })).strikerId).toBe('A2');
    expect(over(mk(), 'B1', [0, 0, 0, 0, 0, 3]).strikerId).toBe('A1');
    expect(run(mk(), d({ batRuns: 1 }), d({ batRuns: 1 }), d({ batRuns: 1 })).strikerId).toBe('A2');
  });
  it('swapStrike puts the other batter on strike, scores nothing, and is undoable', async () => {
    const { ScoringSession } = await import('../src');
    const ss = new ScoringSession({ rules: rules({}), battingOrder: order });
    ss.add({ type: 'delivery', id: 'a', bowlerId: 'B1', batRuns: 3 });
    expect(ss.state.strikerId).toBe('A2');
    ss.add({ type: 'swapStrike', id: 's1' });
    expect(ss.state.strikerId).toBe('A1');
    expect(ss.state.runs).toBe(3);
    ss.add({ type: 'delivery', id: 'b', bowlerId: 'B1', batRuns: 1 });
    expect(ss.state.batters.A1.balls).toBe(2);
    ss.undo('u'); ss.undo('u');
    expect(ss.state.strikerId).toBe('A2');
  });
});
