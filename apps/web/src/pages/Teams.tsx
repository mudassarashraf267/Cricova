import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { careerStats, nameMap, resultOf, teamRecords } from '../lib/analysis';
import { uid } from '../lib/domain';
import type { Team } from '../lib/domain';
import { deleteAllTeams, deleteTeam, saveTeam, savePlayer, useDB } from '../lib/store';
import { Avatar, Confirm, Empty, Field, Modal, PageTitle, readImage } from '../ui';
import { Crest } from '../art';
import { Item, Stagger } from '../fx';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const blank = (): Team => ({ id: uid('t'), name: '', playerIds: [], color: COLORS[Math.floor(Math.random() * COLORS.length)] });

export default function Teams() {
  const db = useDB(); const [sp, setSp] = useSearchParams();
  const [edit, setEdit] = useState<Team | null>(null); const [del, setDel] = useState<Team | null>(null); const [delAll, setDelAll] = useState(false);
  const [view, setView] = useState<string | null>(sp.get('focus'));
  const closeView = () => { setView(null); if (sp.has('focus')) { const n = new URLSearchParams(sp); n.delete('focus'); setSp(n, { replace: true }); } };
  const focus = sp.get('focus'); useEffect(() => { if (focus) setView(focus); }, [focus]); const [cmp, setCmp] = useState<string[]>([]); // search results link here even when already on this page
  const [err, setErr] = useState('');
  useEffect(() => { if (sp.get('new')) { setEdit(blank()); sp.delete('new'); setSp(sp, { replace: true }); } }, [sp, setSp]);
  const t = db.teams.find((x) => x.id === view);
  const names = nameMap(db);
  const recs = teamRecords(db, db.matches, db.teams.map((x) => x.id));

  function save() {
    if (!edit) return;
    if (!edit.name.trim()) return setErr('Team name is required');
    if (db.teams.some((x) => x.id !== edit.id && x.name.toLowerCase() === edit.name.trim().toLowerCase())) return setErr('A team with that name exists');
    saveTeam({ ...edit, name: edit.name.trim() });
    for (const p of db.players) {
      if (edit.playerIds.includes(p.id) && p.teamId !== edit.id) savePlayer({ ...p, teamId: edit.id });
      if (!edit.playerIds.includes(p.id) && p.teamId === edit.id) savePlayer({ ...p, teamId: undefined });
    }
    setEdit(null); setErr('');
  }

  return (
    <div>
      <PageTitle right={<div className="flex flex-wrap gap-2">{db.teams.length > 0 && <button className="btn btn-ghost text-red-500" onClick={() => setDelAll(true)}>🗑 Delete all teams</button>}{cmp.length === 2 && <button className="btn btn-ghost" onClick={() => setView('cmp')}>Compare selected</button>}<button className="btn btn-primary" onClick={() => setEdit(blank())}>＋ New team</button></div>}>Teams</PageTitle>
      {db.teams.length === 0 ? <Empty>No teams yet.</Empty> : (
        <Stagger className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xlg:grid-cols-3 xxlg:grid-cols-4">
          {db.teams.map((x) => { const r = recs.find((y) => y.teamId === x.id)!; return (
            <Item key={x.id} className="card overflow-hidden">
              <div className="h-1.5" style={{ background: x.color }} />
              <div className="flex items-center gap-3 p-3">
                <Crest name={x.name} logo={x.logo} color={x.color} size={46} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setView(x.id)}><div className="break-words font-bold leading-tight">{x.name}</div><div className="break-words text-xs text-slate-500">{x.playerIds.length} players · {x.ground ?? 'No home ground'}</div><div className="text-xs">P{r.played} W{r.won} L{r.lost} · {r.points} pts</div></button>
                <input type="checkbox" aria-label={`Select ${x.name} to compare`} checked={cmp.includes(x.id)} onChange={(e) => setCmp(e.target.checked ? [...cmp, x.id].slice(-2) : cmp.filter((i) => i !== x.id))} />
                <button className="btn btn-ghost !px-2 !py-1 min-h-10 min-w-10 shrink-0" onClick={() => setEdit(x)} aria-label={`Edit ${x.name}`}>✎</button>
                <button className="btn btn-ghost !px-2 !py-1 min-h-10 min-w-10 shrink-0" onClick={() => setDel(x)} aria-label={`Delete ${x.name}`}>🗑</button>
              </div>
            </Item>); })}
        </Stagger>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={db.teams.some((x) => x.id === edit?.id) ? 'Edit team' : 'Create team'}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Team name *"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
            <div className="sm:col-span-2">
              <span className="label">Players ({edit.playerIds.length})</span>
              <AddPlayerBox onAdd={(id) => setEdit({ ...edit, playerIds: [...edit.playerIds, id] })} teamId={edit.id} />
              <div className="mt-2 grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2 dark:border-white/10">
                {db.players.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.playerIds.includes(p.id)} onChange={(e) => setEdit({ ...edit, playerIds: e.target.checked ? [...edit.playerIds, p.id] : edit.playerIds.filter((i) => i !== p.id) })} />{p.name}</label>))}
                {db.players.length === 0 && <span className="text-xs text-slate-500">No saved players yet. Type names above.</span>}
              </div>
            </div>
            <details className="sm:col-span-2 rounded-lg border border-slate-200 p-3 dark:border-white/10"><summary className="cursor-pointer text-sm font-semibold">More details (optional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Country / region"><input className="input" value={edit.region ?? ''} onChange={(e) => setEdit({ ...edit, region: e.target.value })} /></Field>
            <Field label="Home ground"><input className="input" value={edit.ground ?? ''} onChange={(e) => setEdit({ ...edit, ground: e.target.value })} /></Field>
            <Field label="Coach / manager"><input className="input" value={edit.coach ?? ''} onChange={(e) => setEdit({ ...edit, coach: e.target.value })} /></Field>
            <Field label="Colour"><div className="flex gap-2">{COLORS.map((c) => <button key={c} aria-label={`Colour ${c}`} className={`h-8 w-8 rounded-full border-2 ${edit.color === c ? 'border-white ring-2 ring-emerald-500' : 'border-transparent'}`} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })} />)}</div></Field>
            <Field label="Logo"><input type="file" accept="image/*" className="input" onChange={async (e) => { const f = e.target.files?.[0]; if (f) try { setEdit({ ...edit, logo: await readImage(f) }); } catch (x) { setErr((x as Error).message); } }} /></Field>
            <div className="sm:col-span-2"><Field label="Description"><textarea className="input" rows={2} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div>
            {(['captainId', 'viceId', 'keeperId'] as const).map((k) => (
              <Field key={k} label={k === 'captainId' ? 'Captain' : k === 'viceId' ? 'Vice-captain' : 'Wicketkeeper'}>
                <select className="input" value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value || undefined })}><option value="">—</option>{edit.playerIds.map((id) => <option key={id} value={id}>{db.players.find((p) => p.id === id)?.name}</option>)}</select>
              </Field>))}
            </div></details>
            {err && <p className="text-sm text-red-500 sm:col-span-2">{err}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2"><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save team</button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!view} onClose={closeView} title={view === 'cmp' ? 'Team comparison' : t?.name ?? ''} wide>
        {view === 'cmp' && cmp.length === 2 && <Compare ids={[cmp[0], cmp[1]]} />}
        {t && view !== 'cmp' && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-500">{t.region} {t.coach ? `· Coach ${t.coach}` : ''}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              <b>Captain:</b> <span>{db.players.find((p) => p.id === t.captainId)?.name ?? '-'}</span>
              <b>Vice-captain:</b> <span>{db.players.find((p) => p.id === t.viceId)?.name ?? '-'}</span>
              <b>Wicketkeeper:</b> <span>{db.players.find((p) => p.id === t.keeperId)?.name ?? '-'}</span>
            </div>
            <h3 className="font-bold">Squad</h3>
            <div className="grid gap-1 sm:grid-cols-2">{t.playerIds.map((id) => { const p = db.players.find((x) => x.id === id); return p && <div key={id}>{p.name} <span className="text-xs text-slate-500">{p.role}</span></div>; })}</div>
            <h3 className="font-bold">Match history</h3>
            {db.matches.filter((m) => m.status === 'completed' && (m.teamAId === t.id || m.teamBId === t.id)).map((m) => <div key={m.id}>{m.date} · {m.title} — {resultOf(m, names).text}</div>)}
          </div>
        )}
      </Modal>
      <Confirm open={delAll} onClose={() => setDelAll(false)} onYes={() => { deleteAllTeams(); setCmp([]); }} text={`Delete all ${db.teams.length} teams? Players are kept but lose their team. Matches already played keep their scorecards and team names. This cannot be undone.`} yes="Delete all teams" />
      <Confirm open={!!del} onClose={() => setDel(null)} onYes={() => del && deleteTeam(del.id)} text={`Delete ${del?.name}? Players stay but lose this team affiliation. Existing matches keep their scorecards but may show 'Unknown team'.`} yes="Delete" />
    </div>
  );
}

function Compare({ ids }: { ids: [string, string] }) {
  const db = useDB();
  const recs = teamRecords(db, db.matches, ids);
  const stats = careerStats(db);
  const sums = ids.map((id) => {
    const team = db.teams.find((t) => t.id === id)!;
    const ps = team.playerIds.map((p) => stats.get(p)).filter(Boolean) as ReturnType<typeof stats.get>[];
    return { runs: ps.reduce((a, s) => a + s!.bat.runs, 0), wkts: ps.reduce((a, s) => a + s!.bowl.wickets, 0), sixes: ps.reduce((a, s) => a + s!.bat.sixes, 0) };
  });
  const r = (id: string) => recs.find((x) => x.teamId === id)!;
  const rows: [string, (i: 0 | 1) => string | number][] = [
    ['Played', (i) => r(ids[i]).played], ['Won', (i) => r(ids[i]).won], ['Lost', (i) => r(ids[i]).lost], ['Points', (i) => r(ids[i]).points], ['Net run rate', (i) => r(ids[i]).nrr.toFixed(3)],
    ['Squad runs (career)', (i) => sums[i].runs], ['Squad wickets', (i) => sums[i].wkts], ['Squad sixes', (i) => sums[i].sixes],
  ];
  return <table><thead><tr><th className="th">Metric</th>{ids.map((id) => <th key={id} className="th">{db.teams.find((t) => t.id === id)?.name}</th>)}</tr></thead><tbody>{rows.map(([k, f]) => <tr key={k}><td className="td">{k}</td><td className="td font-bold">{f(0)}</td><td className="td font-bold">{f(1)}</td></tr>)}</tbody></table>;
}

function AddPlayerBox({ onAdd, teamId }: { onAdd: (id: string) => void; teamId: string }) {
  const [t, setT] = useState('');
  const go = () => {
    for (const n of t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)) {
      const id = uid('p');
      savePlayer({ id, name: n, batStyle: 'Right-handed', bowlStyle: 'None', role: 'All-rounder', teamId });
      onAdd(id);
    }
    setT('');
  };
  return <div className="flex gap-2"><input className="input" placeholder="Type a player name and press Enter" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), go())} /><button className="btn btn-primary" onClick={go}>Add</button></div>;
}
