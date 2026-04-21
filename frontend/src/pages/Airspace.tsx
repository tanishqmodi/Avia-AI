import { Suspense } from 'react';
import { motion } from 'framer-motion';
import Scene from '../components/3d/Scene';
import Sidebar from '../components/ui/Sidebar';
import FeedPanel from '../components/ui/FeedPanel';
import AlertLog from '../components/ui/AlertLog';

export default function Airspace() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0"
    >
      <div className="absolute inset-0 z-0">
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center text-white/40 font-mono text-xs tracking-widest">
            INITIALIZING 3D ENGINE...
          </div>
        }>
          <Scene />
        </Suspense>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none p-8">
        <div className="relative w-full h-full pointer-events-none">
          <Sidebar />
          <FeedPanel />
          <AlertLog />
        </div>
      </div>
    </motion.div>
  );
}
