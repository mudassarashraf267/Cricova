import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AllInnings } from '../Scorecard';
import { inningsViews, nameMap, playerName, resultOf, teamName } from '../lib/analysis';
import { useDB } from '../lib/store';
import { download, matchCSV } from '../lib/text';
import { Trophy } from '../art';
import { Empty } from '../ui';

export default function MatchView() {
  const { id } = useParams(); const db = useDB(); const m = db.matches.find((x) => x.id === id);
  const [tab, setTab] = useState<'card' | 'info'>('card');
  if (!m) return <Empty>Match not found.</Empty>;
  const res = resultOf(m, nameMap(db)); const views = inningsViews(m);
  const highlights = views.flatMap((v) => v.state ? [
    ...Object.values(v.state.batters).filter((b) => b.runs >= 30).map((b) => `${playerName(db, b.id)} ${b.runs} (${b.balls})`),
    ...Object.values(v.state.bowlers).filter((b) => b.wickets >= 2).map((b) => `${playerName(db, b.id)} ${b.wickets}/${b.runs}`),
  ] : []);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="card mb-4 overflow-hidden">
        <div className="hero p-4">{res.kind === 'win' && m.status !== 'upcoming' && <div className="absolute right-3 top-3"><Trophy size={72} /></div>}
          <div className="text-xs opacity-70">{m.format} · {m.date} · {m.venue || 'Venue TBC'}</div>
          <h1 className="text-xl font-extrabold">{m.title}</h1>
          {views.map((v) => <div key={v.index} className="mt-1 flex justify-between"><span>{teamName(db, v.battingTeamId)}</span><b>{v.runs}/{v.wickets} <span className="font-normal opacity-70">({v.overs} ov)</span></b></div>)}
          {m.status !== 'upcoming' && <div className="mt-2 text-lg font-black">{res.kind === 'win' ? '🏆 ' : ''}<span className="text-gold-shine">{res.text}</span></div>}
          {m.potmId && <div className="text-sm">Player of the match: <b>{playerName(db, m.potmId)}</b></div>}
        </div>
        <div className="no-print flex flex-wrap gap-2 p-3">
          {m.status !== 'completed' && <Link className="btn btn-primary" to={`/scoring/${m.id}`}>{m.status === 'live' ? 'Continue scoring' : 'Start scoring'}</Link>}
          <button className="btn btn-ghost" onClick={() => download(`${m.title.replace(/\W+/g, '_')}.csv`, matchCSV(m, db))}>⬇ CSV</button>
          <button className="btn btn-ghost" onClick={() => window.print()}>🖨 PDF / Print</button>
        </div>
      </div>
      <div className="no-print mb-3 flex gap-2">{([['card', 'Scorecard'], ['info', 'Match info']] as const).map(([k, l]) => <button key={k} className={`btn ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'card' && (views.length === 0 ? <Empty>No innings played yet.</Empty> : <>
        {highlights.length > 0 && <div className="card mb-4 p-3 text-sm"><b>Key performances:</b> {highlights.join(' · ')}</div>}
        <AllInnings m={m} db={db} /></>)}
      {tab === 'info' && (
        <div className="card grid gap-2 p-4 text-sm sm:grid-cols-2">
          <div><b>Toss:</b> {m.toss ? `${teamName(db, m.toss.winnerId)} chose to ${m.toss.decision}` : '-'}</div><div><b>Pitch:</b> {m.pitch}</div>
          <div><b>Umpires:</b> {m.umpires || '-'}</div><div><b>Scorer:</b> {m.scorer || '-'}</div>
          <div><b>Overs:</b> {m.rules.oversPerInnings ?? 'unlimited'}</div><div><b>Max overs per bowler:</b> {m.rules.maxOversPerBowler ?? 'none'}</div>
          <div><b>Scoring mode:</b> {m.mode}</div><div><b>Free hit:</b> {m.rules.freeHit ? 'yes' : 'no'}</div>
          {[m.teamAId, m.teamBId].map((t) => <div key={t} className="sm:col-span-2"><b>{teamName(db, t)} XI:</b> {(m.xi[t] ?? []).map((p) => playerName(db, p)).join(', ')}</div>)}
        </div>)}
    </div>
  );
}
