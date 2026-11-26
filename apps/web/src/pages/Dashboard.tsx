import { formatOvers } from '@cricketpro/engine';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Crest, Stadium } from '../art';
import { CountUp, Item, Stagger, Tilt } from '../fx';
import Hero3D from '../Hero3D';
import { careerStats, inningsViews, nameMap, resultOf, teamName } from '../lib/analysis';
import { isScheduled, useDB } from '../lib/store';

export default function Dashboard() {
  const db = useDB();
  const names = nameMap(db);
  const live = db.matches.filter((m) => m.status === 'live' || (m.status === 'upcoming' && m.innings.length === 0 && m.toss && m.xi[m.teamAId]?.length));
  const soon = db.matches.filter((m) => m.status === 'upcoming' && !live.includes(m)).sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`)).slice(0, 3);
  const done = db.matches.filter((m) => m.status === 'completed').sort((a, b) => b.date.localeCompare(a.date));
  const stats = useMemo(() => [...careerStats(db).values()], [db]);
  const runs = [...stats].sort((a, b) => b.bat.runs - a.bat.runs).slice(0, 3);
  const wkts = [...stats].sort((a, b) => b.bowl.wickets - a.bowl.wickets).slice(0, 3);
  const color = (id: string) => db.teams.find((t) => t.id === id)?.color ?? '#10b981';

  return (
    <div className="mx-auto max-w-2xl space-y-5 lg:max-w-3xl xlg:max-w-4xl">
      <Tilt max={4}><motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 20 }} className="hero rounded-3xl p-5 shadow-xl">
        <Stadium className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full opacity-40" />
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Cricova</div>
            <h1 className="mt-1 text-3xl font-black leading-tight">Every ball.<br />Every run.</h1>
            <div className="mt-3 flex gap-4 text-center">
              {[['Matches', done.length], ['Teams', db.teams.length], ['Players', db.players.length]].map(([k, v]) => (
                <div key={k as string}><div className="text-2xl font-extrabold tabular-nums"><CountUp to={v as number} /></div><div className="text-[10px] uppercase tracking-wide text-white/60">{k}</div></div>))}
            </div>
          </div>
          <Hero3D height={160} className="-mr-2 w-44 shrink-0" />
        </div>
        <Link to="/matches/new" className="btn btn-primary relative mt-5 w-full !py-4 text-lg">＋ Start a new match</Link>
      </motion.div></Tilt>

      {live.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><span className="live-dot" /> Continue scoring</h2>
          <Stagger className="space-y-2">
            {live.map((m) => { const v = inningsViews(m).at(-1); return (
              <Item key={m.id} tilt>
                <Link to={`/scoring/${m.id}`} className="card flex items-center justify-between border-emerald-500/60 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-3"><Crest name={teamName(db, m.teamAId)} color={color(m.teamAId)} size={34} /><Crest name={teamName(db, m.teamBId)} color={color(m.teamBId)} size={34} /></div>
                    <div><div className="font-bold">{m.title}</div><div className="text-xs text-slate-500">{m.status === 'live' ? '● Live' : 'Ready to start'}</div></div>
                  </div>
                  <div className="text-right text-xl font-extrabold tabular-nums">{v ? `${v.runs}/${v.wickets}` : '→'}<div className="text-xs font-normal text-slate-500">{v ? `${v.overs} ov` : ''}</div></div>
                </Link>
              </Item>); })}
          </Stagger>
        </section>)}

      {soon.length > 0 && (
        <section className="space-y-2" data-testid="upcoming">
          <div className="flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">📅 Upcoming matches</h2><Link to="/matches" className="text-xs text-emerald-600 underline">Schedule / see all</Link></div>
          <Stagger className="space-y-2">
            {soon.map((m) => (
              <Item key={m.id} tilt>
                <Link to={isScheduled(m) ? `/matches/new?from=${m.id}` : `/scoring/${m.id}`} className="card flex items-center justify-between p-3 pl-4">
                  <div><div className="font-semibold">{m.title}</div><div className="text-xs text-slate-500">{m.venue || 'Venue TBC'} · {m.format}</div></div>
                  <div className="text-right text-sm font-bold text-gold">{m.date}<div className="text-xs font-normal text-slate-500">{m.time || ''}</div></div>
                </Link>
              </Item>))}
          </Stagger>
        </section>)}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent results</h2>
        {done.length === 0 ? <div className="card p-6 text-center text-sm text-slate-500">No finished matches yet.</div> : (
          <Stagger className="space-y-2">
            {done.slice(0, 4).map((m) => (
              <Item key={m.id} tilt>
                <Link to={`/matches/${m.id}`} className="card block overflow-hidden p-3 pl-4" style={{ borderLeft: `4px solid ${color(inningsViews(m).find((v) => v.battingTeamId === resultOf(m, names).winner)?.battingTeamId ?? m.teamAId)}` }}>
                  <div className="font-semibold">{m.title}</div>
                  <div className="text-xs text-slate-500">{m.date}</div>
                  <div className="mt-1 text-sm">{inningsViews(m).map((v) => `${teamName(db, v.battingTeamId)} ${v.runs}/${v.wickets} (${formatOvers(v.legalBalls)})`).join(' · ')}</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-live">{resultOf(m, names).text}</div>
                </Link>
              </Item>))}
          </Stagger>)}
      </section>

      {stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Board title="🏏 Most runs" rows={runs.map((s) => [s.player.name, `${s.bat.runs}`])} />
          <Board title="⚾ Most wickets" rows={wkts.map((s) => [s.player.name, `${s.bowl.wickets}`])} />
        </div>)}
    </div>
  );
}

function Board({ title, rows }: { title: string; rows: string[][] }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[1])));
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-bold">{title}</h2>
      {rows.map((r, i) => (
        <div key={i} className="py-1.5 text-sm">
          <div className="flex justify-between"><span>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {r[0]}</span><b>{r[1]}</b></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-live" initial={{ width: 0 }} animate={{ width: `${(Number(r[1]) / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: 'easeOut' }} /></div>
        </div>))}
    </section>
  );
}
