import { motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useDB } from './lib/store';
import { Welcome } from './Welcome';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Players = lazy(() => import('./pages/Players'));
const Teams = lazy(() => import('./pages/Teams'));
const Matches = lazy(() => import('./pages/Matches'));
const NewMatch = lazy(() => import('./pages/NewMatch'));
const MatchView = lazy(() => import('./pages/MatchView'));
const Scoring = lazy(() => import('./pages/Scoring'));
const Tournaments = lazy(() => import('./pages/Tournaments'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const Compare = lazy(() => import('./pages/Compare'));

const NAV = [
  ['/', 'Home', '🏠'], ['/matches', 'Matches', '🏏'], ['/players', 'Players', '👤'], ['/teams', 'Teams', '🛡️'],
  ['/analytics', 'Stats', '📊'], ['/settings', 'Settings', '⚙️'],
] as const;

function Search() {
  const db = useDB(); const nav = useNavigate(); const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    return [
      ...db.players.filter((p) => p.name.toLowerCase().includes(s) || p.nickname?.toLowerCase().includes(s)).slice(0, 5).map((p) => ({ k: p.id, t: p.name, s: 'Player', to: `/players?focus=${p.id}` })),
      ...db.teams.filter((t) => t.name.toLowerCase().includes(s)).slice(0, 4).map((t) => ({ k: t.id, t: t.name, s: 'Team', to: `/teams?focus=${t.id}` })),
      ...db.matches.filter((m) => m.title.toLowerCase().includes(s)).slice(0, 5).map((m) => ({ k: m.id, t: m.title, s: 'Match', to: `/matches/${m.id}` })),
    ];
  }, [q, db]);
  return (
    <div className="relative w-full max-w-sm">
      <input className="input" placeholder="Search players, teams, matches…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global search" />
      {hits.length > 0 && (
        <div className="card absolute left-0 right-0 top-11 z-40 max-h-80 overflow-auto p-1">
          {hits.map((h) => <button key={h.k} className="flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-emerald-500/10" onClick={() => { setQ(''); nav(h.to); }}><span>{h.t}</span><span className="text-xs text-slate-500">{h.s}</span></button>)}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const db = useDB(); const loc = useLocation();
  useEffect(() => { document.documentElement.classList.toggle('dark', db.settings.dark); }, [db.settings.dark]);
  const live = db.matches.find((m) => m.status === 'live');
  return (
    <div className="flex min-h-full">
      <Welcome />
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-3 md:flex dark:border-white/10 dark:bg-char-900">
        <Link to="/" className="mb-4 flex items-center gap-2 px-2 text-xl font-extrabold"><motion.img src="/icon.svg" width={30} height={30} alt="" whileHover={{ rotate: 360 }} transition={{ duration: 0.6 }} /><span className="text-gradient">Cricova</span></Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(([to, label, ic]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-white' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}>
              {({ isActive }) => (<>{isActive && <motion.span layoutId="side-pill" className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-600/30" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}<span className="relative">{ic} {label}</span></>)}
            </NavLink>
          ))}
        </nav>
        {live && <Link to={`/scoring/${live.id}`} className="mt-auto rounded-lg bg-live/20 p-3 text-xs font-semibold text-emerald-600 dark:text-live">● Continue: {live.title}</Link>}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-navy-900/80">
          <Link to="/" className="font-extrabold md:hidden">Cricova</Link>
          <Search />
          <Link to="/settings" className="ml-auto text-xl md:hidden" aria-label="Settings">⚙️</Link>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1700px] flex-1 p-3 pb-24 xsm:p-4 xsm:pb-24 md:pb-6 lg:p-6 xlg:p-8">
          <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading…</div>}>
            <>
              <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                <Routes location={loc}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/players" element={<Players />} />
                  <Route path="/teams" element={<Teams />} />
                  <Route path="/matches" element={<Matches />} />
                  <Route path="/matches/new" element={<NewMatch />} />
                  <Route path="/matches/:id" element={<MatchView />} />
                  <Route path="/scoring" element={<Scoring />} />
                  <Route path="/scoring/:id" element={<Scoring />} />
                  <Route path="/tournaments" element={<Tournaments />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/compare" element={<Compare />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<div className="p-8 text-center">Page not found</div>} />
                </Routes>
              </motion.div>
            </>
          </Suspense>
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-white/10 dark:bg-char-900" aria-label="Mobile">
        {NAV.slice(0, 5).map(([to, label, ic]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `relative flex flex-col items-center py-2 text-[11px] ${isActive ? 'font-bold text-emerald-600 dark:text-live' : 'text-slate-500'}`}>
            {({ isActive }) => (<>
              {isActive && <motion.span layoutId="mob-pill" className="absolute inset-x-3 top-0 h-1 rounded-b-full bg-gradient-to-r from-emerald-500 to-live" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <motion.span className="text-lg" animate={{ scale: isActive ? 1.3 : 1, y: isActive ? -2 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>{ic}</motion.span>{label}</>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
