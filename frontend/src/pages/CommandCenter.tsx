import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, Camera, AlertTriangle, Plane, Activity,
  ArrowUpRight, Zap, Radio, ChevronRight, TrendingUp
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Good evening';
  if (hr < 12) return 'Good morning';
  if (hr < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] mono-data px-2 py-1 rounded-md border ${
      ok
        ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300'
        : 'bg-red-500/10 border-red-400/25 text-red-300'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400 pulse-dot' : 'bg-red-400'}`} />
      {label}
    </span>
  );
}

export default function CommandCenter() {
  const { cameras, globalStats, alerts } = useStore();
  const user = useAuthStore(s => s.user);

  const runwayCams = useMemo(
    () => cameras.filter(c => c.is_runway || c.zone?.toLowerCase() === 'runway'),
    [cameras]
  );

  const previewCams = cameras.slice(0, 6);
  const recentAlerts = alerts.slice(0, 5);

  const totalCameras = globalStats?.total_cameras ?? cameras.length;
  const activeCameras = globalStats?.active_cameras ?? 0;
  const totalDetections = globalStats?.total_birds ?? 0;
  const activeAlerts = globalStats?.total_alerts ?? alerts.length;
  const highRisk = globalStats?.high_risk ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-[1600px] mx-auto">
        <PageHeader
          kicker={greeting() + (user?.username ? `, ${user.username}` : '')}
          title="Command Center"
          description="At-a-glance view of your aerial surveillance grid. Monitor sensors, detections, and runway threat vectors in real time."
          icon={<LayoutDashboard size={18} />}
          actions={
            <>
              <Button
                variant="secondary"
                leftIcon={<Radio size={14} />}
                onClick={() => (window.location.href = '/airspace')}
              >
                3D Airspace
              </Button>
              <Link to="/cameras">
                <Button variant="primary" leftIcon={<Camera size={14} />}>
                  Manage Sensors
                </Button>
              </Link>
            </>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Active Sensors"
            value={`${activeCameras}/${totalCameras}`}
            hint={
              <span className="flex items-center gap-1.5">
                <TrendingUp size={12} className="text-emerald-400" />
                {totalCameras > 0 ? Math.round((activeCameras / totalCameras) * 100) : 0}% operational
              </span>
            }
            icon={<Camera size={16} />}
            tone="accent"
            delay={0.05}
          />
          <StatCard
            label="Total Detections"
            value={totalDetections.toLocaleString()}
            hint={`Across all zones`}
            icon={<Activity size={16} />}
            delay={0.1}
          />
          <StatCard
            label="Active Alerts"
            value={activeAlerts}
            hint={`${highRisk} high-risk detections`}
            icon={<AlertTriangle size={16} />}
            tone={highRisk > 0 ? 'danger' : activeAlerts > 0 ? 'warning' : 'default'}
            delay={0.15}
          />
          <StatCard
            label="Runway Coverage"
            value={runwayCams.length}
            hint={runwayCams.length > 0 ? 'Watchpoints deployed' : 'No runway sensors yet'}
            icon={<Plane size={16} />}
            tone="success"
            delay={0.2}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="card p-6 lg:col-span-2"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="label-kicker mb-1">Sensor Array</div>
                <h2 className="text-lg font-semibold text-white">Optical coverage</h2>
              </div>
              <Link to="/cameras" className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 transition-colors">
                View all <ArrowUpRight size={12} />
              </Link>
            </div>

            {previewCams.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center gap-4 border border-dashed border-white/10 rounded-lg">
                <Camera size={32} className="text-white/20" />
                <div>
                  <div className="text-sm text-white/70 mb-1">No sensors deployed</div>
                  <div className="text-xs text-white/40">Add your first camera to begin monitoring</div>
                </div>
                <Link to="/cameras">
                  <Button variant="primary" size="sm" leftIcon={<Camera size={12} />}>
                    Deploy sensor
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {previewCams.map((cam, i) => {
                  const ok = cam.status === 'online' || cam.status === 'active';
                  return (
                    <motion.div
                      key={cam.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: 0.25 + i * 0.04 }}
                      className="card card-interactive p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{cam.name}</div>
                          <div className="text-[11px] text-white/40 mt-0.5 truncate">
                            {cam.zone || 'Unzoned'} · {cam.model_type?.toUpperCase()}
                          </div>
                        </div>
                        <StatusPill ok={ok} label={ok ? 'LIVE' : 'IDLE'} />
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        <div>
                          <div className="label-kicker">FPS</div>
                          <div className="mono-data text-sm text-white mt-0.5">{cam.fps?.toFixed(1) ?? '0.0'}</div>
                        </div>
                        <div>
                          <div className="label-kicker">Birds</div>
                          <div className="mono-data text-sm text-white mt-0.5">{cam.active_birds ?? 0}</div>
                        </div>
                        <div>
                          <div className="label-kicker">Alerts</div>
                          <div className="mono-data text-sm text-cyan-300 mt-0.5">{cam.total_alerts ?? 0}</div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="card p-6 flex flex-col min-h-0"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="label-kicker mb-1">Live feed</div>
                <h2 className="text-lg font-semibold text-white">Recent alerts</h2>
              </div>
              <Link to="/alerts" className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 transition-colors">
                All <ArrowUpRight size={12} />
              </Link>
            </div>

            {recentAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center gap-3 border border-dashed border-white/10 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300">
                  <Zap size={18} />
                </div>
                <div>
                  <div className="text-sm text-white/80">All clear</div>
                  <div className="text-xs text-white/40 mt-0.5">No active threats detected</div>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2">
                {recentAlerts.map(alert => {
                  const tone = alert.severity === 'high'
                    ? { dot: 'bg-red-400', text: 'text-red-300', border: 'border-red-500/20' }
                    : alert.severity === 'medium'
                    ? { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-500/20' }
                    : { dot: 'bg-slate-400', text: 'text-slate-300', border: 'border-white/10' };
                  return (
                    <li key={alert.id} className={`p-3 rounded-lg border ${tone.border} bg-black/30 hover:bg-black/40 transition-colors`}>
                      <div className="flex items-start gap-3">
                        <span className={`w-2 h-2 rounded-full ${tone.dot} mt-1.5 flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[11px] font-medium uppercase tracking-wider ${tone.text}`}>
                              {alert.severity}
                            </span>
                            <span className="text-[10px] mono-data text-white/40">
                              {new Date(alert.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-xs text-white/80 mt-1 leading-relaxed break-words">
                            {alert.message || `Detection at ${alert.cameraName}`}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.section>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.35 }}
          className="card p-6 mt-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="label-kicker mb-1">Quick actions</div>
              <h2 className="text-lg font-semibold text-white">Jump to</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { to: '/airspace', icon: Radio, label: '3D Airspace', hint: 'Live 3D view' },
              { to: '/upload', icon: ArrowUpRight, label: 'Upload & Infer', hint: 'Analyze media' },
              { to: '/runway', icon: Plane, label: 'Runway Watch', hint: 'Zone priority' },
              { to: '/logs', icon: Activity, label: 'Detection Logs', hint: 'Historical data' },
            ].map(q => (
              <Link
                key={q.to}
                to={q.to}
                className="card card-interactive p-4 flex items-center gap-3 group"
              >
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300 group-hover:bg-cyan-500/20 transition-colors">
                  <q.icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{q.label}</div>
                  <div className="text-[11px] text-white/40 truncate">{q.hint}</div>
                </div>
                <ChevronRight size={14} className="text-white/30 group-hover:text-white/70 transition-colors" />
              </Link>
            ))}
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
