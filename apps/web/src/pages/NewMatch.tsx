import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createQuickMatch, isScheduled, useDB } from '../lib/store';
import { BatBall } from '../art';
import { Coin } from '../fx';
import { PageTitle } from '../ui';

const OVERS = [5, 6, 8, 10, 15, 20, 30, 50];

interface Side { name: string; players: string[] }

export default function NewMatch() {
  const db = useDB(); const nav = useNavigate(); const [sp] = useSearchParams();
  const sched = db.matches.find((m) => m.id === sp.get('from') && isScheduled(m));   // starting a match from the calendar
  const tn = (id?: string) => db.teams.find((t) => t.id === id)?.name ?? '';
  const [step, setStep] = useState(0);
  const [sides, setSides] = useState<[Side, Side]>([{ name: sched ? tn(sched.teamAId) : '', players: [] }, { name: sched ? tn(sched.teamBId) : '', players: [] }]);
  const sOvers = sched?.rules.oversPerInnings ?? 10;
  const [overs, setOvers] = useState<number>(sOvers); const [custom, setCustom] = useState(OVERS.includes(sOvers) ? '' : String(sOvers));
  const [more, setMore] = useState(false); const [testStyle, setTestStyle] = useState(!!sched && sched.rules.oversPerInnings == null);
  const [quick, setQuick] = useState(false); const [venue, setVenue] = useState(sched?.venue ?? ''); const [freeHit, setFreeHit] = useState(true);
  const [winner, setWinner] = useState<0 | 1 | null>(null); const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  const [err, setErr] = useState('');

  const upd = (k: 0 | 1, p: Partial<Side>) => setSides((s) => (k === 0 ? [{ ...s[0], ...p }, s[1]] : [s[0], { ...s[1], ...p }]));
  const saved = (name: string) => {
    const t = db.teams.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    return t ? t.playerIds.map((id) => db.players.find((p) => p.id === id)?.name).filter(Boolean) as string[] : [];
  };

  function next() {
    setErr('');
    if (step === 0) {
      const [a, b] = sides;
      if (!a.name.trim() || !b.name.trim()) return setErr('Type both team names');
      if (a.name.trim().toLowerCase() === b.name.trim().toLowerCase()) return setErr('The two teams need different names');
      if (!testStyle && (!overs || overs < 1)) return setErr('Choose the number of overs');
      // Reuse saved players when the team name matches a saved team and nothing has been typed yet.
      setSides(([x, y]) => [x.players.length ? x : { ...x, players: saved(x.name) }, y.players.length ? y : { ...y, players: saved(y.name) }]);
    }
    if (step === 1) for (const s of sides) if (s.players.length < 2) return setErr(`${s.name}: add at least 2 players`);
    setStep(step + 1);
  }

  function start() {
    if (winner === null) return setErr('Tap who won the toss');
    const id = createQuickMatch({ teams: sides, overs: testStyle ? null : overs, testStyle, venue, date: new Date().toISOString().slice(0, 10), tournamentId: sp.get('tournament') ?? undefined, fromId: sched?.id, toss: { winner, decision }, freeHit, mode: quick ? 'quick' : 'detailed' });
    nav(`/scoring/${id}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle right={<BatBall size={64} />}>New match</PageTitle>
      <div className="mb-3 flex gap-1" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/15'}`} />)}</div>
      <div className="card space-y-4 p-4">
        {step === 0 && (
          <>
            <h2 className="text-lg font-bold">Who is playing?</h2>
            {[0, 1].map((k) => (
              <label key={k} className="block"><span className="label">Team {k + 1} name</span>
                <input className="input !py-3 text-base" list="teamnames" placeholder={k === 0 ? 'e.g. Eagles' : 'e.g. Tigers'} value={sides[k].name} onChange={(e) => upd(k as 0 | 1, { name: e.target.value, players: [] })} autoFocus={k === 0} /></label>))}
            <datalist id="teamnames">{db.teams.map((t) => <option key={t.id} value={t.name} />)}</datalist>
            {!testStyle && (
              <div><span className="label">How many overs?</span>
                <div className="flex flex-wrap gap-2">{OVERS.map((o) => <button key={o} className={`btn ${overs === o && !custom ? 'btn-primary' : 'btn-ghost'} !px-4`} onClick={() => { setOvers(o); setCustom(''); }}>{o}</button>)}
                  <input className="input !w-24" type="number" min={1} placeholder="Other" value={custom} onChange={(e) => { setCustom(e.target.value); setOvers(Number(e.target.value)); }} aria-label="Other number of overs" /></div></div>)}
            <button className="py-2 text-sm text-emerald-600 underline" onClick={() => setMore(!more)}>{more ? 'Hide extra options' : 'More options'}</button>
            {more && (
              <div className="space-y-3 rounded-lg bg-slate-100 p-3 dark:bg-white/5">
                <label className="block"><span className="label">Ground (optional)</span><input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={freeHit} onChange={(e) => setFreeHit(e.target.checked)} />Free hit after a no-ball</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} />I only want to type in the final scores (no ball-by-ball)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={testStyle} onChange={(e) => setTestStyle(e.target.checked)} />Multi-day match (two innings each, no over limit)</label>
              </div>)}
          </>
        )}

        {step === 1 && sides.map((s, k) => <PlayerList key={k} side={s} saved={saved(s.name)} onChange={(players) => upd(k as 0 | 1, { players })} />)}

        {step === 2 && (
          <>
            <h2 className="text-lg font-bold">Who won the toss?</h2>
            <div className="flex justify-center py-1"><Coin a={sides[0].name} b={sides[1].name} onResult={(i) => setWinner(i)} /></div>
            <p className="text-center text-xs text-slate-500">Flip a virtual coin, or just tap the winner below.</p>
            <div className="grid grid-cols-2 gap-3">{sides.map((s, k) => <button key={k} className={`btn !py-5 text-base ${winner === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setWinner(k as 0 | 1)}>{s.name}</button>)}</div>
            {winner !== null && (<>
              <h2 className="text-lg font-bold">{sides[winner].name} chose to…</h2>
              <div className="grid grid-cols-2 gap-3">{(['bat', 'bowl'] as const).map((d) => <button key={d} className={`btn !py-5 text-base ${decision === d ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDecision(d)}>{d === 'bat' ? '🏏 Bat' : '⚾ Bowl'}</button>)}</div>
              <p className="rounded-lg bg-emerald-500/10 p-3 text-sm"><b>{sides[decision === 'bat' ? winner : winner === 0 ? 1 : 0].name}</b> will bat first.</p></>)}
          </>
        )}

        {err && <p role="alert" className="text-sm font-medium text-red-500">{err}</p>}
        <div className="flex justify-between gap-2">
          <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          {step < 2 ? <button className="btn btn-primary !px-8 !py-3" onClick={next}>Next</button> : <button className="btn btn-primary !px-6 !py-3" onClick={start}>Start match</button>}
        </div>
      </div>
    </div>
  );
}

function PlayerList({ side, saved, onChange }: { side: Side; saved: string[]; onChange: (p: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    // Several names at once: separate with commas or new lines.
    const names = text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).filter((n) => !side.players.some((p) => p.toLowerCase() === n.toLowerCase()));
    if (names.length) onChange([...side.players, ...names]); setText('');
  };
  const unused = saved.filter((n) => !side.players.includes(n));
  return (
    <div>
      <h2 className="mb-1 text-lg font-bold">{side.name} players <span className="text-sm font-normal text-slate-500">({side.players.length})</span></h2>
      <p className="mb-2 text-xs text-slate-500">Type a name and press Enter. The order here is the batting order.</p>
      <div className="flex gap-2"><input className="input !py-3 text-base" placeholder="Player name" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} aria-label={`Add a player to ${side.name}`} /><button className="btn btn-primary" onClick={add}>Add</button></div>
      <ol className="mt-2 space-y-1">
        {side.players.map((p, i) => (
          <li key={p} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-white/5"><span className="w-5 text-slate-500">{i + 1}</span><span className="flex-1 font-medium">{p}</span>
            <button className="px-1 text-slate-500 disabled:opacity-20" disabled={i === 0} onClick={() => { const a = [...side.players]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }} aria-label={`Move ${p} up`}>▲</button>
            <button className="px-1 text-slate-500" onClick={() => onChange(side.players.filter((x) => x !== p))} aria-label={`Remove ${p}`}>✕</button></li>))}
      </ol>
      {unused.length > 0 && <div className="mt-2 flex flex-wrap gap-1"><span className="text-xs text-slate-500">Saved:</span>{unused.map((n) => <button key={n} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs dark:border-white/20" onClick={() => onChange([...side.players, n])}>＋ {n}</button>)}</div>}
    </div>
  );
}
