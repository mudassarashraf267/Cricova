import { economy, formatOvers, scoreboard } from '@cricketpro/engine';
import type { DeliveryEvent, DismissalKind, InningsEvent } from '@cricketpro/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { InningsCard } from '../Scorecard';
import { inningsViews, nameMap, playerName, resultOf, teamName } from '../lib/analysis';
import { inningsState, totalInnings, uid } from '../lib/domain';
import type { DB, Match } from '../lib/domain';
import { addEvent, addPlayerToMatch, amendLast, correctEvent, redoEvent, saveMatch, startInnings, undoEvent, useDB } from '../lib/store';
import { Crest } from '../art';
import { Celebration, Confetti } from '../fx';
import { Empty, Field, Modal, PageTitle, Toast } from '../ui';

function feedback(db: DB, kind: 'run' | 'boundary' | 'wicket') {
  if (db.settings.vibrate && 'vibrate' in navigator) navigator.vibrate(kind === 'wicket' ? [60, 40, 120] : kind === 'boundary' ? 60 : 15);
  if (db.settings.sound) {
    try {
      const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = kind === 'wicket' ? 180 : kind === 'boundary' ? 880 : 520; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (kind === 'run' ? 0.05 : 0.2));
      setTimeout(() => ctx.close(), 400);
    } catch { /* audio unavailable */ }
  }
}

export default function Scoring() {
  const { id } = useParams(); const db = useDB();
  if (!id) {
    const open = db.matches.filter((m) => m.status !== 'completed');
    return (
      <div><PageTitle right={<Link className="btn btn-primary" to="/matches/new">＋ New match</Link>}>Live scoring</PageTitle>
        {open.length === 0 ? <Empty>No match in progress. Start a new one.</Empty> : <div className="grid gap-3 md:grid-cols-2">{open.map((m) => <Link key={m.id} to={`/scoring/${m.id}`} className="card p-4 hover:border-emerald-500"><div className="font-bold">{m.title}</div><div className="text-xs text-slate-500">{m.status === 'live' ? '● Live' : 'Not started'} · {m.format}</div></Link>)}</div>}
      </div>
    );
  }
  const m = db.matches.find((x) => x.id === id);
  if (!m) return <Empty>Match not found.</Empty>;
  return <MatchScoring m={m} db={db} />;
}

function MatchScoring({ m, db }: { m: Match; db: DB }) {
  const nav = useNavigate();
  const idx = m.innings.length - 1;
  const names = nameMap(db);
  const [toast, setToast] = useState<string | null>(null);
  const done = useCallback(() => setToast(null), []);

  if (m.status === 'completed') return <Navigate to={`/matches/${m.id}`} replace />;
  if (!m.toss) return <TossForm m={m} db={db} />;
  if (m.mode === 'quick') return <QuickEntry m={m} db={db} />;

  const cur = idx >= 0 ? inningsState(m, idx) : null;
  const need = totalInnings(m);
  const allDone = m.innings.length === need && cur && cur.status !== 'inProgress';
  const needsNext = !cur || (cur.status !== 'inProgress' && m.innings.length < need);
  const threeInn = m.rules.inningsPerTeam === 2 && m.innings.length === 3 && cur && cur.status === 'allOut';
  const resultKnown = resultOf(m, names).kind !== 'incomplete';
  const prev = needsNext && idx >= 0 ? inningsViews(m)[idx] : null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-2"><Link to="/matches" className="text-sm text-slate-500">← Matches</Link></div>
      {prev && (
        <div className="card mb-3 p-4 text-center">
          <div className="text-sm text-slate-500">Innings {idx + 1} finished ({endReason(prev.status)})</div>
          <div className="text-2xl font-extrabold">{teamName(db, prev.battingTeamId)} {prev.runs}/{prev.wickets} <span className="text-base font-normal text-slate-500">({prev.overs} ov)</span></div>
          {m.rules.inningsPerTeam === 1 && <div className="mt-1 font-semibold text-emerald-600">{teamName(db, prev.bowlingTeamId)} need {prev.runs + 1} to win</div>}
        </div>)}
      {needsNext && !allDone && <StartInnings m={m} db={db} />}
      {prev && <div className="mt-3"><InningsCard v={prev} db={db} m={m} /></div>}
      {cur && !needsNext && cur.status === 'inProgress' && <Live m={m} idx={idx} db={db} setToast={setToast} />}
      {cur && cur.status !== 'inProgress' && !needsNext && <InningsCard v={inningsViews(m)[idx]} db={db} m={m} />}
      {(allDone || threeInn || resultKnown) && <Finish m={m} db={db} onDone={() => undefined} />}
      <Toast msg={toast} onDone={done} />
    </div>
  );
}

const endReason = (s: string) => ({ allOut: 'all out', oversComplete: 'overs completed', targetReached: 'target reached', declared: 'declared' } as Record<string, string>)[s] ?? s;

/** One text box + Add button for typing a new player name. */
function AddName({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const [t, setT] = useState('');
  const go = () => { if (t.trim()) { onAdd(t.trim()); setT(''); } };
  return <div className="flex gap-2"><input className="input" placeholder={label} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), go())} aria-label={label} /><button className="btn btn-primary" onClick={go}>Add</button></div>;
}

// ---------------- toss (matches created without one, e.g. scheduled fixtures) ----------------
function TossForm({ m, db }: { m: Match; db: DB }) {
  const [winner, setWinner] = useState(m.teamAId); const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div><Link to="/matches" className="text-sm text-slate-500">← Matches</Link></div>
      <div className="card space-y-3 p-4">
        <h2 className="text-lg font-bold">{m.title}: toss</h2>
        <Field label="Toss won by"><select className="input !py-3" value={winner} onChange={(e) => setWinner(e.target.value)}>{[m.teamAId, m.teamBId].map((t) => <option key={t} value={t}>{teamName(db, t)}</option>)}</select></Field>
        <Field label="Chose to"><select className="input !py-3" value={decision} onChange={(e) => setDecision(e.target.value as 'bat' | 'bowl')}><option value="bat">Bat</option><option value="bowl">Bowl</option></select></Field>
        <button className="btn btn-primary w-full !py-3 text-base" onClick={() => saveMatch({ ...m, toss: { winnerId: winner, decision } })}>Save toss and continue</button>
      </div>
    </div>
  );
}

// ---------------- start innings ----------------
function StartInnings({ m, db }: { m: Match; db: DB }) {
  const n = m.innings.length;
  const toss = m.toss!;
  const tossBatFirst = toss.decision === 'bat' ? toss.winnerId : toss.winnerId === m.teamAId ? m.teamBId : m.teamAId;
  const alt = n === 0 ? tossBatFirst : m.innings[n - 1].bowlingTeamId;
  const [team, setTeam] = useState(alt);
  const xi = m.xi[team] ?? [];
  const [o1, setO1] = useState(xi[0] ?? ''); const [o2, setO2] = useState(xi[1] ?? '');
  useEffect(() => { const x = m.xi[team] ?? []; setO1(x[0] ?? ''); setO2(x[1] ?? ''); }, [team, m.xi]);
  const [err, setErr] = useState('');
  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-lg font-bold">{teamName(db, team)} batting</h2>
      {n === 0 && <p className="text-sm text-slate-500">{teamName(db, toss.winnerId)} won the toss and chose to {toss.decision}.</p>}
      {n > 0 && m.rules.inningsPerTeam === 2 && <Field label="Batting side (change only for a follow-on)"><select className="input" value={team} onChange={(e) => setTeam(e.target.value)}>{[m.teamAId, m.teamBId].map((t) => <option key={t} value={t}>{teamName(db, t)}</option>)}</select></Field>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Opening batter 1"><select className="input !py-3" value={o1} onChange={(e) => setO1(e.target.value)}>{xi.map((p) => <option key={p} value={p}>{playerName(db, p)}</option>)}</select></Field>
        <Field label="Opening batter 2"><select className="input !py-3" value={o2} onChange={(e) => setO2(e.target.value)}>{xi.map((p) => <option key={p} value={p}>{playerName(db, p)}</option>)}</select></Field>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      <button className="btn btn-primary w-full !py-3 text-base" onClick={() => { if (!o1 || !o2 || o1 === o2) return setErr('Pick two different opening batters'); startInnings(m.id, team, [o1, o2]); }}>Start scoring</button>
    </div>
  );
}

// ---------------- live scoring ----------------
type Extra = '' | 'wd' | 'nb' | 'bye' | 'lb';
const ALL_KINDS: [DismissalKind, string][] = [['bowled', 'Bowled'], ['caught', 'Caught'], ['lbw', 'LBW'], ['runOut', 'Run out'], ['stumped', 'Stumped'], ['hitWicket', 'Hit wicket'], ['hitBallTwice', 'Hit ball twice'], ['obstructingField', 'Obstructing field']];

function Live({ m, idx, db, setToast }: { m: Match; idx: number; db: DB; setToast: (s: string) => void }) {
  const inn = m.innings[idx];
  const s = inningsState(m, idx);
  const sb = scoreboard(s);
  const bpo = m.rules.ballsPerOver;
  const [extra, setExtra] = useState<Extra>('');
  const [sel, setSel] = useState('');
  const [changing, setChanging] = useState(false);
  const [tab, setTab] = useState<'score' | 'card'>('score');
  const [wk, setWk] = useState(false); const [adv, setAdv] = useState<DeliveryEvent | 'new' | null>(null); const [ret, setRet] = useState(false);
  const [rev, setRev] = useState(false); const [more, setMore] = useState(false); const [fix, setFix] = useState(false); const [addP, setAddP] = useState(false); const [endM, setEndM] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [amend, setAmend] = useState<{ id: string; kind: 'wd' | 'nb' } | null>(null);
  const [wkCtx, setWkCtx] = useState<{ extra: Extra; amendId?: string }>({ extra: '' });
  const [cel, setCel] = useState<{ kind: 'FOUR' | 'SIX' | 'OUT' | null; id: number }>({ kind: null, id: 0 });
  const [overBanner, setOverBanner] = useState<{ n: number; runs: number; wk: number; who: string; maiden: boolean } | null>(null);
  const bowlXI = m.xi[inn.bowlingTeamId] ?? [];
  const needBowler = (!s.currentOver && !sel) || changing;
  const bowlerId = needBowler ? '' : sel || s.currentOver?.bowlerId || '';
  const replacing = !!s.currentOver && !!sel && sel !== s.currentOver.bowlerId;
  useEffect(() => { setSel(''); setChanging(false); }, [s.overs.length]);
  useEffect(() => {
    const o = s.overs.at(-1);
    if (!o || s.status !== 'inProgress') return;
    setOverBanner({ n: o.over, runs: o.runs, wk: o.wickets, who: o.bowlerIds.map((b) => playerName(db, b)).join(' / '), maiden: !!o.maidenBowlerId });
    const t = setTimeout(() => setOverBanner(null), 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.overs.length]);

  const fail = (e: string | null) => { if (e) setToast(e); return !e; };
  const mk = (o: Partial<DeliveryEvent>): DeliveryEvent => ({ type: 'delivery', id: uid('e'), bowlerId, batRuns: 0, scorerId: db.settings.scorer, at: new Date().toISOString(), replacesBowlerMidOver: replacing || undefined, ...o });
  const celebrate = (ev: InningsEvent) => {
    if (ev.type !== 'delivery') return;
    const k = ev.wicket ? 'wicket' : ev.boundary && ev.batRuns >= ev.boundary ? 'boundary' : 'run';
    feedback(db, k);
    if (k !== 'run') {
      const id = Date.now();
      setCel({ kind: k === 'wicket' ? 'OUT' : ev.boundary === 6 ? 'SIX' : 'FOUR', id });
      setTimeout(() => setCel((c) => (c.id === id ? { kind: null, id } : c)), 1100);
      if (k === 'wicket') { document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 520); }
    }
  };
  const send = (ev: InningsEvent) => { const ok = fail(addEvent(m.id, idx, ev)); if (ok) { celebrate(ev); setExtra(''); setAmend(null); } return ok; };
  /** Wide / no ball: one tap records it with its penalty run; the scorer can then add runs that were also run or hit. */
  const quickExtra = (kind: 'wd' | 'nb') => {
    const ev = mk(kind === 'wd' ? { wides: m.rules.wideRuns } : { noBall: true });
    if (send(ev)) setAmend({ id: ev.id, kind });
  };
  const amendRuns = (n: number) => {
    if (!amend) return;
    const last = inn.events[inn.events.length - 1] as DeliveryEvent;
    const b = n === 4 ? 4 : n === 6 ? 6 : undefined;
    const ev: DeliveryEvent = amend.kind === 'wd' ? { ...last, wides: m.rules.wideRuns + n, boundary: n === 4 ? 4 : undefined } : { ...last, batRuns: n, boundary: b };
    if (fail(amendLast(m.id, idx, ev))) { celebrate(ev); setAmend(null); }
  };

  const run = (n: number) => {
    const b = n === 4 ? 4 : n === 6 ? 6 : undefined;
    if (extra === 'wd') return send(mk({ wides: n + m.rules.wideRuns, boundary: n === 4 ? 4 : undefined }));
    if (extra === 'nb') return send(mk({ noBall: true, batRuns: n, boundary: b }));
    if (extra === 'bye') return send(mk({ byes: n, boundary: n === 4 ? 4 : undefined }));
    if (extra === 'lb') return send(mk({ legByes: n, boundary: n === 4 ? 4 : undefined }));
    return send(mk({ batRuns: n, boundary: b }));
  };

  const striker = s.strikerId ? s.batters[s.strikerId] : null; const non = s.nonStrikerId ? s.batters[s.nonStrikerId] : null;
  const curBowler = bowlerId ? s.bowlers[bowlerId] : undefined;
  const events = inn.events;
  const balls = [...s.balls].reverse();
  const overHelp = extra === 'bye' ? 'BYES — how many runs did they run?' : extra === 'lb' ? 'LEG BYES — how many runs did they run?' : '';

  return (
    <div>
      <motion.div layout className="hero rounded-2xl p-4 shadow-xl">
        <div className="flex items-end justify-between">
          <div><div className="flex items-center gap-2 text-sm opacity-80"><Crest name={teamName(db, inn.battingTeamId)} color={db.teams.find((t) => t.id === inn.battingTeamId)?.color} size={24} />{teamName(db, inn.battingTeamId)}{s.freeHit && <span className="ml-2 animate-pulse rounded bg-gold px-1.5 py-0.5 text-xs font-bold text-black">FREE HIT</span>}</div>
            <motion.div data-testid="score" key={`${s.runs}-${s.wickets}`} initial={{ rotateX: -80, opacity: 0.2, color: '#22e07a' }} animate={{ rotateX: 0, opacity: 1, color: '#ffffff' }} style={{ transformPerspective: 500, transformOrigin: '50% 100%' }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="text-5xl font-extrabold tabular-nums">{s.runs}/{s.wickets}</motion.div></div>
          <div className="text-right"><div className="text-2xl font-bold tabular-nums" data-testid="overs">{sb.overs}{s.oversLimit ? <span className="text-sm opacity-60"> / {s.oversLimit}</span> : null}</div><div className="text-sm opacity-80">Run rate {sb.crr?.toFixed(2) ?? '-'}</div></div>
        </div>
        {sb.target !== null && <div className="mt-2 rounded-lg bg-white/10 p-2 text-center text-sm">Need <b>{sb.required}</b> runs from <b>{sb.remainingBalls}</b> balls{sb.rrr ? <> · required rate <b>{sb.rrr.toFixed(2)}</b></> : null}</div>}
        <div className="mt-3 space-y-1 text-sm">
          <div className="grid grid-cols-2 gap-2">
            {[striker, non].filter(Boolean).sort((x, y) => (x!.arrival ?? 0) - (y!.arrival ?? 0)).map((b) => {
              const on = b!.id === s.strikerId;
              return (
                <motion.div key={b!.id} layout animate={{ scale: on ? 1.02 : 1 }} data-testid={on ? 'on-strike' : 'off-strike'}
                  role={on ? undefined : 'button'} tabIndex={on ? undefined : 0} aria-label={on ? undefined : `Put ${playerName(db, b!.id)} on strike`}
                  onClick={on ? undefined : () => send({ type: 'swapStrike', id: uid('e') })}
                  onKeyDown={on ? undefined : (e) => { if (e.key === 'Enter') send({ type: 'swapStrike', id: uid('e') }); }}
                  className={`rounded-xl p-2.5 transition-colors ${on ? 'bg-live/25 ring-2 ring-live' : 'cursor-pointer bg-white/5 opacity-60 hover:opacity-100'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wide ${on ? 'text-live' : 'opacity-70'}`}>{on ? '🏏 On strike' : 'Non-striker'}</div>
                  <div className="truncate font-bold">{playerName(db, b!.id)}</div>
                  <div className="text-xl font-extrabold tabular-nums">{b!.runs} <span className="text-xs font-normal opacity-70">({b!.balls})</span></div>
                </motion.div>);
            })}
          </div>
          <div className="text-center text-[11px] opacity-60">Wrong batter highlighted? Tap the other one to put them on strike.</div>
          {curBowler && (
            <div className="border-t border-white/10 pt-2">
              <div className="flex items-baseline justify-between"><span className="font-bold">⚾ {playerName(db, bowlerId)}</span><span className="text-[10px] uppercase tracking-wide opacity-60">O · M · R · W · Econ</span></div>
              <div className="text-right text-lg font-extrabold tabular-nums" data-testid="bowler-line">{formatOvers(curBowler.legalBalls, bpo)} · {curBowler.maidens} · {curBowler.runs} · {curBowler.wickets} · {economy(curBowler.runs, curBowler.legalBalls, bpo)?.toFixed(2) ?? '-'}</div>
            </div>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="This over">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wide opacity-60">{s.currentOver ? `Over ${s.currentOver.index + 1}` : s.overs.length ? `Over ${s.overs.length} done` : 'This over'}</span>
          {(() => {
            const idx = s.currentOver ? s.currentOver.index : s.overs.length - 1;
            return s.balls.filter((b) => b.over === idx).map((b) => (
              <motion.div key={b.id} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} className="flex flex-col items-center gap-0.5">
                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold ${b.wicket ? 'bg-red-500 glow-red' : b.token === '4' || b.token === '6' ? 'bg-emerald-500 glow-live' : !b.legal ? 'bg-amber-500 text-black' : 'bg-white/20'}`}>{b.token === '0' ? '•' : b.token}</span>
                <span className="text-[9px] tabular-nums opacity-60" data-testid="ball-no">{b.over}.{b.legal ? b.legalInOver : b.legalInOver + 1}</span>
              </motion.div>));
          })()}
          <span className="ml-auto text-xs font-semibold opacity-80">{s.currentOver ? s.currentOver.runs : s.overs.at(-1)?.runs ?? 0} runs</span>
        </div>
      </motion.div>

      <div className="mt-3 flex gap-1" role="tablist">
        {([['score', 'Score'], ['card', 'Scorecard']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`btn flex-1 ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'score' && (<>
      {needBowler ? (
        <BowlerPicker m={m} db={db} s={s} teamId={inn.bowlingTeamId} bowlXI={bowlXI} title={changing ? 'Who is bowling now?' : `Over ${s.overs.length + 1}: who is bowling?`}
          onPick={(id) => { setSel(id); setChanging(false); }} onCancel={changing ? () => setChanging(false) : undefined} />
      ) : (
        <div className="card mt-3 p-3">
          {s.freeHit && <div className="mb-2 rounded-lg bg-gold/90 p-2 text-center text-sm font-extrabold text-black">🔥 FREE HIT — this ball only a run out is possible</div>}
          {amend && (
            <div className="mb-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2 text-sm">
              <div className="mb-1 font-semibold">{amend.kind === 'wd' ? 'Wide recorded (+1).' : 'No ball recorded (+1). Next ball is a free hit.'} {amend.kind === 'wd' ? 'Did they also run?' : 'Did the batter hit it?'}</div>
              <div className="flex flex-wrap gap-2">
                {(amend.kind === 'wd' ? [1, 2, 3, 4] : [1, 2, 3, 4, 6]).map((n) => <button key={n} className="btn btn-ghost !px-3 !py-1.5" onClick={() => amendRuns(n)}>{amend.kind === 'wd' ? `+${n}` : `${n} off bat`}</button>)}
                <button className="btn btn-ghost !px-3 !py-1.5 text-red-500" onClick={() => { setWkCtx({ extra: amend.kind, amendId: amend.id }); setWk(true); }}>Wicket</button>
                <button className="btn btn-ghost !px-3 !py-1.5" onClick={() => setAmend(null)}>Done</button>
              </div>
            </div>)}
          {overHelp && <p className="mb-2 rounded-lg bg-amber-500/15 p-2 text-sm font-medium text-amber-700 dark:text-amber-300">{overHelp}</p>}
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} disabled={((extra === 'bye' || extra === 'lb') && n === 0) || (extra === 'wd' && n === 6)} onClick={() => run(n)}
                className={`btn h-16 text-2xl ${n === 4 || n === 6 ? 'bg-live text-black glow-live' : n === 0 ? 'btn-ghost' : 'btn-primary'}`}>{n === 0 && !extra ? '•' : n}</button>))}
            <button className="btn btn-danger h-16 text-xl text-white glow-red" onClick={() => { setWkCtx({ extra: extra === 'bye' || extra === 'lb' ? extra : '' }); setWk(true); }}>OUT</button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <button className="btn btn-ghost !px-1" onClick={() => quickExtra('wd')}>Wide +1</button>
            <button className="btn btn-ghost !px-1" onClick={() => quickExtra('nb')}>No ball +1</button>
            {([['bye', 'Bye'], ['lb', 'Leg bye']] as const).map(([k, l]) => <button key={k} className={`btn !px-1 ${extra === k ? 'bg-amber-500 text-black' : 'btn-ghost'}`} onClick={() => setExtra(extra === k ? '' : k)} aria-pressed={extra === k}>{l}</button>)}
          </div>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn btn-ghost" disabled={!events.length} onClick={() => fail(undoEvent(m.id, idx))}>↶ Undo</button>
        <button className="btn btn-ghost" onClick={() => setMore(true)}>⋯ More</button>
      </div>
      </>)}

      {tab === 'card' && <div className="mt-3"><InningsCard v={inningsViews(m)[idx]} db={db} m={m} /></div>}

      <Celebration kind={cel.kind} id={cel.id} />
      <AnimatePresence>
        {overBanner && (
          <motion.div key={overBanner.n} initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="pointer-events-none fixed inset-x-3 top-16 z-[60] mx-auto max-w-sm rounded-2xl bg-navy-800/95 px-4 py-3 text-center text-white shadow-2xl ring-1 ring-live/40 backdrop-blur">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-live">Over {overBanner.n} complete</div>
            <div className="text-lg font-extrabold">{overBanner.runs} runs{overBanner.wk ? ` · ${overBanner.wk} wicket${overBanner.wk > 1 ? 's' : ''}` : ''}{overBanner.maiden ? ' · MAIDEN 🔥' : ''}</div>
            <div className="text-xs opacity-70">{overBanner.who}</div>
          </motion.div>)}
      </AnimatePresence>

      {wk && <WicketModal m={m} idx={idx} db={db} extra={wkCtx.extra} mk={mk} onClose={() => setWk(false)} send={(ev) => { if (wkCtx.amendId) { const e = { ...ev, id: wkCtx.amendId } as DeliveryEvent; const ok = fail(amendLast(m.id, idx, e)); if (ok) { celebrate(e); setAmend(null); } return ok; } return send(ev); }} />}
      {adv && <AdvancedModal m={m} idx={idx} db={db} mk={mk} editing={adv === 'new' ? null : adv} bowlerId={bowlerId || bowlXI[0] || ''} onClose={() => setAdv(null)} send={send} setToast={setToast} />}
      {ret && <RetireModal m={m} idx={idx} db={db} onClose={() => setRet(false)} send={send} />}
      {rev && <ReviseModal m={m} idx={idx} onClose={() => setRev(false)} send={send} />}

      <Modal open={more} onClose={() => setMore(false)} title="More">
        <div className="grid gap-2">
          {[
            ['Change bowler (mid-over)', () => { setChanging(true); setTab('score'); }, !!s.currentOver],
            ['Fix an earlier ball', () => setFix(true), events.length > 0],
            ['Redo', () => fail(redoEvent(m.id, idx)), inn.redo.length > 0],
            ['Add a player', () => setAddP(true), true],
            ['Batter retired / timed out', () => setRet(true), true],
            ['Penalty runs, rain or revised target', () => setRev(true), true],
            ['Enter a ball in detail', () => setAdv('new'), !!bowlerId],
            ['Declare innings', () => send({ type: 'declare', id: uid('e') }), s.oversLimit === null],
            ['End match without a result', () => setEndM(true), true],
          ].filter((x) => x[2]).map(([label, fn]) => <button key={label as string} className="btn btn-ghost !justify-start !py-3 text-left" onClick={() => { setMore(false); (fn as () => void)(); }}>{label as string}</button>)}
        </div>
      </Modal>

      <Modal open={fix} onClose={() => setFix(false)} title="Fix an earlier ball" wide>
        <p className="mb-2 text-sm text-slate-500">Pick a ball to change or remove. You will be asked for a reason and it is saved in the history.</p>
        <div className="max-h-96 overflow-y-auto"><table><tbody>{balls.slice(0, 40).map((b) => (
          <tr key={b.id}><td className="td text-slate-500">{b.over}.{b.legal ? b.legalInOver : b.legalInOver + 1}</td><td className="td font-bold">{b.token}</td><td className="td text-xs">{playerName(db, b.bowlerId)} → {playerName(db, b.strikerId)}</td>
            <td className="td whitespace-nowrap text-right"><button className="btn btn-ghost !px-2 !py-1" onClick={() => { setFix(false); setAdv(events.find((e) => e.id === b.id) as DeliveryEvent); }}>Change</button> <button className="btn btn-ghost !px-2 !py-1" onClick={() => { setFix(false); setDel(b.id); }}>Remove</button></td></tr>))}</tbody></table></div>
      </Modal>

      <Modal open={addP} onClose={() => setAddP(false)} title="Add a player">
        <div className="space-y-4">
          {[inn.battingTeamId, inn.bowlingTeamId].map((t) => <div key={t}><div className="label">{teamName(db, t)}</div><AddName label="Player name" onAdd={(n) => { addPlayerToMatch(m.id, t, n); setAddP(false); }} /></div>)}
        </div>
      </Modal>

      <Modal open={endM} onClose={() => setEndM(false)} title="End the match without a result?">
        <p className="mb-3 text-sm text-slate-500">Scores so far are kept.</p>
        <div className="grid gap-2">
          {([['noResult', 'No result (e.g. rain)'], ['abandoned', 'Abandoned'], ...(m.rules.inningsPerTeam === 2 ? [['drawn', 'Draw']] : [])] as [NonNullable<Match['override']>, string][]).map(([k, l]) => <button key={k} className="btn btn-danger" onClick={() => { saveMatch({ ...m, status: 'completed', override: k }); }}>{l}</button>)}
          <button className="btn btn-ghost" onClick={() => setEndM(false)}>Cancel</button>
        </div>
      </Modal>
      <ReasonModal open={!!del} title="Remove this ball" onClose={() => setDel(null)} onOk={(r) => { fail(correctEvent(m.id, idx, del!, null, r)); setDel(null); }} />
    </div>
  );
}

function BowlerPicker({ m, db, s, teamId, bowlXI, title, onPick, onCancel }: { m: Match; db: DB; s: ReturnType<typeof inningsState>; teamId: string; bowlXI: string[]; title: string; onPick: (id: string) => void; onCancel?: () => void }) {
  const bpo = m.rules.ballsPerOver; const max = m.rules.maxOversPerBowler;
  return (
    <div className="card mt-3 space-y-2 p-3">
      <h3 className="font-bold">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {bowlXI.map((p) => {
          const st = s.bowlers[p];
          const full = max !== null && (st?.legalBalls ?? 0) >= max * bpo;
          const consec = !m.rules.allowConsecutiveOvers && !s.currentOver && s.lastOverBowlerId === p;
          const left = s.currentOver && s.currentOver.bowlerIds.includes(p) && s.currentOver.bowlerId !== p;
          const off = full || consec || !!left;
          return <button key={p} disabled={off} className="btn btn-ghost !justify-between !py-3 text-left" onClick={() => onPick(p)}><span className="font-semibold">{playerName(db, p)}</span><span className="text-xs opacity-70">{off ? (full ? 'bowled max overs' : left ? 'left this over' : 'bowled last over') : st ? `${formatOvers(st.legalBalls, bpo)}-${st.maidens}-${st.runs}-${st.wickets}` : 'new'}</span></button>;
        })}
      </div>
      <AddName label="Add a new bowler (type name)" onAdd={(n) => { const id = addPlayerToMatch(m.id, teamId, n); if (id) onPick(id); }} />
      {onCancel && <button className="btn btn-ghost w-full" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

function availableBatters(s: ReturnType<typeof inningsState>) {
  return Object.values(s.batters).filter((b) => b.status === 'yetToBat' || b.status === 'retiredHurt' || b.status === 'retiredNotOut');
}

function WicketModal({ m, idx, db, extra, mk, onClose, send }: { m: Match; idx: number; db: DB; extra: Extra; mk: (o: Partial<DeliveryEvent>) => DeliveryEvent; onClose: () => void; send: (e: InningsEvent) => boolean }) {
  const s = inningsState(m, idx); const inn = m.innings[idx];
  const bowlXI = m.xi[inn.bowlingTeamId] ?? [];
  const keeper = db.teams.find((t) => t.id === inn.bowlingTeamId)?.keeperId;
  // Only offer dismissals that are possible for this kind of ball, so the scorer can never hit a rule error.
  const kinds = ALL_KINDS.filter(([k]) => {
    if (extra === 'bye' || extra === 'lb') return k === 'runOut';
    if (extra === 'nb' || s.freeHit) return ['runOut', 'hitBallTwice', 'obstructingField'].includes(k);
    if (extra === 'wd') return ['runOut', 'stumped', 'hitWicket', 'obstructingField'].includes(k);
    return true;
  });
  const [kind, setKind] = useState<DismissalKind | ''>('');
  const [who, setWho] = useState(s.strikerId ?? ''); const [fielder, setFielder] = useState(''); const [cb, setCb] = useState(false);
  const [runs, setRuns] = useState(0); const [next, setNext] = useState('');
  const lastWicket = s.wickets + 1 >= s.wicketsToEnd;
  const avail = availableBatters(s);
  const either = kind === 'runOut' || kind === 'obstructingField';
  const canRuns = kind === 'runOut';
  useEffect(() => { if (kind === 'stumped' && keeper && bowlXI.includes(keeper)) setFielder(keeper); }, [kind, keeper]); // eslint-disable-line
  const ready = !!kind && (lastWicket || !!next) && (kind !== 'caught' || cb || !!fielder || true);
  const submit = () => {
    if (!kind) return;
    const k: DismissalKind = kind === 'caught' && cb ? 'caughtAndBowled' : kind;
    const rr = canRuns ? runs : 0;
    const ev = mk({
      batRuns: extra === '' || extra === 'nb' ? rr : 0, byes: extra === 'bye' ? rr : 0, legByes: extra === 'lb' ? rr : 0,
      noBall: extra === 'nb' || undefined, wides: extra === 'wd' ? m.rules.wideRuns + rr : 0, completedRuns: rr,
      wicket: { kind: k, playerOutId: either ? who : s.strikerId ?? undefined, fielderId: k === 'caughtAndBowled' ? undefined : fielder || undefined, nextBatterId: lastWicket ? undefined : next || undefined },
    });
    if (send(ev)) onClose();
  };
  const pickBtn = (active: boolean) => `btn !py-3 ${active ? 'btn-primary' : 'btn-ghost'}`;
  return (
    <Modal open onClose={onClose} title="Wicket!">
      <div className="space-y-4">
        {extra && <p className="rounded-lg bg-amber-500/15 p-2 text-sm">This wicket is on a {{ wd: 'wide', nb: 'no ball', bye: 'bye', lb: 'leg bye' }[extra]}, so only some dismissals are possible.</p>}
        {s.freeHit && !extra && <p className="rounded-lg bg-amber-500/15 p-2 text-sm">Free hit: only a run out (or similar) is possible.</p>}
        <div><div className="label">How is the batter out?</div><div className="grid grid-cols-2 gap-2">{kinds.map(([k, l]) => <button key={k} className={pickBtn(kind === k)} onClick={() => setKind(k)}>{l}</button>)}</div></div>

        {either && <div><div className="label">Who is out?</div><div className="grid grid-cols-2 gap-2">{[s.strikerId, s.nonStrikerId].filter(Boolean).map((p) => <button key={p!} className={pickBtn(who === p)} onClick={() => setWho(p!)}>{playerName(db, p!)}</button>)}</div></div>}
        {canRuns && <div><div className="label">Runs completed before the run out</div><div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((n) => <button key={n} className={pickBtn(runs === n)} onClick={() => setRuns(n)}>{n}</button>)}</div></div>}
        {(kind === 'caught' || kind === 'stumped' || kind === 'runOut') && (
          <div><div className="label">{kind === 'stumped' ? 'Wicketkeeper' : kind === 'caught' ? 'Caught by' : 'Fielder (optional)'}</div>
            <div className="grid grid-cols-2 gap-2">
              {kind === 'caught' && <button className={pickBtn(cb)} onClick={() => { setCb(true); setFielder(''); }}>The bowler</button>}
              {bowlXI.map((p) => <button key={p} className={pickBtn(!cb && fielder === p)} onClick={() => { setCb(false); setFielder(p); }}>{playerName(db, p)}</button>)}
            </div></div>)}

        {kind && !lastWicket && (
          <div><div className="label">Who comes in next?</div>
            <div className="grid grid-cols-2 gap-2">{avail.map((b) => <button key={b.id} className={pickBtn(next === b.id)} onClick={() => setNext(b.id)}>{playerName(db, b.id)}{b.status !== 'yetToBat' ? ' (returns)' : ''}</button>)}</div>
            <div className="mt-2"><AddName label="Add a new batter (type name)" onAdd={(n) => { const id = addPlayerToMatch(m.id, inn.battingTeamId, n); if (id) setNext(id); }} /></div>
          </div>)}
        {kind && lastWicket && <div><p className="mb-2 text-sm text-amber-600">This wicket ends the innings. Another batter can still come in if you add one.</p><AddName label="Add a new batter (type name)" onAdd={(n) => addPlayerToMatch(m.id, inn.battingTeamId, n)} /></div>}
        <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-danger !px-6 !py-3" disabled={!ready} onClick={submit}>Confirm out</button></div>
      </div>
    </Modal>
  );
}

function ReasonModal({ open, title, onClose, onOk }: { open: boolean; title: string; onClose: () => void; onOk: (reason: string) => void }) {
  const [r, setR] = useState('');
  return <Modal open={open} onClose={onClose} title={title}><Field label="Reason (required, saved in the audit trail)"><input className="input" value={r} onChange={(e) => setR(e.target.value)} autoFocus /></Field><div className="mt-3 flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-danger" disabled={!r.trim()} onClick={() => { onOk(r.trim()); setR(''); }}>Confirm</button></div></Modal>;
}


function AdvancedModal({ m, idx, db, mk, editing, onClose, send, setToast, bowlerId }: { m: Match; idx: number; db: DB; mk: (o: Partial<DeliveryEvent>) => DeliveryEvent; editing: DeliveryEvent | null; onClose: () => void; send: (e: InningsEvent) => boolean; setToast: (s: string) => void; bowlerId: string }) {
  const e0 = editing;
  const [bat, setBat] = useState(e0?.batRuns ?? 0); const [wides, setWides] = useState(e0?.wides ?? 0); const [nb, setNb] = useState(!!e0?.noBall);
  const [byes, setByes] = useState(e0?.byes ?? 0); const [lb, setLb] = useState(e0?.legByes ?? 0); const [bd, setBd] = useState<string>(String(e0?.boundary ?? ''));
  const [cr, setCr] = useState<string>(e0?.completedRuns !== undefined ? String(e0.completedRuns) : '');
  const [reason, setReason] = useState(''); const [bowler, setBowler] = useState(e0?.bowlerId ?? bowlerId);
  const inn = m.innings[idx];
  const num = (setter: (n: number) => void) => (ev: React.ChangeEvent<HTMLInputElement>) => setter(Math.max(0, Number(ev.target.value) || 0));
  const submit = () => {
    const base: Partial<DeliveryEvent> = { batRuns: bat, wides: wides || undefined, noBall: nb || undefined, byes: byes || undefined, legByes: lb || undefined, boundary: bd ? (Number(bd) as 4 | 6) : undefined, completedRuns: cr === '' ? undefined : Number(cr), bowlerId: bowler };
    if (!editing) { if (send(mk(base))) onClose(); return; }
    if (!reason.trim()) return setToast('Enter a reason for the correction');
    const repl: DeliveryEvent = { ...editing, ...base, wicket: editing.wicket, replacesBowlerMidOver: editing.replacesBowlerMidOver };
    const err = correctEvent(m.id, idx, editing.id, repl, reason.trim());
    if (err) setToast(err); else onClose();
  };
  return (
    <Modal open onClose={onClose} title={editing ? 'Correct delivery' : 'Advanced delivery entry'} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Bowler"><select className="input" value={bowler} onChange={(e) => setBowler(e.target.value)}>{(m.xi[inn.bowlingTeamId] ?? []).map((p) => <option key={p} value={p}>{playerName(db, p)}</option>)}</select></Field>
        <Field label="Runs off the bat"><input type="number" min={0} className="input" value={bat} onChange={num(setBat)} /></Field>
        <Field label="Wide runs (total, incl. penalty)"><input type="number" min={0} className="input" value={wides} onChange={num(setWides)} /></Field>
        <Field label="Byes"><input type="number" min={0} className="input" value={byes} onChange={num(setByes)} /></Field>
        <Field label="Leg-byes"><input type="number" min={0} className="input" value={lb} onChange={num(setLb)} /></Field>
        <Field label="Ball reached boundary"><select className="input" value={bd} onChange={(e) => setBd(e.target.value)}><option value="">No</option><option value="4">Four</option><option value="6">Six</option></select></Field>
        <Field label="Runs physically run (overthrows; blank = auto)"><input className="input" type="number" min={0} value={cr} onChange={(e) => setCr(e.target.value)} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={nb} onChange={(e) => setNb(e.target.checked)} />No-ball</label>
        {editing && <div className="sm:col-span-3"><Field label="Reason for correction *"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>}
      </div>
      {editing?.wicket && <p className="mt-2 text-xs text-amber-600">This delivery has a wicket ({editing.wicket.kind}); it is preserved. To change the dismissal, delete and re-enter the ball.</p>}
      <div className="mt-3 flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>{editing ? 'Save correction' : 'Add delivery'}</button></div>
    </Modal>
  );
}

function RetireModal({ m, idx, db, onClose, send }: { m: Match; idx: number; db: DB; onClose: () => void; send: (e: InningsEvent) => boolean }) {
  const s = inningsState(m, idx);
  const [kind, setKind] = useState<'retiredHurt' | 'retiredNotOut' | 'retiredOut' | 'timedOut'>('retiredHurt');
  const [who, setWho] = useState(s.strikerId ?? ''); const avail = availableBatters(s); const [next, setNext] = useState(avail[0]?.id ?? '');
  const wick = kind === 'retiredOut' || kind === 'timedOut'; const last = wick && s.wickets + 1 >= s.wicketsToEnd;
  return (
    <Modal open onClose={onClose} title="Retire / timed out">
      <div className="space-y-3">
        <Field label="Type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="retiredHurt">Retired hurt (not a wicket)</option><option value="retiredNotOut">Retired not out (not a wicket)</option><option value="retiredOut">Retired out (wicket, not credited to bowler)</option><option value="timedOut">Timed out (wicket, not credited to bowler)</option></select></Field>
        <Field label="Batter"><select className="input" value={who} onChange={(e) => setWho(e.target.value)}>{[s.strikerId, s.nonStrikerId].filter(Boolean).map((p) => <option key={p!} value={p!}>{playerName(db, p!)}</option>)}</select></Field>
        {!last && <Field label="Next batter"><select className="input" value={next} onChange={(e) => setNext(e.target.value)}>{avail.filter((b) => b.id !== who).map((b) => <option key={b.id} value={b.id}>{playerName(db, b.id)}</option>)}</select></Field>}
        <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => send({ type: 'batterOut', id: uid('e'), kind, playerId: who, nextBatterId: last ? undefined : next || undefined, scorerId: db.settings.scorer, at: new Date().toISOString() }) && onClose()}>Record</button></div>
      </div>
    </Modal>
  );
}

function ReviseModal({ m, idx, onClose, send }: { m: Match; idx: number; onClose: () => void; send: (e: InningsEvent) => boolean }) {
  const inn = m.innings[idx];
  const [pen, setPen] = useState(5); const [ov, setOv] = useState(String(inn.oversLimit ?? m.rules.oversPerInnings ?? '')); const [tg, setTg] = useState(String(inn.target ?? ''));
  return (
    <Modal open onClose={onClose} title="Penalty runs & revised conditions">
      <div className="space-y-3">
        <div className="flex items-end gap-2"><Field label="Penalty runs awarded to the batting side"><input type="number" min={1} className="input" value={pen} onChange={(e) => setPen(Number(e.target.value))} /></Field><button className="btn btn-primary" onClick={() => send({ type: 'penalty', id: uid('e'), runs: pen }) && onClose()}>Add</button></div>
        <hr className="border-slate-200 dark:border-white/10" />
        <p className="text-xs text-slate-500">Rain / reduced overs: enter the official revised overs and target from your competition's method (e.g. DLS tables). Cricova does not calculate DLS itself.</p>
        <Field label="Overs for this innings"><input type="number" min={1} className="input" value={ov} onChange={(e) => setOv(e.target.value)} /></Field>
        {inn.target !== undefined && <Field label="Revised target (runs to win)"><input type="number" min={1} className="input" value={tg} onChange={(e) => setTg(e.target.value)} /></Field>}
        <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => {
          saveMatch({ ...m, innings: m.innings.map((x, k) => (k === idx ? { ...x, oversLimit: ov ? Number(ov) : x.oversLimit, target: tg ? Number(tg) : x.target, audit: [...x.audit, { at: new Date().toISOString(), action: 'revise', user: 'scorer', detail: `overs ${ov}, target ${tg}`, reason: 'Revised conditions' }] } : x)) }); onClose();
        }}>Apply revision</button></div>
      </div>
    </Modal>
  );
}

// ---------------- finishing ----------------
function Finish({ m, db, onDone }: { m: Match; db: DB; onDone: () => void }) {
  const names = nameMap(db); const res = resultOf(m, names);
  const players = [...(m.xi[m.teamAId] ?? []), ...(m.xi[m.teamBId] ?? [])];
  const suggestion = useMemo(() => {
    let best = '', score = -1;
    for (let i = 0; i < m.innings.length; i++) { const st = inningsState(m, i); for (const b of Object.values(st.batters)) if (b.runs > score) { best = b.id; score = b.runs; } for (const bw of Object.values(st.bowlers)) { const sc = bw.wickets * 25; if (sc > score) { best = bw.id; score = sc; } } }
    return best;
  }, [m]);
  const [potm, setPotm] = useState(m.potmId ?? suggestion);
  if (res.kind === 'incomplete') return null;
  return (
    <div className="card mt-3 space-y-3 border-gold p-4">
      {res.kind === 'win' && <Confetti burst={1} count={70} colors={['#d4af37', '#fde68a', '#22e07a', '#ffffff']} />}
      <motion.h2 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} className="text-center text-2xl font-black"><span className="mr-1">🏆</span><span className="text-gold-shine">{res.text}</span></motion.h2>
      <Field label="Player of the match"><select className="input" value={potm} onChange={(e) => setPotm(e.target.value)}><option value="">None</option>{players.map((p) => <option key={p} value={p}>{playerName(db, p)}</option>)}</select></Field>
      <button className="btn btn-primary" onClick={() => { saveMatch({ ...m, status: 'completed', potmId: potm || undefined }); onDone(); }}>Finalize match & view report</button>
    </div>
  );
}

// ---------------- quick (manual) entry ----------------
function QuickEntry({ m, db }: { m: Match; db: DB }) {
  const nav = useNavigate();
  const n = m.innings.length; const need = totalInnings(m);
  const toss = m.toss!; const first = toss.decision === 'bat' ? toss.winnerId : toss.winnerId === m.teamAId ? m.teamBId : m.teamAId;
  const team = n === 0 ? first : m.innings[n - 1].bowlingTeamId;
  const [f, setF] = useState({ runs: 0, wickets: 0, overs: '0.0', extras: 0 });
  const [bats, setBats] = useState([{ name: '', runs: 0, balls: 0, out: true }]); const [bowls, setBowls] = useState([{ name: '', overs: '0.0', runs: 0, wickets: 0 }]);
  const [err, setErr] = useState('');
  function save() {
    if (!/^\d+(\.[0-5])?$/.test(f.overs)) return setErr('Overs must look like 18.3 (balls 0-5)');
    const sumBat = bats.reduce((a, b) => a + b.runs, 0);
    if (sumBat + f.extras > f.runs) return setErr(`Batter runs (${sumBat}) + extras (${f.extras}) exceed the team total (${f.runs})`);
    const inn = { battingTeamId: team, bowlingTeamId: team === m.teamAId ? m.teamBId : m.teamAId, openers: ['', ''] as [string, string], events: [], redo: [], audit: [], manual: { ...f, batters: bats.filter((b) => b.name), bowlers: bowls.filter((b) => b.name) } };
    const done = n + 1 === need;
    saveMatch({ ...m, innings: [...m.innings, inn], status: done ? 'completed' : 'live' });
    if (done) nav(`/matches/${m.id}`);
    setF({ runs: 0, wickets: 0, overs: '0.0', extras: 0 }); setErr('');
  }
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h2 className="text-xl font-bold">Quick score: innings {n + 1} — {teamName(db, team)}</h2>
      <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">These numbers are entered by hand. Cricova will not invent deliveries, partnerships or fall of wickets from them, and they are excluded from career statistics.</p>
      <div className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {(['runs', 'wickets', 'extras'] as const).map((k) => <Field key={k} label={k}><input type="number" min={0} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: Math.max(0, Number(e.target.value)) })} /></Field>)}
        <Field label="Overs (e.g. 18.3)"><input className="input" value={f.overs} onChange={(e) => setF({ ...f, overs: e.target.value })} /></Field>
      </div>
      <div className="card space-y-2 p-4"><b className="text-sm">Batters</b>{bats.map((b, i) => <div key={i} className="grid grid-cols-5 gap-2"><input className="input col-span-2" placeholder="Name" value={b.name} onChange={(e) => setBats(bats.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} /><input type="number" className="input" placeholder="R" value={b.runs} onChange={(e) => setBats(bats.map((x, k) => k === i ? { ...x, runs: Number(e.target.value) } : x))} /><input type="number" className="input" placeholder="B" value={b.balls} onChange={(e) => setBats(bats.map((x, k) => k === i ? { ...x, balls: Number(e.target.value) } : x))} /><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={b.out} onChange={(e) => setBats(bats.map((x, k) => k === i ? { ...x, out: e.target.checked } : x))} />out</label></div>)}
        <button className="btn btn-ghost" onClick={() => setBats([...bats, { name: '', runs: 0, balls: 0, out: true }])}>＋ batter</button></div>
      <div className="card space-y-2 p-4"><b className="text-sm">Bowlers</b>{bowls.map((b, i) => <div key={i} className="grid grid-cols-5 gap-2"><input className="input col-span-2" placeholder="Name" value={b.name} onChange={(e) => setBowls(bowls.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} /><input className="input" placeholder="O" value={b.overs} onChange={(e) => setBowls(bowls.map((x, k) => k === i ? { ...x, overs: e.target.value } : x))} /><input type="number" className="input" placeholder="R" value={b.runs} onChange={(e) => setBowls(bowls.map((x, k) => k === i ? { ...x, runs: Number(e.target.value) } : x))} /><input type="number" className="input" placeholder="W" value={b.wickets} onChange={(e) => setBowls(bowls.map((x, k) => k === i ? { ...x, wickets: Number(e.target.value) } : x))} /></div>)}
        <button className="btn btn-ghost" onClick={() => setBowls([...bowls, { name: '', overs: '0.0', runs: 0, wickets: 0 }])}>＋ bowler</button></div>
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
      <button className="btn btn-primary" onClick={save}>Save innings {n + 1}</button>
    </div>
  );
}
