import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Filter, Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import AlertCard from '../components/AlertCard'
import { api } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import clsx from 'clsx'

const LEVELS = ['ALL', 'CRITICAL', 'HIGH_RISK', 'INTRUSION', 'APPROACH']

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getAlerts(200)
        setAlerts(data.reverse())
      } catch (e) { /* */ }
    }
    load()
  }, [])

  const handleAlertWs = useCallback((data) => {
    if (data.alerts) {
      setAlerts(prev => [...data.alerts, ...prev].slice(0, 500))
      if (soundEnabled) {
        try { new Audio('/alert.mp3').play().catch(() => {}) } catch (e) { /* */ }
      }
    }
  }, [soundEnabled])

  useWebSocket(api.alertsWsUrl(), { onMessage: handleAlertWs })

  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.level === filter)

  const countByLevel = {
    CRITICAL: alerts.filter(a => a.level === 'CRITICAL').length,
    HIGH_RISK: alerts.filter(a => a.level === 'HIGH_RISK').length,
    INTRUSION: alerts.filter(a => a.level === 'INTRUSION').length,
    APPROACH: alerts.filter(a => a.level === 'APPROACH').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-sky-100">Alert Center</h2>
          <p className="text-sm text-sky-500 mt-0.5">{alerts.length} total events recorded</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoundEnabled(!soundEnabled)}
            className={clsx('p-2 rounded-lg transition-colors', soundEnabled ? 'bg-accent-blue/20 text-accent-blue' : 'bg-sky-900/40 text-sky-500 hover:text-sky-300')}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={() => setAutoScroll(!autoScroll)}
            className={clsx('p-2 rounded-lg transition-colors', autoScroll ? 'bg-accent-blue/20 text-accent-blue' : 'bg-sky-900/40 text-sky-500 hover:text-sky-300')}>
            {autoScroll ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        </div>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { level: 'CRITICAL', color: 'bg-red-500/10 border-red-500/30 text-red-400' },
          { level: 'HIGH_RISK', color: 'bg-orange-500/10 border-orange-500/30 text-orange-400' },
          { level: 'INTRUSION', color: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
          { level: 'APPROACH', color: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
        ].map(({ level, color }) => (
          <motion.button
            key={level}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setFilter(filter === level ? 'ALL' : level)}
            className={clsx(
              'p-4 rounded-xl border transition-all text-left',
              filter === level ? color : 'bg-sky-900/20 border-sky-800/30 text-sky-400 hover:bg-sky-900/40',
            )}
          >
            <p className="text-2xl font-bold">{countByLevel[level]}</p>
            <p className="text-xs font-medium uppercase tracking-wider mt-1">{level.replace('_', ' ')}</p>
          </motion.button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-sky-500" />
        <div className="flex gap-1.5">
          {LEVELS.map(level => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filter === level
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'bg-sky-900/40 text-sky-500 border border-transparent hover:text-sky-300'
              )}
            >
              {level === 'ALL' ? 'All' : level.replace('_', ' ')}
              {level !== 'ALL' && <span className="ml-1 opacity-60">({countByLevel[level]})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      <div className="space-y-2 max-h-[calc(100vh-400px)] overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-sky-700 mx-auto mb-3" />
              <p className="text-sky-400 font-medium">No alerts for this filter</p>
            </motion.div>
          ) : (
            filtered.map((alert, i) => (
              <AlertCard key={`${alert.timestamp}-${i}`} alert={alert} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
