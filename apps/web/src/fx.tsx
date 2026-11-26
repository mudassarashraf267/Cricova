import { animate, AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/** Particle burst. Change `burst` (any new number) to fire it. Skipped when the user prefers reduced motion. */
export function Confetti({ burst, count = 40, colors = ['#22e07a', '#10b981', '#d4af37', '#ffffff'] }: { burst: number; count?: number; colors?: string[] }) {
  const reduce = useReducedMotion();
  const parts = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const d = 140 + Math.random() * 260;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 80, r: Math.random() * 540 - 270, c: colors[i % colors.length], s: 6 + Math.random() * 8, delay: Math.random() * 0.08, round: i % 3 === 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [burst, count]);
  if (reduce || !burst) return null;
  return (
    <div key={burst} className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden" aria-hidden>
      {parts.map((p, i) => (
        <motion.span key={i} className="absolute" style={{ width: p.s, height: p.s * (p.round ? 1 : 0.5), background: p.c, borderRadius: p.round ? 999 : 2 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }} animate={{ x: p.x, y: p.y + 220, opacity: 0, rotate: p.r, scale: 0.6 }}
          transition={{ duration: 1.3, delay: p.delay, ease: [0.15, 0.7, 0.3, 1] }} />
      ))}
    </div>
  );
}

/** Number that counts up when it appears or changes. */
export function CountUp({ to, duration = 0.9 }: { to: number; duration?: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) { setV(to); return; }
    const c = animate(0, to, { duration, ease: 'easeOut', onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, duration, reduce]);
  return <>{v}</>;
}

/** Floating, slowly spinning cricket ball. */
export function Ball({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <motion.svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden
      animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
      <defs>
        <radialGradient id="ballg" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#ff6b5e" /><stop offset="0.55" stopColor="#d1272b" /><stop offset="1" stopColor="#7a0f16" /></radialGradient>
      </defs>
      <motion.g animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }} style={{ originX: '50px', originY: '50px' }}>
        <circle cx="50" cy="50" r="44" fill="url(#ballg)" />
        <path d="M18 30c18 10 46 10 64 0M18 70c18-10 46-10 64 0" stroke="#fff6" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {[24, 34, 44, 54, 64, 74].map((x) => <g key={x}><path d={`M${x} 33l1.5 5M${x} 67l1.5-5`} stroke="#fff8" strokeWidth="1.6" strokeLinecap="round" /></g>)}
      </motion.g>
      <ellipse cx="38" cy="30" rx="12" ry="7" fill="#fff" opacity="0.18" transform="rotate(-25 38 30)" />
    </motion.svg>
  );
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } } };
/** Children that use <Item> animate in one after another. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div className={className} variants={container} initial="hidden" animate="show">{children}</motion.div>;
}
export function Item({ children, className, tilt }: { children: ReactNode; className?: string; tilt?: boolean }) {
  return <motion.div className={`min-w-0 ${className ?? ''}`} variants={item} whileHover={tilt ? undefined : { y: -3 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>{tilt ? <Tilt max={5}>{children}</Tilt> : children}</motion.div>;
}

/** Big FOUR / SIX / OUT moment: ring burst, text pop and (for OUT) a red flash. */
export function Celebration({ kind, id }: { kind: 'FOUR' | 'SIX' | 'OUT' | null; id: number }) {
  const col = kind === 'OUT' ? '#ef4444' : kind === 'SIX' ? '#d4af37' : '#22e07a';
  return (
    <>
      <AnimatePresence>
        {kind && (
          <motion.div key={id} className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {kind === 'OUT' && <motion.div className="absolute inset-0" style={{ background: 'radial-gradient(circle, transparent 35%, rgba(239,68,68,.55))' }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.9 }} />}
            <motion.div className="absolute rounded-full border-4" style={{ borderColor: col, width: 120, height: 120 }} initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 5, opacity: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }} />
            <motion.div className="relative text-7xl font-black tracking-tight" style={{ color: col, textShadow: `0 0 40px ${col}` }}
              initial={{ scale: 0.3, rotate: -8, opacity: 0 }} animate={{ scale: [0.3, 1.25, 1], rotate: [-8, 3, 0], opacity: 1 }} transition={{ duration: 0.45, times: [0, 0.6, 1] }}>
              {kind === 'OUT' ? 'OUT!' : kind === 'SIX' ? 'SIX!' : 'FOUR!'}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Confetti burst={kind === 'FOUR' || kind === 'SIX' ? id : 0} count={kind === 'SIX' ? 64 : 36} colors={kind === 'SIX' ? ['#d4af37', '#fde68a', '#22e07a', '#ffffff'] : ['#22e07a', '#10b981', '#ffffff']} />
    </>
  );
}

/** 3D tilt that follows the pointer (mouse only), with a moving glare. Flat when reduced motion is preferred. */
export function Tilt({ children, className, max = 7 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const rx = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });
  const gl = useMotionValue(0);
  const glare = useMotionTemplate`radial-gradient(circle at ${useTransform(x, (v) => v * 100)}% ${useTransform(y, (v) => v * 100)}%, rgba(255,255,255,0.16), transparent 55%)`;
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div className={className} style={{ perspective: 900 }}>
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d', position: 'relative' }}
        onPointerMove={(e) => { if (e.pointerType !== 'mouse') return; gl.set(1); const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height); }}
        onPointerLeave={() => { x.set(0.5); y.set(0.5); gl.set(0); }}>
        {children}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare, mixBlendMode: 'overlay', opacity: gl }} />
      </motion.div>
    </div>
  );
}

/** A real 3D coin: tap to flip it; it lands on one of the two sides and reports which. */
export function Coin({ a, b, onResult, disabled }: { a: string; b: string; onResult: (side: 0 | 1) => void; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const [rot, setRot] = useState(0); const [busy, setBusy] = useState(false); const [land, setLand] = useState<0 | 1 | null>(null);
  const [flipId, setFlipId] = useState(0);
  const flip = () => {
    if (busy || disabled) return;
    const side: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const base = rot - (rot % 360);
    setBusy(true); setLand(null); setRot(base + 360 * (5 + Math.floor(Math.random() * 3)) + (side === 0 ? 0 : 180)); setFlipId((n) => n + 1);
    setPending(side);
  };
  const [pending, setPending] = useState<0 | 1>(0);
  const face = (txt: string, back: boolean) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full text-center"
      style={{ backfaceVisibility: 'hidden', transform: back ? 'rotateY(180deg)' : undefined, background: 'radial-gradient(circle at 30% 25%, #fff2a8, #d4af37 55%, #8a6a12)', border: '5px solid #b8860b', boxShadow: 'inset 0 0 18px rgba(0,0,0,.35)' }}>
      <div className="text-3xl">🏏</div>
      <div className="mt-1 max-w-[80%] truncate text-xs font-black uppercase tracking-wide text-amber-950">{txt}</div>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-2" style={{ perspective: 800 }}>
      <motion.div key={flipId} initial={false} animate={reduce ? { rotateY: rot } : { rotateY: rot, y: [0, -110, 0], scale: [1, 1.25, 1] }}
        transition={reduce ? { duration: 0 } : { rotateY: { duration: 1.9, ease: [0.2, 0.6, 0.3, 1] }, y: { duration: 1.9, times: [0, 0.45, 1], ease: 'easeInOut' }, scale: { duration: 1.9, times: [0, 0.45, 1] } }}
        onAnimationComplete={() => { if (busy) { setBusy(false); setLand(pending); onResult(pending); } }}
        style={{ width: 120, height: 120, transformStyle: 'preserve-3d', position: 'relative', filter: 'drop-shadow(0 14px 14px rgba(0,0,0,.35))' }} data-testid="coin">
        {face(a, false)}{face(b, true)}
      </motion.div>
      <button className="btn btn-ghost" onClick={flip} disabled={busy || disabled}>{busy ? 'Flipping…' : land === null ? 'Flip a coin' : 'Flip again'}</button>
    </div>
  );
}
