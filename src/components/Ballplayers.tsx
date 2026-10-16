import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import {
  BATTER_COLOR,
  FIELDER_COLOR,
  createPlaySim,
  livePlay,
  stepPlaySim,
  yawFacing,
  type PlaySim,
} from '../baseball/playScript';

function Blob({ color, cap }: { color: string; cap: string }) {
  return (
    <group>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 16]} />
        <meshBasicMaterial color="#04140c" transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.7, 18, 14]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.88, 0]}>
        <sphereGeometry args={[0.36, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshStandardMaterial color={cap} roughness={0.4} />
      </mesh>
      {/* Face sits on local +z. yawFacing points that axis along the run. */}
      <mesh position={[0, 1.86, 0.28]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

/** Fielders, catcher, and the batter. Decorative only: no colliders, so the ball's call does not change. */
export function Ballplayers() {
  const sim = useRef<PlaySim>(createPlaySim());
  const starters = useMemo(() => createPlaySim().actors, []);
  const nodes = useRef<Record<string, Group | null>>({});
  const glove = useRef<Mesh>(null);
  const toss = useRef<Mesh>(null);

  useFrame((_, delta) => {
    const live = livePlay;
    const play = sim.current;
    stepPlaySim(play, live, delta);
    for (const actor of play.actors) {
      const node = nodes.current[actor.name];
      if (!node) continue;
      const bob = actor.moving ? Math.sin(live.time * 14 + actor.homeX) * 0.05 : 0;
      node.position.set(actor.x, bob, actor.z);
      if (actor.faceX !== 0 || actor.faceZ !== 0) node.rotation.y = yawFacing(actor.faceX, actor.faceZ);
    }

    const holder = play.holding ? play.actors.find((actor) => actor.name === play.holding) : undefined;
    if (glove.current) {
      glove.current.visible = Boolean(holder);
      if (holder) {
        const reach = Math.hypot(holder.faceX, holder.faceZ) || 1;
        glove.current.position.set(
          holder.x + (holder.faceX / reach) * 0.85,
          1.45,
          holder.z + (holder.faceZ / reach) * 0.85,
        );
      }
    }
    if (toss.current) {
      const ball = play.throwBall;
      toss.current.visible = ball.active;
      toss.current.position.set(ball.x, ball.y, ball.z);
    }
  });

  return (
    <group>
      {starters.map((actor) => (
        <group
          key={actor.name}
          ref={(node) => {
            nodes.current[actor.name] = node;
          }}
          position={[actor.x, 0, actor.z]}
          rotation={[0, yawFacing(actor.faceX, actor.faceZ), 0]}
          scale={actor.role === 'hit' ? 1.18 : 1}
        >
          <Blob
            color={actor.role === 'hit' ? BATTER_COLOR : FIELDER_COLOR}
            cap={actor.role === 'hit' ? '#7c2d12' : '#1d4ed8'}
          />
        </group>
      ))}
      <mesh ref={glove} visible={false}>
        <sphereGeometry args={[0.16, 12, 10]} />
        <meshStandardMaterial color="#f8fafc" emissive="#e2e8f0" emissiveIntensity={0.4} />
      </mesh>
      <mesh ref={toss} visible={false}>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshStandardMaterial color="#f8fafc" emissive="#fef3c7" emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}
