import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Grid } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { useState, useRef, useEffect } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';

export function CanvasScene() {
  const [speed, setSpeed] = useState(16);
  const [angle, setAngle] = useState(45);
  const [isLaunched, setIsLaunched] = useState(false);

  const [stats, setStats] = useState({
    distance: 0,
    height: 0,
    maxHeight: 0,
    time: 0,
  });

  const bodyRef = useRef<RapierRigidBody>(null);
  const hasLaunched = useRef(false);
  const startTime = useRef(0);
  const maxHeightRef = useRef(0);

  const launch = () => {
    if (isLaunched) return;
    hasLaunched.current = false;
    setIsLaunched(true);
    startTime.current = performance.now();
    maxHeightRef.current = 0;
  };

  const reset = () => {
    setIsLaunched(false);
    hasLaunched.current = false;
    setStats({ distance: 0, height: 0, maxHeight: 0, time: 0 });
    maxHeightRef.current = 0;

    if (bodyRef.current) {
      bodyRef.current.setTranslation({ x: 0, y: 6, z: 0 }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  };

  // Apply velocity once when launched
  useEffect(() => {
    if (!isLaunched || !bodyRef.current || hasLaunched.current) return;

    const timer = setTimeout(() => {
      if (bodyRef.current) {
        const rad = (angle * Math.PI) / 180;
        const vx = speed * Math.cos(rad);
        const vy = speed * Math.sin(rad);

        bodyRef.current.setTranslation({ x: 0, y: 6, z: 0 }, true);
        bodyRef.current.setLinvel({ x: vx, y: vy, z: 0 }, true);
        bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        hasLaunched.current = true;
      }
    }, 30);

    return () => clearTimeout(timer);
  }, [isLaunched, speed, angle]);

  // Live stats
  useFrame(() => {
    if (!bodyRef.current || !isLaunched) return;

    const pos = bodyRef.current.translation();
    const dist = Math.sqrt(pos.x * pos.x);
    const height = Math.max(0, pos.y - 0.6);

    if (height > maxHeightRef.current) {
      maxHeightRef.current = height;
    }

    const time = (performance.now() - startTime.current) / 1000;

    setStats({
      distance: dist,
      height,
      maxHeight: maxHeightRef.current,
      time,
    });
  });

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0a' }}>
      <Canvas camera={{ position: [28, 14, 28], fov: 40 }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[20, 30, 15]} intensity={1.4} castShadow />

        <Physics gravity={[0, -9.81, 0]}>
          {/* Ground */}
          <RigidBody type="fixed" position={[0, -1, 0]}>
            <mesh receiveShadow>
              <boxGeometry args={[120, 2, 120]} />
              <meshStandardMaterial color="#1e2937" />
            </mesh>
          </RigidBody>

          {/* Origin platform */}
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[1.4, 1.4, 0.3, 32]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>

          {/* Origin cross */}
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[0.18, 0.08, 2.8]} />
            <meshStandardMaterial color="#93c5fd" />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[2.8, 0.08, 0.18]} />
            <meshStandardMaterial color="#93c5fd" />
          </mesh>

          {/* Projectile */}
          <RigidBody
            ref={bodyRef}
            position={[0, 6, 0]}
            colliders="ball"
            restitution={0.25}
            friction={0.4}
          >
            <mesh castShadow>
              <sphereGeometry args={[0.55]} />
              <meshStandardMaterial
                color="#ef4444"
                emissive="#f87171"
                emissiveIntensity={0.45}
              />
            </mesh>
          </RigidBody>
        </Physics>

        <Grid
          args={[100, 100]}
          cellSize={2}
          cellThickness={0.5}
          cellColor="#334155"
          sectionSize={10}
          sectionThickness={1.1}
          sectionColor="#475569"
          fadeDistance={90}
          position={[0, 0.02, 0]}
        />

        <OrbitControls
          target={[15, 5, 0]}
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.05}
        />
        <Stars radius={300} depth={50} count={2500} factor={3} fade />
      </Canvas>

      {/* Controls + Stats */}
      <div className="absolute top-6 left-6 bg-black/90 p-5 rounded-xl border border-zinc-700 w-80 space-y-4 z-50">
        <h3 className="font-semibold text-lg">Projectile Motion</h3>

        <div>
          <label className="text-sm text-zinc-400">
            Speed: <span className="text-white font-mono">{speed} m/s</span>
          </label>
          <input
            type="range"
            min="8"
            max="30"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-cyan-500"
            disabled={isLaunched}
          />
        </div>

        <div>
          <label className="text-sm text-zinc-400">
            Angle: <span className="text-white font-mono">{angle}°</span>
          </label>
          <input
            type="range"
            min="15"
            max="75"
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="w-full accent-cyan-500"
            disabled={isLaunched}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={launch}
            disabled={isLaunched}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 rounded-lg font-medium"
          >
            Launch
          </button>
          <button
            onClick={reset}
            className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-medium"
          >
            Reset
          </button>
        </div>

        {/* Live Stats */}
        <div className="pt-4 border-t border-zinc-700 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Distance</span>
            <span className="font-mono">{stats.distance.toFixed(1)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Current Height</span>
            <span className="font-mono">{stats.height.toFixed(1)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Max Height</span>
            <span className="font-mono">{stats.maxHeight.toFixed(1)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Time</span>
            <span className="font-mono">{stats.time.toFixed(2)} s</span>
          </div>
        </div>
      </div>
    </div>
  );
}