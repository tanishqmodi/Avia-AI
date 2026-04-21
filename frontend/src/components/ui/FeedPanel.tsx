import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, X, WifiOff } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useCameraStream } from '../../hooks/useCameraStream';

export default function FeedPanel() {
  const { activeCameraId, setActiveCamera, cameras } = useStore();
  const { data, isConnected } = useCameraStream(activeCameraId);
  const [expanded, setExpanded] = useState(false);

  const activeCam = cameras.find(c => c.id === activeCameraId);
  const activeModel = activeCam ? activeCam.model_type : '';
  const camName = activeCam ? activeCam.name : '';

  useEffect(() => {
    if (!activeCameraId) setExpanded(false);
  }, [activeCameraId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeCameraId) return;
      if (e.key === 'Escape') setActiveCamera(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeCameraId, setActiveCamera]);

  const size = expanded
    ? { width: 'min(1100px, 92vw)', height: 'min(680px, 82vh)' }
    : { width: 'min(600px, 92vw)', height: 'min(380px, 60vh)' };

  return (
    <AnimatePresence>
      {activeCameraId && (
        <motion.div
          key="feed-panel"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0, ...size }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="absolute bottom-4 right-1/2 translate-x-1/2 card flex flex-col z-20 pointer-events-auto max-w-[92vw] max-h-[82vh] overflow-hidden"
          role="dialog"
          aria-label={`Live camera feed ${camName}`}
        >
          <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] bg-black/40 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isConnected ? 'bg-red-400 animate-pulse shadow-[0_0_8px_rgba(248,113,113,0.6)]' : 'bg-white/30'
                }`}
                aria-label={isConnected ? 'Live' : 'Disconnected'}
              />
              <div className="label-kicker">Live feed</div>
              <span className="text-sm text-white/90 font-medium truncate">{camName}</span>
              {activeModel && (
                <span className="text-[10px] mono-data uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/60 flex-shrink-0">
                  {activeModel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-white/40 hover:text-white transition-colors p-1.5 rounded hover:bg-white/5"
                aria-label={expanded ? 'Restore feed size' : 'Expand feed'}
                title={expanded ? 'Restore' : 'Expand'}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={() => setActiveCamera(null)}
                className="text-white/40 hover:text-white transition-colors p-1.5 rounded hover:bg-white/5"
                aria-label="Close feed"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 relative bg-black overflow-hidden min-h-0">
            {!isConnected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/40 text-xs">
                <WifiOff size={22} />
                <span className="mono-data uppercase tracking-widest">Connecting to feed...</span>
              </div>
            )}

            {data?.frame && (
              <img
                src={`data:image/jpeg;base64,${data.frame}`}
                alt={`Camera feed ${camName}`}
                className="absolute inset-0 w-full h-full object-contain"
              />
            )}

            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-[2px] bg-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.5)] animate-[scanline_4s_linear_infinite] pointer-events-none" />

            <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] mono-data bg-black/70 backdrop-blur px-2 py-1 rounded border border-white/10">
              <span className="text-white/50">FRAME</span>
              <span className="text-white/90">{data?.stats?.frame_count || 0}</span>
              <span className="text-white/20">·</span>
              <span className="text-white/50">FPS</span>
              <span className="text-cyan-300">{(data?.stats?.fps ?? 0).toFixed(1)}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
