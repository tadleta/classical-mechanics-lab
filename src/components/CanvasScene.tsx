import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Grid, Trail } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { useState, useRef, useEffect } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';

type Mode = 'projectile' | 'baseball';

function SceneContent({
  mode,
  isLaunched,
  speed,
  angle,
  sprayAngle,
  ballRadius,
  onStatsUpdate,
}: {
  mode: Mode;
  isLaunched: boolean;
  speed: number;        // always stored in m/s internally
  angle: number;
  sprayAngle: number;   // degrees left/right
  ballRadius: number;
  onStatsUpdate: (stats: any) => void;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const hasLaunched = useRef(false);
  const startTime = useRef(0);
  const maxHeightRef = useRef(0);

  const launchY = ballRadius + 0.15;

  // Convert spray angle into a direction
  const getVelocity = () => {
    const rad = (angle * Math.PI) / 180;
    const sprayRad = (sprayAngle * Math.PI) / 180;

    const horizontal = speed * Math.cos(rad);
    const vertical = speed * Math.sin(rad);

    return {
      x: horizontal * Math.cos(sprayRad),
      y: vertical,
      z: horizontal * Math.sin(sprayRad),
    };
  };

  useEffect(() => {
    if (!isLaunched || !bodyRef.current || hasLaunched.current) return;

    const timer = setTimeout(() => {
      if (bodyRef.current) {
        const vel = getVelocity();

        bodyRef.current.setTranslation({ x: 0, y: launchY, z: 0 }, true);
        bodyRef.current.setLinvel(vel, true);
        bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);

        hasLaunched.current = true;
        startTime.current = performance.now();
        maxHeightRef.current = 0;
      }
    }, 30);

    return () => clearTimeout(timer);
  }, [isLaunched, speed, angle, sprayAngle, launchY]);

  useEffect(() => {
    if (!isLaunched && bodyRef.current) {
      bodyRef.current.setTranslation({ x: 0, y: launchY, z: 0 }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      hasLaunched.current = false;
    }
  }, [isLaunched, launchY]);

  useFrame(() => {
    if (!bodyRef.current || !isLaunched) return;

    const pos = bodyRef.current.translation();
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    const height = Math.max(0, pos.y - ballRadius);

    if (height > maxHeightRef.current) {
      maxHeightRef.current = height;
    }

    const time = (performance.now() - startTime.current) / 1000;

    onStatsUpdate({
      distance: dist,
      height,
      maxHeight: maxHeightRef.current,
      time,
    });
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[20, 30, 15]} intensity={1.4} castShadow />

      <Physics gravity={[0, -9.81, 0]}>
        {/* Ground */}
        <RigidBody type="fixed" position={[0, -1, 0]}>
          <mesh receiveShadow>
            <boxGeometry args={[200, 2, 200]} />
            <meshStandardMaterial color="#1e2937" />
          </mesh>
        </RigidBody>

        {/* Origin / Home Plate */}
        {mode === 'baseball' ? (
          // Simple home plate
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.9, 5]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
        ) : (
          // Original blue platform
          <>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[1.6, 1.6, 0.24, 32]} />
              <meshStandardMaterial color="#3b82f6" />
            </mesh>
            <mesh position={[0, 0.26, 0]}>
              <boxGeometry args={[0.18, 0.08, 3]} />
              <meshStandardMaterial color="#93c5fd" />
            </mesh>
            <mesh position={[0, 0.26, 0]}>
              <boxGeometry args={[3, 0.08, 0.18]} />
              <meshStandardMaterial color="#93c5fd" />
            </mesh>
          </>
        )}

        {/* Projectile */}
        <RigidBody
          ref={bodyRef}
          position={[0, launchY, 0]}
          colliders="ball"
          restitution={0.25}
          friction={0.4}
        >
          <Trail width={0.9} length={20} color="#fb7185" attenuation={(t) => t * 0.9}>
            <mesh castShadow>
              <sphereGeometry args={[ballRadius]} />
              <meshStandardMaterial
                color={mode === 'baseball' ? '#f8fafc' : '#ef4444'}
                emissive={mode === 'baseball' ? '#e2e8f0' : '#f87171'}
                emissiveIntensity={0.4}
              />
            </mesh>
          </Trail>
        </RigidBody>
      </Physics>

      <Grid
        args={[140, 140]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={10}
        sectionThickness={1.1}
        sectionColor="#475569"
        fadeDistance={110}
        position={[0, 0.02, 0]}
      />

      <OrbitControls
        target={[20, 5, 0]}
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.05}
      />
      <Stars radius={300} depth={50} count={2500} factor={3} fade />
    </>
  );
}

export function CanvasScene() {
  const [mode, setMode] = useState<Mode>('projectile');
  const [isLaunched, setIsLaunched] = useState(false);

  // Internal speed is always in m/s
  const [speedMs, setSpeedMs] = useState(16);
  const [angle, setAngle] = useState(45);
  const [sprayAngle, setSprayAngle] = useState(0);
  const [ballRadius, setBallRadius] = useState(0.55);

  const [stats, setStats] = useState({
    distance: 0,
    height: 0,
    maxHeight: 0,
    time: 0,
  });

  // Helpers for unit conversion
  const mphToMs = (mph: number) => mph * 0.44704;
  const msToMph = (ms: number) => ms / 0.44704;
  const metersToFeet = (m: number) => m * 3.28084;

  const launch = () => {
    if (!isLaunched) setIsLaunched(true);
  };

  const reset = () => {
    setIsLaunched(false);
    setStats({ distance: 0, height: 0, maxHeight: 0, time: 0 });
  };

  // Estimated outcome for baseball mode
  const getOutcome = () => {
    const distFt = metersToFeet(stats.distance);
    if (angle < 5) return 'Ground Ball';
    if (angle < 20) return 'Line Drive';
    if (distFt > 350) return 'Home Run (likely)';
    if (distFt > 280) return 'Deep Fly Ball';
    return 'Fly Ball';
  };

  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas camera={{ position: [32, 16, 32], fov: 42 }} style={{ width: '100%', height: '100%' }}>
        <SceneContent
          mode={mode}
          isLaunched={isLaunched}
          speed={speedMs}
          angle={angle}
          sprayAngle={sprayAngle}
          ballRadius={ballRadius}
          onStatsUpdate={setStats}
        />
      </Canvas>

      {/* Control Panel */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          backgroundColor: 'rgba(0,0,0,0.92)',
          padding: 20,
          borderRadius: 12,
          border: '1px solid #3f3f46',
          width: 340,
          zIndex: 50,
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h3 style={{ fontWeight: 600, fontSize: '1.15rem', marginBottom: 16 }}>
          {mode === 'baseball' ? 'Baseball – Batted Ball' : 'Projectile Lab'}
        </h3>

        {/* Mode Selector */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 13, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>
            Mode
          </label>
          <select
            value={mode}
            onChange={(e) => {
              const newMode = e.target.value as Mode;
              setMode(newMode);
              setIsLaunched(false);

              if (newMode === 'baseball') {
                setSpeedMs(mphToMs(95));
                setAngle(25);
                setBallRadius(0.037); // real baseball radius ≈ 3.7 cm
              } else {
                setSpeedMs(16);
                setAngle(45);
                setBallRadius(0.55);
              }
            }}
            disabled={isLaunched}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              background: '#27272a',
              color: 'white',
              border: '1px solid #3f3f46',
            }}
          >
            <option value="projectile">General Projectile</option>
            <option value="baseball">Baseball (Batted Ball)</option>
          </select>
        </div>

        {/* Launch Controls */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#71717a', marginBottom: 10 }}>
            Launch
          </p>

          {mode === 'baseball' ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#a1a1aa' }}>
                  Exit Velocity: <span style={{ color: 'white', fontFamily: 'monospace' }}>{msToMph(speedMs).toFixed(0)} mph</span>
                </label>
                <input
                  type="range"
                  min={35}
                  max={130}
                  value={msToMph(speedMs)}
                  onChange={(e) => setSpeedMs(mphToMs(Number(e.target.value)))}
                  disabled={isLaunched}
                  style={{ width: '100%', accentColor: '#22d3ee' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#a1a1aa' }}>
                  Launch Angle: <span style={{ color: 'white', fontFamily: 'monospace' }}>{angle}°</span>
                </label>
                <input
                  type="range"
                  min={-45}
                  max={80}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  disabled={isLaunched}
                  style={{ width: '100%', accentColor: '#22d3ee' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#a1a1aa' }}>
                  Spray Angle: <span style={{ color: 'white', fontFamily: 'monospace' }}>{sprayAngle}°</span>
                </label>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  value={sprayAngle}
                  onChange={(e) => setSprayAngle(Number(e.target.value))}
                  disabled={isLaunched}
                  style={{ width: '100%', accentColor: '#22d3ee' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#71717a', marginTop: 2 }}>
                  <span>Pull</span>
                  <span>Center</span>
                  <span>Oppo</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#a1a1aa' }}>
                  Speed: <span style={{ color: 'white', fontFamily: 'monospace' }}>{speedMs.toFixed(1)} m/s</span>
                </label>
                <input
                  type="range"
                  min={8}
                  max={30}
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  disabled={isLaunched}
                  style={{ width: '100%', accentColor: '#22d3ee' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#a1a1aa' }}>
                  Angle: <span style={{ color: 'white', fontFamily: 'monospace' }}>{angle}°</span>
                </label>
                <input
                  type="range"
                  min={15}
                  max={75}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  disabled={isLaunched}
                  style={{ width: '100%', accentColor: '#22d3ee' }}
                />
              </div>
            </>
          )}
        </div>

        {/* Ball size (only show in General mode for now) */}
        {mode === 'projectile' && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#71717a', marginBottom: 10 }}>
              Ball
            </p>
            <div>
              <label style={{ fontSize: 13, color: '#a1a1aa' }}>
                Radius: <span style={{ color: 'white', fontFamily: 'monospace' }}>{ballRadius.toFixed(2)} m</span>
              </label>
              <input
                type="range"
                min={0.25}
                max={1.2}
                step={0.05}
                value={ballRadius}
                onChange={(e) => setBallRadius(Number(e.target.value))}
                disabled={isLaunched}
                style={{ width: '100%', accentColor: '#22d3ee' }}
              />
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={launch}
            disabled={isLaunched}
            style={{
              flex: 1,
              padding: '10px 0',
              background: isLaunched ? '#3f3f46' : '#dc2626',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontWeight: 500,
              cursor: isLaunched ? 'not-allowed' : 'pointer',
            }}
          >
            Launch
          </button>
          <button
            onClick={reset}
            style={{
              flex: 1,
              padding: '10px 0',
              background: '#3f3f46',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>

        {/* Stats */}
        <div style={{ borderTop: '1px solid #3f3f46', paddingTop: 14, fontSize: 13 }}>
          {mode === 'baseball' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Exit Velocity</span>
                <span style={{ fontFamily: 'monospace' }}>{msToMph(speedMs).toFixed(0)} mph</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Launch Angle</span>
                <span style={{ fontFamily: 'monospace' }}>{angle}°</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Distance</span>
                <span style={{ fontFamily: 'monospace' }}>{metersToFeet(stats.distance).toFixed(0)} ft</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Max Height</span>
                <span style={{ fontFamily: 'monospace' }}>{metersToFeet(stats.maxHeight).toFixed(0)} ft</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Hang Time</span>
                <span style={{ fontFamily: 'monospace' }}>{stats.time.toFixed(2)} s</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #3f3f46' }}>
                <span style={{ color: '#a1a1aa' }}>Estimated Outcome</span>
                <span style={{ fontFamily: 'monospace', color: '#4ade80' }}>{getOutcome()}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Distance</span>
                <span style={{ fontFamily: 'monospace' }}>{stats.distance.toFixed(1)} m</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Current Height</span>
                <span style={{ fontFamily: 'monospace' }}>{stats.height.toFixed(1)} m</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Max Height</span>
                <span style={{ fontFamily: 'monospace' }}>{stats.maxHeight.toFixed(1)} m</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#a1a1aa' }}>Time</span>
                <span style={{ fontFamily: 'monospace' }}>{stats.time.toFixed(2)} s</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}