import { useEffect, useState } from 'react';

// TestingNewDataset: color legend for multi-class aerial detection.
type LegendEntry = { class_name: string; color_hex: string; available: boolean };

export default function DetectionLegend({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<LegendEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('http://localhost:8000/api/detection/legend')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { if (!cancelled) setItems(d.classes || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <span className="label-kicker mr-1">Legend</span>
      {items.map(it => (
        <span
          key={it.class_name}
          title={it.available ? `${it.class_name} detected in live/upload` : `${it.class_name} pending model fine-tune`}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
            it.available
              ? 'border-white/10 bg-white/[0.04] text-white/80'
              : 'border-white/5 bg-white/[0.02] text-white/30 line-through decoration-white/30'
          }`}
        >
          <span
            className="w-2.5 h-2.5 rounded-sm"
            style={{ background: it.color_hex, boxShadow: `0 0 6px ${it.color_hex}66` }}
            aria-hidden="true"
          />
          <span className="capitalize">{it.class_name}</span>
        </span>
      ))}
    </div>
  );
}
