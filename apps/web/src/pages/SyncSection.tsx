import { useEffect, useState } from 'react';
import { firstSetup, link, openServer, serverApi, serverStatus, signIn, signOut, syncNow, useSync } from '../lib/sync';
import type { Role, SyncUser } from '../lib/sync';

const LABEL: Record<string, string> = {
  off: 'Not connected', 'needs-link': 'Choose how to start', connecting: 'Connecting…', online: 'Online, in sync',
  offline: 'Offline (changes are queued)', 'signed-out': 'Signed out', 'read-only': 'Read-only account',
};

function Users() {
  const [users, setUsers] = useState<(SyncUser & { created_at: string })[]>([]); const [err, setErr] = useState('');
  const [f, setF] = useState({ username: '', name: '', password: '', role: 'scorer' as Role });
  const load = () => serverApi<typeof users>('/api/users').then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, []);
  const run = async (p: Promise<unknown>) => { setErr(''); try { await p; await load(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-white/10">
      <h3 className="font-semibold">Accounts</h3>
      <ul className="space-y-1 text-sm">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2">
            <span>{u.name} <span className="text-slate-500">@{u.username}</span></span>
            <span className="flex gap-1">
              <select className="input !w-auto !py-1" aria-label={`Role for ${u.username}`} value={u.role} onChange={(e) => run(serverApi(`/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ role: e.target.value }) }))}>
                <option value="admin">admin</option><option value="scorer">scorer</option><option value="viewer">viewer</option>
              </select>
              <button className="btn btn-ghost !py-1" onClick={() => confirm(`Delete ${u.username}?`) && run(serverApi(`/api/users/${u.id}`, { method: 'DELETE' }))}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      <form className="grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); void run(serverApi('/api/users', { method: 'POST', body: JSON.stringify(f) }).then(() => setF({ ...f, username: '', name: '', password: '' }))); }}>
        <input className="input" placeholder="username" aria-label="New username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
        <input className="input" placeholder="display name" aria-label="New display name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" type="password" placeholder="password (8+)" aria-label="New password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
        <select className="input" aria-label="New role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}><option value="scorer">scorer</option><option value="viewer">viewer</option><option value="admin">admin</option></select>
        <button className="btn btn-primary col-span-2">Add account</button>
      </form>
      <p className="text-xs text-slate-500">Scorers can add and change data. Viewers are read-only. Only admins manage accounts.</p>
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
    </div>
  );
}

export default function SyncSection() {
  const s = useSync();
  const [url, setUrl] = useState(s.config?.url ?? ''); const [mode, setMode] = useState<'idle' | 'login' | 'setup' | 'open'>('idle');
  const [f, setF] = useState({ username: '', name: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const check = async () => {
    setErr(''); setBusy(true);
    try { const st = await serverStatus(url); setMode(!st.authRequired ? 'open' : st.needsSetup ? 'setup' : 'login'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await (mode === 'setup' ? firstSetup(url, f.username, f.name, f.password) : signIn(url, f.username, f.password)); setF({ username: '', name: '', password: '' }); setMode('idle'); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  return (
    <section className="card space-y-3 p-4" aria-label="Server sync">
      <h2 className="font-bold">Server sync <span className="text-xs font-normal text-slate-500">(optional)</span></h2>
      {!s.config ? (
        <>
          <p className="text-sm text-slate-500">Connect to a Cricova server to share data between devices. The app keeps working offline and uploads when it can.</p>
          <div className="flex gap-2">
            <input className="input" placeholder="Server address, e.g. http://192.168.1.5:3001 (blank = this site)" aria-label="Server address" value={url} onChange={(e) => { setUrl(e.target.value); setMode('idle'); }} />
            <button className="btn btn-ghost" disabled={busy} onClick={check}>Connect</button>
          </div>
          {mode === 'open' && <div className="space-y-2"><p className="text-sm text-amber-600">This server has no login (AUTH=off). Anyone on the network can change its data.</p><button className="btn btn-primary" onClick={() => { openServer(url); setMode('idle'); }}>Use without login</button></div>}
          {(mode === 'login' || mode === 'setup') && (
            <form className="space-y-2" onSubmit={submit}>
              {mode === 'setup' && <p className="text-sm text-amber-600">New server: create the first (admin) account.</p>}
              <input className="input" placeholder="username" aria-label="Username" autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
              {mode === 'setup' && <input className="input" placeholder="display name" aria-label="Display name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
              <input className="input" type="password" placeholder="password" aria-label="Password" autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} minLength={mode === 'setup' ? 8 : undefined} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
              <button className="btn btn-primary" disabled={busy}>{mode === 'setup' ? 'Create admin account' : 'Sign in'}</button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="text-sm"><span className="font-semibold">{LABEL[s.state]}</span> · {s.config.user.name} ({s.config.user.role}) · {s.config.url || 'this site'}{s.pending > 0 && <> · {s.pending} change{s.pending === 1 ? '' : 's'} waiting to upload</>}</p>
          {s.error && <p role="alert" className="text-sm text-amber-600">{s.error}</p>}
          {s.state === 'needs-link' && (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">First time on this server. Which data should win?</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={() => void link('upload')}>Upload this device&apos;s data</button>
                <button className="btn btn-ghost" onClick={() => confirm('Replace the data on this device with the server data?') && void link('download')}>Use the server&apos;s data</button>
              </div>
            </div>
          )}
          {s.state === 'signed-out' && (
            <form className="space-y-2" onSubmit={submit}>
              <input className="input" placeholder="username" aria-label="Username" autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
              <input className="input" type="password" placeholder="password" aria-label="Password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
              <button className="btn btn-primary" disabled={busy}>Sign in again</button>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            {s.state !== 'needs-link' && <button className="btn btn-ghost" onClick={syncNow}>Sync now</button>}
            <button className="btn btn-ghost" onClick={() => (s.pending === 0 || confirm(`${s.pending} change(s) have not uploaded and will stay only on this device. Disconnect anyway?`)) && signOut()}>Disconnect</button>
          </div>
          {s.config.user.role === 'admin' && s.config.linked && s.state !== 'signed-out' && <Users />}
        </>
      )}
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
    </section>
  );
}
