import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { careerStats } from '../lib/analysis';
import { BAT_STYLES, BOWL_STYLES, uid } from '../lib/domain';
import type { Player, Role } from '../lib/domain';
import { deleteAllPlayers, deletePlayer, getDB, savePlayer, saveTeam, useDB } from '../lib/store';
import { Avatar, Confirm, Empty, Field, Modal, PageTitle, readImage } from '../ui';
import { Item, Stagger } from '../fx';

const blank = (): Player => ({ id: uid('p'), name: '', batStyle: 'Right-handed', bowlStyle: 'None', role: 'Batter' });
const PAGE = 24;

export default function Players() {
  const db = useDB(); const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(''); const [role, setRole] = useState(''); const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<Player | null>(null); const [del, setDel] = useState<Player | null>(null); const [delAll, setDelAll] = useState(false); const [view, setView] = useState<string | null>(sp.get('focus'));
  const closeView = () => { setView(null); if (sp.has('focus')) { const n = new URLSearchParams(sp); n.delete('focus'); setSp(n, { replace: true }); } };
  const focus = sp.get('focus'); useEffect(() => { if (focus) setView(focus); }, [focus]); // search results link here even when already on this page
  const [err, setErr] = useState('');
  useEffect(() => { if (sp.get('new')) { setEdit(blank()); sp.delete('new'); setSp(sp, { replace: true }); } }, [sp, setSp]);
  const stats = useMemo(() => careerStats(db), [db]);
  const list = useMemo(() => [...db.players].reverse().filter((p) => (!role || p.role === role) && (p.name + (p.nickname ?? '')).toLowerCase().includes(q.toLowerCase())), [db.players, q, role]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  const viewP = db.players.find((p) => p.id === view); const c = view ? stats.get(view) : undefined;

  function submit() {
    if (!edit) return;
    if (!edit.name.trim()) return setErr('Name is required');
    savePlayer({ ...edit, name: edit.name.trim() }); setEdit(null); setErr('');
  }
  const set = (patch: Partial<Player>) => setEdit((e) => (e ? { ...e, ...patch } : e));

  return (
    <div>
      <PageTitle right={db.players.length > 0 ? <button className="btn btn-ghost text-red-500" onClick={() => setDelAll(true)}>🗑 Delete all players</button> : undefined}>Players</PageTitle>
      <QuickAdd />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search players" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      </div>
      {list.length === 0 ? <Empty>No players match. Add one to get started.</Empty> : (
        <Stagger className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xlg:grid-cols-3 xxlg:grid-cols-4">
          {shown.map((p) => { const t = db.teams.find((x) => x.id === p.teamId); const s = stats.get(p.id); return (
            <Item key={p.id} className="card flex items-center gap-3 p-3">
              <Avatar name={p.name} photo={p.photo} color={t?.color} size={44} />
              <button className="min-w-0 flex-1 text-left" onClick={() => setView(p.id)}>
                <div className="break-words font-semibold leading-tight">{p.name}{p.nickname ? ` “${p.nickname}”` : ''}</div>
                <div className="break-words text-xs text-slate-500">{p.role} · {t?.name ?? 'No team'}{p.jersey ? ` · #${p.jersey}` : ''}</div>
                {s && <div className="text-xs">{s.bat.runs} runs · {s.bowl.wickets} wkts</div>}
              </button>
              <button className="btn btn-ghost !px-2 !py-1 min-h-10 min-w-10 shrink-0" onClick={() => setEdit(p)} aria-label={`Edit ${p.name}`}>✎</button>
              <button className="btn btn-ghost !px-2 !py-1 min-h-10 min-w-10 shrink-0" onClick={() => setDel(p)} aria-label={`Delete ${p.name}`}>🗑</button>
            </Item>); })}
        </Stagger>
      )}
      {pages > 1 && <div className="mt-4 flex items-center justify-center gap-3"><button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button><span className="text-sm">{page + 1} / {pages}</span><button className="btn btn-ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button></div>}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={db.players.some((p) => p.id === edit?.id) ? 'Edit player' : 'Add player'}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name *"><input className="input" value={edit.name} onChange={(e) => set({ name: e.target.value })} autoFocus /></Field>
            <Field label="Team"><select className="input" value={edit.teamId ?? ''} onChange={(e) => set({ teamId: e.target.value || undefined })}><option value="">No team</option>{db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Role"><select className="input" value={edit.role} onChange={(e) => set({ role: e.target.value as Role })}>{['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'].map((r) => <option key={r}>{r}</option>)}</select></Field>
            <details className="sm:col-span-2 rounded-lg border border-slate-200 p-3 dark:border-white/10"><summary className="cursor-pointer text-sm font-semibold">More details (optional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Nickname"><input className="input" value={edit.nickname ?? ''} onChange={(e) => set({ nickname: e.target.value })} /></Field>
            <Field label="Date of birth"><input type="date" className="input" value={edit.dob ?? ''} onChange={(e) => set({ dob: e.target.value })} /></Field>
            <Field label="Nationality"><input className="input" value={edit.nationality ?? ''} onChange={(e) => set({ nationality: e.target.value })} /></Field>
            <Field label="Batting style"><select className="input" value={edit.batStyle} onChange={(e) => set({ batStyle: e.target.value })}>{BAT_STYLES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Bowling style"><select className="input" value={edit.bowlStyle} onChange={(e) => set({ bowlStyle: e.target.value })}>{BOWL_STYLES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Jersey number"><input type="number" min={0} className="input" value={edit.jersey ?? ''} onChange={(e) => set({ jersey: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Profile picture"><input type="file" accept="image/*" className="input" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { set({ photo: await readImage(f) }); } catch (x) { setErr((x as Error).message); } } }} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><textarea className="input" rows={2} value={edit.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field></div>
            </div></details>
            {err && <p className="text-sm text-red-500 sm:col-span-2">{err}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2"><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={() => {
              // keep team squad lists in sync with the chosen team affiliation
              submit();
              const cur = edit; if (cur.name.trim()) {
                for (const t of db.teams) {
                  const has = t.playerIds.includes(cur.id);
                  if (t.id === cur.teamId && !has) saveTeam({ ...t, playerIds: [...t.playerIds, cur.id] });
                  if (t.id !== cur.teamId && has) saveTeam({ ...t, playerIds: t.playerIds.filter((x) => x !== cur.id) });
                }
              }
            }}>Save</button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!viewP} onClose={closeView} title={viewP?.name ?? ''} wide>
        {viewP && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3"><Avatar name={viewP.name} photo={viewP.photo} size={64} /><div><div className="font-bold">{viewP.role} · {viewP.batStyle}</div><div className="text-slate-500">{viewP.bowlStyle !== 'None' ? viewP.bowlStyle : 'Does not bowl'}{viewP.nationality ? ` · ${viewP.nationality}` : ''}</div>{viewP.notes && <div className="text-xs">{viewP.notes}</div>}</div></div>
            {!c ? <p className="text-slate-500">No completed ball-by-ball matches yet, so no career statistics.</p> : (
              <>
                <h3 className="font-bold">Batting</h3>
                <Grid items={[['Mat', c.matches], ['Inns', c.bat.inns], ['NO', c.bat.notOuts], ['Runs', c.bat.runs], ['HS', `${c.bat.hs}${c.bat.hsNotOut ? '*' : ''}`], ['Avg', c.bat.avg ?? '-'], ['SR', c.bat.sr ?? '-'], ['Balls', c.bat.balls], ['4s', c.bat.fours], ['6s', c.bat.sixes], ['100s', c.bat.hundreds], ['50s', c.bat.fifties], ['Ducks', c.bat.ducks]]} />
                <h3 className="font-bold">Bowling</h3>
                <Grid items={[['Inns', c.bowl.inns], ['Balls', c.bowl.legalBalls], ['Mdns', c.bowl.maidens], ['Runs', c.bowl.runs], ['Wkts', c.bowl.wickets], ['Best', c.bowl.bestW ? `${c.bowl.bestW}/${c.bowl.bestR}` : '-'], ['Avg', c.bowl.avg ?? '-'], ['Econ', c.bowl.eco ?? '-'], ['SR', c.bowl.sr ?? '-'], ['5W', c.bowl.fiveW], ['10W (match)', c.bowl.tenW]]} />
                <h3 className="font-bold">Fielding</h3>
                <Grid items={[['Catches', c.field.catches], ['Stumpings', c.field.stumpings], ['Run-outs', c.field.runOuts]]} />
              </>
            )}
          </div>
        )}
      </Modal>
      <Confirm open={delAll} onClose={() => setDelAll(false)} onYes={() => { deleteAllPlayers(); setPage(0); }} text={`Delete all ${db.players.length} players? They are removed from every team. Matches already played keep the names and scorecards, but career statistics are no longer tracked for deleted players. This cannot be undone.`} yes="Delete all players" />
      <Confirm open={!!del} onClose={() => setDel(null)} onYes={() => del && deletePlayer(del.id)} text={`Delete ${del?.name}? They are removed from squads. Completed match scorecards keep their name and statistics.`} yes="Delete" />
    </div>
  );
}

function Grid({ items }: { items: [string, string | number][] }) {
  return <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{items.map(([k, v]) => <div key={k} className="rounded-lg bg-slate-100 p-2 text-center dark:bg-white/5"><div className="text-[10px] uppercase text-slate-500">{k}</div><div className="font-bold">{v}</div></div>)}</div>;
}

/** Fastest way to add players: type a name, press Enter. */
function QuickAdd() {
  const db = useDB(); const [name, setName] = useState(''); const [team, setTeam] = useState('');
  const add = () => {
    const names = name.split(/[,\n]/).map((x) => x.trim()).filter(Boolean); if (!names.length) return;
    for (const n of names) {
      const p: Player = { id: uid('p'), name: n, batStyle: 'Right-handed', bowlStyle: 'None', role: 'All-rounder', teamId: team || undefined };
      savePlayer(p);
      const t = db.teams.find((x) => x.id === team); if (t) saveTeam({ ...t, playerIds: [...(getDB().teams.find((x) => x.id === t.id)?.playerIds ?? t.playerIds), p.id] });
    }
    setName('');
  };
  return (
    <div className="card mb-3 p-3">
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1 !py-3" placeholder="Type a player name and press Enter" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New player name" />
        {db.teams.length > 0 && <select className="input !w-auto" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team"><option value="">No team</option>{db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        <button className="btn btn-primary" onClick={add}>Add</button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Tip: add several at once by separating names with commas.</p>
    </div>
  );
}
