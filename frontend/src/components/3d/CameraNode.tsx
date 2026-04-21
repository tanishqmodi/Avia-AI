import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store/useStore';

interface CameraNodeProps {
  id: string;
  position: [number, number, number];
  label: string;
}

export default function CameraNode({ id, position, label }: CameraNodeProps) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { activeCameraId, setActiveCamera } = useStore();

  const isActive = activeCameraId === id;

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y += 0.02;
      ref.current.position.y = position[1] + 1 + Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.2;
    }
  });

  return (
    <group position={position}>
      {/* Connector Line to Ground */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1]} />
        <meshBasicMaterial color="#333" />
      </mesh>

      <mesh
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          setActiveCamera(isActive ? null : id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color={isActive || hovered ? '#00f3ff' : '#ffffff'}
          emissive={isActive || hovered ? '#00f3ff' : '#000000'}
          emissiveIntensity={isActive ? 2 : hovered ? 1 : 0}
          wireframe={!isActive}
        />
      </mesh>

      <Html position={[0, 1.5, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`px-2 py-1 text-xs font-mono border backdrop-blur-md whitespace-nowrap transition-colors duration-300 ${
          isActive 
            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(0,243,255,0.5)]' 
            : 'bg-black/50 border-white/20 text-white/70'
        }`}>
          {label}
        </div>
      </Html>
    </group>
  );
}
