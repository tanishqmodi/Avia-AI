import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

type Tone = 'default' | 'accent' | 'warning' | 'danger' | 'success';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  delay?: number;
}

const tones: Record<Tone, { text: string; bg: string; border: string; accent: string }> = {
  default: {
    text: 'text-white',
    bg: 'bg-white/[0.03]',
    border: 'border-white/10',
    accent: 'text-white/60',
  },
  accent: {
    text: 'text-cyan-100',
    bg: 'bg-cyan-500/[0.06]',
    border: 'border-cyan-400/25',
    accent: 'text-cyan-300',
  },
  warning: {
    text: 'text-amber-100',
    bg: 'bg-amber-500/[0.06]',
    border: 'border-amber-400/25',
    accent: 'text-amber-300',
  },
  danger: {
    text: 'text-red-100',
    bg: 'bg-red-500/[0.06]',
    border: 'border-red-400/25',
    accent: 'text-red-300',
  },
  success: {
    text: 'text-emerald-100',
    bg: 'bg-emerald-500/[0.06]',
    border: 'border-emerald-400/25',
    accent: 'text-emerald-300',
  },
};

export default function StatCard({ label, value, hint, icon, tone = 'default', delay = 0 }: StatCardProps) {
  const t = tones[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.4, 0, 0.2, 1] }}
      className={`card p-5 relative overflow-hidden ${t.bg} ${t.border}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="label-kicker">{label}</span>
        {icon && <div className={t.accent}>{icon}</div>}
      </div>
      <div className={`mono-data text-3xl font-semibold ${t.text} leading-none`}>
        {value}
      </div>
      {hint && (
        <div className="mt-3 text-xs text-white/50 leading-snug">{hint}</div>
      )}
    </motion.div>
  );
}
