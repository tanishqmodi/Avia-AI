import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield } from 'lucide-react';
import { useStore } from '../../store/useStore';

const severityStyles: Record<string, { bar: string; badge: string; dot: string; label: string }> = {
  high: {
    bar: 'bg-red-500/70',
    badge: 'bg-red-500/10 border-red-400/30 text-red-300',
    dot: 'bg-red-400',
    label: 'text-red-300',
  },
  medium: {
    bar: 'bg-amber-500/70',
    badge: 'bg-amber-500/10 border-amber-400/30 text-amber-300',
    dot: 'bg-amber-400',
    label: 'text-amber-300',
  },
  low: {
    bar: 'bg-slate-500/60',
    badge: 'bg-slate-500/10 border-slate-400/20 text-slate-300',
    dot: 'bg-slate-400',
    label: 'text-slate-300',
  },
};

function relativeTime(ts: number) {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function AlertLog() {
  const { alerts } = useStore();

  return (
    <div className="absolute top-0 right-0 w-[320px] max-h-[80vh] flex flex-col gap-2 pointer-events-auto">
      <div className="label-kicker flex items-center gap-1.5 mb-1">
        <AlertTriangle size={12} /> Live detections
        <span className="ml-auto mono-data text-[10px] text-white/50">{alerts.length}</span>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar">
        <AnimatePresence initial={false}>
          {alerts.map(alert => {
            const s = severityStyles[alert.severity] || severityStyles.low;
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24, height: 0, marginTop: -8 }}
                layout
                className="card relative overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${s.bar}`} />
                <div className="p-3 pl-4">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${alert.severity === 'high' ? 'animate-pulse' : ''}`} />
                      <span className={`text-[10px] mono-data uppercase tracking-widest font-semibold ${s.label}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/40 mono-data flex-shrink-0">
                      {relativeTime(alert.timestamp)}
                    </span>
                  </div>
                  <div className="text-xs text-white/85 leading-snug break-words">
                    {alert.message || `Bird detected at ${alert.cameraName}`}
                  </div>
                  {alert.confidence > 0 && (
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="text-white/40">Confidence</span>
                      <span className="mono-data text-cyan-300">{(alert.confidence * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {alerts.length === 0 && (
          <div className="card p-5 flex flex-col items-center justify-center gap-2 text-center border-dashed">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300">
              <Shield size={14} />
            </div>
            <div className="text-xs text-white/70">All clear</div>
            <div className="text-[10px] text-white/40">No active detections</div>
          </div>
        )}
      </div>
    </div>
  );
}
