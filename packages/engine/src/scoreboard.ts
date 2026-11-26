import { formatOvers } from './format';
import { economy } from './stats';
import type { InningsState, OverSummary, Partnership } from './types';

export interface Scoreboard {
  runs: number; wickets: number; overs: string; legalBalls: number;
  crr: number | null;
  target: number | null; required: number | null; remainingBalls: number | null; rrr: number | null;
  strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null;
  lastBalls: string[];
  partnership: Partnership | null;
  freeHit: boolean;
  status: InningsState['status'];
}

/** Tokens of the most recent deliveries, walking back until `n` legal balls are included (extras between them are kept). */
export function lastBalls(s: InningsState, n = 6): string[] {
  const out: string[] = [];
  let legal = 0;
  for (let i = s.balls.length - 1; i >= 0 && legal < n; i--) {
    out.unshift(s.balls[i].token);
    if (s.balls[i].legal) legal++;
  }
  return out;
}

export function scoreboard(s: InningsState): Scoreboard {
  const bpo = s.config.rules.ballsPerOver;
  const target = s.config.target ?? null;
  const remaining = s.oversLimit !== null ? Math.max(0, s.oversLimit * bpo - s.legalBalls) : null;
  const required = target !== null ? Math.max(0, target - s.runs) : null;
  return {
    runs: s.runs, wickets: s.wickets, overs: formatOvers(s.legalBalls, bpo), legalBalls: s.legalBalls,
    crr: economy(s.runs, s.legalBalls, bpo),
    target, required, remainingBalls: target !== null ? remaining : null,
    rrr: required !== null && remaining ? economy(required, remaining, bpo) : null,
    strikerId: s.strikerId, nonStrikerId: s.nonStrikerId,
    bowlerId: s.currentOver?.bowlerId ?? s.lastOverBowlerId,
    lastBalls: lastBalls(s),
    partnership: s.current,
    freeHit: s.freeHit && s.config.rules.freeHit,
    status: s.status,
  };
}

export const allPartnerships = (s: InningsState): Partnership[] => (s.current ? [...s.partnerships, s.current] : s.partnerships);

/** Completed overs plus the in-progress over (if any), for over-by-over summaries and charts. */
export function allOvers(s: InningsState): OverSummary[] {
  const o = s.currentOver;
  if (!o) return s.overs;
  return [...s.overs, { over: o.index + 1, bowlerIds: o.bowlerIds, legalBalls: o.legalBalls, runs: o.runs, wickets: o.wickets, tokens: o.tokens }];
}

/** Totals check used by tests and by the recalculation tool: the score must always equal bat runs + extras. */
export function checkInvariants(s: InningsState): string[] {
  const problems: string[] = [];
  const batRuns = Object.values(s.batters).reduce((a, b) => a + b.runs, 0);
  const e = s.extras;
  const extras = e.wides + e.noBalls + e.byes + e.legByes + e.penalty;
  if (s.runs !== batRuns + extras) problems.push(`score ${s.runs} != bat ${batRuns} + extras ${extras}`);
  const bowled = Object.values(s.bowlers).reduce((a, b) => a + b.legalBalls, 0);
  if (bowled !== s.legalBalls) problems.push(`legal balls ${s.legalBalls} != sum of bowlers ${bowled}`);
  const charged = Object.values(s.bowlers).reduce((a, b) => a + b.runs, 0);
  if (charged !== s.runs - e.byes - e.legByes - e.penalty) problems.push('bowler runs != team runs minus byes/leg-byes/penalty');
  const bowlerWk = Object.values(s.bowlers).reduce((a, b) => a + b.wickets, 0);
  const credited = s.balls.filter((b) => b.wicket?.bowlerCredited).length;
  if (bowlerWk !== credited) problems.push('bowler wickets mismatch');
  if (s.fow.length !== s.wickets) problems.push('FOW length != wickets');
  return problems;
}
