import { useState } from 'react';
import { deleteAllStats, useDB } from './lib/store';
import { Confirm } from './ui';

/** One-tap "delete all stats": removes every match so all statistics reset to zero. Players and teams stay. */
export function DeleteStats({ className = 'btn btn-ghost' }: { className?: string }) {
  const db = useDB(); const [ask, setAsk] = useState(false); const [msg, setMsg] = useState('');
  const n = db.matches.length;
  return (
    <>
      <button className={`${className} text-red-500`} onClick={() => setAsk(true)} disabled={n === 0} title={n === 0 ? 'No stats to delete' : undefined}>🗑 Delete all stats</button>
      {msg && <span role="status" className="text-sm text-emerald-600">{msg}</span>}
      <Confirm open={ask} onClose={() => setAsk(false)} yes="Delete all stats"
        text={`Delete all ${n} match${n === 1 ? '' : 'es'} and every statistic built from them (runs, wickets, averages, points tables)? Your players and teams are kept. Export a backup first if you may need this later. This cannot be undone.`}
        onYes={() => { const k = deleteAllStats(); setMsg(`${k} match${k === 1 ? '' : 'es'} deleted. Stats are reset.`); }} />
    </>
  );
}
