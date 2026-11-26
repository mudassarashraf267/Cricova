import type { InningsStatus } from './types';

export interface InningsSummary {
  teamId: string;
  runs: number;
  wickets: number;
  status: InningsStatus;
  /** Wickets available to fall (players - 1). */
  wicketsToEnd: number;
}

export type MatchOutcomeOverride = 'noResult' | 'abandoned' | 'drawn';

export interface MatchResult {
  kind: 'win' | 'tie' | 'draw' | 'noResult' | 'abandoned' | 'incomplete';
  winner?: string;
  by?: 'runs' | 'wickets' | 'innings';
  margin?: number;
  text: string;
}

export interface ResultInput {
  teams: [string, string];
  /** In batting order. */
  innings: InningsSummary[];
  inningsPerTeam: 1 | 2;
  override?: MatchOutcomeOverride;
  names?: Record<string, string>;
}

/**
 * Result from completed innings. Never invents a result for an unfinished match.
 * DLS / revised targets are deliberately NOT computed here: an official, validated method must supply them
 * (pass the revised target into InningsConfig.target).
 */
export function computeResult(input: ResultInput): MatchResult {
  const nm = (id: string) => input.names?.[id] ?? id;
  if (input.override === 'noResult') return { kind: 'noResult', text: 'No result' };
  if (input.override === 'abandoned') return { kind: 'abandoned', text: 'Match abandoned' };
  if (input.override === 'drawn') return { kind: 'draw', text: 'Match drawn' };

  const { innings, inningsPerTeam } = input;
  const needed = inningsPerTeam * 2;
  const done = (i: InningsSummary) => i.status !== 'inProgress';
  const total = (team: string) => innings.filter((i) => i.teamId === team).reduce((a, i) => a + i.runs, 0);
  const count = (team: string) => innings.filter((i) => i.teamId === team).length;
  const [a, b] = input.teams;
  const last = innings[innings.length - 1];

  const allPlayed = innings.length === needed && innings.every(done);
  const inningsVictory = inningsPerTeam === 2 && innings.length === 3 && innings.every(done) && last.status === 'allOut'
    && ((count(a) === 1 && total(a) > total(b)) || (count(b) === 1 && total(b) > total(a)));
  if (!allPlayed && !inningsVictory) return { kind: 'incomplete', text: 'Match in progress' };

  const ta = total(a), tb = total(b);
  if (ta === tb && !inningsVictory) return { kind: 'tie', text: 'Match tied' };
  const winner = ta > tb ? a : b, loser = winner === a ? b : a;
  const diff = Math.abs(ta - tb);

  if (inningsVictory) return { kind: 'win', winner, by: 'innings', margin: diff, text: `${nm(winner)} won by an innings and ${diff} run${diff === 1 ? '' : 's'}` };
  if (last.teamId === winner) {
    const left = last.wicketsToEnd - last.wickets;
    return { kind: 'win', winner, by: 'wickets', margin: left, text: `${nm(winner)} won by ${left} wicket${left === 1 ? '' : 's'}` };
  }
  void loser;
  return { kind: 'win', winner, by: 'runs', margin: diff, text: `${nm(winner)} won by ${diff} run${diff === 1 ? '' : 's'}` };
}
