import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Physics, RigidBody } from '@react-three/rapier';
import { useState } from 'react';

export function CanvasScene() {
  const [projectilePosition, setProjectilePosition] = useState([0, 5, 0]);

  return (
    <Canvas camera={{ position: [0, 10, 20], fov: 50 }} style={{ background: '#0a0a0a' }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />

      <Physics gravity={[0, -9.81, 0]}>
        {/* Ground */}
        <RigidBody type="fixed" position={[0, -1, 0]}>
          <mesh receiveShadow>
            <boxGeometry args={[50, 2, 50]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        </RigidBody>

        {/* Projectile (simple sphere) */}
        <RigidBody position={projectilePosition as [number, number, number]} colliders="ball">
          <mesh castShadow>
            <sphereGeometry args={[0.5]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
          </mesh>
        </RigidBody>
      </Physics>

      <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
      <Stars radius={300} depth={60} count={5000} factor={4} saturation={0} fade speed={1} />
    </Canvas>
  );
}