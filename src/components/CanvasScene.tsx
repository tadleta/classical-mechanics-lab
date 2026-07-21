import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { useState, useRef, useEffect } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';

export function CanvasScene() {
  const [speed, setSpeed] = useState(16);
  const [angle, setAngle] = useState(45);
  const [isLaunched, setIsLaunched] = useState(false);

  const bodyRef = useRef<RapierRigidBody>(null);
  const hasLaunched = useRef(false);

  const launch = () => {
    if (isLaunched) return;
    hasLaunched.current = false;
    setIsLaunched(true);
  };

  const reset = () => {
    setIsLaunched(false);
    hasLaunched.current = false;

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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0a' }}>
      <Canvas camera={{ position: [25, 12, 25], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[15, 25, 10]} intensity={1.3} />

        <Physics gravity={[0, -9.81, 0]}>
          {/* Ground */}
          <RigidBody type="fixed" position={[0, -1, 0]}>
            <mesh>
              <boxGeometry args={[80, 2, 80]} />
              <meshStandardMaterial color="#1e2937" />
            </mesh>
          </RigidBody>

          {/* Origin marker */}
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[1.2, 1.2, 0.3, 32]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>

          {/* Projectile */}
          <RigidBody
            ref={bodyRef}
            position={[0, 6, 0]}
            colliders="ball"
          >
            <mesh>
              <sphereGeometry args={[0.6]} />
              <meshStandardMaterial color="#ef4444" emissive="#f87171" emissiveIntensity={0.4} />
            </mesh>
          </RigidBody>
        </Physics>

        <OrbitControls target={[12, 4, 0]} />
      </Canvas>

      {/* Controls */}
      <div className="absolute top-6 left-6 bg-black/90 p-5 rounded-xl border border-zinc-700 w-72 space-y-4 z-50">
        <h3 className="font-semibold text-lg">Projectile Controls</h3>

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
      </div>
    </div>
  );
}