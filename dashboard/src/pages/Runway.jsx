import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plane, Shield, AlertTriangle, Bird, Radar, Activity, Camera } from 'lucide-react'
import CameraFeed from '../components/CameraFeed'
import AlertCard from '../components/AlertCard'
import MetricCard from '../components/MetricCard'
import StatusBadge, { riskToVariant, riskToLabel } from '../components/StatusBadge'
import { api } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'

export default function Runway() {
  const [cameras, setCameras] = useState([])
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const [c, a] = await Promise.all([api.getCameras(), api.getAlerts(30)])
        setCameras(c)
        setAlerts(a.filter(al => al.zone === 'Runway' || al.camera_name?.toLowerCase().includes('runway')))
      } catch (e) { /* */ }
    }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleAlertWs = useCallback((data) => {
    if (data.alerts) {
      const runwayAlerts = data.alerts.filter(
        a => a.zone === 'Runway' || a.camera_name?.toLowerCase().includes('runway')
      )
      if (runwayAlerts.length) {
        setAlerts(prev => [...runwayAlerts, ...prev].slice(0, 100))
      }
    }
  }, [])

  useWebSocket(api.alertsWsUrl(), { onMessage: handleAlertWs })

  const runwayCams = cameras.filter(c => c.is_runway || c.zone === 'Runway')
  const primaryCam = runwayCams[0]

  const totalBirds = runwayCams.reduce((s, c) => s + (c.active_birds || 0), 0)
  const inZone = runwayCams.reduce((s, c) => s + (c.birds_in_zone || 0), 0)
  const maxRisk = Math.max(0, ...runwayCams.map(c => c.max_risk || 0))

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-blue/10 border border-accent-blue/20">
            <Plane className="w-6 h-6 text-accent-blue" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-sky-100">Runway Monitoring</h2>
            <p className="text-sm text-sky-500 mt-0.5">Priority avian intrusion surveillance</p>
          </div>
        </div>
        <StatusBadge
          variant={riskToVariant(maxRisk)}
          label={riskToLabel(maxRisk)}
          pulse={maxRisk >= 2}
          size="lg"
        />
      </motion.div>

      {/* Runway status banner */}
      {maxRisk >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-4"
        >
          <div className="relative">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-400 uppercase tracking-wider">
              {maxRisk >= 3 ? 'Critical Threat Detected' : 'High Risk Alert'}
            </p>
            <p className="text-xs text-red-300/80 mt-0.5">
              {inZone} bird{inZone !== 1 ? 's' : ''} detected in runway zone. Immediate attention required.
            </p>
          </div>
        </motion.div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Runway Cameras" value={runwayCams.length} icon={Camera} color="blue" />
        <MetricCard title="Birds Detected" value={totalBirds} icon={Bird} color="cyan" glow={totalBirds > 0} />
        <MetricCard title="In Runway Zone" value={inZone} icon={Radar} color="amber" glow={inZone > 0} />
        <MetricCard title="Runway Alerts" value={alerts.length} icon={AlertTriangle} color="red" glow={alerts.length > 0} />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Camera feeds */}
        <div className="xl:col-span-2 space-y-4">
          {runwayCams.length === 0 ? (
            <div className="glass p-12 text-center">
              <Plane className="w-16 h-16 text-sky-700 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-sky-300 mb-2">No Runway Cameras</h3>
              <p className="text-sm text-sky-500">Assign a camera to the Runway zone in the Cameras or Settings page.</p>
            </div>
          ) : (
            runwayCams.map(cam => (
              <CameraFeed key={cam.id} camera={cam} expanded />
            ))
          )}
        </div>

        {/* Runway alerts */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent-amber" />
            <h3 className="text-sm font-semibold text-sky-200 uppercase tracking-wider">Runway Alerts</h3>
          </div>
          <div className="glass p-3 max-h-[600px] overflow-y-auto space-y-2">
            <AnimatePresence mode="popLayout">
              {alerts.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center">
                  <Activity className="w-10 h-10 text-sky-700 mx-auto mb-3" />
                  <p className="text-sm text-sky-600">Runway clear</p>
                  <p className="text-xs text-sky-700 mt-1">No avian threats detected</p>
                </motion.div>
              ) : (
                alerts.slice(0, 20).map((alert, i) => (
                  <AlertCard key={`${alert.timestamp}-${i}`} alert={alert} />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
