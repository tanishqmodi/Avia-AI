import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import Runway from './Runway';
import CameraNode from './CameraNode';
import { useStore } from '../../store/useStore';

export default function Scene() {
  const { cameras } = useStore();
  
  return (
    <div className="absolute inset-0 w-full h-full z-0">
      <Canvas camera={{ position: [0, 20, 40], fov: 45 }}>
        <color attach="background" args={['#000000']} />
        
        <ambientLight intensity={0.2} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} color="#ffffff" />
        <pointLight position={[-10, 5, -10]} intensity={2} color="#00f3ff" distance={50} />

        <Grid
          position={[0, -0.01, 0]}
          args={[100, 100]}
          cellSize={1}
          cellThickness={1}
          cellColor="#1a1a1a"
          sectionSize={10}
          sectionThickness={1.5}
          sectionColor="#333333"
          fadeDistance={50}
          fadeStrength={1.5}
        />

        <Runway />

        {/* Dynamic Camera Nodes */}
        {cameras.map((cam, i) => {
          let pos: [number, number, number] = [0, 0, 0];
          if (cam.zone === 'Runway') pos = [i * 10 - 15, 0, 10];
          else if (cam.zone === 'Taxiway') pos = [i * 8 - 10, 0, -15];
          else pos = [i * 12 - 20, 0, 0];

          return (
            <CameraNode 
              key={cam.id} 
              id={cam.id} 
              position={pos} 
              label={cam.name} 
            />
          );
        })}

        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={10}
          maxDistance={80}
        />
      </Canvas>
    </div>
  );
}
