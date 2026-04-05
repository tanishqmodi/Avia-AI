import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Bird, AlertTriangle, Shield, Activity, Cpu, Radar, Zap } from 'lucide-react'
import MetricCard from '../components/MetricCard'
import AlertCard from '../components/AlertCard'
import StatusBadge, { riskToVariant, riskToLabel } from '../components/StatusBadge'
import CameraFeed from '../components/CameraFeed'
import { api } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

export default function Dashboard() {
  const [stats, setStats] = useState({})
  const [cameras, setCameras] = useState([])
  const [alerts, setAlerts] = useState([])

  // Poll stats
  useEffect(() => {
    const load = async () => {
      try {
        const [s, c, a] = await Promise.all([api.getStats(), api.getCameras(), api.getAlerts(20)])
        setStats(s)
        setCameras(c)
        setAlerts(a)
      } catch (e) { /* backend not ready */ }
    }
    load()
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [])

  // Global alert WebSocket
  const handleAlertWs = useCallback((data) => {
    if (data.alerts) {
      setAlerts(prev => [...data.alerts, ...prev].slice(0, 50))
    }
  }, [])

  useWebSocket(api.alertsWsUrl(), { onMessage: handleAlertWs })

  const runwayCam = cameras.find(c => c.is_runway)
  const risk = stats.max_risk || 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-sky-100">Command Center</h2>
          <p className="text-sm text-sky-500 mt-0.5">Real-time avian threat monitoring overview</p>
        </div>
        <StatusBadge
          variant={riskToVariant(risk)}
          label={riskToLabel(risk)}
          pulse={risk >= 2}
          size="lg"
        />
      </motion.div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <MetricCard title="Active Cameras" value={stats.active_cameras || 0} icon={Camera} color="blue" subtitle={`${stats.total_cameras || 0} total`} />
        <MetricCard title="Birds Detected" value={stats.total_birds || 0} icon={Bird} color="cyan" glow />
        <MetricCard title="In Runway Zone" value={stats.birds_in_zone || 0} icon={Radar} color="amber" glow={stats.birds_in_zone > 0} />
        <MetricCard title="High Risk" value={stats.high_risk || 0} icon={AlertTriangle} color="red" glow={stats.high_risk > 0} />
        <MetricCard title="Total Alerts" value={stats.total_alerts || 0} icon={Zap} color="orange" />
        <MetricCard title="AI Models" value={stats.model_status === 'active' ? 'Online' : 'Offline'} icon={Cpu} color="emerald" subtitle="YOLO + RT-DETR" />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Runway Camera — Priority */}
        <div className="xl:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent-blue" />
            <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">Runway Camera</h3>
          </div>
          {runwayCam ? (
            <CameraFeed camera={runwayCam} expanded />
          ) : (
            <div className="glass p-12 text-center">
              <Camera className="w-16 h-16 text-sky-700 mx-auto mb-4" />
              <p className="text-sky-400 font-medium">No Runway Camera Assigned</p>
              <p className="text-sm text-sky-600 mt-1">Go to Settings to add a camera and assign it to the runway.</p>
            </div>
          )}
        </div>

        {/* Alerts panel */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-accent-amber" />
              <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">Live Alerts</h3>
            </div>
            {alerts.length > 0 && (
              <span className="text-[10px] font-mono text-sky-500">{alerts.length} events</span>
            )}
          </div>

          <div className="glass p-3 max-h-[540px] overflow-y-auto space-y-2">
            <AnimatePresence mode="popLayout">
              {alerts.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-8 text-center"
                >
                  <Activity className="w-10 h-10 text-sky-700 mx-auto mb-3" />
                  <p className="text-sm text-sky-600">No alerts yet</p>
                  <p className="text-xs text-sky-700 mt-1">Alerts appear here in real-time</p>
                </motion.div>
              ) : (
                alerts.slice(0, 15).map((alert, i) => (
                  <AlertCard key={`${alert.timestamp}-${i}`} alert={alert} compact />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* All cameras mini grid */}
      {cameras.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">All Cameras</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cameras.map(cam => (
              <CameraFeed key={cam.id} camera={cam} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
