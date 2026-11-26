import { allOvers, allPartnerships, economy, formatOvers, strikeRate } from '@cricketpro/engine';
import { inningsViews, playerName, teamName } from './lib/analysis';
import type { InnView } from './lib/analysis';
import type { DB, Match } from './lib/domain';
import { dismissalText } from './lib/text';

export function InningsCard({ v, db, m }: { v: InnView; db: DB; m: Match }) {
  const nm = (id?: string) => playerName(db, id);
  const man = m.innings[v.index].manual;
  if (man) {
    return (
      <section className="card mb-4 overflow-hidden">
        <Head v={v} db={db} />
        <p className="bg-amber-500/10 px-4 py-2 text-xs text-amber-600">Entered manually (quick score). No ball-by-ball data exists for this innings, so partnerships, fall of wickets and over summaries are unavailable.</p>
        <div className="overflow-x-auto p-2"><table><thead><tr><th className="th">Batter</th><th className="th">R</th><th className="th">B</th><th className="th">Status</th></tr></thead><tbody>
          {man.batters.map((b, i) => <tr key={i}><td className="td">{b.name}</td><td className="td font-bold">{b.runs}</td><td className="td">{b.balls}</td><td className="td">{b.out ? 'out' : 'not out'}</td></tr>)}</tbody></table>
          <p className="px-2 py-1 text-sm">Extras: {man.extras}</p>
          <table className="mt-2"><thead><tr><th className="th">Bowler</th><th className="th">O</th><th className="th">R</th><th className="th">W</th><th className="th">Econ</th></tr></thead><tbody>
            {man.bowlers.map((b, i) => <tr key={i}><td className="td">{b.name}</td><td className="td">{b.overs}</td><td className="td">{b.runs}</td><td className="td font-bold">{b.wickets}</td><td className="td">{economy(b.runs, safeBalls(b.overs)) ?? '-'}</td></tr>)}</tbody></table></div>
      </section>
    );
  }
  const s = v.state!;
  const bat = Object.values(s.batters).filter((b) => b.status !== 'yetToBat').sort((a, b) => (a.arrival ?? 99) - (b.arrival ?? 99));
  const dnb = Object.values(s.batters).filter((b) => b.status === 'yetToBat');
  const e = s.extras; const extras = e.wides + e.noBalls + e.byes + e.legByes + e.penalty;
  const bpo = s.config.rules.ballsPerOver;
  return (
    <section className="card mb-4 overflow-hidden">
      <Head v={v} db={db} />
      <div className="overflow-x-auto p-2">
        <table className="min-w-[340px]"><thead><tr><th className="th">Batter</th><th className="th">Dismissal</th><th className="th text-right">R</th><th className="th text-right">B</th><th className="th text-right">4s</th><th className="th text-right">6s</th><th className="th text-right">SR</th></tr></thead>
          <tbody>{bat.map((b) => (
            <tr key={b.id}><td className="td font-semibold">{nm(b.id)}{b.status === 'notOut' && s.status === 'inProgress' && (s.strikerId === b.id) ? ' *' : ''}</td><td className="td text-slate-500">{dismissalText(b.dismissal, db, b.status)}</td>
              <td className="td text-right font-bold">{b.runs}</td><td className="td text-right">{b.balls}</td><td className="td text-right">{b.fours}</td><td className="td text-right">{b.sixes}</td><td className="td text-right">{strikeRate(b.runs, b.balls)?.toFixed(2) ?? '-'}</td></tr>))}
            <tr><td className="td font-semibold">Extras</td><td className="td text-slate-500" colSpan={5}>wd {e.wides}, nb {e.noBalls}, b {e.byes}, lb {e.legByes}, pen {e.penalty}</td><td className="td text-right font-bold">{extras}</td></tr>
            <tr><td className="td font-extrabold">Total</td><td className="td text-slate-500" colSpan={4}>{s.wickets} wkts, {formatOvers(s.legalBalls, bpo)} ov</td><td className="td text-right font-extrabold" colSpan={2}>{s.runs}</td></tr>
          </tbody></table>
        {dnb.length > 0 && <p className="px-2 py-1 text-xs text-slate-500">Did not bat: {dnb.map((b) => nm(b.id)).join(', ')}</p>}
      </div>
      <div className="overflow-x-auto p-2">
        <table className="min-w-[340px]"><thead><tr><th className="th">Bowler</th><th className="th text-right">O</th><th className="th text-right">M</th><th className="th text-right">R</th><th className="th text-right">W</th><th className="th text-right">Econ</th><th className="th text-right">Wd</th><th className="th text-right">Nb</th></tr></thead>
          <tbody>{Object.values(s.bowlers).map((b) => (
            <tr key={b.id}><td className="td font-semibold">{nm(b.id)}</td><td className="td text-right">{formatOvers(b.legalBalls, bpo)}</td><td className="td text-right">{b.maidens}</td><td className="td text-right">{b.runs}</td><td className="td text-right font-bold">{b.wickets}</td><td className="td text-right">{economy(b.runs, b.legalBalls, bpo)?.toFixed(2) ?? '-'}</td><td className="td text-right">{b.wides}</td><td className="td text-right">{b.noBalls}</td></tr>))}</tbody></table>
      </div>
      {s.fow.length > 0 && (
        <div className="overflow-x-auto p-2">
          <h4 className="px-2 text-xs font-bold uppercase text-slate-500">Fall of wickets</h4>
          <table className="min-w-[320px]"><thead><tr><th className="th">Wkt</th><th className="th">Score</th><th className="th">Batter</th><th className="th">Over</th><th className="th text-right">Partnership</th></tr></thead>
            <tbody>{s.fow.map((f) => <tr key={f.wicket}><td className="td">{f.wicket}</td><td className="td font-bold">{f.score}</td><td className="td">{nm(f.batterId)}</td><td className="td">{f.over}</td><td className="td text-right">{f.partnershipRuns}</td></tr>)}</tbody></table>
        </div>
      )}
      <div className="overflow-x-auto p-2">
        <h4 className="px-2 text-xs font-bold uppercase text-slate-500">Partnerships</h4>
        <table className="min-w-[340px]"><thead><tr><th className="th">Wkt</th><th className="th">Batters</th><th className="th text-right">Runs</th><th className="th text-right">Balls</th><th className="th text-right">Extras</th><th className="th">Contribution</th></tr></thead>
          <tbody>{allPartnerships(s).map((p, i) => (
            <tr key={i}><td className="td">{p.wicketNo}{p.unbroken ? '*' : ''}</td><td className="td">{p.batters.map(nm).join(' & ')}</td><td className="td text-right font-bold">{p.runs}</td><td className="td text-right">{p.balls}</td><td className="td text-right">{p.extras}</td>
              <td className="td text-xs text-slate-500">{p.batters.map((b) => `${nm(b).split(' ')[0]} ${p.contributions[b].runs}(${p.contributions[b].balls})`).join(', ')}</td></tr>))}</tbody></table>
      </div>
      <div className="p-2">
        <h4 className="px-2 text-xs font-bold uppercase text-slate-500">Over summary</h4>
        <div className="overflow-x-auto">
          <table className="min-w-[340px]"><thead><tr><th className="th">Over</th><th className="th">Bowler</th><th className="th">Balls</th><th className="th text-right">Runs</th><th className="th text-right">Score</th></tr></thead>
            <tbody>{allOvers(s).map((o) => {
              const last = [...s.balls].reverse().find((b) => b.over === o.over - 1);
              return (
                <tr key={o.over}>
                  <td className="td font-bold">{o.over}{o.legalBalls > 0 && <div className="text-[10px] font-normal text-slate-500">{o.over - 1}.1–{o.over - 1}.{o.legalBalls}</div>}</td>
                  <td className="td">{o.bowlerIds.map(nm).join(' / ')}{o.maidenBowlerId ? <span className="ml-1 rounded bg-gold/20 px-1 text-[10px] font-bold text-gold">MAIDEN</span> : null}</td>
                  <td className="td"><div className="flex flex-wrap gap-1">{o.tokens.map((t, i) => <span key={i} className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold ${t.includes('W') && !t.includes('Wd') ? 'bg-red-500 text-white' : t === '4' || t === '6' ? 'bg-emerald-500 text-white' : /Wd|Nb/.test(t) ? 'bg-amber-400 text-black' : 'bg-slate-200 text-slate-800 dark:bg-white/15 dark:text-white'}`}>{t === '0' ? '•' : t}</span>)}</div></td>
                  <td className="td text-right font-bold">{o.runs}</td>
                  <td className="td text-right tabular-nums">{last ? `${last.scoreAfter}/${last.wicketsAfter}` : ''}</td>
                </tr>);
            })}</tbody></table>
        </div>
      </div>
    </section>
  );
}

function safeBalls(o: string) { const [a, b] = o.split('.'); return Number(a) * 6 + Number(b ?? 0); }

function Head({ v, db }: { v: InnView; db: DB }) {
  return (
    <div className="flex items-center justify-between bg-navy-800 px-4 py-3 text-white">
      <div className="font-bold">{teamName(db, v.battingTeamId)} <span className="text-xs font-normal opacity-70">innings {v.index + 1}</span></div>
      <div className="text-lg font-extrabold">{v.runs}/{v.wickets} <span className="text-sm font-normal opacity-70">({v.overs} ov)</span></div>
    </div>
  );
}

export function AllInnings({ m, db }: { m: Match; db: DB }) {
  return <>{inningsViews(m).map((v) => <InningsCard key={v.index} v={v} db={db} m={m} />)}</>;
}
