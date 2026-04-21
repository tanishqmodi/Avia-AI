import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plane, AlertTriangle, Shield, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/useStore';
import { useCameraStream } from '../hooks/useCameraStream';

function RunwayCamera({ id, name, zone, model }: { id: string; name: string; zone: string; model: string }) {
  const { data, isConnected } = useCameraStream(id);

  return (
    <div className="card card-interactive overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex items-center">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-red-400' : 'bg-slate-500'}`} />
            {isConnected && <span className="absolute inset-0 rounded-full bg-red-400/50 animate-ping" />}
          </span>
          <span className="text-sm font-medium text-white truncate">{name}</span>
        </div>
        <span className="text-[10px] mono-data text-cyan-300/80 uppercase tracking-wider">{model}</span>
      </div>
      <div className="relative bg-black/60 aspect-video">
        {data?.frame ? (
          <img src={`data:image/jpeg;base64,${data.frame}`} alt={`Feed ${name}`} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30">
            <Radio size={18} />
            <span className="text-[10px] mono-data uppercase tracking-widest">Awaiting signal</span>
          </div>
        )}
        <div className="absolute top-2 left-2 text-[10px] mono-data text-cyan-300 bg-black/70 px-2 py-0.5 rounded border border-cyan-400/20">
          {zone.toUpperCase()}
        </div>
      </div>
    </div>
  );
}

export default function Runway() {
  const { cameras, alerts, globalStats } = useStore();

  const runwayCams = useMemo(
    () => cameras.filter(c => c.is_runway || c.zone?.toLowerCase() === 'runway'),
    [cameras]
  );
  const runwayAlerts = useMemo(() => {
    const names = new Set(runwayCams.map(c => c.name));
    return alerts.filter(a => names.has(a.cameraName));
  }, [runwayCams, alerts]);

  const activeCount = runwayCams.filter(c => c.status === 'online' || c.status === 'active').length;
  const highRisk = runwayAlerts.filter(a => a.severity === 'high').length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-[1600px] mx-auto">
        <PageHeader
          kicker="Priority zone"
          title="Runway Watch"
          description="Dedicated view for runway-classified sensors. Threats here are highest-priority and route directly to tower ops."
          icon={<Plane size={18} />}
          actions={
            <Link to="/cameras">
              <Button variant="secondary" leftIcon={<Plane size={14} />}>
                Manage sensors
              </Button>
            </Link>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Runway Sensors"
            value={`${activeCount}/${runwayCams.length}`}
            hint="Active watchpoints"
            icon={<Plane size={16} />}
            tone="accent"
          />
          <StatCard
            label="Zone Alerts"
            value={runwayAlerts.length}
            hint={`${highRisk} high-risk`}
            icon={<AlertTriangle size={16} />}
            tone={highRisk > 0 ? 'danger' : runwayAlerts.length > 0 ? 'warning' : 'default'}
            delay={0.05}
          />
          <StatCard
            label="Max Risk Index"
            value={(globalStats?.max_risk ?? 0).toFixed(2)}
            hint="Tracked bird threat"
            icon={<Shield size={16} />}
            tone="success"
            delay={0.1}
          />
        </div>

        <section className="card p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <div className="label-kicker mb-1">Optical Array</div>
              <h2 className="text-lg font-semibold text-white">Runway coverage</h2>
            </div>
            {runwayCams.length > 0 && (
              <span className="text-xs text-white/40">
                {runwayCams.length} sensor{runwayCams.length === 1 ? '' : 's'} · streaming live
              </span>
            )}
          </div>

          {runwayCams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4 border border-dashed border-white/10 rounded-lg">
              <Plane size={32} className="text-white/20" />
              <div>
                <div className="text-sm text-white/70 mb-1">No runway sensors deployed</div>
                <div className="text-xs text-white/40">Tag a camera with zone "Runway" to surface it here</div>
              </div>
              <Link to="/cameras">
                <Button variant="primary" size="sm" leftIcon={<Plane size={12} />}>
                  Deploy runway sensor
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {runwayCams.map(cam => (
                <RunwayCamera key={cam.id} id={cam.id} name={cam.name} zone={cam.zone} model={cam.model_type} />
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}
