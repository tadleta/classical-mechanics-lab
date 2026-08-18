import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Grid, Trail } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { useState, useRef, useEffect, useMemo } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

type Mode = 'projectile' | 'baseball';

const BASE_DISTANCE = 27.432; // 90 ft
const FOUL_LINE = 100.58;     // 330 ft
const CENTER = 121.92;        // 400 ft

function SceneContent({
  mode,
  isLaunched,
  speed,
  angle,
  sprayAngle,
  ballRadius,
  onStatsUpdate,
  onLanded,
  landingPos,
}: {
  mode: Mode;
  isLaunched: boolean;
  speed: number;
  angle: number;
  sprayAngle: number;
  ballRadius: number;
  onStatsUpdate: (stats: any) => void;
  onLanded: (finalStats: any, pos: { x: number; z: number }) => void;
  landingPos: { x: number; z: number } | null;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const hasLaunched = useRef(false);
  const hasLanded = useRef(false);
  const startTime = useRef(0);
  const maxHeightRef = useRef(0);

  const launchY = ballRadius + 0.12;

  // 0° spray = center field (45° in our coordinate system)
  const getVelocity = () => {
    const launchRad = (angle * Math.PI) / 180;
    const sprayRad = (sprayAngle * Math.PI) / 180;
    const direction = Math.PI / 4 + sprayRad; // center at 45°

    const horizontal = speed * Math.cos(launchRad);
    const vertical = speed * Math.sin(launchRad);

    return {
      x: horizontal * Math.cos(direction),
      y: vertical,
      z: horizontal * Math.sin(direction),
    };
  };

  // Launch
  useEffect(() => {
    if (!isLaunched || !bodyRef.current || hasLaunched.current) return;

    const timer = setTimeout(() => {
      if (bodyRef.current) {
        const vel = getVelocity();
        bodyRef.current.setTranslation({ x: 0, y: launchY, z: 0 }, true);
        bodyRef.current.setLinvel(vel, true);
        bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);

        hasLaunched.current = true;
        hasLanded.current = false;
        startTime.current = performance.now();
        maxHeightRef.current = 0;
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isLaunched, speed, angle, sprayAngle, launchY]);

  // Reset
  useEffect(() => {
    if (!isLaunched && bodyRef.current) {
      bodyRef.current.setTranslation({ x: 0, y: launchY, z: 0 }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      hasLaunched.current = false;
      hasLanded.current = false;
    }
  }, [isLaunched, launchY]);

  // Physics + drag + landing
  useFrame((_, delta) => {
    if (!bodyRef.current || !isLaunched) return;

    const pos = bodyRef.current.translation();
    const vel = bodyRef.current.linvel();
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    const height = Math.max(0, pos.y - ballRadius);
    const time = (performance.now() - startTime.current) / 1000;

    if (height > maxHeightRef.current) {
      maxHeightRef.current = height;
    }

    const currentStats = {
      distance: dist,
      height,
      maxHeight: maxHeightRef.current,
      time,
    };

    // ===== Proper Quadratic Air Drag =====
if (!hasLanded.current && mode === 'baseball') {
  const speedNow = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

  if (speedNow > 1) {
    // Tunable coefficient – start here
    const dragCoeff = 0.0034;

    // Magnitude of drag acceleration
    const dragAccel = dragCoeff * speedNow * speedNow;

    // Direction opposite to velocity
    const ux = vel.x / speedNow;
    const uy = vel.y / speedNow;
    const uz = vel.z / speedNow;

    bodyRef.current.setLinvel(
      {
        x: vel.x - ux * dragAccel * delta,
        y: vel.y - uy * dragAccel * delta,
        z: vel.z - uz * dragAccel * delta,
      },
      true
    );
  }
}
// ===== Reliable Landing Detection =====
if (!hasLanded.current) {
  onStatsUpdate(currentStats);

  // Has the ball actually left the ground?
  const hasLeftGround = maxHeightRef.current > ballRadius + 1.5;

  // Is it back near the ground?
  const isNearGround = pos.y < ballRadius + 0.3;

  // Has it been in the air long enough?
  const hasBeenInAir = time > 0.9;

  if (hasLeftGround && isNearGround && hasBeenInAir) {
    // This is the true first landing point
    const landX = pos.x;
    const landZ = pos.z;

    // Soften the landing but allow a little roll
    bodyRef.current.setLinvel(
      { x: vel.x * 0.5, y: 0, z: vel.z * 0.5 },
      true
    );
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setTranslation({ x: landX, y: ballRadius, z: landZ }, true);

    hasLanded.current = true;
    onLanded(currentStats, { x: landX, z: landZ });
  }

  // Safety net only
  if (time > 8.0 && !hasLanded.current) {
    const landX = pos.x;
    const landZ = pos.z;

    bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setTranslation({ x: landX, y: ballRadius, z: landZ }, true);

    hasLanded.current = true;
    onLanded(currentStats, { x: landX, z: landZ });
  }
}
  });

  // ----- Visual helpers -----
  const Base = ({ position }: { position: [number, number, number] }) => (
    <mesh position={position}>
      <boxGeometry args={[1.15, 0.12, 1.15]} />
      <meshStandardMaterial color="#f8fafc" />
    </mesh>
  );

  const FoulPole = ({ position }: { position: [number, number, number] }) => (
    <group position={position}>
      <mesh position={[0, 9, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 18, 12]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[0, 17.2, 0]}>
        <boxGeometry args={[2.2, 1, 0.2]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
    </group>
  );

  // Smooth arc fence
  const FenceArc = useMemo(() => {
    const points: [number, number, number][] = [];
    const segments = 64;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = t * (Math.PI / 2); // 0 → 90°

      // Deeper in center field
      const radius =
        FOUL_LINE + (CENTER - FOUL_LINE) * Math.sin(theta * 2) * 0.85 + (CENTER - FOUL_LINE) * 0.15;

      const x = radius * Math.cos(theta);
      const z = radius * Math.sin(theta);
      points.push([x, 0, z]);
    }
    return points;
  }, []);

  const FenceSegment = ({
    start,
    end,
  }: {
    start: [number, number, number];
    end: [number, number, number];
  }) => {
    const midX = (start[0] + end[0]) / 2;
    const midZ = (start[2] + end[2]) / 2;
    const dx = end[0] - start[0];
    const dz = end[2] - start[2];
    const length = Math.sqrt(dx * dx + dz * dz);
    const rot = Math.atan2(dx, dz);

    return (
      <RigidBody type="fixed" position={[midX, 2, midZ]}>
        <mesh rotation={[0, rot, 0]}>
          <boxGeometry args={[0.32, 4, length + 0.05]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      </RigidBody>
    );
  };

  const LandingMarker = ({ x, z }: { x: number; z: number }) => (
    <group position={[x, 0.2, z]}>
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[2.8, 0.2, 0.4]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[2.8, 0.2, 0.4]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
    </group>
  );

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[50, 60, 30]} intensity={1.3} castShadow />

      <Physics gravity={[0, -9.81, 0]}>
        {/* Ground */}
        <RigidBody type="fixed" position={[0, -1, 0]}>
          <mesh receiveShadow>
            <boxGeometry args={[700, 2, 700]} />
            <meshStandardMaterial color={mode === 'baseball' ? '#166534' : '#1e2937'} />
          </mesh>
        </RigidBody>

        {mode === 'baseball' && (
          <>
            {/* Dirt infield */}
            <mesh
              position={[BASE_DISTANCE / 2, 0.015, BASE_DISTANCE / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[23, 64]} />
              <meshStandardMaterial color="#854d0e" transparent opacity={0.7} />
            </mesh>

            {/* Base paths */}
            <mesh position={[BASE_DISTANCE / 2, 0.03, 0]}>
              <boxGeometry args={[BASE_DISTANCE, 0.04, 0.85]} />
              <meshStandardMaterial color="#a16207" />
            </mesh>
            <mesh position={[BASE_DISTANCE, 0.03, BASE_DISTANCE / 2]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[BASE_DISTANCE, 0.04, 0.85]} />
              <meshStandardMaterial color="#a16207" />
            </mesh>
            <mesh position={[BASE_DISTANCE / 2, 0.03, BASE_DISTANCE]}>
              <boxGeometry args={[BASE_DISTANCE, 0.04, 0.85]} />
              <meshStandardMaterial color="#a16207" />
            </mesh>
            <mesh position={[0, 0.03, BASE_DISTANCE / 2]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[BASE_DISTANCE, 0.04, 0.85]} />
              <meshStandardMaterial color="#a16207" />
            </mesh>

            {/* Bases */}
            
            {/* Home Plate */}
            <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, -Math.PI / 4]}>
              <shapeGeometry args={[(() => {
              const shape = new THREE.Shape();
              // Classic home plate dimensions (roughly to scale)
              shape.moveTo(0, 0.85);
              shape.lineTo(0.75, 0.85);
              shape.lineTo(0.75, 0);
              shape.lineTo(0, -0.75);
              shape.lineTo(-0.75, 0);
              shape.lineTo(-0.75, 0.85);
              shape.lineTo(0, 0.85);
              return shape;
              })()]}
            />
  <meshStandardMaterial color="#f8fafc" side={THREE.DoubleSide} />
</mesh>
            <Base position={[BASE_DISTANCE, 0.09, 0.7]} />
            <Base position={[BASE_DISTANCE, 0.09, BASE_DISTANCE]} />
            <Base position={[0.7, 0.09, BASE_DISTANCE]} />

            {/* Mound */}
            <mesh position={[BASE_DISTANCE / 2, 0.18, BASE_DISTANCE / 2]}>
              <cylinderGeometry args={[2.1, 2.4, 0.35, 32]} />
              <meshStandardMaterial color="#a16207" />
            </mesh>

            {/* White foul lines (baselines) */}

            {/* Left field line (along +X) */}
            <mesh position={[FOUL_LINE / 2, 0.04, 0]} rotation={[0, 0, 0]}>
              <boxGeometry args={[FOUL_LINE, 0.06, 0.35]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>

            {/* Right field line (along +Z) */}
            <mesh position={[0, 0.04, FOUL_LINE / 2]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[FOUL_LINE, 0.06, 0.35]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>

            {/* Smooth arc fence */}
            {FenceArc.slice(0, -1).map((start, i) => (
              <FenceSegment key={i} start={start} end={FenceArc[i + 1]} />
            ))}

            {/* Foul Poles */}
            <FoulPole position={[FOUL_LINE, 0, 0]} />
            <FoulPole position={[0, 0, FOUL_LINE]} />
          </>
        )}

        {/* General mode origin */}
        {mode === 'projectile' && (
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

        {/* The Ball */}
        <RigidBody
          ref={bodyRef}
          position={[0, launchY, 0]}
          colliders="ball"
          restitution={0}
          friction={0.9}
        >
          <Trail width={0.9} length={18} color="#fb7185" attenuation={(t) => t * 0.9}>
            <mesh castShadow>
              <sphereGeometry args={[ballRadius]} />
              <meshStandardMaterial
                color={mode === 'baseball' ? '#f8fafc' : '#ef4444'}
                emissive={mode === 'baseball' ? '#e2e8f0' : '#f87171'}
                emissiveIntensity={0.35}
              />
            </mesh>
          </Trail>
        </RigidBody>
      </Physics>

      {landingPos && <LandingMarker x={landingPos.x} z={landingPos.z} />}

      <Grid
        args={[400, 400]}
        cellSize={5}
        cellThickness={0.35}
        cellColor="#334155"
        sectionSize={25}
        sectionThickness={0.9}
        sectionColor="#475569"
        fadeDistance={300}
        position={[0, 0.02, 0]}
      />

      <OrbitControls
        target={mode === 'baseball' ? [34, 4, 35] : [20, 5, 0]}
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.05}
      />
      <Stars radius={500} depth={80} count={3500} factor={3} fade />
    </>
  );
}

export function CanvasScene() {
  const [mode, setMode] = useState<Mode>('projectile');
  const [isLaunched, setIsLaunched] = useState(false);
  const [hasLanded, setHasLanded] = useState(false);

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
  const [finalResult, setFinalResult] = useState<any>(null);
  const [landingPos, setLandingPos] = useState<{ x: number; z: number } | null>(null);

  const mphToMs = (mph: number) => mph * 0.44704;
  const msToMph = (ms: number) => ms / 0.44704;
  const metersToFeet = (m: number) => m * 3.28084;

  const launch = () => {
    if (!isLaunched) {
      setIsLaunched(true);
      setHasLanded(false);
      setFinalResult(null);
      setLandingPos(null);
    }
  };

  const reset = () => {
    setIsLaunched(false);
    setHasLanded(false);
    setFinalResult(null);
    setLandingPos(null);
    setStats({ distance: 0, height: 0, maxHeight: 0, time: 0 });
  };

  const handleLanded = (finalStats: any, pos: { x: number; z: number }) => {
    setHasLanded(true);
    setFinalResult(finalStats);
    setLandingPos(pos);
  };

  const getOutcome = () => {
    if (!finalResult) return '—';
    const distFt = metersToFeet(finalResult.distance);

    if (angle < 5) return 'Ground Ball';
    if (angle < 17) return 'Line Drive';
    if (distFt >= 380) return 'Home Run';
    if (distFt >= 320) return 'Deep Fly Ball';
    if (distFt >= 250) return 'Fly Ball';
    return 'Infield / Short';
  };

  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas camera={{ position: [-25, 12, -25], fov: 45 }} style={{ width: '100%', height: '100%' }}>
        <SceneContent
          mode={mode}
          isLaunched={isLaunched}
          speed={speedMs}
          angle={angle}
          sprayAngle={sprayAngle}
          ballRadius={ballRadius}
          onStatsUpdate={setStats}
          onLanded={handleLanded}
          landingPos={landingPos}
        />
      </Canvas>

      {/* Control Panel */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          backgroundColor: 'rgba(0,0,0,0.93)',
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

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 13, color: '#a1a1aa', display: 'block', marginBottom: 6 }}>Mode</label>
          <select
            value={mode}
            onChange={(e) => {
              const newMode = e.target.value as Mode;
              setMode(newMode);
              reset();
              if (newMode === 'baseball') {
                setSpeedMs(mphToMs(95));
                setAngle(25);
                setBallRadius(0.037);
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

        {mode === 'projectile' && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#71717a', marginBottom: 10 }}>Ball</p>
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
        )}

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
                <span style={{ fontFamily: 'monospace' }}>
                  {metersToFeet(hasLanded && finalResult ? finalResult.distance : stats.distance).toFixed(0)} ft
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Max Height</span>
                <span style={{ fontFamily: 'monospace' }}>
                  {metersToFeet(hasLanded && finalResult ? finalResult.maxHeight : stats.maxHeight).toFixed(0)} ft
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Hang Time</span>
                <span style={{ fontFamily: 'monospace' }}>
                  {(hasLanded && finalResult ? finalResult.time : stats.time).toFixed(2)} s
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid #3f3f46' }}>
                <span style={{ color: '#a1a1aa' }}>Result</span>
                <span style={{ fontFamily: 'monospace', color: hasLanded ? '#4ade80' : '#a1a1aa' }}>
                  {hasLanded ? getOutcome() : 'In flight…'}
                </span>
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