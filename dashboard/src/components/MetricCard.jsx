import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef } from 'react'
import clsx from 'clsx'

function AnimatedNumber({ value, duration = 0.8 }) {
  const nodeRef = useRef(null)
  const motionVal = useMotionValue(0)
  const rounded = useTransform(motionVal, (v) => Math.round(v))

  useEffect(() => {
    const controls = animate(motionVal, value, { duration })
    return controls.stop
  }, [value, duration, motionVal])

  useEffect(() => {
    const unsub = rounded.on('change', (v) => {
      if (nodeRef.current) nodeRef.current.textContent = v.toLocaleString()
    })
    return unsub
  }, [rounded])

  return <span ref={nodeRef}>{Math.round(value)}</span>
}

const colorMap = {
  blue: { icon: 'from-blue-500/20 to-blue-600/10', text: 'text-blue-400', glow: 'glow-blue' },
  cyan: { icon: 'from-cyan-500/20 to-teal-500/10', text: 'text-cyan-400', glow: 'glow-cyan' },
  emerald: { icon: 'from-emerald-500/20 to-green-500/10', text: 'text-emerald-400', glow: 'glow-emerald' },
  amber: { icon: 'from-amber-500/20 to-yellow-500/10', text: 'text-amber-400', glow: 'glow-amber' },
  red: { icon: 'from-red-500/20 to-rose-500/10', text: 'text-red-400', glow: 'glow-red' },
  orange: { icon: 'from-orange-500/20 to-amber-500/10', text: 'text-orange-400', glow: 'glow-amber' },
}

export default function MetricCard({ title, value, icon: Icon, color = 'blue', subtitle, glow }) {
  const c = colorMap[color] || colorMap.blue

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.3 }}
      className={clsx('glass-card p-5 relative overflow-hidden', glow && c.glow)}
    >
      <div className={clsx(
        'absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-[0.07] transition-opacity duration-500 group-hover:opacity-[0.12]',
        `bg-gradient-to-br ${c.icon}`
      )} />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold text-sky-500 uppercase tracking-[0.12em] mb-2">{title}</p>
          <p className="text-[28px] font-bold text-sky-100 leading-none">
            {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
          </p>
          {subtitle && <p className="text-[11px] text-sky-600 mt-2">{subtitle}</p>}
        </div>
        <div className={clsx('p-2.5 rounded-xl bg-gradient-to-br border border-white/[0.04]', c.icon)}>
          <Icon className={clsx('w-[18px] h-[18px]', c.text)} />
        </div>
      </div>
    </motion.div>
  )
}
