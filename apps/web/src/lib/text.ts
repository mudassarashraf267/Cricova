import { formatOvers, economy, strikeRate } from '@cricketpro/engine';
import type { DismissalInfo } from '@cricketpro/engine';
import { inningsViews, playerName, teamName, resultOf, nameMap } from './analysis';
import type { DB, Match } from './domain';

export function dismissalText(d: DismissalInfo | undefined, db: DB, status: string): string {
  if (status === 'yetToBat') return 'did not bat';
  if (status === 'notOut') return 'not out';
  if (status === 'retiredHurt') return 'retired hurt';
  if (status === 'retiredNotOut') return 'retired not out';
  if (!d) return 'out';
  const b = playerName(db, d.bowlerId), f = playerName(db, d.fielderId);
  switch (d.kind) {
    case 'bowled': return `b ${b}`;
    case 'caught': return `c ${f || '?'} b ${b}`;
    case 'caughtAndBowled': return `c & b ${b}`;
    case 'lbw': return `lbw b ${b}`;
    case 'stumped': return `st ${f || '?'} b ${b}`;
    case 'runOut': return `run out${f ? ` (${f})` : ''}`;
    case 'hitWicket': return `hit wicket b ${b}`;
    case 'hitBallTwice': return 'hit the ball twice';
    case 'obstructingField': return 'obstructing the field';
    case 'timedOut': return 'timed out';
    case 'retiredOut': return 'retired out';
    default: return 'out';
  }
}

const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function matchCSV(m: Match, db: DB): string {
  const rows: (string | number)[][] = [];
  rows.push(['Cricova scorecard'], ['Match', m.title], ['Date', m.date], ['Venue', m.venue], ['Result', resultOf(m, nameMap(db)).text], []);
  for (const v of inningsViews(m)) {
    rows.push([`Innings ${v.index + 1}`, teamName(db, v.battingTeamId), `${v.runs}/${v.wickets}`, `${v.overs} ov`]);
    const s = v.state;
    if (!s) { rows.push(['(quick-entry innings: totals only)'], []); continue; }
    rows.push(['Batter', 'Dismissal', 'R', 'B', '4s', '6s', 'SR']);
    for (const b of Object.values(s.batters).filter((x) => x.status !== 'yetToBat').sort((a, b) => (a.arrival ?? 99) - (b.arrival ?? 99)))
      rows.push([playerName(db, b.id), dismissalText(b.dismissal, db, b.status), b.runs, b.balls, b.fours, b.sixes, strikeRate(b.runs, b.balls) ?? '']);
    rows.push(['Extras', `wd ${s.extras.wides}, nb ${s.extras.noBalls}, b ${s.extras.byes}, lb ${s.extras.legByes}, pen ${s.extras.penalty}`], []);
    rows.push(['Bowler', 'O', 'M', 'R', 'W', 'Econ', 'Wd', 'Nb']);
    for (const b of Object.values(s.bowlers)) rows.push([playerName(db, b.id), formatOvers(b.legalBalls), b.maidens, b.runs, b.wickets, economy(b.runs, b.legalBalls) ?? '', b.wides, b.noBalls]);
    rows.push(['Fall of wickets'], ['Wkt', 'Score', 'Batter', 'Over']);
    for (const f of s.fow) rows.push([f.wicket, f.score, playerName(db, f.batterId), f.over]);
    rows.push([]);
  }
  return rows.map((r) => r.map(q).join(',')).join('\n');
}

export function download(name: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
