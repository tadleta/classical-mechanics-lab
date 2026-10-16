import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fenceRadiusMeters, fieldPoint } from '../baseball/scoring';
import {
  GRASS_BAND_WIDTH,
  MAX_SEATS,
  facadeBlocks,
  grassBands,
  lightTowerPositions,
  scoreboardAnchor,
  seatLayout,
} from '../baseball/stadiumLayout';

const SEAT_COLORS = ['#1d4ed8', '#1e3a8a', '#b91c1c', '#7f1d1d', '#e2e8f0', '#334155', '#0369a1'];

function SeatBowl() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const seats = useMemo(() => seatLayout(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    seats.forEach((seat, index) => {
      dummy.position.set(seat.x, seat.y, seat.z);
      dummy.lookAt(0, seat.y, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.set(SEAT_COLORS[index % SEAT_COLORS.length]);
      mesh.setColorAt(index, color);
    });

    mesh.count = seats.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [color, dummy, seats]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_SEATS]} frustumCulled={false}>
      <boxGeometry args={[1.8, 0.4, 1.2]} />
      <meshStandardMaterial color="#ffffff" roughness={0.85} />
    </instancedMesh>
  );
}

function WarningTrack() {
  const segments = useMemo(() => {
    const points: [number, number, number][] = [];
    const count = 48;
    for (let i = 0; i <= count; i++) {
      const theta = (i / count) * (Math.PI / 2);
      points.push(fieldPoint(theta, fenceRadiusMeters(theta)));
    }
    return points;
  }, []);

  return (
    <>
      {segments.slice(0, -1).map((start, index) => {
        const end = segments[index + 1];
        const midX = (start[0] + end[0]) / 2;
        const midZ = (start[2] + end[2]) / 2;
        const dx = end[0] - start[0];
        const dz = end[2] - start[2];
        const length = Math.hypot(dx, dz);
        const rot = Math.atan2(dx, dz);
        const inward = Math.hypot(midX, midZ) || 1;
        return (
          <mesh
            key={index}
            position={[midX - (midX / inward) * 3.2, 0.05, midZ - (midZ / inward) * 3.2]}
            rotation={[0, rot, 0]}
          >
            <boxGeometry args={[5.2, 0.05, length + 0.2]} />
            <meshStandardMaterial color="#a16207" roughness={1} />
          </mesh>
        );
      })}
    </>
  );
}

function GrassStripes() {
  const bands = useMemo(() => grassBands(), []);

  return (
    <>
      {bands.map(({ points: segments }, band) =>
        segments.slice(0, -1).map((start, index) => {
          const end = segments[index + 1];
          const midX = (start[0] + end[0]) / 2;
          const midZ = (start[2] + end[2]) / 2;
          const dx = end[0] - start[0];
          const dz = end[2] - start[2];
          const length = Math.hypot(dx, dz);
          const rot = Math.atan2(dx, dz);
          return (
            <mesh key={`${band}-${index}`} position={[midX, 0.03, midZ]} rotation={[0, rot, 0]}>
              <boxGeometry args={[GRASS_BAND_WIDTH, 0.02, length + 0.15]} />
              <meshStandardMaterial color={band % 2 === 0 ? '#16a34a' : '#15803d'} />
            </mesh>
          );
        }),
      )}
    </>
  );
}

function LightTower({ position }: { position: [number, number, number] }) {
  const bank = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    bank.current?.lookAt(24, 4, 24);
  }, []);

  return (
    <group position={position}>
      <mesh position={[0, 18, 0]}>
        <cylinderGeometry args={[0.4, 0.75, 36, 8]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.45} />
      </mesh>
      <group ref={bank} position={[0, 36.2, 0]}>
        <mesh>
          <boxGeometry args={[7, 1.1, 1.6]} />
          <meshStandardMaterial color="#cbd5e1" emissive="#fff7ed" emissiveIntensity={0.85} />
        </mesh>
        {[-2.2, -0.7, 0.7, 2.2].map((x) => (
          <mesh key={x} position={[x, 0, 0.7]}>
            <sphereGeometry args={[0.38, 12, 12]} />
            <meshStandardMaterial color="#fffbeb" emissive="#fde68a" emissiveIntensity={2.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Scoreboard() {
  const ref = useRef<THREE.Group>(null);
  const [x, y, z] = scoreboardAnchor();

  useLayoutEffect(() => {
    // lookAt points the group's +z at home, so the screen sits on local +z.
    ref.current?.lookAt(0, 8, 0);
  }, []);

  return (
    <group ref={ref} position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[26, 12, 1.4]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, 0.6, 0.8]}>
        <boxGeometry args={[22, 7.2, 0.2]} />
        <meshStandardMaterial color="#052e16" emissive="#4ade80" emissiveIntensity={0.28} />
      </mesh>
      {[-7.2, 0, 7.2].map((xPos) => (
        <mesh key={xPos} position={[xPos, -4.2, 0.85]}>
          <boxGeometry args={[5.4, 1.3, 0.16]} />
          <meshStandardMaterial color="#78350f" emissive="#fbbf24" emissiveIntensity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function StadiumBowl() {
  const blocks = facadeBlocks();

  return (
    <>
      {blocks.map((block, index) => (
        <mesh key={index} position={[block.x, 12, block.z]} rotation={[0, block.rot, 0]}>
          <boxGeometry args={[8, 24, 13]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      ))}
      <mesh position={[58, 6, -34]}>
        <boxGeometry args={[100, 12, 8]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[-34, 6, 58]}>
        <boxGeometry args={[8, 12, 100]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[-26, 3.5, -26]}>
        <boxGeometry args={[34, 7, 34]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </>
  );
}

/** Decorative bowl, lights, and wall surroundings. None of these are colliders. */
export function BallparkShell() {
  const towers = lightTowerPositions();

  return (
    <group>
      <hemisphereLight args={['#0f172a', '#14532d', 0.45]} />
      <directionalLight position={[110, 60, -30]} intensity={0.7} color="#fff4d6" />
      <directionalLight position={[-30, 60, 110]} intensity={0.7} color="#fff4d6" />
      <directionalLight position={[130, 80, 130]} intensity={0.45} color="#fff7ed" />
      <fog attach="fog" args={['#020617', 150, 340]} />

      <mesh position={[40, 0.02, -28]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[140, 50]} />
        <meshStandardMaterial color="#052e16" />
      </mesh>
      <mesh position={[-28, 0.02, 40]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[50, 140]} />
        <meshStandardMaterial color="#052e16" />
      </mesh>
      <mesh position={[-30, 0.02, -30]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#052e16" />
      </mesh>

      <GrassStripes />
      <WarningTrack />
      <SeatBowl />
      <StadiumBowl />
      {towers.map((position) => (
        <LightTower key={position.join(',')} position={position} />
      ))}
      <Scoreboard />

      <mesh position={[26, 0.9, -5.5]}>
        <boxGeometry args={[14, 1.8, 3.2]} />
        <meshStandardMaterial color="#1c1917" />
      </mesh>
      <mesh position={[-5.5, 0.9, 26]}>
        <boxGeometry args={[3.2, 1.8, 14]} />
        <meshStandardMaterial color="#1c1917" />
      </mesh>

      <mesh position={[0.85, 0.07, -0.85]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.55, 0.03, 1.8]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-0.85, 0.07, 0.85]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.55, 0.03, 1.8]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}
