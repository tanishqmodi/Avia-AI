import clsx from 'clsx'

const variants = {
  clear: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  intrusion: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  'high-risk': { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  critical: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-500' },
  active: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  inactive: { bg: 'bg-sky-700/15', text: 'text-sky-500', border: 'border-sky-700/30', dot: 'bg-sky-600' },
  online: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  offline: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-500' },
}

export function riskToVariant(risk) {
  if (risk === 0) return 'clear'
  if (risk === 1) return 'intrusion'
  if (risk === 2) return 'high-risk'
  return 'critical'
}

export function riskToLabel(risk) {
  if (risk === 0) return 'Clear'
  if (risk === 1) return 'Intrusion'
  if (risk === 2) return 'High Risk'
  return 'Critical'
}

export default function StatusBadge({ variant = 'clear', label, pulse = false, size = 'sm' }) {
  const v = variants[variant] || variants.clear

  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wider',
      v.bg, v.text, v.border,
      size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs',
    )}>
      <span className={clsx('rounded-full', v.dot, pulse && 'animate-pulse',
        size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
      )} />
      {label}
    </span>
  )
}
