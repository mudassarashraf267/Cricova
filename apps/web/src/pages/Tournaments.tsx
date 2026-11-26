import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { careerStats, nameMap, resultOf, teamName, teamRecords } from '../lib/analysis';
import { uid } from '../lib/domain';
import type { Fixture, Tournament } from '../lib/domain';
import { deleteTournament, saveTournament, useDB } from '../lib/store';
import { Confirm, Empty, Field, Modal, PageTitle } from '../ui';

export default function Tournaments() {
  const db = useDB(); const [sp, setSp] = useSearchParams();
  const [sel, setSel] = useState<string | null>(db.tournaments[0]?.id ?? null);
  const [edit, setEdit] = useState<Tournament | null>(null); const [del, setDel] = useState(false);
  const [fx, setFx] = useState<{ a: string; b: string; date: string; stage: Fixture['stage'] }>({ a: '', b: '', date: new Date().toISOString().slice(0, 10), stage: 'league' });
  const [err, setErr] = useState('');
  useEffect(() => { if (sp.get('new')) { setEdit({ id: uid('tn'), name: '', teamIds: [], fixtures: [], createdAt: new Date().toISOString().slice(0, 10) }); sp.delete('new'); setSp(sp, { replace: true }); } }, [sp, setSp]);
  const t = db.tournaments.find((x) => x.id === sel);
  const names = nameMap(db);
  const matches = useMemo(() => db.matches.filter((m) => m.tournamentId === t?.id), [db.matches, t]);
  const table = t ? teamRecords(db, matches, t.teamIds) : [];
  const stats = useMemo(() => (t ? [...careerStats(db, { tournamentId: t.id }).values()] : []), [db, t]);

  function addFixture() {
    if (!t) return;
    if (!fx.a || !fx.b || fx.a === fx.b) return setErr('Choose two different teams');
    saveTournament({ ...t, fixtures: [...t.fixtures, { id: uid('f'), teamAId: fx.a, teamBId: fx.b, date: fx.date, stage: fx.stage }] }); setErr('');
  }
  function roundRobin() {
    if (!t) return;
    const out: Fixture[] = []; const d = new Date();
    for (let i = 0; i < t.teamIds.length; i++) for (let j = i + 1; j < t.teamIds.length; j++) {
      if (t.fixtures.some((f) => (f.teamAId === t.teamIds[i] && f.teamBId === t.teamIds[j]) || (f.teamAId === t.teamIds[j] && f.teamBId === t.teamIds[i]))) continue;
      d.setDate(d.getDate() + 2); out.push({ id: uid('f'), teamAId: t.teamIds[i], teamBId: t.teamIds[j], date: d.toISOString().slice(0, 10), stage: 'league' });
    }
    saveTournament({ ...t, fixtures: [...t.fixtures, ...out] });
  }
  const stageOrder = ['league', 'quarter', 'semi', 'final'];
  return (
    <div>
      <PageTitle right={<button className="btn btn-primary" onClick={() => setEdit({ id: uid('tn'), name: '', teamIds: [], fixtures: [], createdAt: new Date().toISOString().slice(0, 10) })}>＋ Create tournament</button>}>Tournaments</PageTitle>
      {db.tournaments.length === 0 ? <Empty>No tournaments yet.</Empty> : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">{db.tournaments.map((x) => <button key={x.id} className={`btn ${sel === x.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSel(x.id)}>{x.name}</button>)}</div>
          {t && (
            <div className="space-y-4">
              <section className="card overflow-x-auto p-4">
                <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Points table</h2><div className="flex gap-2"><button className="btn btn-ghost" onClick={() => setEdit(t)}>Edit</button><button className="btn btn-ghost" onClick={() => setDel(true)}>Delete</button></div></div>
                <table className="min-w-[480px]"><thead><tr><th className="th">#</th><th className="th">Team</th><th className="th">P</th><th className="th">W</th><th className="th">L</th><th className="th">T</th><th className="th">NR</th><th className="th">Pts</th><th className="th">NRR</th></tr></thead>
                  <tbody>{table.map((r, i) => <tr key={r.teamId}><td className="td">{i + 1}</td><td className="td font-semibold">{teamName(db, r.teamId)}</td><td className="td">{r.played}</td><td className="td">{r.won}</td><td className="td">{r.lost}</td><td className="td">{r.tied}</td><td className="td">{r.noResult}</td><td className="td font-bold">{r.points}</td><td className="td">{r.nrr.toFixed(3)}</td></tr>)}</tbody></table>
                <p className="mt-2 text-xs text-slate-500">Win 2 pts, tie / no result 1 pt. NRR = runs per over scored minus conceded; all-out innings count the full overs quota.</p>
              </section>
              <section className="card p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Fixtures</h2><button className="btn btn-ghost" onClick={roundRobin}>Generate round-robin</button></div>
                {[...t.fixtures].sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || a.date.localeCompare(b.date)).map((f) => { const m = db.matches.find((x) => x.id === f.matchId); return (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2 text-sm first:border-0 dark:border-white/10">
                    <div><span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase dark:bg-white/10">{f.stage}</span>{teamName(db, f.teamAId)} vs {teamName(db, f.teamBId)} <span className="text-xs text-slate-500">{f.date}</span></div>
                    <div className="flex items-center gap-2">{m ? <><span className="text-xs text-emerald-600">{m.status === 'completed' ? resultOf(m, names).text : m.status}</span><Link className="btn btn-ghost !py-1" to={`/matches/${m.id}`}>Open</Link></> : <Link className="btn btn-primary !py-1" to={`/matches/new?tournament=${t.id}`}>Create match</Link>}
                      <button className="btn btn-ghost !px-2 !py-1" aria-label="Remove fixture" onClick={() => saveTournament({ ...t, fixtures: t.fixtures.filter((x) => x.id !== f.id) })}>✕</button></div>
                  </div>); })}
                <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-5 dark:border-white/10">
                  <select className="input" value={fx.a} onChange={(e) => setFx({ ...fx, a: e.target.value })} aria-label="Team A"><option value="">Team A</option>{t.teamIds.map((id) => <option key={id} value={id}>{teamName(db, id)}</option>)}</select>
                  <select className="input" value={fx.b} onChange={(e) => setFx({ ...fx, b: e.target.value })} aria-label="Team B"><option value="">Team B</option>{t.teamIds.map((id) => <option key={id} value={id}>{teamName(db, id)}</option>)}</select>
                  <input type="date" className="input" value={fx.date} onChange={(e) => setFx({ ...fx, date: e.target.value })} />
                  <select className="input" value={fx.stage} onChange={(e) => setFx({ ...fx, stage: e.target.value as Fixture['stage'] })}><option value="league">League</option><option value="quarter">Quarter-final</option><option value="semi">Semi-final</option><option value="final">Final</option></select>
                  <button className="btn btn-primary" onClick={addFixture}>Add fixture</button>
                </div>
                {err && <p className="mt-1 text-sm text-red-500">{err}</p>}
              </section>
              <div className="grid gap-4 md:grid-cols-2">
                <Leaders title="Leading run scorers" rows={[...stats].sort((a, b) => b.bat.runs - a.bat.runs).slice(0, 5).map((s) => [s.player.name, `${s.bat.runs}`])} />
                <Leaders title="Leading wicket takers" rows={[...stats].sort((a, b) => b.bowl.wickets - a.bowl.wickets).slice(0, 5).map((s) => [s.player.name, `${s.bowl.wickets}`])} />
              </div>
            </div>
          )}
        </>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Tournament">
        {edit && <div className="space-y-3">
          <Field label="Name *"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
          <div><span className="label">Participating teams</span><div className="grid gap-1 sm:grid-cols-2">{db.teams.map((tm) => <label key={tm.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.teamIds.includes(tm.id)} onChange={(e) => setEdit({ ...edit, teamIds: e.target.checked ? [...edit.teamIds, tm.id] : edit.teamIds.filter((i) => i !== tm.id) })} />{tm.name}</label>)}</div></div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={() => { if (!edit.name.trim()) return setErr('Name is required'); if (edit.teamIds.length < 2) return setErr('Pick at least two teams'); saveTournament(edit); setSel(edit.id); setEdit(null); setErr(''); }}>Save</button></div>
        </div>}
      </Modal>
      <Confirm open={del} onClose={() => setDel(false)} onYes={() => { if (t) { deleteTournament(t.id); setSel(null); } }} text="Delete this tournament? Its matches are kept as friendlies." yes="Delete" />
    </div>
  );
}

function Leaders({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="card p-4"><h2 className="mb-2 font-bold">{title}</h2>{rows.length === 0 ? <p className="text-sm text-slate-500">No completed matches yet.</p> : rows.map((r, i) => <div key={i} className="flex justify-between border-t border-slate-200 py-1.5 text-sm first:border-0 dark:border-white/10"><span>{i + 1}. {r[0]}</span><b>{r[1]}</b></div>)}</section>;
}
