import { motion } from 'framer-motion';
const initials = (n: string) => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();

/** Night stadium panorama: stands, crowd, floodlights and the pitch. Pure SVG, so it stays sharp and works offline. */
export function Stadium({ className = '' }: { className?: string }) {
  const crowd = Array.from({ length: 140 }, (_, i) => ({ x: 20 + ((i * 37) % 560), y: 92 + ((i * 53) % 46), c: ['#fde68a', '#22e07a', '#93c5fd', '#fca5a5', '#ffffff'][i % 5], o: 0.25 + ((i * 7) % 10) / 22 }));
  return (
    <svg viewBox="0 0 600 190" className={className} aria-hidden preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="st-field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#14803d" /><stop offset="1" stopColor="#064e3b" /></linearGradient>
        <linearGradient id="st-stand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e3a5f" /><stop offset="1" stopColor="#0b1b33" /></linearGradient>
        <radialGradient id="st-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff7d6" stopOpacity="0.95" /><stop offset="1" stopColor="#fff7d6" stopOpacity="0" /></radialGradient>
        <linearGradient id="st-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff7d6" stopOpacity="0.28" /><stop offset="1" stopColor="#fff7d6" stopOpacity="0" /></linearGradient>
      </defs>
      {/* stands */}
      <path d="M0 150 Q300 70 600 150 L600 190 L0 190Z" fill="url(#st-stand)" />
      <path d="M0 162 Q300 92 600 162 L600 190 L0 190Z" fill="#12294a" />
      {crowd.map((d, i) => <circle key={i} cx={d.x} cy={d.y + 40 - Math.abs(d.x - 300) * 0.12} r="1.6" fill={d.c} opacity={d.o} />)}
      {/* field */}
      <ellipse cx="300" cy="172" rx="250" ry="26" fill="url(#st-field)" />
      <ellipse cx="300" cy="172" rx="250" ry="26" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.2" />
      <ellipse cx="300" cy="172" rx="150" ry="14" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeDasharray="3 4" />
      <path d="M284 172 L316 172 L322 178 L278 178Z" fill="#d8c58a" opacity="0.9" />
      {[290, 300, 310].map((x) => <rect key={x} x={x - 0.8} y="164" width="1.6" height="8" fill="#f5deb3" />)}
      {/* floodlights */}
      {[60, 190, 410, 540].map((x, i) => (
        <g key={x}>
          <rect x={x - 1.5} y={70 - (i % 2) * 6} width="3" height={90 + (i % 2) * 6} fill="#0b1226" />
          <polygon points={`${x - 9},${70 - (i % 2) * 6} ${x + 9},${70 - (i % 2) * 6} ${x + 70 * (x < 300 ? 1 : -1)},175 ${x - 30 * (x < 300 ? 1 : -1)},175`} fill="url(#st-beam)" />
          <rect x={x - 11} y={62 - (i % 2) * 6} width="22" height="10" rx="2" fill="#1b2a44" />
          {[-7, -2.3, 2.3, 7].map((dx) => <circle key={dx} cx={x + dx} cy={67 - (i % 2) * 6} r="2" fill="#fff7d6" />)}
          <circle cx={x} cy={67 - (i % 2) * 6} r="22" fill="url(#st-glow)" />
        </g>
      ))}
    </svg>
  );
}

/** Gold trophy with a gentle 3D swing and a light sweep. */
export function Trophy({ size = 96 }: { size?: number }) {
  return (
    <div style={{ perspective: 600, width: size, height: size }} aria-hidden>
      <motion.svg viewBox="0 0 100 100" width={size} height={size} animate={{ rotateY: [-22, 22, -22], y: [0, -4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} style={{ transformStyle: 'preserve-3d' }}>
        <defs>
          <linearGradient id="tr-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff2a8" /><stop offset="0.45" stopColor="#d4af37" /><stop offset="1" stopColor="#8a6a12" /></linearGradient>
          <linearGradient id="tr-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f3a64" /><stop offset="1" stopColor="#0b1b33" /></linearGradient>
        </defs>
        <path d="M24 18H14c0 14 6 24 18 26M76 18h10c0 14-6 24-18 26" fill="none" stroke="url(#tr-gold)" strokeWidth="5" strokeLinecap="round" />
        <path d="M24 12h52v22c0 16-11 26-26 26S24 50 24 34Z" fill="url(#tr-gold)" />
        <path d="M32 16c-2 18 2 34 12 40" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="44" y="58" width="12" height="14" fill="url(#tr-gold)" />
        <path d="M32 72h36l4 10H28Z" fill="url(#tr-gold)" />
        <rect x="26" y="82" width="48" height="10" rx="3" fill="url(#tr-base)" />
        <circle cx="50" cy="30" r="6" fill="#fff" fillOpacity="0.25" />
      </motion.svg>
    </div>
  );
}

/** Bat and ball illustration with motion arcs. */
export function BatBall({ size = 120, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 140 120" width={size} height={size * (120 / 140)} className={className} aria-hidden>
      <defs>
        <linearGradient id="bb-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f3d9a4" /><stop offset="1" stopColor="#c99a55" /></linearGradient>
        <radialGradient id="bb-ball" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#ff6b5e" /><stop offset="0.6" stopColor="#d1272b" /><stop offset="1" stopColor="#7a0f16" /></radialGradient>
      </defs>
      <g transform="rotate(35 55 60)">
        <rect x="46" y="4" width="18" height="30" rx="7" fill="#1f2937" />
        <rect x="49" y="30" width="12" height="16" fill="url(#bb-wood)" />
        <path d="M40 46h30l-3 62a5 5 0 0 1-5 5H48a5 5 0 0 1-5-5Z" fill="url(#bb-wood)" />
        <path d="M55 50v58" stroke="#a9772f" strokeWidth="1.5" opacity="0.6" />
      </g>
      <circle cx="104" cy="34" r="14" fill="url(#bb-ball)" />
      <path d="M92 28c8 5 16 5 24 0M92 40c8-5 16-5 24 0" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" fill="none" />
      <path d="M70 84c10-26 22-40 36-48" stroke="#22e07a" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}

/** Team badge: a shield in the team colour with its initials. */
export function Crest({ name, color = '#10b981', size = 40, logo }: { name: string; color?: string; size?: number; logo?: string }) {
  if (logo) return <img src={logo} alt={name} width={size} height={size} className="rounded-lg object-cover" style={{ width: size, height: size }} loading="lazy" />;
  const id = `crest-${name.replace(/\W/g, '')}-${color.replace('#', '')}`;
  return (
    <svg viewBox="0 0 48 56" width={size} height={size * (56 / 48)} role="img" aria-label={`${name} badge`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor="#0b1b33" /></linearGradient>
      </defs>
      <path d="M24 2 44 9v18c0 14-9 23-20 27C13 50 4 41 4 27V9Z" fill={`url(#${id})`} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
      <path d="M24 2 44 9v6C34 12 14 12 4 15V9Z" fill="#fff" fillOpacity="0.18" />
      <text x="24" y="35" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" fontFamily="Inter, system-ui, sans-serif">{initials(name).slice(0, 2)}</text>
    </svg>
  );
}

/** Friendly empty-state picture. */
export function EmptyArt({ children }: { children?: React.ReactNode }) {
  return (
    <div className="card relative overflow-hidden p-8 text-center">
      <Stadium className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-60" />
      <div className="relative"><BatBall size={96} className="mx-auto" /><div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{children}</div></div>
    </div>
  );
}
