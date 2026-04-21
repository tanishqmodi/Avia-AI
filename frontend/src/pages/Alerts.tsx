import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, X, Shield } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/useStore';

type Filter = 'all' | 'high' | 'medium' | 'low';

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

const severityStyles: Record<string, { badge: string; bar: string; dot: string; label: string }> = {
  high: { badge: 'bg-red-500/10 border-red-400/30 text-red-300', bar: 'bg-red-500/70', dot: 'bg-red-400', label: 'text-red-300' },
  medium: { badge: 'bg-amber-500/10 border-amber-400/30 text-amber-300', bar: 'bg-amber-500/70', dot: 'bg-amber-400', label: 'text-amber-300' },
  low: { badge: 'bg-slate-500/10 border-slate-400/20 text-slate-300', bar: 'bg-slate-500/60', dot: 'bg-slate-400', label: 'text-slate-300' },
};

function relativeTime(ts: number) {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function Alerts() {
  const { alerts, dismissAlert, clearAlerts } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () => ({
      all: alerts.length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length,
    }),
    [alerts]
  );

  const filtered = useMemo(
    () => (filter === 'all' ? alerts : alerts.filter(a => a.severity === filter)),
    [alerts, filter]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-5xl mx-auto">
        <PageHeader
          kicker={`${alerts.length} active`}
          title="Alert Center"
          description="Real-time threat detections across all zones. Acknowledge, filter, and investigate high-priority events."
          icon={<AlertTriangle size={18} />}
          actions={
            <Button
              variant="secondary"
              leftIcon={<Trash2 size={14} />}
              onClick={clearAlerts}
              disabled={alerts.length === 0}
            >
              Clear all
            </Button>
          }
        />

        <div className="flex gap-2 flex-wrap mb-5" role="tablist" aria-label="Severity filter">
          {filters.map(f => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 h-8 text-xs font-medium rounded-md border transition-colors flex items-center gap-2 ${
                filter === f.key
                  ? 'bg-white/10 border-white/25 text-white'
                  : 'bg-transparent border-white/10 text-white/60 hover:border-white/20 hover:text-white/90'
              }`}
            >
              {f.label}
              <span className={`text-[10px] mono-data px-1.5 rounded ${filter === f.key ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-white/50'}`}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {filtered.map(alert => {
              const s = severityStyles[alert.severity] || severityStyles.low;
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16, height: 0, marginBottom: -10 }}
                  layout
                  className="card card-interactive relative overflow-hidden"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${s.bar}`} />
                  <div className="p-4 pl-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${s.badge} flex-shrink-0`}>
                        <AlertTriangle size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] mono-data uppercase tracking-widest font-semibold ${s.label}`}>
                            {alert.severity} severity
                          </span>
                          <span className="text-[10px] text-white/40 mono-data">·</span>
                          <span className="text-[10px] text-white/50 mono-data">
                            {relativeTime(alert.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm text-white/90 break-words leading-snug">
                          {alert.message || `Bird detected at ${alert.cameraName}`}
                        </div>
                        <div className="text-[11px] text-white/40 mt-1 mono-data">
                          {new Date(alert.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right hidden sm:block">
                        <div className="label-kicker">Confidence</div>
                        <div className="mono-data text-base text-cyan-300 mt-0.5">
                          {alert.confidence ? `${(alert.confidence * 100).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <button
                        onClick={() => dismissAlert(alert.id)}
                        className="text-white/30 hover:text-white transition-colors p-2 rounded hover:bg-white/5"
                        aria-label="Dismiss alert"
                        title="Dismiss"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="card p-14 flex flex-col items-center justify-center text-center gap-3 border-dashed">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300">
                <Shield size={18} />
              </div>
              <div className="text-sm text-white/80">
                {alerts.length === 0 ? 'All clear' : `No ${filter} alerts`}
              </div>
              <div className="text-xs text-white/40">
                {alerts.length === 0 ? 'No active threats detected in this session' : 'Switch filters to view other severities'}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
