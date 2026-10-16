import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Grid, Trail } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import {
  FOUL_POLE_M,
  WALL_HEIGHT_M,
  fenceCross,
  fenceMetersForSpray,
  fenceRadiusMeters,
  fieldPoint,
  isBarrel,
  isHardHit,
  scorePlay,
  statcastHitType,
} from '../baseball/scoring';
import type { PlayKind, Score } from '../baseball/scoring';
import { MLB_PARK_COUNT, homeRunsByPark } from '../baseball/ballparks';
import type { ParkResult, TrajectoryPoint } from '../baseball/ballparks';
import { readHistory, rememberLaunch, writeHistory } from '../baseball/history';
import type { SavedLaunch } from '../baseball/history';
import { BallparkShell } from './BallparkShell';

type Mode = 'projectile' | 'baseball';

type LiveStats = {
  distance: number;
  height: number;
  maxHeight: number;
  time: number;
};

type FlightSnapshot = {
  speedMs: number;
  angle: number;
  sprayAngle: number;
  ballRadius: number;
  mode: Mode;
};

const BASE_DISTANCE = 27.432; // 90 ft

type FlightFacts = {
  clearedFence: boolean;
  hitWall: boolean;
  clearanceHeightM: number | null;
  trajectory: TrajectoryPoint[];
};

function SceneContent({
  mode,
  isLaunched,
  launchNonce,
  speed,
  angle,
  sprayAngle,
  ballRadius,
  onStatsUpdate,
  onLanded,
  landingPos,
  markKind,
}: {
  mode: Mode;
  isLaunched: boolean;
  launchNonce: number;
  speed: number;
  angle: number;
  sprayAngle: number;
  ballRadius: number;
  onStatsUpdate: (stats: LiveStats) => void;
  onLanded: (
    finalStats: LiveStats,
    pos: { x: number; z: number },
    flight: FlightFacts,
    nonce: number,
  ) => void;
  landingPos: { x: number; z: number } | null;
  markKind: PlayKind | null;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const hasLaunched = useRef(false);
  const hasLanded = useRef(false);
  const startTime = useRef(0);
  const maxHeightRef = useRef(0);
  const prevPos = useRef<{ x: number; y: number; z: number } | null>(null);
  const clearedFence = useRef(false);
  const hitWall = useRef(false);
  const clearanceHeight = useRef<number | null>(null);
  const trajectory = useRef<TrajectoryPoint[]>([]);
  const lastDist = useRef(0);
  const flightNonce = useRef(0);

  const launchY = ballRadius + 0.12;

  // 0° spray = center field (45° in our coordinate system)
  const getVelocity = useCallback(() => {
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
  }, [speed, angle, sprayAngle]);

  // Launch. launchNonce changes on every Launch and Reset, so a second flight
  // starts even when isLaunched is already true. Speed and angle here are the
  // snapshot from the click, not the live sliders.
  useEffect(() => {
    if (!isLaunched || !bodyRef.current) return;

    flightNonce.current = launchNonce;
    hasLaunched.current = false;
    hasLanded.current = false;
    bodyRef.current.setTranslation({ x: 0, y: launchY, z: 0 }, true);
    bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    prevPos.current = null;
    clearedFence.current = false;
    hitWall.current = false;
    clearanceHeight.current = null;
    trajectory.current = [];
    lastDist.current = 0;
    maxHeightRef.current = 0;
    startTime.current = performance.now();

    const timer = setTimeout(() => {
      if (!bodyRef.current) return;
      const vel = getVelocity();
      bodyRef.current.setTranslation({ x: 0, y: launchY, z: 0 }, true);
      bodyRef.current.setLinvel(vel, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      hasLaunched.current = true;
      hasLanded.current = false;
      startTime.current = performance.now();
      maxHeightRef.current = 0;
      prevPos.current = null;
      clearedFence.current = false;
      hitWall.current = false;
      clearanceHeight.current = null;
      trajectory.current = [];
      lastDist.current = 0;
    }, 50);

    return () => clearTimeout(timer);
  }, [isLaunched, launchNonce, getVelocity, launchY]);

  // Reset
  useEffect(() => {
    if (!isLaunched && bodyRef.current) {
      bodyRef.current.setTranslation({ x: 0, y: launchY, z: 0 }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      hasLaunched.current = false;
      hasLanded.current = false;
      prevPos.current = null;
      clearedFence.current = false;
      hitWall.current = false;
      clearanceHeight.current = null;
      trajectory.current = [];
      lastDist.current = 0;
    }
  }, [isLaunched, launchY]);

  // Physics + drag + landing
  useFrame((_, delta) => {
    if (!bodyRef.current || !isLaunched || !hasLaunched.current) return;

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

    if (mode === 'baseball' && !clearedFence.current && !hitWall.current && prevPos.current) {
      const prev = prevPos.current;
      const cross = fenceCross(prev.x, prev.y, prev.z, pos.x, pos.y, pos.z, ballRadius);
      if (cross?.cleared) {
        clearedFence.current = true;
        clearanceHeight.current = cross.clearanceHeightM;
      } else if (cross?.hitWall) {
        hitWall.current = true;
      }
    }
    prevPos.current = { x: pos.x, y: pos.y, z: pos.z };

    if (mode === 'baseball' && !hasLanded.current && dist + 0.01 >= lastDist.current) {
      trajectory.current.push({ distM: dist, bottomM: pos.y - ballRadius });
      lastDist.current = dist;
    }

    const flightFacts = (): FlightFacts => ({
      clearedFence: clearedFence.current,
      hitWall: hitWall.current,
      clearanceHeightM: clearanceHeight.current,
      trajectory: trajectory.current.slice(),
    });

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
    onLanded(currentStats, { x: landX, z: landZ }, flightFacts(), flightNonce.current);
  }

  // Safety net only
  if (time > 8.0 && !hasLanded.current) {
    const landX = pos.x;
    const landZ = pos.z;

    bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setTranslation({ x: landX, y: ballRadius, z: landZ }, true);

    hasLanded.current = true;
    onLanded(currentStats, { x: landX, z: landZ }, flightFacts(), flightNonce.current);
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
      const theta = (i / segments) * (Math.PI / 2); // 0° left-field line → 90° right-field line
      points.push(fieldPoint(theta, fenceRadiusMeters(theta)));
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
    const inward = Math.hypot(midX, midZ) || 1;
    const nx = midX / inward;
    const nz = midZ / inward;

    return (
      <group>
        <RigidBody type="fixed" position={[midX, WALL_HEIGHT_M / 2, midZ]}>
          <mesh rotation={[0, rot, 0]}>
            <boxGeometry args={[0.32, WALL_HEIGHT_M, length + 0.05]} />
            <meshStandardMaterial color="#14532d" />
          </mesh>
        </RigidBody>
        <mesh position={[midX + nx * 0.4, WALL_HEIGHT_M + 0.1, midZ + nz * 0.4]} rotation={[0, rot, 0]}>
          <boxGeometry args={[0.45, 0.18, length + 0.08]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
      </group>
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

  const markColor =
    markKind === 'hr' ? '#facc15' : markKind === 'hit' ? '#4ade80' : markKind === 'foul' ? '#fb923c' : '#e2e8f0';

  return (
    <>
      <ambientLight intensity={mode === 'baseball' ? 0.32 : 0.5} />
      <directionalLight position={[50, 60, 30]} intensity={mode === 'baseball' ? 0.55 : 1.3} castShadow />

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
            <mesh position={[FOUL_POLE_M / 2, 0.04, 0]} rotation={[0, 0, 0]}>
              <boxGeometry args={[FOUL_POLE_M, 0.06, 0.35]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>

            {/* Right field line (along +Z) */}
            <mesh position={[0, 0.04, FOUL_POLE_M / 2]} rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[FOUL_POLE_M, 0.06, 0.35]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>

            {/* Smooth arc fence */}
            {FenceArc.slice(0, -1).map((start, i) => (
              <FenceSegment key={i} start={start} end={FenceArc[i + 1]} />
            ))}

            {/* Foul Poles */}
            <FoulPole position={[FOUL_POLE_M, 0, 0]} />
            <FoulPole position={[0, 0, FOUL_POLE_M]} />
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
          <Trail key={launchNonce} width={0.9} length={18} color="#fb7185" attenuation={(t) => t * 0.9}>
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

      {mode === 'baseball' && <BallparkShell />}

      {landingPos && mode === 'projectile' && <LandingMarker x={landingPos.x} z={landingPos.z} />}
      {landingPos && mode === 'baseball' && (
        <mesh position={[landingPos.x, 0.12, landingPos.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 2.8, 40]} />
          <meshStandardMaterial color={markColor} emissive={markColor} emissiveIntensity={0.55} />
        </mesh>
      )}

      {mode === 'baseball' ? (
        <color attach="background" args={['#020617']} />
      ) : (
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
      )}

      <OrbitControls
        target={mode === 'baseball' ? [34, 4, 35] : [20, 5, 0]}
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.05}
      />
      {mode !== 'baseball' && <Stars radius={500} depth={80} count={3500} factor={3} fade />}
    </>
  );
}

function ParkList({ title, parks }: { title: string; parks: ParkResult[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#a1a1aa', marginBottom: 4 }}>
        {title}
      </div>
      {parks.length === 0 ? (
        <div style={{ fontSize: 12, color: '#71717a' }}>None</div>
      ) : (
        parks.map((park) => (
          <div
            key={park.name}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, lineHeight: 1.35, padding: '3px 0' }}
          >
            <span style={{ color: park.homeRun ? '#facc15' : '#e4e4e7' }}>
              {park.name}
              <span style={{ color: '#71717a' }}> · {park.team}</span>
            </span>
            <span style={{ color: '#71717a', fontFamily: 'monospace', flexShrink: 0 }}>
              {Math.round(park.fenceFt)} ft{park.wallFt >= 12 ? `, ${Math.round(park.wallFt)} ft wall` : ''}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function contactLabel(barrel: boolean, hardHit: boolean) {
  if (barrel) return 'Barrel';
  if (hardHit) return 'Hard hit';
  return 'Normal';
}

function HistoryList({
  launches,
  openId,
  parksId,
  onToggle,
  onToggleParks,
}: {
  launches: SavedLaunch[];
  openId: string | null;
  parksId: string | null;
  onToggle: (id: string) => void;
  onToggleParks: (id: string) => void;
}) {
  const metersToFeet = (meters: number) => meters * 3.28084;
  const msToMph = (ms: number) => ms / 0.44704;

  return (
    <div style={{ borderTop: '1px solid #3f3f46', marginTop: 14, paddingTop: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#71717a', marginBottom: 8 }}>
        Previous launches ({launches.length}/10)
      </div>
      {launches.length === 0 ? (
        <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.45 }}>
          Finished flights in this tab show up here, including the ballpark breakdown.
        </div>
      ) : (
        launches.map((launch) => {
          const open = openId === launch.id;
          const when = new Date(launch.at).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
          });
          const distance =
            launch.mode === 'baseball'
              ? `${metersToFeet(launch.distanceM).toFixed(0)} ft`
              : `${launch.distanceM.toFixed(1)} m`;
          const setup =
            launch.mode === 'baseball'
              ? `${msToMph(launch.speedMs).toFixed(0)} mph · ${launch.angle}°`
              : `${launch.speedMs.toFixed(1)} m/s · ${launch.angle}°`;
          const outcome = launch.play?.result ?? 'Landed';
          const homeRuns = launch.parks?.filter((park) => park.homeRun) ?? [];
          const stayedIn = launch.parks?.filter((park) => !park.homeRun) ?? [];
          const parksOpen = parksId === launch.id;

          return (
            <div key={launch.id} style={{ borderTop: '1px solid #27272a', padding: '8px 0' }}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onToggle(launch.id)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{when}</span>
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                </div>
                <div style={{ color: '#a1a1aa', marginTop: 2, lineHeight: 1.35 }}>
                  {launch.mode === 'baseball' ? 'Baseball' : 'Projectile'} · {setup} · {outcome} · {distance}
                </div>
              </button>
              {open && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  {launch.mode === 'baseball' ? (
                    <>
                      <HistoryRow label="Exit velocity" value={`${msToMph(launch.speedMs).toFixed(0)} mph`} />
                      <HistoryRow label="Launch angle" value={`${launch.angle}°`} />
                      <HistoryRow label="Spray" value={`${launch.sprayAngle}°`} />
                      <HistoryRow label="Hit type" value={launch.play?.hitType ?? '—'} />
                      <HistoryRow
                        label="Contact"
                        value={launch.play ? contactLabel(launch.play.barrel, launch.play.hardHit) : '—'}
                      />
                      <HistoryRow
                        label="Fence"
                        value={launch.play ? `${metersToFeet(launch.play.fenceM).toFixed(0)} ft` : '—'}
                      />
                    </>
                  ) : (
                    <>
                      <HistoryRow label="Speed" value={`${launch.speedMs.toFixed(1)} m/s`} />
                      <HistoryRow label="Angle" value={`${launch.angle}°`} />
                      <HistoryRow label="Radius" value={`${launch.ballRadius.toFixed(2)} m`} />
                    </>
                  )}
                  <HistoryRow label="Distance" value={distance} />
                  <HistoryRow
                    label="Max height"
                    value={
                      launch.mode === 'baseball'
                        ? `${metersToFeet(launch.maxHeightM).toFixed(0)} ft`
                        : `${launch.maxHeightM.toFixed(1)} m`
                    }
                  />
                  <HistoryRow label="Hang time" value={`${launch.hangTimeS.toFixed(2)} s`} />
                  {launch.play && (
                    <p style={{ color: '#d4d4d8', lineHeight: 1.45, margin: '8px 0 0' }}>{launch.play.reason}</p>
                  )}
                  {launch.parks && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        aria-expanded={parksOpen}
                        onClick={() => onToggleParks(launch.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          background: '#27272a',
                          color: 'white',
                          border: '1px solid #3f3f46',
                          borderRadius: 8,
                          padding: '8px 10px',
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'left',
                        }}
                      >
                        <span>
                          Home Run in {homeRuns.length}/{launch.parks.length || MLB_PARK_COUNT} Ballparks
                        </span>
                        <span aria-hidden="true">{parksOpen ? '▾' : '▸'}</span>
                      </button>
                      {parksOpen && (
                        <div style={{ marginTop: 8 }}>
                          <ParkList title="Home run" parks={homeRuns} />
                          <ParkList title="Not a home run" parks={stayedIn} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function HistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
      <span style={{ color: '#a1a1aa' }}>{label}</span>
      <span style={{ fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

export function CanvasScene() {
  const [mode, setMode] = useState<Mode>('baseball');
  const [isLaunched, setIsLaunched] = useState(false);
  const [hasLanded, setHasLanded] = useState(false);
  const [launchNonce, setLaunchNonce] = useState(0);
  const activeNonce = useRef(0);

  const [speedMs, setSpeedMs] = useState(95 * 0.44704);
  const [angle, setAngle] = useState(25);
  const [sprayAngle, setSprayAngle] = useState(0);
  const [ballRadius, setBallRadius] = useState(0.037);

  const [stats, setStats] = useState({
    distance: 0,
    height: 0,
    maxHeight: 0,
    time: 0,
  });
  const [finalResult, setFinalResult] = useState<LiveStats | null>(null);
  const [landingPos, setLandingPos] = useState<{ x: number; z: number } | null>(null);
  const [play, setPlay] = useState<Score | null>(null);
  const [parkReport, setParkReport] = useState<ParkResult[] | null>(null);
  const [parksOpen, setParksOpen] = useState(false);
  const [flightInputs, setFlightInputs] = useState<FlightSnapshot | null>(null);
  const flightInputsRef = useRef<FlightSnapshot | null>(null);
  const [history, setHistory] = useState<SavedLaunch[]>(() => readHistory());
  const [openLaunchId, setOpenLaunchId] = useState<string | null>(null);
  const [historyParksFor, setHistoryParksFor] = useState<string | null>(null);

  useEffect(() => {
    writeHistory(history);
  }, [history]);

  const mphToMs = (mph: number) => mph * 0.44704;
  const msToMph = (ms: number) => ms / 0.44704;
  const metersToFeet = (m: number) => m * 3.28084;

  const clearFlightReadout = () => {
    setHasLanded(false);
    setFinalResult(null);
    setLandingPos(null);
    setPlay(null);
    setParkReport(null);
    setParksOpen(false);
    setStats({ distance: 0, height: 0, maxHeight: 0, time: 0 });
  };

  const launch = () => {
    const next = activeNonce.current + 1;
    activeNonce.current = next;
    const snapshot: FlightSnapshot = { speedMs, angle, sprayAngle, ballRadius, mode };
    flightInputsRef.current = snapshot;
    setFlightInputs(snapshot);
    setLaunchNonce(next);
    setIsLaunched(true);
    clearFlightReadout();
  };

  const reset = () => {
    const next = activeNonce.current + 1;
    activeNonce.current = next;
    flightInputsRef.current = null;
    setFlightInputs(null);
    setLaunchNonce(next);
    setIsLaunched(false);
    clearFlightReadout();
  };

  const handleLanded = (
    finalStats: LiveStats,
    pos: { x: number; z: number },
    flight: FlightFacts,
    nonce: number,
  ) => {
    if (nonce !== activeNonce.current) return;
    const inputs = flightInputsRef.current;
    if (!inputs) return;

    const scored =
      inputs.mode === 'baseball'
        ? scorePlay({
            exitVeloMps: inputs.speedMs,
            launchAngleDeg: inputs.angle,
            landingX: pos.x,
            landingZ: pos.z,
            hangTimeS: finalStats.time,
            clearedFence: flight.clearedFence,
            hitWall: flight.hitWall,
            clearanceHeightM: flight.clearanceHeightM,
          })
        : null;
    const parks = inputs.mode === 'baseball' ? homeRunsByPark(pos.x, pos.z, flight.trajectory) : null;

    setHasLanded(true);
    setFinalResult(finalStats);
    setLandingPos(pos);
    setPlay(scored);
    setParkReport(parks);
    setParksOpen(false);
    setHistory((existing) =>
      rememberLaunch(existing, {
        id: `${nonce}-${finalStats.time.toFixed(3)}-${inputs.mode}`,
        at: Date.now(),
        mode: inputs.mode,
        speedMs: inputs.speedMs,
        angle: inputs.angle,
        sprayAngle: inputs.sprayAngle,
        ballRadius: inputs.ballRadius,
        distanceM: finalStats.distance,
        maxHeightM: finalStats.maxHeight,
        hangTimeS: finalStats.time,
        play: scored,
        parks,
      }),
    );
  };

  const homeRunParks = parkReport?.filter((park) => park.homeRun) ?? [];
  const otherParks = parkReport?.filter((park) => !park.homeRun) ?? [];

  const flightSpeed = flightInputs?.speedMs ?? speedMs;
  const flightAngle = flightInputs?.angle ?? angle;
  const flightSpray = flightInputs?.sprayAngle ?? sprayAngle;
  const flightRadius = flightInputs?.ballRadius ?? ballRadius;
  const exitMph = msToMph(flightSpeed);
  const hitType = play?.hitType ?? statcastHitType(flightAngle);
  const contact = (play ? play.barrel : isBarrel(exitMph, flightAngle))
    ? 'Barrel'
    : (play ? play.hardHit : isHardHit(exitMph))
      ? 'Hard hit'
      : 'Normal';
  const fenceMeters = hasLanded && play ? play.fenceM : fenceMetersForSpray(flightSpray);
  const resultColor =
    !hasLanded || !play
      ? '#a1a1aa'
      : play.kind === 'hr'
        ? '#facc15'
        : play.kind === 'hit'
          ? '#4ade80'
          : play.kind === 'foul'
            ? '#fb923c'
            : '#e2e8f0';

  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas camera={{ position: [-25, 12, -25], fov: 45 }} style={{ width: '100%', height: '100%' }}>
        <SceneContent
          mode={mode}
          isLaunched={isLaunched}
          launchNonce={launchNonce}
          speed={flightSpeed}
          angle={flightAngle}
          sprayAngle={flightSpray}
          ballRadius={flightRadius}
          onStatsUpdate={setStats}
          onLanded={handleLanded}
          landingPos={landingPos}
          markKind={play?.kind ?? null}
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
          width: 360,
          maxHeight: 'calc(100% - 40px)',
          overflowY: 'auto',
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
              style={{ width: '100%', accentColor: '#22d3ee' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={launch}
            style={{
              flex: 1,
              padding: '10px 0',
              background: '#dc2626',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontWeight: 500,
              cursor: 'pointer',
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
        <p style={{ color: '#71717a', fontSize: 11, lineHeight: 1.45, margin: '-8px 0 16px' }}>
          Change the sliders and launch again. The ball resets on its own, and the last ten finished flights stay in this tab.
        </p>

        <div style={{ borderTop: '1px solid #3f3f46', paddingTop: 14, fontSize: 13 }}>
          {mode === 'baseball' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Exit Velocity</span>
                <span style={{ fontFamily: 'monospace' }}>{msToMph(flightSpeed).toFixed(0)} mph</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Launch Angle</span>
                <span style={{ fontFamily: 'monospace' }}>{flightAngle}°</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Hit type</span>
                <span style={{ fontFamily: 'monospace' }}>{hitType}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Contact</span>
                <span style={{ fontFamily: 'monospace' }}>{contact}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#a1a1aa' }}>Fence</span>
                <span style={{ fontFamily: 'monospace' }}>{metersToFeet(fenceMeters).toFixed(0)} ft</span>
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
                <span style={{ fontFamily: 'monospace', color: resultColor }}>
                  {!isLaunched ? 'Ready' : hasLanded && play ? play.result : 'In flight…'}
                </span>
              </div>
              {hasLanded && play && (
                <p style={{ color: '#d4d4d8', fontSize: 12, lineHeight: 1.45, margin: '10px 0 0' }}>{play.reason}</p>
              )}
              {hasLanded && parkReport && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    aria-expanded={parksOpen}
                    onClick={() => setParksOpen((open) => !open)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      background: '#27272a',
                      color: 'white',
                      border: '1px solid #3f3f46',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontSize: 13,
                      textAlign: 'left',
                    }}
                  >
                    <span>Home Run in {homeRunParks.length}/{MLB_PARK_COUNT} Ballparks</span>
                    <span aria-hidden="true">{parksOpen ? '▾' : '▸'}</span>
                  </button>
                  {parksOpen && (
                    <div style={{ marginTop: 8 }}>
                      <ParkList title="Home run" parks={homeRunParks} />
                      <ParkList title="Not a home run" parks={otherParks} />
                    </div>
                  )}
                </div>
              )}
              <p style={{ color: '#71717a', fontSize: 11, lineHeight: 1.45, margin: '10px 0 0' }}>
                A home run here has to clear this fence (about 340 ft down the lines, 400 ft in center, 13 ft wall). The 30 ballparks are the real 2026 MLB fences, scored from this same flight. Hit type is the Statcast launch-angle band. Balls that stay in are scored against an average MLB defense: typical depths, a 27 ft/s sprint, and a 0.45 s jump. The ring marks where it came down.
              </p>
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
        <HistoryList
          launches={history}
          openId={openLaunchId}
          parksId={historyParksFor}
          onToggle={(id) => {
            setOpenLaunchId((current) => (current === id ? null : id));
            setHistoryParksFor(null);
          }}
          onToggleParks={(id) => setHistoryParksFor((current) => (current === id ? null : id))}
        />
      </div>
    </div>
  );
}