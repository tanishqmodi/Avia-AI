import { useRef } from 'react';
import * as THREE from 'three';

export default function Runway() {
  const runwayGroup = useRef<THREE.Group>(null);

  return (
    <group ref={runwayGroup} position={[0, 0, 0]}>
      {/* Main Asphalt Strip */}
      <mesh receiveShadow position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 40]} />
        <meshStandardMaterial color="#080808" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Centerline Dashes */}
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh
          key={`dash-${i}`}
          position={[0, 0.06, -18 + i * 4]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.2, 2]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}

      {/* Runway Edge Lines */}
      <mesh position={[-3.8, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.1, 40]} />
        <meshBasicMaterial color="#ffffff" opacity={0.5} transparent />
      </mesh>
      <mesh position={[3.8, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.1, 40]} />
        <meshBasicMaterial color="#ffffff" opacity={0.5} transparent />
      </mesh>

      {/* Threshold Markings */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh
          key={`thresh-s-${i}`}
          position={[-2.5 + i, 0.06, 18]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.4, 3]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh
          key={`thresh-n-${i}`}
          position={[-2.5 + i, 0.06, -18]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.4, 3]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}
