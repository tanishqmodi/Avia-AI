import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  kicker?: string;
}

export default function PageHeader({ title, description, icon, actions, kicker }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start justify-between gap-6 flex-wrap mb-8"
    >
      <div className="min-w-0">
        {kicker && (
          <div className="label-kicker text-cyan-300/70 mb-2">{kicker}</div>
        )}
        <div className="flex items-center gap-3 mb-1.5">
          {icon && (
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300">
              {icon}
            </div>
          )}
          <h1 className="text-2xl font-semibold text-white tracking-tight">{title}</h1>
        </div>
        {description && (
          <p className="text-sm text-white/50 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      )}
    </motion.div>
  );
}
