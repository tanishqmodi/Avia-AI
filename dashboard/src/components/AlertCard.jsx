import { motion } from 'framer-motion'
import { AlertTriangle, AlertOctagon, Radar } from 'lucide-react'
import clsx from 'clsx'

const alertConfig = {
  CRITICAL: {
    icon: AlertOctagon,
    bg: 'bg-red-500/[0.06]',
    border: 'border-red-500/20',
    text: 'text-red-400',
    accent: 'bg-red-500',
    label: 'Critical',
  },
  HIGH_RISK: {
    icon: AlertTriangle,
    bg: 'bg-orange-500/[0.06]',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    accent: 'bg-orange-500',
    label: 'High Risk',
  },
  HIGH_DENSITY: {
    icon: AlertTriangle,
    bg: 'bg-yellow-500/[0.06]',
    border: 'border-yellow-500/20',
    text: 'text-yellow-400',
    accent: 'bg-yellow-500',
    label: 'High Density',
  },
  INTRUSION: {
    icon: AlertTriangle,
    bg: 'bg-amber-500/[0.06]',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    accent: 'bg-amber-500',
    label: 'Intrusion',
  },
  APPROACH: {
    icon: Radar,
    bg: 'bg-blue-500/[0.06]',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    accent: 'bg-blue-500',
    label: 'Approach',
  },
}

export default function AlertCard({ alert, compact = false }) {
  const config = alertConfig[alert.level] || alertConfig.APPROACH
  const Icon = config.icon
  const timestamp = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : ''

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -15, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl border', config.bg, config.border)}
      >
        <div className={clsx('w-[3px] h-7 rounded-full flex-shrink-0', config.accent)} />
        <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', config.text)} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-sky-200 truncate leading-tight">{alert.message}</p>
          <p className="text-[9px] text-sky-600 mt-0.5">{alert.camera_name || 'System'} {timestamp && `· ${timestamp}`}</p>
        </div>
        <span className={clsx('text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest', config.bg, config.text, 'border', config.border)}>
          {config.label}
        </span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      className={clsx('p-4 rounded-xl border relative overflow-hidden', config.bg, config.border)}
    >
      <div className={clsx('absolute left-0 top-0 bottom-0 w-[3px]', config.accent)} />

      <div className="flex items-start gap-3 ml-2">
        <div className={clsx('p-1.5 rounded-lg mt-0.5', config.bg)}>
          <Icon className={clsx('w-3.5 h-3.5', config.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('text-[10px] font-bold uppercase tracking-widest', config.text)}>{config.label}</span>
            {alert.track_id && (
              <span className="text-[9px] text-sky-500 font-mono bg-sky-900/40 px-1.5 py-0.5 rounded">ID:{alert.track_id}</span>
            )}
          </div>
          <p className="text-[12px] text-sky-200 leading-relaxed">{alert.message}</p>
          <div className="flex items-center gap-3 mt-2 text-[9px] text-sky-600">
            {alert.camera_name && <span>{alert.camera_name}</span>}
            {alert.zone && <span>Zone: {alert.zone}</span>}
            {timestamp && <span>{timestamp}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
