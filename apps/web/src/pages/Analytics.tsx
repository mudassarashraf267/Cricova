import { allOvers, allPartnerships, economy, strikeRate } from '@cricketpro/engine';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inningsViews, phaseSummary, playerName, teamName } from '../lib/analysis';
import { useDB } from '../lib/store';
import { DeleteStats } from '../DeleteStats';
import { Empty, PageTitle } from '../ui';

const C = { a: '#10b981', b: '#3b82f6', gold: '#d4af37', red: '#ef4444', grey: '#94a3b8' };

export default function Analytics() {
  const db = useDB();
  const done = db.matches.filter((m) => m.status !== 'upcoming' && m.mode === 'detailed' && m.innings.length > 0);
  const [mid, setMid] = useState(done[0]?.id ?? ''); const [ii, setIi] = useState(0);
  const m = done.find((x) => x.id === mid) ?? done[0];
  const views = useMemo(() => (m ? inningsViews(m) : []), [m]);
  const v = views[Math.min(ii, views.length - 1)];
  const s = v?.state;
  if (!m || !s) return <div><PageTitle right={<DeleteStats />}>Stats</PageTitle><Empty>Analytics need at least one ball-by-ball match. Score a match first.</Empty></div>;

  const bpo = s.config.rules.ballsPerOver;
  const overs = allOvers(s);
  let cum = 0;
  const progression = overs.map((o) => { cum += o.runs; return { over: o.over, runs: cum, perOver: o.runs, wickets: o.wickets }; });
  const wk = s.fow.map((f) => ({ over: Math.floor(f.legalBalls / bpo) + 1, runs: f.score }));
  const batters = Object.values(s.batters).filter((b) => b.status !== 'yetToBat').map((b) => ({ name: playerName(db, b.id).split(' ')[0], runs: b.runs, sr: strikeRate(b.runs, b.balls) ?? 0, dots: b.balls ? Math.round((b.dots / b.balls) * 100) : 0, bnd: b.runs ? Math.round(((b.fours * 4 + b.sixes * 6) / b.runs) * 100) : 0 }));
  const bowlers = Object.values(s.bowlers).map((b) => ({ name: playerName(db, b.id).split(' ')[0], eco: economy(b.runs, b.legalBalls, bpo) ?? 0, wkts: b.wickets, dots: b.legalBalls ? Math.round((b.dots / b.legalBalls) * 100) : 0, bnd: b.boundaryRuns }));
  const e = s.extras; const extras = [{ n: 'Wides', v: e.wides }, { n: 'No-balls', v: e.noBalls }, { n: 'Byes', v: e.byes }, { n: 'Leg-byes', v: e.legByes }, { n: 'Penalty', v: e.penalty }].filter((x) => x.v > 0);
  const parts = allPartnerships(s).map((p) => ({ name: `Wkt ${p.wicketNo}`, runs: p.runs, balls: p.balls }));
  const phases = phaseSummary(s).map((p) => ({ ...p, rr: p.balls ? Math.round((p.runs * bpo * 100) / p.balls) / 100 : 0 }));
  const legal = s.balls.filter((b) => b.legal).length;
  const dotPct = legal ? Math.round((s.balls.filter((b) => b.legal && b.totalRuns === 0).length / legal) * 100) : 0;
  const bndPct = s.runs ? Math.round((Object.values(s.batters).reduce((a, b) => a + b.fours * 4 + b.sixes * 6, 0) / s.runs) * 100) : 0;
  const compare = views.map((x) => ({ name: `${teamName(db, x.battingTeamId)} (${x.index + 1})`, runs: x.runs, wkts: x.wickets }));
  const ax = { stroke: C.grey, fontSize: 11 };

  return (
    <div className="space-y-4">
      <PageTitle right={<div className="flex flex-wrap gap-2"><Link className="btn btn-ghost" to="/compare">Compare</Link><DeleteStats /></div>}>Stats</PageTitle>
      <div className="flex flex-wrap gap-2">
        <select className="input max-w-sm" value={m.id} onChange={(e) => { setMid(e.target.value); setIi(0); }} aria-label="Match">{done.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.date})</option>)}</select>
        <div className="flex gap-1">{views.map((x) => <button key={x.index} className={`btn ${x.index === Math.min(ii, views.length - 1) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setIi(x.index)}>{teamName(db, x.battingTeamId)}</button>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Score', `${v.runs}/${v.wickets}`], ['Overs', v.overs], ['Dot-ball %', `${dotPct}%`], ['Boundary run %', `${bndPct}%`]].map(([k, val]) => <div key={k} className="card p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-2xl font-extrabold">{val}</div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="Runs by over"><BarChart data={progression}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="over" {...ax} /><YAxis {...ax} /><Tooltip /><Bar dataKey="perOver" name="Runs" fill={C.a} radius={[4, 4, 0, 0]}>{progression.map((p, i) => <Cell key={i} fill={p.wickets ? C.red : C.a} />)}</Bar></BarChart></Chart>
        <Chart title="Run progression"><LineChart data={progression}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="over" {...ax} /><YAxis {...ax} /><Tooltip /><Line dataKey="runs" name="Score" stroke={C.b} strokeWidth={2} dot={false} /></LineChart></Chart>
        <Chart title="Runs by batter"><BarChart data={batters}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Bar dataKey="runs" fill={C.a} radius={[4, 4, 0, 0]} /></BarChart></Chart>
        <Chart title="Strike rate / dot % / boundary %"><BarChart data={batters}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Legend /><Bar dataKey="sr" name="SR" fill={C.gold} /><Bar dataKey="dots" name="Dot %" fill={C.grey} /><Bar dataKey="bnd" name="Boundary %" fill={C.a} /></BarChart></Chart>
        <Chart title="Bowler economy and wickets"><BarChart data={bowlers}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Legend /><Bar dataKey="eco" name="Economy" fill={C.b} /><Bar dataKey="wkts" name="Wickets" fill={C.red} /></BarChart></Chart>
        <Chart title="Boundary runs conceded & dot-ball %"><BarChart data={bowlers}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Legend /><Bar dataKey="bnd" name="Boundary runs" fill={C.gold} /><Bar dataKey="dots" name="Dot %" fill={C.grey} /></BarChart></Chart>
        <Chart title="Partnerships"><BarChart data={parts}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Bar dataKey="runs" fill={C.b} radius={[4, 4, 0, 0]} /></BarChart></Chart>
        <Chart title="Extras breakdown">{extras.length ? <PieChart><Pie data={extras} dataKey="v" nameKey="n" outerRadius={80} label>{extras.map((_, i) => <Cell key={i} fill={[C.a, C.b, C.gold, C.red, C.grey][i % 5]} />)}</Pie><Tooltip /><Legend /></PieChart> : <text />}</Chart>
        <Chart title="Phase performance (runs & run rate)"><BarChart data={phases}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="phase" {...ax} /><YAxis {...ax} /><Tooltip /><Legend /><Bar dataKey="runs" name="Runs" fill={C.a} /><Bar dataKey="wickets" name="Wickets" fill={C.red} /><Bar dataKey="rr" name="Run rate" fill={C.gold} /></BarChart></Chart>
        <Chart title="Innings comparison"><BarChart data={compare}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="name" {...ax} /><YAxis {...ax} /><Tooltip /><Legend /><Bar dataKey="runs" name="Runs" fill={C.a} /><Bar dataKey="wkts" name="Wickets" fill={C.red} /></BarChart></Chart>
      </div>
      <p className="text-xs text-slate-500">Wicket overs: {wk.map((w) => `${w.runs}@ov${w.over}`).join(', ') || 'none'}.</p>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return <section className="card p-4"><h3 className="mb-2 text-sm font-bold">{title}</h3><div style={{ width: '100%', height: 240 }}><ResponsiveContainer>{children}</ResponsiveContainer></div></section>;
}
