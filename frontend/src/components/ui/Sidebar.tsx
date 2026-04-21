import { motion } from 'framer-motion';
import { Camera, Cpu, Activity, Plane } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { api } from '../../services/api';

export default function Sidebar() {
  const { cameras, globalStats, activeCameraId, setActiveCamera, fetchCameras } = useStore();

  const activeCam = cameras.find(c => c.id === activeCameraId);
  const activeModel = activeCam ? activeCam.model_type : 'yolo';

  const handleModelChange = async (model: string) => {
    if (!activeCameraId) return;
    await api.updateCamera(activeCameraId, { model_type: model });
    fetchCameras();
  };

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute top-0 left-0 w-[320px] card p-5 flex flex-col gap-6 pointer-events-auto max-h-[80vh]"
    >
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="label-kicker flex items-center gap-1.5">
            <Cpu size={12} /> AI Engine
          </div>
          {activeCam && (
            <span className="text-[10px] mono-data text-white/50 truncate max-w-[140px]">{activeCam.name}</span>
          )}
        </div>
        <div className="grid grid-cols-2 bg-black/40 border border-white/10 rounded-lg p-1 gap-1">
          <button
            disabled={!activeCameraId}
            onClick={() => handleModelChange('yolo')}
            className={`py-2 text-xs font-medium rounded-md transition-all ${
              activeModel === 'yolo' ? 'bg-white text-black shadow' : 'text-white/60 hover:text-white'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            YOLOv8
          </button>
          <button
            disabled={!activeCameraId}
            onClick={() => handleModelChange('rtdetr')}
            className={`py-2 text-xs font-medium rounded-md transition-all ${
              activeModel === 'rtdetr' ? 'bg-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.4)]' : 'text-white/60 hover:text-white'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            RT-DETR
          </button>
        </div>
        {!activeCameraId && (
          <p className="text-[11px] text-white/40 mt-2">Select a sensor to change engine</p>
        )}
      </section>

      <section className="flex-1 flex flex-col min-h-0">
        <div className="label-kicker flex items-center gap-1.5 mb-3">
          <Camera size={12} /> Optical Array
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar">
          {cameras.map(cam => {
            const isActive = activeCameraId === cam.id;
            return (
              <button
                key={cam.id}
                onClick={() => setActiveCamera(isActive ? null : cam.id)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  isActive
                    ? 'border-cyan-400/50 bg-cyan-500/10'
                    : 'border-white/10 bg-black/30 hover:border-white/25 hover:bg-black/50'
                }`}
              >
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {cam.is_runway && <Plane size={12} className={isActive ? 'text-cyan-300' : 'text-white/40'} />}
                    <span className={`text-sm font-medium truncate ${isActive ? 'text-cyan-100' : 'text-white/90'}`}>
                      {cam.name}
                    </span>
                  </div>
                  {isActive && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />}
                </div>
                <div className="flex justify-between items-center mt-1.5 text-[10px] mono-data">
                  <span className="text-white/40">{cam.zone?.toUpperCase()}</span>
                  <span className={isActive ? 'text-cyan-300' : 'text-white/40'}>{(cam.fps ?? 0).toFixed(1)} FPS</span>
                </div>
              </button>
            );
          })}
          {cameras.length === 0 && (
            <div className="text-xs text-white/40 text-center p-4 border border-dashed border-white/10 rounded-lg">
              No cameras deployed
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-white/5 pt-4">
        <div className="label-kicker flex items-center gap-1.5 mb-3">
          <Activity size={12} /> System metrics
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/30 border border-white/5 rounded-lg p-3">
            <div className="label-kicker">Detections</div>
            <div className="mono-data text-lg font-semibold text-white mt-1">{globalStats?.total_birds ?? 0}</div>
          </div>
          <div className="bg-black/30 border border-cyan-400/20 rounded-lg p-3">
            <div className="label-kicker">Alerts</div>
            <div className="mono-data text-lg font-semibold text-cyan-300 mt-1">{globalStats?.total_alerts ?? 0}</div>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
