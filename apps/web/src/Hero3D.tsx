import { useReducedMotion } from 'framer-motion';
import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Ball } from './fx';

const Scene3D = lazy(() => import('./Scene3D'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

class Guard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* fall back to the flat illustration */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * Live 3D scene (ball bowled at the stumps). Loaded on demand, paused when off-screen,
 * and replaced by a flat animated ball if WebGL is missing, fails, or the user prefers reduced motion.
 */
export default function Hero3D({ className = '', height = 200 }: { className?: string; height?: number }) {
  const reduce = useReducedMotion();
  const [ok] = useState(() => hasWebGL());
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  // Start the 3D scene shortly after first paint so it never delays the page becoming usable.
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const el = box.current; if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const flat = <div className="flex h-full items-center justify-center"><Ball size={Math.min(110, height - 20)} /></div>;
  return (
    <div ref={box} className={className} style={{ height }} data-testid="hero-3d">
      {reduce || !ok || !ready ? flat : (
        <Guard fallback={flat}>
          <Suspense fallback={flat}><Scene3D active={visible} /></Suspense>
        </Guard>
      )}
    </div>
  );
}
