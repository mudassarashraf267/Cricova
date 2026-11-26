import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportJSON, importJSON, resetToSample, saveSettings, useDB, wipeAll } from '../lib/store';
import { download } from '../lib/text';
import { Confirm, PageTitle } from '../ui';
import SyncSection from './SyncSection';
import { DeleteStats } from '../DeleteStats';
import { useSync } from '../lib/sync';

export default function Settings() {
  const db = useDB(); const linked = !!useSync().config?.linked; const file = useRef<HTMLInputElement>(null);
  const [ask, setAsk] = useState<null | 'sample' | 'wipe'>(null); const [msg, setMsg] = useState('');
  const Toggle = ({ k, label }: { k: 'dark' | 'sound' | 'vibrate'; label: string }) => <label className="flex items-center justify-between py-2"><span>{label}</span><input type="checkbox" className="h-5 w-5" checked={db.settings[k]} onChange={(e) => saveSettings({ [k]: e.target.checked })} /></label>;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle>Settings</PageTitle>
      <section className="card divide-y divide-slate-200 p-4 dark:divide-white/10">
        <Toggle k="dark" label="Dark mode" /><Toggle k="sound" label="Sound feedback when scoring" /><Toggle k="vibrate" label="Vibration feedback (phones)" />
        <label className="block py-2"><span className="label">Scorer name (stamped on each ball and correction)</span><input className="input" value={db.settings.scorer} onChange={(e) => saveSettings({ scorer: e.target.value })} /></label>
      </section>
      <section className="card space-y-2 p-4">
        <h2 className="font-bold">Your data</h2>
        <p className="text-sm text-slate-500">Everything is stored on this device (browser storage) and works offline; connect a server below to share it between devices. Export a backup regularly.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => download('cricova-backup.json', exportJSON(), 'application/json')}>Export backup (JSON)</button>
          <button className="btn btn-ghost" onClick={() => file.current?.click()}>Import backup</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { importJSON(await f.text()); setMsg('Backup imported.'); } catch (x) { setMsg((x as Error).message); } e.target.value = ''; }} />
          <Link className="btn btn-ghost" to="/compare">Compare players &amp; teams</Link>
        </div>
        {msg && <p role="status" className="text-sm text-emerald-600">{msg}</p>}
      </section>
      <SyncSection />
      <section className="card space-y-2 p-4">
        <h2 className="font-bold text-red-500">Danger zone</h2>
        <div className="flex flex-wrap gap-2"><button className="btn btn-ghost" onClick={() => setAsk('sample')}>Reset to sample data</button><DeleteStats /><button className="btn btn-danger" onClick={() => setAsk('wipe')}>Delete all my data</button></div>
      </section>
      <Confirm open={!!ask} onClose={() => setAsk(null)} yes={ask === 'wipe' ? 'Delete everything' : 'Reset'} text={ask === 'wipe' ? 'Delete every player, team, match and tournament on this device? Export a backup first. This cannot be undone.' + (linked ? ' This device is connected to a server, so the data is deleted there and on your other devices too.' : '') : 'Replace all current data with the sample teams, players and matches?' + (linked ? ' This device is connected to a server: the change is shared with your other devices.' : '')} onYes={() => (ask === 'wipe' ? wipeAll() : resetToSample())} />
    </div>
  );
}
