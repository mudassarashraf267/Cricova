import { useMemo, useState } from 'react';
import { careerStats, passes, resultOf, nameMap, teamName, teamRecords } from '../lib/analysis';
import type { StatFilter, TeamRecord } from '../lib/analysis';
import { useDB } from '../lib/store';
import { Empty, PageTitle } from '../ui';

type Val = string | number | null | undefined;
type Row = [label: string, get: (id: string) => Val, better: 'hi' | 'lo' | null];

const rr = (runs: number, balls: number) => (balls ? Math.round((runs * 600) / balls) / 100 : null);

export default function Compare() {
  const db = useDB();
  const [mode, setMode] = useState<'players' | 'teams'>('players');
  const [pids, setPids] = useState<string[]>(db.players.slice(0, 2).map((p) => p.id));
  const [tids, setTids] = useState<string[]>(db.teams.slice(0, 2).map((t) => t.id));
  const [f, setF] = useState<StatFilter>({});
  const formats = [...new Set(db.matches.map((m) => m.format))];
  const stats = useMemo(() => careerStats(db, f), [db, f]);
  const matches = useMemo(() => db.matches.filter((m) => passes(m, f)), [db, f]);
  const recs = useMemo(() => new Map<string, TeamRecord>(teamRecords(db, matches, tids).map((r) => [r.teamId, r])), [db, matches, tids]);

  const playerRows: Row[] = [
    ['Matches', (i) => stats.get(i)?.matches ?? 0, null], ['Runs', (i) => stats.get(i)?.bat.runs ?? 0, 'hi'], ['Batting average', (i) => stats.get(i)?.bat.avg, 'hi'], ['Strike rate', (i) => stats.get(i)?.bat.sr, 'hi'],
    ['Highest score', (i) => stats.get(i)?.bat.hs ?? 0, 'hi'], ['Fours', (i) => stats.get(i)?.bat.fours ?? 0, 'hi'], ['Sixes', (i) => stats.get(i)?.bat.sixes ?? 0, 'hi'],
    ['Wickets', (i) => stats.get(i)?.bowl.wickets ?? 0, 'hi'], ['Economy', (i) => stats.get(i)?.bowl.eco, 'lo'], ['Bowling average', (i) => stats.get(i)?.bowl.avg, 'lo'], ['Bowling strike rate', (i) => stats.get(i)?.bowl.sr, 'lo'],
    ['Best bowling', (i) => { const c = stats.get(i); return c && c.bowl.bestW ? `${c.bowl.bestW}/${c.bowl.bestR}` : '-'; }, null], ['Catches', (i) => stats.get(i)?.field.catches ?? 0, 'hi'],
  ];
  const teamRows: Row[] = [
    ['Played', (i) => recs.get(i)?.played ?? 0, null], ['Won', (i) => recs.get(i)?.won ?? 0, 'hi'], ['Lost', (i) => recs.get(i)?.lost ?? 0, 'lo'], ['Tied / no result', (i) => (recs.get(i)?.tied ?? 0) + (recs.get(i)?.noResult ?? 0), null],
    ['Win %', (i) => { const r = recs.get(i); return r && r.played ? Math.round((r.won * 1000) / r.played) / 10 : null; }, 'hi'],
    ['Points', (i) => recs.get(i)?.points ?? 0, 'hi'], ['Net run rate', (i) => { const r = recs.get(i); return r && r.played ? Math.round(r.nrr * 1000) / 1000 : null; }, 'hi'],
    ['Runs scored', (i) => recs.get(i)?.runsFor ?? 0, 'hi'], ['Runs conceded', (i) => recs.get(i)?.runsAgainst ?? 0, 'lo'],
    ['Run rate (batting)', (i) => { const r = recs.get(i); return r ? rr(r.runsFor, r.ballsFor) : null; }, 'hi'],
    ['Run rate (conceded)', (i) => { const r = recs.get(i); return r ? rr(r.runsAgainst, r.ballsAgainst) : null; }, 'lo'],
  ];

  // head to head for exactly two teams
  const h2h = useMemo(() => {
    if (tids.length !== 2 || tids[0] === tids[1]) return null;
    const names = nameMap(db); const w: Record<string, number> = { [tids[0]]: 0, [tids[1]]: 0 }; let other = 0, n = 0;
    for (const m of matches) {
      if (m.status !== 'completed' || !tids.includes(m.teamAId) || !tids.includes(m.teamBId) || m.teamAId === m.teamBId) continue;
      n++; const r = resultOf(m, names);
      if (r.kind === 'win' && r.winner && r.winner in w) w[r.winner]++; else other++;
    }
    return { n, a: w[tids[0]], b: w[tids[1]], other };
  }, [db, matches, tids]);

  const ids = mode === 'players' ? pids : tids;
  const setIds = mode === 'players' ? setPids : setTids;
  const options = mode === 'players' ? db.players.map((p) => ({ id: p.id, name: p.name })) : db.teams.map((t) => ({ id: t.id, name: t.name }));
  const rows = mode === 'players' ? playerRows : teamRows;
  const title = (id: string) => (mode === 'players' ? db.players.find((p) => p.id === id)?.name : teamName(db, id));

  const best = (fn: (id: string) => Val, dir: 'hi' | 'lo' | null) => {
    if (!dir) return new Set<string>();
    const vals = ids.map((i) => [i, fn(i)] as const).filter((x): x is readonly [string, number] => typeof x[1] === 'number' && Number.isFinite(x[1]));
    if (vals.length < 2) return new Set<string>();
    const t = dir === 'hi' ? Math.max(...vals.map((v) => v[1])) : Math.min(...vals.map((v) => v[1]));
    if (vals.every((v) => v[1] === t)) return new Set<string>();   // all equal: nobody is "better"
    return new Set(vals.filter((v) => v[1] === t).map((v) => v[0]));
  };
  const barW = (fn: (id: string) => Val, id: string) => {
    const nums = ids.map((i) => fn(i)).filter((x): x is number => typeof x === 'number' && x > 0);
    const v = fn(id); return typeof v === 'number' && v > 0 && nums.length ? Math.max(6, Math.round((v / Math.max(...nums)) * 100)) : 0;
  };
  const tooFew = options.length < 2;

  return (
    <div>
      <PageTitle>Compare</PageTitle>
      <div className="mb-3 inline-flex rounded-xl bg-slate-200/70 p-1 dark:bg-white/10" role="tablist" aria-label="Compare what">
        {(['players', 'teams'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={mode === k} className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${mode === k ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 dark:text-slate-300'}`} onClick={() => setMode(k)}>{k === 'players' ? '👤 Players' : '🛡️ Teams'}</button>
        ))}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <select className="input" value={f.format ?? ''} onChange={(e) => setF({ ...f, format: e.target.value || undefined })} aria-label="Format"><option value="">All formats</option>{formats.map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input" value={f.tournamentId ?? ''} onChange={(e) => setF({ ...f, tournamentId: e.target.value || undefined })} aria-label="Tournament"><option value="">All tournaments</option>{db.tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input type="date" className="input" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} aria-label="From date" />
        <input type="date" className="input" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} aria-label="To date" />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {ids.map((id, k) => <select key={k} className="input max-w-xs" aria-label={`${mode === 'players' ? 'Player' : 'Team'} ${k + 1}`} value={id} onChange={(e) => setIds(ids.map((x, j) => (j === k ? e.target.value : x)))}>{options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>)}
        {ids.length < 4 && !tooFew && <button className="btn btn-ghost" onClick={() => setIds([...ids, options.find((p) => !ids.includes(p.id))?.id ?? ids[0]])}>＋ add</button>}
        {ids.length > 2 && <button className="btn btn-ghost" onClick={() => setIds(ids.slice(0, -1))}>− remove</button>}
      </div>
      {tooFew ? <Empty>Add at least two {mode} to compare them.</Empty> : (
        <>
          {mode === 'teams' && h2h && (
            <div className="card mb-3 p-4 text-center" data-testid="h2h">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Head to head</div>
              <div className="mt-1 flex items-center justify-center gap-4 text-lg font-extrabold">
                <span>{teamName(db, tids[0])} <span className="text-gold">{h2h.a}</span></span><span className="text-slate-400">–</span><span><span className="text-gold">{h2h.b}</span> {teamName(db, tids[1])}</span>
              </div>
              <div className="text-xs text-slate-500">{h2h.n === 0 ? 'These teams have not played each other yet.' : `${h2h.n} match${h2h.n === 1 ? '' : 'es'} played${h2h.other ? `, ${h2h.other} tied / no result` : ''}`}</div>
            </div>
          )}
          <div className="card overflow-x-auto"><table className="min-w-[420px]"><thead><tr><th className="th">Stat</th>{ids.map((id, k) => <th key={k} className="th">{title(id)}</th>)}</tr></thead>
            <tbody>{rows.map(([k, fn, dir]) => { const b = best(fn, dir); return (
              <tr key={k}><td className="td text-slate-500">{k}</td>{ids.map((id, c) => (
                <td key={c} className={`td font-bold ${b.has(id) ? 'text-gold' : ''}`}>{fn(id) ?? '-'}
                  {dir && barW(fn, id) > 0 && <div className="mt-1 h-1 rounded-full bg-slate-200 dark:bg-white/10"><div className={`h-1 rounded-full ${b.has(id) ? 'bg-gold' : 'bg-emerald-500/70'}`} style={{ width: `${barW(fn, id)}%` }} /></div>}
                </td>))}</tr>); })}</tbody></table></div>
        </>
      )}
      <p className="mt-2 text-xs text-slate-500">Statistics come from completed ball-by-ball matches only. Gold marks the better value (lower is better for economy, runs conceded and losses).</p>
    </div>
  );
}
