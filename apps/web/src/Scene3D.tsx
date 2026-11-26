import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const CYCLE = 4.6;      // seconds per delivery
const HIT = 1.55;       // when the ball reaches the stumps
const STUMP_X = [-0.24, 0, 0.24];
const STUMP_Z = -1.2;

/** Cricket ball: red leather with a raised stitched seam. */
function CricketBall({ refObj }: { refObj: React.MutableRefObject<THREE.Group | null> }) {
  const stitches = useMemo(() => Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2), []);
  return (
    <group ref={refObj}>
      <mesh>
        <sphereGeometry args={[0.2, 32, 32]} />
        <meshStandardMaterial color="#c1121f" roughness={0.32} metalness={0.12} />
      </mesh>
      {/* seam: a thin ring round the middle plus two rows of stitches either side */}
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.011, 6, 40]} /><meshStandardMaterial color="#f5e9d3" roughness={0.6} /></mesh>
      {[-0.028, 0.028].map((off) => stitches.map((a, i) => (
        <mesh key={`${off}-${i}`} position={[Math.cos(a) * 0.2, off * 0.98, Math.sin(a) * 0.2]} rotation={[0, -a, i % 2 ? 0.7 : -0.7]}>
          <boxGeometry args={[0.012, 0.022, 0.004]} /><meshStandardMaterial color="#fff6e6" roughness={0.7} />
        </mesh>
      )))}
    </group>
  );
}

function Wicket() {
  const ball = useRef<THREE.Group | null>(null);
  const stumps = useRef<THREE.Group | null>(null);
  const bails = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8c58a', roughness: 0.55, metalness: 0.05 }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime % CYCLE;
    const g = ball.current; const st = stumps.current;
    if (!g || !st) return;
    if (t < HIT) {
      // delivery: released low near the camera, pitches, rises into the stumps
      const p = t / HIT;
      g.visible = true; g.scale.setScalar(1);
      g.position.set(-0.55 * (1 - p) + 0.02 * p, 0.15 + 0.6 * p + 0.85 * Math.abs(Math.sin(p * Math.PI * 1.5)) * (1 - p) + 0.7 * (1 - p) * (1 - p), 4 + (STUMP_Z + 0.18 - 4) * p);
    } else {
      // after the hit: the ball is deflected away, falls and shrinks
      const tau = t - HIT;
      g.position.set(0.02 + 0.9 * tau, 0.7 + 2.2 * tau - 4.2 * tau * tau, STUMP_Z - 3.2 * tau);
      g.scale.setScalar(Math.max(0.001, 1 - tau * 0.55));
      g.visible = g.position.y > 0.1 || tau < 0.5;
    }
    g.rotation.x -= 0.22; g.rotation.z += 0.07;

    // stumps wobble and settle after the hit; bails fly with simple gravity
    const tau = Math.max(0, t - HIT);
    st.rotation.x = t >= HIT ? -0.32 * Math.exp(-tau * 2.2) * Math.cos(tau * 14) : 0;
    bails.forEach((b, i) => {
      const m = b.current; if (!m) return;
      const dir = i === 0 ? -1 : 1;
      if (t < HIT) { m.position.set(dir * 0.12, 1.47, 0); m.rotation.set(0, 0, Math.PI / 2); return; }
      m.position.set(dir * (0.12 + 0.9 * tau), 1.47 + 2.4 * tau - 4.6 * tau * tau, -1.3 * tau);
      m.rotation.set(tau * 9 * dir, tau * 5, Math.PI / 2 + tau * 7 * dir);
    });
  });

  return (
    <group position={[0, 0, STUMP_Z]}>
      <group ref={stumps}>
        {STUMP_X.map((x) => (
          <mesh key={x} position={[x, 0.7, 0]} material={wood}><cylinderGeometry args={[0.035, 0.035, 1.4, 20]} /></mesh>
        ))}
        {bails.map((r, i) => (
          <mesh key={i} ref={r} material={wood}><cylinderGeometry args={[0.018, 0.018, 0.2, 12]} /></mesh>
        ))}
      </group>
      <CricketBall refObj={ball} />
    </group>
  );
}

/** Slight camera parallax that follows the pointer. */
function Rig({ children }: { children: React.ReactNode }) {
  const grp = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = grp.current; if (!g) return;
    g.rotation.y += (state.pointer.x * 0.35 - g.rotation.y) * 0.06;
    g.rotation.x += (-state.pointer.y * 0.12 - g.rotation.x) * 0.06;
  });
  return <group ref={grp}>{children}</group>;
}

/** Renders at ~25 fps instead of every display refresh: smooth enough for this scene and much lighter on phones. */
function Ticker({ active }: { active: boolean }) {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    if (!active) return;
    invalidate();
    const id = setInterval(() => invalidate(), 40);
    return () => clearInterval(id);
  }, [active, invalidate]);
  return null;
}

export default function Scene3D({ active = true }: { active?: boolean }) {
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0.5, 1.45, 6.4], fov: 36, near: 0.1, far: 50 }} onCreated={({ camera }) => camera.lookAt(0, 0.85, -1.2)} gl={{ alpha: true, antialias: true }} style={{ background: 'transparent' }}>
      <Ticker active={active} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 6, 4]} intensity={2.1} />
      <pointLight position={[-3, 1.5, -2]} intensity={14} color="#22e07a" />
      <pointLight position={[3, 1, 2]} intensity={8} color="#3b82f6" />
      <Rig>
        {/* pitch disc + soft contact shadow area */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1]}>
          <circleGeometry args={[2.6, 48]} />
          <meshStandardMaterial color="#0f5132" roughness={0.9} transparent opacity={0.85} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 1.2]}>
          <planeGeometry args={[0.9, 4.4]} />
          <meshStandardMaterial color="#c9b37a" roughness={0.95} transparent opacity={0.9} />
        </mesh>
        <Wicket />
      </Rig>
    </Canvas>
  );
}
