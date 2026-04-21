import { useEffect, useRef, useState } from 'react';
import { Plane, Search, X, MapPin } from 'lucide-react';
import { api, type Airport } from '../../services/api';

interface Props {
  value: Airport | null;
  onChange: (airport: Airport | null) => void;
  disabled?: boolean;
}

export default function AirportPicker({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const r = await api.searchAirports(query, 12);
        setResults(r);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const select = (a: Airport) => {
    onChange(a);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlight]) select(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {value ? (
        <div className="flex items-center gap-3 p-3 bg-cyan-500/[0.06] border border-cyan-400/25 rounded-lg">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 flex-shrink-0">
            <Plane size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-white truncate">
              <span className="mono-data text-cyan-300">{value.iata}</span>
              <span className="text-white/30">·</span>
              <span className="truncate">{value.name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/50 mt-0.5">
              <MapPin size={11} />
              {value.city}
              {value.country && <span className="mono-data uppercase text-white/40">· {value.country}</span>}
              {value.icao && <span className="ml-1 mono-data text-white/35">ICAO {value.icao}</span>}
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="text-white/40 hover:text-white transition-colors p-1.5 rounded hover:bg-white/5 flex-shrink-0"
              aria-label="Clear airport"
              title="Clear"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={query}
            disabled={disabled}
            placeholder="Search IATA code, city, or name..."
            onFocus={() => setOpen(true)}
            onChange={e => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="w-full bg-black/40 border border-white/10 rounded-lg h-10 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors disabled:opacity-50"
            aria-autocomplete="list"
            aria-expanded={open}
          />
        </div>
      )}

      {open && !value && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 card p-1 max-h-64 overflow-y-auto custom-scrollbar shadow-2xl">
          {loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-white/40 flex items-center gap-2">
              <div className="w-3 h-3 border border-cyan-400/50 border-t-transparent rounded-full animate-spin" />
              Searching airports...
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-white/40">No airports match your search.</div>
          )}
          {results.map((a, i) => (
            <button
              type="button"
              key={`${a.iata}-${a.icao || i}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => select(a)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                i === highlight ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className="mono-data text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 rounded px-1.5 py-0.5 flex-shrink-0">
                {a.iata}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white/90 truncate">{a.name}</div>
                <div className="text-[11px] text-white/45 truncate">
                  {a.city}
                  {a.country && <span className="mono-data uppercase text-white/35"> · {a.country}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
