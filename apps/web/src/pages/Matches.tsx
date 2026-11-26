import { useState } from 'react';
import { Link } from 'react-router-dom';
import { inningsViews, nameMap, resultOf, teamName } from '../lib/analysis';
import type { Match } from '../lib/domain';
import { deleteMatch, isScheduled, rescheduleMatch, scheduleMatch, useDB } from '../lib/store';
import { Confirm, Empty, Modal, PageTitle } from '../ui';
import { Item, Stagger } from '../fx';

const OVERS = [5, 6, 8, 10, 15, 20, 30, 50];
const today = () => new Date().toISOString().slice(0, 10);
const when = (m: Match) => {
  const d = new Date(`${m.date}T${m.time || '00:00'}`);
  if (Number.isNaN(d.getTime())) return `${m.date}${m.time ? ` · ${m.time}` : ''}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${m.time ? ` · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}`;
};
const key = (m: Match) => `${m.date} ${m.time || '00:00'}`;

export default function Matches() {
  const db = useDB(); const names = nameMap(db);
  const [tab, setTab] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all');
  const [q, setQ] = useState(''); const [del, setDel] = useState<string | null>(null);
  const [form, setForm] = useState<null | 'new' | string>(null);   // 'new' or the id of the match being rescheduled
  const list = db.matches.filter((m) => (tab === 'all' || m.status === tab) && m.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (tab === 'upcoming' ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))));
  const editing = form && form !== 'new' ? db.matches.find((m) => m.id === form) : undefined;
  return (
    <div>
      <PageTitle right={<div className="flex flex-wrap gap-2"><button className="btn btn-ghost !px-5 !py-3" onClick={() => setForm('new')}>📅 Schedule match</button><Link className="btn btn-primary !px-5 !py-3" to="/matches/new">＋ New match</Link></div>}>Matches</PageTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['all', 'live', 'upcoming', 'completed'] as const).map((t) => <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'} capitalize`} onClick={() => setTab(t)}>{t}</button>)}
        <input className="input max-w-xs" placeholder="Search matches" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="mb-3 text-xs text-slate-500"><Link className="underline" to="/tournaments">Tournaments</Link></p>
      {list.length === 0 ? <Empty>{tab === 'upcoming' ? 'No upcoming matches. Tap “Schedule match” to add one with its date and time.' : 'No matches here yet.'}</Empty> : (
        <Stagger className="grid gap-3 lg:grid-cols-2">
          {list.map((m) => { const sch = isScheduled(m); return (
            <Item key={m.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link to={m.status === 'live' ? `/scoring/${m.id}` : sch ? `/matches/new?from=${m.id}` : `/matches/${m.id}`} className="font-bold hover:underline">{m.title}</Link>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${m.status === 'live' ? 'bg-live/20 text-emerald-600' : m.status === 'completed' ? 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300' : 'bg-gold/20 text-gold'}`}>{m.status}</span>
              </div>
              {m.status === 'upcoming'
                ? <div className="mt-1 text-sm font-semibold" data-testid="when">📅 {when(m)}</div>
                : null}
              <div className="text-xs text-slate-500">{m.status === 'upcoming' ? '' : `${m.date} · `}{m.format} · {m.venue || 'Venue TBC'}</div>
              {inningsViews(m).map((v) => <div key={v.index} className="mt-1 flex justify-between text-sm"><span>{teamName(db, v.battingTeamId)}</span><b>{v.runs}/{v.wickets} <span className="font-normal text-slate-500">({v.overs})</span></b></div>)}
              {m.status !== 'upcoming' && <div className="mt-2 text-sm font-semibold text-emerald-600 dark:text-live">{resultOf(m, names).text}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {!sch && <Link className="btn btn-ghost" to={`/matches/${m.id}`}>Scorecard</Link>}
                {m.status !== 'completed' && (sch
                  ? <Link className="btn btn-primary" to={`/matches/new?from=${m.id}`}>Start match</Link>
                  : <Link className="btn btn-primary" to={`/scoring/${m.id}`}>{m.status === 'live' ? 'Continue scoring' : 'Start scoring'}</Link>)}
                {m.status === 'upcoming' && <button className="btn btn-ghost" onClick={() => setForm(m.id)}>Change date / time</button>}
                <button className="btn btn-ghost" onClick={() => setDel(m.id)}>Delete</button>
              </div>
            </Item>); })}
        </Stagger>
      )}
      {form && <ScheduleForm key={form} match={editing} onClose={() => setForm(null)} onSaved={() => setTab('upcoming')} />}
      <Confirm open={!!del} onClose={() => setDel(null)} onYes={() => del && deleteMatch(del)} text="Permanently delete this match and all of its ball-by-ball data? This cannot be undone." yes="Delete match" />
    </div>
  );
}

function ScheduleForm({ match, onClose, onSaved }: { match?: Match; onClose: () => void; onSaved: () => void }) {
  const db = useDB();
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [date, setDate] = useState(match?.date ?? today()); const [time, setTime] = useState(match?.time ?? '15:00');
  const [venue, setVenue] = useState(match?.venue ?? ''); const [overs, setOvers] = useState<number>(match?.rules.oversPerInnings ?? 10);
  const [err, setErr] = useState('');
  function save() {
    if (match) { if (!date) return setErr('Pick a date'); rescheduleMatch(match.id, { date, time, venue }); onSaved(); return onClose(); }
    if (!a.trim() || !b.trim()) return setErr('Type both team names');
    if (a.trim().toLowerCase() === b.trim().toLowerCase()) return setErr('The two teams need different names');
    if (!date) return setErr('Pick a date');
    if (!overs || overs < 1) return setErr('Choose the number of overs');
    scheduleMatch({ teamA: a, teamB: b, date, time, venue, overs }); onSaved(); onClose();
  }
  return (
    <Modal open onClose={onClose} title={match ? `Change date / time · ${match.title}` : 'Schedule an upcoming match'}>
      <div className="space-y-3">
        {!match && (<>
          <label className="block"><span className="label">Team 1</span><input className="input" list="sched-teams" value={a} onChange={(e) => setA(e.target.value)} placeholder="e.g. Eagles" autoFocus /></label>
          <label className="block"><span className="label">Team 2</span><input className="input" list="sched-teams" value={b} onChange={(e) => setB(e.target.value)} placeholder="e.g. Tigers" /></label>
          <datalist id="sched-teams">{db.teams.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        </>)}
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Date</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="block"><span className="label">Time</span><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <label className="block"><span className="label">Ground (optional)</span><input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} /></label>
        {!match && (
          <div><span className="label">Overs per side</span>
            <div className="flex flex-wrap gap-2">{OVERS.map((o) => <button key={o} type="button" className={`btn ${overs === o ? 'btn-primary' : 'btn-ghost'} !px-3`} onClick={() => setOvers(o)}>{o}</button>)}</div></div>)}
        {err && <p role="alert" className="text-sm font-medium text-red-500">{err}</p>}
        <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{match ? 'Save' : 'Add to upcoming'}</button></div>
      </div>
    </Modal>
  );
}
