import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Camera, Maximize2, Minimize2, Wifi, WifiOff, Bird, Cpu } from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'
import clsx from 'clsx'

const riskConfig = {
  0: { bg: 'bg-emerald-500', text: 'text-emerald-400', label: 'Clear' },
  1: { bg: 'bg-amber-500', text: 'text-amber-400', label: 'Intrusion' },
  2: { bg: 'bg-orange-500', text: 'text-orange-400', label: 'High Risk' },
  3: { bg: 'bg-red-500', text: 'text-red-400', label: 'Critical' },
}

const zoneColors = {
  Runway:    { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', ring: 'ring-red-500/20' },
  Taxiway:   { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', ring: 'ring-amber-500/20' },
  Apron:     { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', ring: 'ring-yellow-500/20' },
  Perimeter: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', ring: 'ring-blue-500/20' },
  Terminal:  { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20', ring: 'ring-teal-500/20' },
  General:   { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20', ring: 'ring-sky-500/20' },
}

const modelBadge = {
  yolo:   { label: 'YOLO', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  rtdetr: { label: 'RT-DETR', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
}

export default function CameraFeed({ camera, expanded = false, onToggleExpand }) {
  const [frame, setFrame] = useState(null)
  const [stats, setStats] = useState({})
  const wsUrl = `ws://${window.location.hostname}:8000/ws/camera/${camera.id}`

  const handleMessage = useCallback((data) => {
    if (data.type === 'frame') {
      setFrame(`data:image/jpeg;base64,${data.frame}`)
      setStats(data.stats || {})
    }
  }, [])

  const { connected } = useWebSocket(wsUrl, { onMessage: handleMessage, enabled: camera.enabled })
  const risk = riskConfig[stats.max_risk || 0]
  const zc = zoneColors[camera.zone] || zoneColors.General
  const mb = modelBadge[camera.model_type] || modelBadge.yolo

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        'glass-card overflow-hidden relative scan-line',
        expanded && 'col-span-full',
        `ring-1 ${zc.ring}`,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'rgba(5,10,20,0.6)', borderBottom: '1px solid rgba(56,96,160,0.08)' }}>
        <div className="flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-sky-500" />
          <span className="text-[13px] font-medium text-sky-200">{camera.name}</span>
          {camera.is_runway && (
            <span className="text-[8px] font-extrabold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-[0.15em]">
              Runway
            </span>
          )}
          <span className={clsx('text-[9px] px-2 py-0.5 rounded-full border', zc.bg, zc.text, zc.border)}>{camera.zone}</span>
          <span className={clsx('text-[8px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wider', mb.color)}>
            <Cpu className="w-2.5 h-2.5 inline-block mr-0.5 -mt-px" />{mb.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold', `${risk.bg}/10`, risk.text)}>
            <div className={clsx('w-1.5 h-1.5 rounded-full', risk.bg, (stats.max_risk || 0) >= 2 && 'animate-pulse')} />
            {risk.label}
          </div>
          {connected ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-red-400/60" />}
          {onToggleExpand && (
            <button onClick={onToggleExpand} className="p-1 rounded-lg hover:bg-sky-900/40 text-sky-500 transition-colors">
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Feed */}
      <div className="relative bg-[#020510] aspect-video">
        {frame ? (
          <img src={frame} alt={camera.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Camera className="w-10 h-10 text-sky-800 mx-auto mb-2" />
              <p className="text-[11px] text-sky-700">{connected ? 'Awaiting frames...' : 'Connecting...'}</p>
              {!connected && (
                <div className="mt-2 flex justify-center gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1 h-1 bg-sky-700 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {connected && frame && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm">
            <div className="live-dot" />
            <span className="text-[8px] font-bold text-red-400 tracking-[0.2em] uppercase">Live</span>
          </div>
        )}
        {stats.fps > 0 && (
          <div className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm">
            <span className="text-[9px] font-mono text-sky-400">{stats.fps} FPS</span>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-2" style={{ background: 'rgba(5,10,20,0.5)', borderTop: '1px solid rgba(56,96,160,0.06)' }}>
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <Bird className="w-3 h-3 text-cyan-400" />
            <span className="text-sky-200 font-semibold">{stats.active_birds || 0}</span>
            <span className="text-sky-600">birds</span>
          </div>
          {camera.is_runway && (
            <div>
              <span className="text-amber-400 font-semibold">{stats.birds_in_zone || 0}</span>
              <span className="text-sky-600"> zone</span>
            </div>
          )}
          <div>
            <span className="text-red-400 font-semibold">{stats.high_risk || 0}</span>
            <span className="text-sky-600"> risk</span>
          </div>
        </div>
        <span className="text-[9px] text-sky-700">{stats.total_alerts || 0} alerts</span>
      </div>
    </motion.div>
  )
}
