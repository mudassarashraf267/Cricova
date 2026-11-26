import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const KEY = 'cricova.welcomed';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Full-screen intro shown once per browser session. Skipped for reduced-motion users; tap anywhere to skip. */
export function Welcome() {
  const [show, setShow] = useState(() => { try { return !reduced() && !sessionStorage.getItem(KEY); } catch { return false; } });
  const close = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } setShow(false); };
  useEffect(() => { if (!show) return; const t = setTimeout(close, 3200); return () => clearTimeout(t); }, [show]);
  const letters = 'Cricova'.split('');
  return (
    <AnimatePresence>
      {show && (
        <motion.div key="welcome" role="presentation" data-testid="welcome" onClick={close}
          className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-navy-900 via-navy-800 to-emerald-900 text-white"
          initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 0.6 }}>
          {/* expanding rings */}
          {[0, 1, 2].map((i) => <motion.span key={i} className="absolute h-40 w-40 rounded-full border border-emerald-300/40" initial={{ scale: 0.2, opacity: 0.8 }} animate={{ scale: 7, opacity: 0 }} transition={{ duration: 2.6, delay: 0.3 + i * 0.5, repeat: Infinity, ease: 'easeOut' }} />)}
          {/* bouncing ball with a spinning seam */}
          <motion.div className="relative mb-6 h-20 w-20 rounded-full bg-gradient-to-br from-red-400 to-red-700 shadow-[0_20px_50px_rgba(239,68,68,0.5)]"
            initial={{ y: -420, rotate: 0 }} animate={{ y: [-420, 0, -70, 0, -22, 0], rotate: 720 }} transition={{ duration: 1.5, times: [0, 0.4, 0.6, 0.78, 0.9, 1], ease: 'easeIn' }}>
            <span className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 border-y border-dashed border-white/80" />
            <span className="absolute left-3 top-3 h-5 w-5 rounded-full bg-white/30 blur-[2px]" />
          </motion.div>
          <motion.div aria-hidden className="mb-4 h-2 w-28 rounded-full bg-black/30 blur-md" initial={{ scaleX: 0.3, opacity: 0.2 }} animate={{ scaleX: [0.3, 1, 0.6, 1, 0.8, 1], opacity: 0.5 }} transition={{ duration: 1.5, times: [0, 0.4, 0.6, 0.78, 0.9, 1] }} />
          {/* title, letter by letter */}
          <h1 className="flex text-6xl font-black tracking-tight sm:text-7xl" aria-label="Cricova">
            {letters.map((ch, i) => (
              <motion.span key={i} aria-hidden className={i % 2 ? 'text-emerald-300' : 'text-white'} initial={{ y: 60, opacity: 0, rotateX: -90 }} animate={{ y: 0, opacity: 1, rotateX: 0 }} transition={{ delay: 1.1 + i * 0.07, type: 'spring', stiffness: 260, damping: 16 }}>{ch}</motion.span>
            ))}
          </h1>
          <motion.p className="mt-3 text-sm font-semibold uppercase tracking-[0.35em] text-emerald-200" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }}>Every ball. Every run. Every wicket.</motion.p>
          <motion.span className="absolute bottom-8 text-xs text-white/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}>Tap to start</motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
